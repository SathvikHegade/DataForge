import os
from pydantic import model_validator
from pydantic_settings import BaseSettings
from typing import Optional

DEFAULT_SECRET_KEY = "dataforge-super-secret-key-change-in-production-min-32-chars"

class Settings(BaseSettings):
    PROJECT_NAME: str = "DataForge"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"
    
    # Security
    SECRET_KEY: str = DEFAULT_SECRET_KEY
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440 # 24 hours
    
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./dataforge.db")
    
    # Redis & Celery
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    
    # Object Storage
    STORAGE_BACKEND: str = os.getenv("STORAGE_BACKEND", "local") # "s3" or "local"
    S3_ENDPOINT_URL: Optional[str] = os.getenv("S3_ENDPOINT_URL", "http://localhost:9000")
    S3_ACCESS_KEY: str = os.getenv("S3_ACCESS_KEY", "minioadmin")
    S3_SECRET_KEY: str = os.getenv("S3_SECRET_KEY", "minioadmin")
    S3_BUCKET_NAME: str = os.getenv("S3_BUCKET_NAME", "dataforge-datasets")
    S3_SECURE: bool = os.getenv("S3_SECURE", "false").lower() in ("true", "1")
    CORS_ORIGINS: str = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173,https://dataforge-orcin.vercel.app,https://dataforge-1-9ycn.onrender.com",
    )
    
    # Local Storage Directory
    LOCAL_STORAGE_DIR: str = os.getenv("LOCAL_STORAGE_DIR", "./data_storage")
    
    # Limits & Processing
    MAX_UPLOAD_SIZE_MB: int = 500
    MAX_PREVIEW_ROWS: int = 1000
    CHUNK_SIZE_ROWS: int = 50000

    # External Integrations (Kaggle & Hugging Face)
    KAGGLE_USERNAME: Optional[str] = os.getenv("KAGGLE_USERNAME", None)
    KAGGLE_KEY: Optional[str] = os.getenv("KAGGLE_KEY", None)
    KAGGLE_API_TOKEN: Optional[str] = os.getenv("KAGGLE_API_TOKEN", None)
    HF_TOKEN: Optional[str] = os.getenv("HF_TOKEN", None)

    class Config:
        case_sensitive = True
        env_file = ".env"
        extra = "ignore"

    @model_validator(mode="after")
    def validate_production_security(self):
        if self.ENVIRONMENT.lower() in {"production", "prod"}:
            if self.SECRET_KEY == DEFAULT_SECRET_KEY or len(self.SECRET_KEY) < 32:
                raise ValueError("A unique SECRET_KEY of at least 32 characters is required in production.")
            if "*" in self.CORS_ORIGINS.split(","):
                raise ValueError("Wildcard CORS origins are not allowed in production.")
        return self

settings = Settings()
