from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

class DatasetCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None

class DatasetVersionBrief(BaseModel):
    id: str
    version_number: int
    branch_name: str
    row_count: int
    column_count: int
    created_at: datetime
    execution_status: str

    class Config:
        from_attributes = True

class DatasetOut(BaseModel):
    id: str
    user_id: str
    name: str
    description: Optional[str] = None
    original_filename: str
    format: str
    file_size_bytes: int
    current_version_id: Optional[str] = None
    source: str = "local"
    source_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    current_version: Optional[DatasetVersionBrief] = None

    class Config:
        from_attributes = True

class DatasetListItem(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    original_filename: str
    format: str
    file_size_bytes: int
    current_version_id: Optional[str] = None
    row_count: Optional[int] = 0
    column_count: Optional[int] = 0
    version_number: Optional[int] = 1
    source: str = "local"
    source_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class KaggleImportRequest(BaseModel):
    url: str = Field(..., min_length=1, max_length=512, description="Kaggle dataset URL or username/dataset-name identifier")
    name: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None

class HuggingFaceImportRequest(BaseModel):
    url: str = Field(..., min_length=1, max_length=512, description="Hugging Face dataset URL or repository identifier")
    split: Optional[str] = Field(None, max_length=128)
    name: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None

class HuggingFaceSplitsRequest(BaseModel):
    url: str = Field(..., min_length=1, max_length=512, description="Hugging Face dataset URL or repository identifier")

class HuggingFaceSplitsResponse(BaseModel):
    repository: str
    splits: List[str]
    default_split: str
    suggested_name: Optional[str] = None
    description: Optional[str] = None

class DatasetPreviewResponse(BaseModel):
    dataset_id: str
    version_id: str
    version_number: int
    total_rows: int
    total_columns: int
    columns: List[str]
    column_types: Dict[str, str]
    page: int
    page_size: int
    rows: List[Dict[str, Any]]
