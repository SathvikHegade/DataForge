from datetime import datetime, timezone
import uuid
from sqlalchemy import Column, String, Integer, BigInteger, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.database import Base

class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    original_filename = Column(String(255), nullable=False)
    format = Column(String(32), nullable=False) # csv, parquet, json, xlsx
    file_size_bytes = Column(BigInteger, nullable=False, default=0)
    current_version_id = Column(String(36), nullable=True) # ID of the active/latest version
    source = Column(String(32), nullable=False, default="local") # local, kaggle, huggingface
    source_url = Column(String(512), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    owner = relationship("User", back_populates="datasets")
    versions = relationship("DatasetVersion", back_populates="dataset", cascade="all, delete-orphan", foreign_keys="DatasetVersion.dataset_id")
    schemas = relationship("DatasetSchema", back_populates="dataset", cascade="all, delete-orphan")
    transformations = relationship("TransformationRun", back_populates="dataset", cascade="all, delete-orphan")
    validations = relationship("ValidationReport", back_populates="dataset", cascade="all, delete-orphan")
    ml_reports = relationship("MLReadinessReport", back_populates="dataset", cascade="all, delete-orphan")
    jobs = relationship("BackgroundJob", back_populates="dataset", cascade="all, delete-orphan")
