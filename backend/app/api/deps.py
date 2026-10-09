from typing import Generator, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.dataset import Dataset
from app.models.version import DatasetVersion
from app.core.security import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

def get_current_user(
    db: Session = Depends(get_db),
    token: Optional[str] = Depends(oauth2_scheme)
) -> User:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user account."
        )
    return user

def get_user_dataset(
    dataset_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Dataset:
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found.")
    if dataset.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied: You do not own this dataset.")
    return dataset

def get_user_dataset_version(
    dataset_id: str,
    version_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> tuple[Dataset, DatasetVersion]:
    dataset = get_user_dataset(dataset_id, db, current_user)
    if version_id:
        version = db.query(DatasetVersion).filter(
            DatasetVersion.id == version_id,
            DatasetVersion.dataset_id == dataset.id
        ).first()
        if not version:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset version not found.")
    else:
        # Pick dataset.current_version_id or latest version
        if dataset.current_version_id:
            version = db.query(DatasetVersion).filter(DatasetVersion.id == dataset.current_version_id).first()
        else:
            version = db.query(DatasetVersion).filter(DatasetVersion.dataset_id == dataset.id).order_by(DatasetVersion.version_number.desc()).first()

        if not version:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No versions found for this dataset.")
    return dataset, version


def load_version_dataframe(version: DatasetVersion, dataset_id: str):
    """
    Safely retrieves the file bytes and Polars DataFrame for a given version.
    Raises structured DatasetStorageNotFoundError if the storage file is missing.
    """
    import polars as pl
    from app.core.storage import storage_service
    from app.core.exceptions import DatasetStorageNotFoundError

    try:
        file_bytes = storage_service.get_file_bytes(version.storage_path)
    except FileNotFoundError as exc:
        raise DatasetStorageNotFoundError(dataset_id=dataset_id) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unable to read dataset version from storage: {exc}"
        ) from exc

    try:
        df = pl.read_parquet(file_bytes)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unable to parse dataset parquet data: {exc}"
        ) from exc

    return file_bytes, df
