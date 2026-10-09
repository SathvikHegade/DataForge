from datetime import datetime, timezone
from sqlalchemy import Column, String, BigInteger, DateTime, LargeBinary
from app.database import Base

class StoredFile(Base):
    __tablename__ = "stored_files"

    storage_path = Column(String(512), primary_key=True, index=True)
    content = Column(LargeBinary, nullable=False)
    checksum = Column(String(64), nullable=True)
    file_size = Column(BigInteger, nullable=False, default=0)
    content_type = Column(String(128), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
