from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator


class VisualizationType(str, Enum):
    histogram = "histogram"
    kde = "kde"
    box = "box"
    bar = "bar"
    violin = "violin"
    scatter = "scatter"
    correlation_heatmap = "correlation_heatmap"
    pair_plot = "pair_plot"
    line = "line"
    grouped_box = "grouped_box"
    missing_bar = "missing_bar"
    missing_heatmap = "missing_heatmap"
    outlier = "outlier"
    class_distribution = "class_distribution"


_ALLOWED_AGGREGATIONS = {"count", "sum", "mean", "median", "min", "max", "std", "nunique"}


class VisualizationRequest(BaseModel):
    chart_type: VisualizationType
    columns: List[str] = Field(default_factory=list, max_length=8)
    x_column: Optional[str] = None
    y_column: Optional[str] = None
    group_column: Optional[str] = None
    # Aggregation function for bar / class_distribution charts
    aggregation: str = Field(default="count")
    # Secondary column used as the value when aggregation != count
    value_column: Optional[str] = None
    bins: int = Field(default=20, ge=5, le=100)
    correlation_method: str = Field(default="pearson")
    sample_size: int = Field(default=5000, ge=100, le=20000)

    @field_validator("correlation_method")
    @classmethod
    def validate_correlation_method(cls, value: str) -> str:
        if value not in {"pearson", "spearman"}:
            raise ValueError("correlation_method must be pearson or spearman")
        return value

    @field_validator("aggregation")
    @classmethod
    def validate_aggregation(cls, value: str) -> str:
        if value not in _ALLOWED_AGGREGATIONS:
            raise ValueError(f"aggregation must be one of {sorted(_ALLOWED_AGGREGATIONS)}")
        return value


class VisualizationMetadata(BaseModel):
    """
    Schema-driven metadata returned by GET /visualizations/metadata.
    Provides all information the frontend needs to build dataset-agnostic
    chart controls without any hardcoded column names.
    """
    dataset_id: str
    version_id: str
    version_number: int
    row_count: int
    columns: List[str]
    column_types: Dict[str, str]
    numeric_columns: List[str]
    categorical_columns: List[str]
    date_columns: List[str]
    boolean_columns: List[str] = Field(default_factory=list)
    missing_columns: List[str]
    recommendations: List[Dict[str, Any]]
    # Chart compatibility map: chart_type -> {required_types, n_columns, aggregations}
    chart_compatibility: Dict[str, Any] = Field(default_factory=dict)


class VisualizationResponse(BaseModel):
    """
    Chart response — always includes dynamic axis labels and title.
    """
    chart_type: VisualizationType
    title: str
    # Dynamic axis labels — always derived from chart config, never hardcoded
    x_axis_label: str = ""
    y_axis_label: str = ""
    data: Any
    insights: List[Dict[str, Any]] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
