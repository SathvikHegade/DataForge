from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.config import settings
from app.database import engine, Base
from app.api.routes import api_router
from app.core.storage import storage_service
import app.models # ensure all models are registered

# Create database tables if they do not exist
Base.metadata.create_all(bind=engine)

def _ensure_schema_columns():
    try:
        from sqlalchemy import inspect
        with engine.begin() as conn:
            inspector = inspect(conn)
            if "datasets" in inspector.get_table_names():
                existing_cols = {c["name"] for c in inspector.get_columns("datasets")}
                if "source" not in existing_cols:
                    conn.execute(text("ALTER TABLE datasets ADD COLUMN source VARCHAR(32) DEFAULT 'local'"))
                if "source_url" not in existing_cols:
                    conn.execute(text("ALTER TABLE datasets ADD COLUMN source_url VARCHAR(512)"))
    except Exception:
        pass

_ensure_schema_columns()

app = FastAPI(
    title="DataForge API",
    description="Intelligent Data Preparation & ML Readiness Platform",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    redirect_slashes=False
)

# CORS
origins = [
    origin.strip()
    for origin in settings.CORS_ORIGINS.split(",")
    if origin.strip()
]
required_origins = ["https://dataforge-1-9ycn.onrender.com"]
origins.extend(origin for origin in required_origins if origin not in origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https://.*\.onrender\.com",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-Dataset-Id", "X-Version-Number", "X-Row-Count", "X-Column-Count"]
)

from fastapi import Request
from fastapi.responses import JSONResponse
from app.core.exceptions import DatasetStorageNotFoundError

# Startup sync for local disk cache to database persistence
if hasattr(storage_service, "sync_local_disk_to_db"):
    try:
        storage_service.sync_local_disk_to_db()
    except Exception:
        pass

@app.exception_handler(DatasetStorageNotFoundError)
async def dataset_storage_not_found_handler(request: Request, exc: DatasetStorageNotFoundError):
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.detail if isinstance(exc.detail, dict) else {
            "error": "DATASET_FILE_NOT_FOUND",
            "message": str(exc.detail),
            "recoverable": True,
            "detail": str(exc.detail),
        },
    )

@app.exception_handler(FileNotFoundError)
async def file_not_found_exception_handler(request: Request, exc: FileNotFoundError):
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={
            "error": "DATASET_FILE_NOT_FOUND",
            "message": "The dataset storage file could not be found.",
            "recoverable": True,
            "detail": "The dataset storage file could not be found.",
        },
    )

# Health Checks
@app.get("/health", status_code=status.HTTP_200_OK, tags=["Health"])
def health_check():
    return {
        "status": "healthy",
        "service": "DataForge Backend",
        "version": "1.0.0",
        "storage_backend": settings.STORAGE_BACKEND,
        "storage_directory": settings.effective_storage_dir
    }

@app.get("/health/ready", status_code=status.HTTP_200_OK, tags=["Health"])
def readiness_check():
    db_ok = False
    storage_ok = False

    # Check DB
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    # Check Storage
    try:
        storage_ok = storage_service.is_ready()
    except Exception:
        storage_ok = False

    return {
        "status": "ready" if (db_ok and storage_ok) else "degraded",
        "database": "connected" if db_ok else "unreachable",
        "storage": "connected" if storage_ok else "unreachable"
    }

# Include all API routes
app.include_router(api_router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
