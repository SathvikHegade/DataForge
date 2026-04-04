from __future__ import annotations

from typing import Dict

import pandas as pd

from .contracts import DatasetSummary


def infer_types(df: pd.DataFrame) -> Dict[str, str]:
    inferred: Dict[str, str] = {}
    for col in df.columns:
        dtype = df[col].dtype
        if pd.api.types.is_numeric_dtype(dtype):
            inferred[col] = "numeric"
        elif pd.api.types.is_datetime64_any_dtype(dtype):
            inferred[col] = "datetime"
        else:
            inferred[col] = "categorical"
    return inferred


def build_summary(df: pd.DataFrame, target: str | None, sensitive: list[str]) -> DatasetSummary:
    return DatasetSummary(
        rows=len(df),
        columns=len(df.columns),
        target_column=target,
        sensitive_columns=sensitive,
        inferred_types=infer_types(df),
    )
