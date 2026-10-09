from typing import Optional

import polars as pl
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_user_dataset_version, load_version_dataframe
from app.database import get_db
from app.engine.visualizer import generate_chart, metadata
from app.models.user import User
from app.schemas.visualization import VisualizationMetadata, VisualizationRequest, VisualizationResponse

router = APIRouter(prefix="/datasets", tags=["Data Visualisation"])


def _load_version(dataset_id: str, version_id: Optional[str], db: Session, current_user: User):
    dataset, version = get_user_dataset_version(dataset_id, version_id, db, current_user)
    _, df = load_version_dataframe(version, dataset.id)
    return dataset, version, df


@router.get("/{dataset_id}/visualizations/metadata", response_model=VisualizationMetadata)
def get_visualization_metadata(
    dataset_id: str,
    version_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    dataset, version, df = _load_version(dataset_id, version_id, db, current_user)
    return metadata(df, dataset.id, version.id, version.version_number)


@router.post("/{dataset_id}/visualizations/chart", response_model=VisualizationResponse)
def create_visualization(
    dataset_id: str,
    request: VisualizationRequest,
    version_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _, _, df = _load_version(dataset_id, version_id, db, current_user)
    try:
        return generate_chart(
            df=df,
            chart_type=request.chart_type.value,
            columns=request.columns,
            x_column=request.x_column,
            y_column=request.y_column,
            group_column=request.group_column,
            bins=request.bins,
            correlation_method=request.correlation_method,
            sample_size=request.sample_size,
            aggregation=request.aggregation,
            value_column=request.value_column,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
