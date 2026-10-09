from typing import Optional
from fastapi import HTTPException, status

class DatasetStorageNotFoundError(HTTPException):
    def __init__(self, dataset_id: Optional[str] = None, message: str = "The dataset storage file could not be found."):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": "DATASET_FILE_NOT_FOUND",
                "message": message,
                "dataset_id": dataset_id or "unknown",
                "recoverable": True,
            }
        )
