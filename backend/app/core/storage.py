import os
import io
import hashlib
import logging
from typing import BinaryIO, Optional, Tuple
from abc import ABC, abstractmethod
from app.config import settings

logger = logging.getLogger(__name__)

class StorageService(ABC):
    @abstractmethod
    def is_ready(self) -> bool:
        """Returns whether the configured storage backend is reachable and usable."""
        pass

    @abstractmethod
    def save_file(self, file_obj: BinaryIO, filename: str, content_type: Optional[str] = None) -> Tuple[str, str, int]:
        """Saves a file and returns (storage_path, sha256_checksum, byte_size)"""
        pass

    @abstractmethod
    def get_file_bytes(self, storage_path: str) -> bytes:
        """Retrieves raw bytes for a file"""
        pass

    @abstractmethod
    def get_file_stream(self, storage_path: str) -> BinaryIO:
        """Retrieves a readable binary stream for a file"""
        pass

    @abstractmethod
    def delete_file(self, storage_path: str) -> bool:
        """Deletes a file if it exists"""
        pass

    @abstractmethod
    def exists(self, storage_path: str) -> bool:
        """Checks if a file exists"""
        pass


class LocalStorageService(StorageService):
    def __init__(self, base_dir: Optional[str] = None):
        self.base_dir = os.path.abspath(base_dir or settings.effective_storage_dir)
        os.makedirs(self.base_dir, exist_ok=True)

    def _get_full_path(self, storage_path: str) -> str:
        # Normalize and reject paths that escape the configured storage root.
        clean_path = storage_path.replace("\\", "/").lstrip("/")
        full_path = os.path.abspath(os.path.join(self.base_dir, clean_path))
        if os.path.commonpath((self.base_dir, full_path)) != self.base_dir:
            raise ValueError("Storage path escapes the configured storage directory.")
        return full_path

    @staticmethod
    def _clean_path(storage_path: str) -> str:
        return storage_path.replace("\\", "/").lstrip("/")

    def _persist_to_db(self, clean_path: str, content: bytes, checksum: str, size: int, content_type: Optional[str]):
        """Persists file bytes into the database fallback table (StoredFile)."""
        try:
            from app.database import SessionLocal
            from app.models.stored_file import StoredFile
            with SessionLocal() as db:
                record = db.query(StoredFile).filter(StoredFile.storage_path == clean_path).first()
                if record:
                    record.content = content
                    record.checksum = checksum
                    record.file_size = size
                    record.content_type = content_type
                else:
                    record = StoredFile(
                        storage_path=clean_path,
                        content=content,
                        checksum=checksum,
                        file_size=size,
                        content_type=content_type,
                    )
                    db.add(record)
                db.commit()
        except Exception as exc:
            logger.warning("Failed to persist file %s to database fallback: %s", clean_path, exc)

    def _rehydrate_from_db(self, clean_path: str, full_path: str) -> Optional[bytes]:
        """Restores file bytes from the database fallback table onto the local filesystem."""
        try:
            from app.database import SessionLocal
            from app.models.stored_file import StoredFile
            with SessionLocal() as db:
                record = db.query(StoredFile).filter(StoredFile.storage_path == clean_path).first()
                if record and record.content:
                    os.makedirs(os.path.dirname(full_path), exist_ok=True)
                    with open(full_path, "wb") as f:
                        f.write(record.content)
                    logger.info("Successfully re-hydrated file '%s' from database to disk cache.", clean_path)
                    return record.content
        except Exception as exc:
            logger.warning("Failed to rehydrate file %s from database: %s", clean_path, exc)
        return None

    def is_ready(self) -> bool:
        return os.path.isdir(self.base_dir) and os.access(self.base_dir, os.W_OK)

    def save_file(self, file_obj: BinaryIO, filename: str, content_type: Optional[str] = None) -> Tuple[str, str, int]:
        clean_rel_path = self._clean_path(filename)
        full_path = self._get_full_path(clean_rel_path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)

        hasher = hashlib.sha256()
        total_size = 0
        all_bytes = bytearray()

        file_obj.seek(0)
        with open(full_path, "wb") as f:
            while chunk := file_obj.read(1024 * 1024):  # 1MB chunks
                hasher.update(chunk)
                f.write(chunk)
                all_bytes.extend(chunk)
                total_size += len(chunk)

        checksum = hasher.hexdigest()
        raw_bytes = bytes(all_bytes)

        # Persist to database fallback table for survive-restart resilience
        self._persist_to_db(clean_rel_path, raw_bytes, checksum, total_size, content_type)

        return clean_rel_path, checksum, total_size

    def get_file_bytes(self, storage_path: str) -> bytes:
        clean_path = self._clean_path(storage_path)
        full_path = self._get_full_path(clean_path)

        # 1. Fast local disk access
        if os.path.exists(full_path):
            try:
                with open(full_path, "rb") as f:
                    return f.read()
            except OSError as exc:
                logger.warning("Disk read failed for %s (%s). Attempting DB fallback.", full_path, exc)

        # 2. Database re-hydration (critical for surviving Render container restarts/redeployments)
        rehydrated = self._rehydrate_from_db(clean_path, full_path)
        if rehydrated is not None:
            return rehydrated

        raise FileNotFoundError(f"Storage file '{clean_path}' not found on disk or database.")

    def get_file_stream(self, storage_path: str) -> BinaryIO:
        clean_path = self._clean_path(storage_path)
        full_path = self._get_full_path(clean_path)

        if not os.path.exists(full_path):
            rehydrated = self._rehydrate_from_db(clean_path, full_path)
            if rehydrated is not None:
                return io.BytesIO(rehydrated)
            raise FileNotFoundError(f"Storage file '{clean_path}' not found on disk or database.")

        return open(full_path, "rb")

    def delete_file(self, storage_path: str) -> bool:
        clean_path = self._clean_path(storage_path)
        full_path = self._get_full_path(clean_path)
        deleted = False

        if os.path.exists(full_path):
            try:
                os.remove(full_path)
                deleted = True
            except OSError:
                deleted = False

        # Also remove from DB fallback
        try:
            from app.database import SessionLocal
            from app.models.stored_file import StoredFile
            with SessionLocal() as db:
                record = db.query(StoredFile).filter(StoredFile.storage_path == clean_path).first()
                if record:
                    db.delete(record)
                    db.commit()
                    deleted = True
        except Exception as exc:
            logger.warning("Failed to delete %s from database fallback: %s", clean_path, exc)

        return deleted

    def exists(self, storage_path: str) -> bool:
        clean_path = self._clean_path(storage_path)
        full_path = self._get_full_path(clean_path)

        if os.path.exists(full_path):
            return True

        # Check DB fallback
        try:
            from app.database import SessionLocal
            from app.models.stored_file import StoredFile
            with SessionLocal() as db:
                return db.query(StoredFile.storage_path).filter(StoredFile.storage_path == clean_path).first() is not None
        except Exception:
            return False

    def sync_local_disk_to_db(self):
        """Scans existing local dataset files and backs them up to the database if not present."""
        try:
            from app.database import SessionLocal
            from app.models.stored_file import StoredFile

            with SessionLocal() as db:
                for root, _, files in os.walk(self.base_dir):
                    for file in files:
                        full_path = os.path.join(root, file)
                        rel_path = os.path.relpath(full_path, self.base_dir).replace("\\", "/")
                        existing = db.query(StoredFile.storage_path).filter(StoredFile.storage_path == rel_path).first()
                        if not existing:
                            try:
                                with open(full_path, "rb") as f:
                                    content = f.read()
                                checksum = hashlib.sha256(content).hexdigest()
                                db.add(StoredFile(
                                    storage_path=rel_path,
                                    content=content,
                                    checksum=checksum,
                                    file_size=len(content),
                                    content_type="application/octet-stream"
                                ))
                                db.commit()
                                logger.info("Synced local file '%s' into database fallback.", rel_path)
                            except Exception as e:
                                db.rollback()
                                logger.warning("Failed to sync '%s' to database: %s", rel_path, e)
        except Exception as exc:
            logger.warning("Could not run local disk to DB sync: %s", exc)


class S3StorageService(StorageService):
    def __init__(self):
        self._available = False
        self.local_fallback = LocalStorageService()
        try:
            from minio import Minio
            endpoint = settings.S3_ENDPOINT_URL.replace("http://", "").replace("https://", "").rstrip("/")
            self.client = Minio(
                endpoint,
                access_key=settings.S3_ACCESS_KEY,
                secret_key=settings.S3_SECRET_KEY,
                secure=settings.S3_SECURE
            )
            self.bucket_name = settings.S3_BUCKET_NAME
            if not self.client.bucket_exists(self.bucket_name):
                self.client.make_bucket(self.bucket_name)
            self._available = True
        except Exception as e:
            logger.warning("MinIO/S3 unavailable (%s). Falling back to persistent local/database storage.", e)
            self._available = False

    @staticmethod
    def _clean_object_path(storage_path: str) -> str:
        clean_path = storage_path.replace("\\", "/").lstrip("/")
        if any(part == ".." for part in clean_path.split("/")):
            raise ValueError("Storage path contains a parent-directory segment.")
        return clean_path

    def save_file(self, file_obj: BinaryIO, filename: str, content_type: Optional[str] = None) -> Tuple[str, str, int]:
        if not self._available:
            return self.local_fallback.save_file(file_obj, filename, content_type)

        clean_path = self._clean_object_path(filename)
        file_obj.seek(0, io.SEEK_END)
        size = file_obj.tell()
        file_obj.seek(0)

        hasher = hashlib.sha256()
        while chunk := file_obj.read(1024 * 1024):
            hasher.update(chunk)
        checksum = hasher.hexdigest()
        file_obj.seek(0)

        self.client.put_object(
            bucket_name=self.bucket_name,
            object_name=clean_path,
            data=file_obj,
            length=size,
            content_type=content_type or "application/octet-stream"
        )
        return clean_path, checksum, size

    def is_ready(self) -> bool:
        return self.client.bucket_exists(self.bucket_name) if self._available else self.local_fallback.is_ready()

    def get_file_bytes(self, storage_path: str) -> bytes:
        if not self._available:
            return self.local_fallback.get_file_bytes(storage_path)
        clean_path = self._clean_object_path(storage_path)
        response = self.client.get_object(self.bucket_name, clean_path)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()

    def get_file_stream(self, storage_path: str) -> BinaryIO:
        if not self._available:
            return self.local_fallback.get_file_stream(storage_path)
        clean_path = self._clean_object_path(storage_path)
        response = self.client.get_object(self.bucket_name, clean_path)
        data = response.read()
        response.close()
        response.release_conn()
        return io.BytesIO(data)

    def delete_file(self, storage_path: str) -> bool:
        if not self._available:
            return self.local_fallback.delete_file(storage_path)
        try:
            clean_path = self._clean_object_path(storage_path)
            self.client.remove_object(self.bucket_name, clean_path)
            return True
        except Exception:
            return False

    def exists(self, storage_path: str) -> bool:
        if not self._available:
            return self.local_fallback.exists(storage_path)
        try:
            clean_path = self._clean_object_path(storage_path)
            self.client.stat_object(self.bucket_name, clean_path)
            return True
        except Exception:
            return False


def get_storage() -> StorageService:
    if settings.STORAGE_BACKEND == "s3":
        try:
            service = S3StorageService()
            if service._available:
                return service
            return service.local_fallback
        except Exception:
            return LocalStorageService()
    return LocalStorageService()


storage_service = get_storage()
