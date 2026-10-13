import io
import uuid
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
import polars as pl
from app.database import get_db
from app.models.user import User
from app.models.dataset import Dataset
from app.models.version import DatasetVersion
from app.models.transformation import TransformationRun
from app.schemas.transformation import (
    TransformationPreviewRequest,
    TransformationPreviewResponse,
    TransformationExecuteRequest,
    TransformationHistoryItem
)
from app.api.deps import get_current_user, get_user_dataset, get_user_dataset_version
from app.core.storage import storage_service
from app.engine.reader import DataReader
from app.engine.transformer import DataTransformer
from app.engine.preview import TransformationPreviewEngine

router = APIRouter(prefix="/transformations", tags=["Transformations"])

SUPPORTED_OPERATIONS = [
    {
        "category": "Missing Values",
        "operation": "drop_missing",
        "title": "Drop Missing Values",
        "description": "Remove rows that contain missing/null values.",
        "params": [
            {"name": "columns", "type": "columns", "required": False, "description": "Specific columns to check (default: all columns)"},
            {"name": "how", "type": "select", "options": ["any", "all"], "default": "any", "description": "'any' drops row if any column is null; 'all' drops only if all are null"}
        ]
    },
    {
        "category": "Missing Values",
        "operation": "fill_missing_constant",
        "title": "Fill Missing (Constant)",
        "description": "Fill null values with a fixed constant or placeholder.",
        "params": [
            {"name": "columns", "type": "columns", "required": True, "description": "Target columns"},
            {"name": "value", "type": "string", "required": True, "description": "Constant replacement value"}
        ]
    },
    {
        "category": "Missing Values",
        "operation": "fill_missing_mean",
        "title": "Fill Missing (Mean)",
        "description": "Impute missing values in numeric columns with the column mean.",
        "params": [
            {"name": "columns", "type": "numeric_columns", "required": True, "description": "Numeric columns to impute"}
        ]
    },
    {
        "category": "Missing Values",
        "operation": "fill_missing_median",
        "title": "Fill Missing (Median)",
        "description": "Impute missing values in numeric columns with the column median.",
        "params": [
            {"name": "columns", "type": "numeric_columns", "required": True, "description": "Numeric columns to impute"}
        ]
    },
    {
        "category": "Missing Values",
        "operation": "fill_missing_mode",
        "title": "Fill Missing (Mode)",
        "description": "Fill null values with the most frequent value in each selected column.",
        "params": [
            {"name": "columns", "type": "columns", "required": True, "description": "Target columns"}
        ]
    },
    {
        "category": "Duplicates",
        "operation": "remove_duplicates",
        "title": "Remove Duplicate Rows",
        "description": "Deduplicate records based on all columns or a designated subset.",
        "params": [
            {"name": "subset", "type": "columns", "required": False, "description": "Subset of columns for uniqueness (default: all)"},
            {"name": "keep", "type": "select", "options": ["first", "last"], "default": "first", "description": "Which record to retain"}
        ]
    },
    {
        "category": "Type Conversion",
        "operation": "cast_type",
        "title": "Cast Column Data Type",
        "description": "Convert column into integer, float, string, boolean, or date.",
        "params": [
            {"name": "column", "type": "single_column", "required": True, "description": "Target column to convert"},
            {"name": "target_type", "type": "select", "options": ["integer", "float", "string", "boolean", "date", "datetime", "categorical"], "required": True, "default": "string"},
            {"name": "invalid_strategy", "type": "select", "options": ["coerce_null", "replace_default", "raise"], "default": "coerce_null"},
            {"name": "default_value", "type": "string", "required": False, "description": "Replacement for invalid or missing values when replace_default is selected"},
            {"name": "format", "type": "string", "required": False, "placeholder": "%Y-%m-%d", "description": "Optional date/datetime parsing format"}
        ]
    },
    {
        "category": "Column Operations",
        "operation": "rename_column",
        "title": "Rename Column",
        "description": "Rename a column to a cleaner or standard name.",
        "params": [
            {"name": "old_name", "type": "single_column", "required": True},
            {"name": "new_name", "type": "string", "required": True}
        ]
    },
    {
        "category": "Column Operations",
        "operation": "drop_column",
        "title": "Drop Columns",
        "description": "Permanently remove redundant or unneeded columns.",
        "params": [
            {"name": "columns", "type": "columns", "required": True}
        ]
    },
    {
        "category": "Column Operations",
        "operation": "select_columns",
        "title": "Select Columns",
        "description": "Keep only the selected columns in the dataset.",
        "params": [
            {"name": "columns", "type": "columns", "required": True}
        ]
    },
    {
        "category": "Column Operations",
        "operation": "duplicate_column",
        "title": "Duplicate Column",
        "description": "Create a copy of a column with a new name.",
        "params": [
            {"name": "source_column", "type": "single_column", "required": True},
            {"name": "new_column", "type": "string", "required": True}
        ]
    },
    {
        "category": "String Operations",
        "operation": "trim_whitespace",
        "title": "Trim Whitespace",
        "description": "Strip leading and trailing spaces from text columns.",
        "params": [
            {"name": "columns", "type": "string_columns", "required": False}
        ]
    },
    {
        "category": "String Operations",
        "operation": "change_case",
        "title": "Change Text Case",
        "description": "Convert string values to lowercase, uppercase, or title case.",
        "params": [
            {"name": "columns", "type": "string_columns", "required": True},
            {"name": "case", "type": "select", "options": ["lower", "upper", "title"], "default": "lower"}
        ]
    },
    {
        "category": "String Operations",
        "operation": "replace_text",
        "title": "Replace Text Pattern",
        "description": "Replace substrings or regex patterns across text columns.",
        "params": [
            {"name": "columns", "type": "string_columns", "required": True},
            {"name": "pattern", "type": "string", "required": True},
            {"name": "replacement", "type": "string", "default": ""},
            {"name": "is_regex", "type": "boolean", "default": False}
        ]
    },
    {
        "category": "String Operations",
        "operation": "normalize_strings",
        "title": "Normalize Strings",
        "description": "Trim text and collapse repeated whitespace.",
        "params": [
            {"name": "columns", "type": "string_columns", "required": False}
        ]
    },
    {
        "category": "Date Operations",
        "operation": "parse_dates",
        "title": "Parse Dates",
        "description": "Convert date strings to standard ISO dates and optionally extract components.",
        "params": [
            {"name": "columns", "type": "columns", "required": True},
            {"name": "format", "type": "string", "required": False, "placeholder": "%Y-%m-%d"},
            {"name": "extract_components", "type": "multiselect", "options": ["year", "month", "day", "day_of_week"], "default": []}
        ]
    },
    {
        "category": "Numerical",
        "operation": "standard_scale",
        "title": "Standard Scaler (Z-Score)",
        "description": "Standardize features by removing the mean and scaling to unit variance.",
        "params": [
            {"name": "columns", "type": "numeric_columns", "required": True}
        ]
    },
    {
        "category": "Numerical",
        "operation": "min_max_scale",
        "title": "Min-Max Scaler",
        "description": "Scale numerical values into a fixed range [0, 1].",
        "params": [
            {"name": "columns", "type": "numeric_columns", "required": True},
            {"name": "min_target", "type": "number", "default": 0.0},
            {"name": "max_target", "type": "number", "default": 1.0}
        ]
    },
    {
        "category": "Numerical",
        "operation": "log_transform",
        "title": "Logarithmic Transform",
        "description": "Apply log1p transform (log(1+x)) to reduce skewness in positive numeric values.",
        "params": [
            {"name": "columns", "type": "numeric_columns", "required": True}
        ]
    },
    {
        "category": "Categorical",
        "operation": "one_hot_encode",
        "title": "One-Hot Encoding",
        "description": "Convert categorical string columns into binary indicator variables.",
        "params": [
            {"name": "columns", "type": "columns", "required": True},
            {"name": "drop_first", "type": "boolean", "default": False}
        ]
    },
    {
        "category": "Categorical",
        "operation": "ordinal_encode",
        "title": "Ordinal Encoding",
        "description": "Replace ordered categories with their configured integer ranks.",
        "params": [
            {"name": "column", "type": "single_column", "required": True},
            {"name": "order", "type": "array", "required": True, "description": "Categories from lowest to highest rank"}
        ]
    },
    {
        "category": "Outlier Handling",
        "operation": "handle_outliers",
        "title": "Outlier Handling (IQR / Z-Score)",
        "description": "Detect outliers using 1.5x IQR and either clip to boundary or filter out.",
        "params": [
            {"name": "columns", "type": "numeric_columns", "required": True},
            {"name": "method", "type": "select", "options": ["iqr", "zscore"], "default": "iqr"},
            {"name": "action", "type": "select", "options": ["clip", "remove"], "default": "clip"}
        ]
    },
    {
        "category": "Row Operations",
        "operation": "filter_rows",
        "title": "Filter Rows",
        "description": "Filter rows matching a conditional rule.",
        "params": [
            {"name": "column", "type": "single_column", "required": True},
            {"name": "operator", "type": "select", "options": ["==", "!=", ">", "<", ">=", "<=", "contains", "is_not_null", "is_null"], "default": "=="},
            {"name": "value", "type": "string", "required": False}
        ]
    },
    {
        "category": "Row Operations",
        "operation": "sort_rows",
        "title": "Sort Rows",
        "description": "Order dataset rows by one or more columns.",
        "params": [
            {"name": "columns", "type": "columns", "required": True},
            {"name": "descending", "type": "boolean", "default": False}
        ]
    }
]

@router.get("/operations")
def get_operations():
    return SUPPORTED_OPERATIONS

@router.post("/preview", response_model=TransformationPreviewResponse)
def preview_transformation(
    req: TransformationPreviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    dataset, version = get_user_dataset_version(req.dataset_id, req.version_id, db, current_user)

    file_bytes = storage_service.get_file_bytes(version.storage_path)
    df = pl.read_parquet(file_bytes)

    preview_result = TransformationPreviewEngine.preview(df, req.operation, req.parameters)
    return preview_result

@router.post("/execute", status_code=status.HTTP_201_CREATED)
def execute_transformation(
    req: TransformationExecuteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    dataset, source_ver = get_user_dataset_version(req.dataset_id, req.version_id, db, current_user)

    # Read source data
    src_bytes = storage_service.get_file_bytes(source_ver.storage_path)
    df = pl.read_parquet(src_bytes)

    # Execute transformation
    try:
        transformed_df, details = DataTransformer.apply_transformation(df, req.operation, req.parameters)
    except Exception as e:
        # Record failed run
        failed_run = TransformationRun(
            dataset_id=dataset.id,
            source_version_id=source_ver.id,
            target_version_id=None,
            operation=req.operation,
            parameters=req.parameters,
            status="failed",
            error_message=str(e),
            executed_by_user_id=current_user.id,
            completed_at=datetime.now(timezone.utc)
        )
        db.add(failed_run)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Transformation execution failed: {str(e)}"
        )

    # Convert to Parquet bytes
    parquet_bytes = DataReader.dataframe_to_parquet_bytes(transformed_df)

    # Increment version
    latest_ver = db.query(DatasetVersion).filter(
        DatasetVersion.dataset_id == dataset.id
    ).order_by(DatasetVersion.version_number.desc()).first()
    new_version_num = (latest_ver.version_number + 1) if latest_ver else 1

    new_version_id = str(uuid.uuid4())
    storage_path = f"datasets/{dataset.id}/v{new_version_num}_{uuid.uuid4().hex[:8]}.parquet"
    saved_path, checksum, file_size = storage_service.save_file(
        file_obj=io.BytesIO(parquet_bytes),
        filename=storage_path,
        content_type="application/octet-stream"
    )

    metadata = DataReader.extract_metadata(transformed_df)

    # Save new Version
    branch = req.branch_name if req.branch_name and req.branch_name.strip() else source_ver.branch_name
    new_version = DatasetVersion(
        id=new_version_id,
        dataset_id=dataset.id,
        version_number=new_version_num,
        branch_name=branch,
        parent_version_id=source_ver.id,
        storage_path=saved_path,
        file_checksum=checksum,
        file_format="parquet",
        row_count=transformed_df.height,
        column_count=transformed_df.width,
        schema_metadata=metadata["schema"],
        transformation_operation=req.operation,
        transformation_params=req.parameters,
        execution_status="ready",
        created_by_user_id=current_user.id,
        created_at=datetime.now(timezone.utc)
    )
    db.add(new_version)
    db.flush()

    # Update dataset current version
    dataset.current_version_id = new_version.id
    dataset.updated_at = datetime.now(timezone.utc)

    # Record successful transformation run
    trans_run = TransformationRun(
        id=str(uuid.uuid4()),
        dataset_id=dataset.id,
        source_version_id=source_ver.id,
        target_version_id=new_version.id,
        operation=req.operation,
        parameters=req.parameters,
        status="completed",
        summary=details,
        executed_by_user_id=current_user.id,
        completed_at=datetime.now(timezone.utc)
    )
    db.add(trans_run)
    db.commit()

    return {
        "success": True,
        "message": f"Successfully applied {req.operation}. Created Version {new_version.version_number}.",
        "new_version_id": new_version.id,
        "version_number": new_version.version_number,
        "branch_name": new_version.branch_name,
        "row_count": new_version.row_count,
        "column_count": new_version.column_count,
        "summary": details
    }

@router.get("/history/{dataset_id}", response_model=List[TransformationHistoryItem])
def get_transformation_history(
    dataset_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    dataset = get_user_dataset(dataset_id, db, current_user)
    runs = db.query(TransformationRun).filter(
        TransformationRun.dataset_id == dataset.id
    ).order_by(desc(TransformationRun.started_at)).all()
    return runs
