from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
import polars as pl
from app.database import get_db
from app.models.user import User
from app.models.schema import DatasetSchema
from app.schemas.schema_compat import (
    SchemaDefinitionCreate,
    SchemaDefinitionOut,
    SchemaCompatibilityReport,
    ExpectedColumn
)
from app.api.deps import get_current_user, get_user_dataset, get_user_dataset_version, load_version_dataframe
from app.core.storage import storage_service
from app.engine.schema_engine import SchemaEngine

router = APIRouter(prefix="/schemas", tags=["Schemas"])


def _schema_type(dtype: str) -> str:
    normalized = dtype.lower()
    if any(token in normalized for token in ("int", "uint")):
        return "integer"
    if "float" in normalized or "decimal" in normalized:
        return "float"
    if "bool" in normalized:
        return "boolean"
    if "datetime" in normalized:
        return "datetime"
    if "date" in normalized:
        return "date"
    if "categorical" in normalized:
        return "categorical"
    return "string"

@router.post("/", response_model=SchemaDefinitionOut, status_code=status.HTTP_201_CREATED)
def create_schema(
    schema_in: SchemaDefinitionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Verify dataset ownership if dataset_id provided
    if schema_in.dataset_id:
        get_user_dataset(schema_in.dataset_id, db, current_user)

    col_dicts = [col.model_dump() for col in schema_in.columns]
    schema_record = DatasetSchema(
        user_id=current_user.id,
        dataset_id=schema_in.dataset_id,
        name=schema_in.name,
        description=schema_in.description,
        schema_definition=col_dicts
    )
    db.add(schema_record)
    db.commit()
    db.refresh(schema_record)

    return SchemaDefinitionOut(
        id=schema_record.id,
        user_id=schema_record.user_id,
        dataset_id=schema_record.dataset_id,
        name=schema_record.name,
        description=schema_record.description,
        columns=[ExpectedColumn(**c) for c in schema_record.schema_definition],
        created_at=schema_record.created_at,
        updated_at=schema_record.updated_at
    )

@router.get("/", response_model=List[SchemaDefinitionOut])
def list_schemas(
    dataset_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    q = db.query(DatasetSchema).filter(DatasetSchema.user_id == current_user.id)
    if dataset_id:
        q = q.filter((DatasetSchema.dataset_id == dataset_id) | (DatasetSchema.dataset_id == None))
    records = q.all()
    return [
        SchemaDefinitionOut(
            id=r.id,
            user_id=r.user_id,
            dataset_id=r.dataset_id,
            name=r.name,
            description=r.description,
            columns=[ExpectedColumn(**c) for c in r.schema_definition],
            created_at=r.created_at,
            updated_at=r.updated_at
        )
        for r in records
    ]

@router.get("/{schema_id}", response_model=SchemaDefinitionOut)
def get_schema(
    schema_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    schema_record = db.query(DatasetSchema).filter(
        DatasetSchema.id == schema_id,
        DatasetSchema.user_id == current_user.id
    ).first()
    if not schema_record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schema definition not found.")

    return SchemaDefinitionOut(
        id=schema_record.id,
        user_id=schema_record.user_id,
        dataset_id=schema_record.dataset_id,
        name=schema_record.name,
        description=schema_record.description,
        columns=[ExpectedColumn(**c) for c in schema_record.schema_definition],
        created_at=schema_record.created_at,
        updated_at=schema_record.updated_at
    )

@router.delete("/{schema_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_schema(
    schema_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    schema_record = db.query(DatasetSchema).filter(
        DatasetSchema.id == schema_id,
        DatasetSchema.user_id == current_user.id
    ).first()
    if not schema_record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schema definition not found.")
    db.delete(schema_record)
    db.commit()
    return None

@router.post("/compare", response_model=SchemaCompatibilityReport)
def compare_schema(
    dataset_id: str = Query(...),
    version_id: Optional[str] = Query(None),
    schema_id: Optional[str] = Query(None),
    custom_columns: Optional[List[ExpectedColumn]] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    dataset, version = get_user_dataset_version(dataset_id, version_id, db, current_user)

    expected_cols = []
    if schema_id:
        schema_rec = db.query(DatasetSchema).filter(
            DatasetSchema.id == schema_id,
            DatasetSchema.user_id == current_user.id
        ).first()
        if not schema_rec:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schema not found.")
        expected_cols = schema_rec.schema_definition
    elif custom_columns:
        expected_cols = [c.model_dump() for c in custom_columns]
    else:
        # Default: auto-generate expected schema from current version for baseline comparison
        expected_cols = [
            {"name": col, "data_type": _schema_type(str(dtype)), "required": True, "nullable": True}
            for col, dtype in version.schema_metadata.items()
        ]

    file_bytes, df = load_version_dataframe(version, dataset.id)

    report = SchemaEngine.compare_schema(
        df=df,
        expected_columns=expected_cols,
        dataset_id=dataset.id,
        version_id=version.id,
        schema_id=schema_id
    )

    return report
