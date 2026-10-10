import re
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session
import polars as pl
from app.database import get_db
from app.models.user import User
from app.schemas.export import ExportRequest
from app.api.deps import get_current_user, get_user_dataset_version, load_version_dataframe
from app.core.storage import storage_service
from app.engine.exporter import DataExporter

router = APIRouter(prefix="/datasets", tags=["Export"])

@router.post("/{dataset_id}/export")
def export_dataset(
    dataset_id: str,
    req: ExportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    dataset, version = get_user_dataset_version(dataset_id, req.version_id, db, current_user)

    _, df = load_version_dataframe(version, dataset.id)

    try:
        exported_bytes, mime_type, ext = DataExporter.export(
            df=df,
            format_type=req.format,
            columns=req.columns,
            compression=req.compression,
            include_header=req.include_header
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Export failed: {str(e)}"
        )

    clean_name = re.sub(r"[^A-Za-z0-9._-]+", "_", dataset.name).strip("._-").lower() or "dataset"
    filename = f"{clean_name}_v{version.version_number}.{ext}"

    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "X-Dataset-Id": dataset.id,
        "X-Version-Number": str(version.version_number),
        "X-Row-Count": str(df.height),
        "X-Column-Count": str(df.width)
    }

    return Response(
        content=exported_bytes,
        media_type=mime_type,
        headers=headers
    )

