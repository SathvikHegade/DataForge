from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
import polars as pl
from app.database import get_db
from app.models.user import User
from app.schemas.profiling import ProfilingReport
from app.api.deps import get_current_user, get_user_dataset_version, load_version_dataframe
from app.engine.profiler import DataProfiler

router = APIRouter(prefix="/datasets", tags=["Profiling"])

@router.post("/{dataset_id}/profile", response_model=ProfilingReport)
def generate_profile(
    dataset_id: str,
    version_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    dataset, version = get_user_dataset_version(dataset_id, version_id, db, current_user)
    file_bytes, df = load_version_dataframe(version, dataset.id)

    report_dict = DataProfiler.profile_dataframe(
        df=df,
        dataset_id=dataset.id,
        version_id=version.id,
        version_number=version.version_number,
        file_size_bytes=len(file_bytes)
    )

    return report_dict

@router.get("/{dataset_id}/profile", response_model=ProfilingReport)
def get_profile(
    dataset_id: str,
    version_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return generate_profile(dataset_id, version_id, db, current_user)
