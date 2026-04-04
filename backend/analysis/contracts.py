from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class Alert(BaseModel):
    severity: str = Field(..., description="info|warn|critical")
    dimension: str
    message: str
    metric_key: str
    value: Any


class DimensionMetrics(BaseModel):
    name: str
    score: float = Field(..., ge=0, le=100)
    metrics: Dict[str, Any]
    alerts: List[Alert] = Field(default_factory=list)


class DatasetSummary(BaseModel):
    rows: int
    columns: int
    target_column: Optional[str] = None
    sensitive_columns: List[str] = Field(default_factory=list)
    inferred_types: Dict[str, str] = Field(default_factory=dict)


class AnalysisResult(BaseModel):
    dataset_summary: DatasetSummary
    dimensions: List[DimensionMetrics]
    quality_score: float = Field(..., ge=0, le=100)
    score_breakdown: Dict[str, float]
    remediation_suggestions: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
