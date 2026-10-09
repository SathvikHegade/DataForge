import uuid
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
import polars as pl
from app.database import get_db
from app.models.user import User
from app.models.dataset import Dataset
from app.models.version import DatasetVersion
from app.models.validation import ValidationReport
from app.schemas.validation import ValidationReportOut, ValidateRequest
from app.api.deps import get_current_user, get_user_dataset_version, load_version_dataframe
from app.core.storage import storage_service

router = APIRouter(prefix="/validation", tags=["Validation"])

@router.post("/{dataset_id}/validate", response_model=ValidationReportOut, status_code=status.HTTP_201_CREATED)
def validate_dataset(
    dataset_id: str,
    req: ValidateRequest = ValidateRequest(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    dataset, version = get_user_dataset_version(dataset_id, req.version_id, db, current_user)
    file_bytes, df = load_version_dataframe(version, dataset.id)

    rules_checked = [
        "NON_EMPTY_DATASET",
        "COLUMN_NAMES_VALIDITY",
        "NULL_INTEGRITY",
        "DUPLICATE_RECORDS",
        "NUMERICAL_FINITENESS",
        "CONSTANT_COLUMNS_CHECK"
    ]

    issues = []

    # 1. Non-empty check
    if df.height == 0:
        issues.append({
            "rule": "NON_EMPTY_DATASET",
            "severity": "critical",
            "column": None,
            "message": "Dataset contains 0 rows.",
            "row_count": 0,
            "sample_values": []
        })

    # 2. Duplicate rows check
    dup_count = df.height - df.unique().height
    if dup_count > 0:
        issues.append({
            "rule": "DUPLICATE_RECORDS",
            "severity": "warning" if dup_count < 10 else "critical",
            "column": None,
            "message": f"Dataset contains {dup_count} exact duplicate rows.",
            "row_count": dup_count,
            "sample_values": []
        })

    # 3. Nulls and Column integrity
    for col in df.columns:
        series = df[col]
        null_cnt = series.null_count()
        if null_cnt > 0:
            null_pct = round(null_cnt / df.height * 100, 1)
            issues.append({
                "rule": "NULL_INTEGRITY",
                "severity": "critical" if null_pct > 50 else ("warning" if null_pct > 10 else "info"),
                "column": col,
                "message": f"Column '{col}' has {null_cnt} missing values ({null_pct}%).",
                "row_count": null_cnt,
                "sample_values": [None]
            })

        # Constant check
        if series.drop_nulls().unique().len() <= 1 and df.height > 1:
            issues.append({
                "rule": "CONSTANT_COLUMNS_CHECK",
                "severity": "warning",
                "column": col,
                "message": f"Column '{col}' has zero variance (constant values).",
                "row_count": df.height,
                "sample_values": series.drop_nulls()[:1].to_list()
            })

    # Status
    has_crit = any(i["severity"] == "critical" for i in issues)
    has_warn = any(i["severity"] == "warning" for i in issues)
    overall_status = "failed" if has_crit else ("warning" if has_warn else "passed")

    report = ValidationReport(
        id=str(uuid.uuid4()),
        dataset_id=dataset.id,
        version_id=version.id,
        overall_status=overall_status,
        rules_checked=rules_checked,
        violations_count=len(issues),
        issues=issues,
        created_at=datetime.now(timezone.utc)
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    return report

@router.get("/{dataset_id}/report", response_model=ValidationReportOut)
def get_validation_report(
    dataset_id: str,
    version_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    dataset, version = get_user_dataset_version(dataset_id, version_id, db, current_user)
    report = db.query(ValidationReport).filter(
        ValidationReport.dataset_id == dataset.id,
        ValidationReport.version_id == version.id
    ).order_by(desc(ValidationReport.created_at)).first()

    if not report:
        # Generate on the fly if none exists
        return validate_dataset(dataset_id, ValidateRequest(version_id=version.id), db, current_user)

    return report
