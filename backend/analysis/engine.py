from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd

from .bias import analyze_bias
from .contracts import AnalysisResult
from .duplication import analyze_duplication
from .imbalance import analyze_imbalance
from .noise import analyze_noise
from .schema_profiler import build_summary
from .scoring import compose_score


def load_dataset(path: str) -> pd.DataFrame:
    p = Path(path)
    suffix = p.suffix.lower()
    if suffix == ".csv":
        return pd.read_csv(p)
    if suffix == ".parquet":
        return pd.read_parquet(p)
    if suffix == ".jsonl":
        return pd.read_json(p, lines=True)
    raise ValueError(f"Unsupported file format: {suffix}")


def run_full_analysis(file_path: str, config: dict[str, Any] | None = None) -> dict[str, Any]:
    config = config or {}
    target = config.get("target_column")
    sensitive = config.get("sensitive_columns", [])
    weights = config.get("weights")

    df = load_dataset(file_path)
    summary = build_summary(df, target, sensitive)
    dimensions = [
        analyze_bias(df, target, sensitive),
        analyze_noise(df),
        analyze_duplication(df),
        analyze_imbalance(df, target),
    ]

    quality_score, breakdown = compose_score(dimensions, weights)
    suggestions = [
        "Address columns with highest missing ratio first.",
        "Investigate sensitive group disparity and rebalance training data if needed.",
        "Drop exact duplicates and review near-duplicate clusters.",
    ]
    result = AnalysisResult(
        dataset_summary=summary,
        dimensions=dimensions,
        quality_score=quality_score,
        score_breakdown=breakdown,
        remediation_suggestions=suggestions,
        metadata={"engine": "dataforge-sentinel-v1"},
    )
    return result.model_dump()
