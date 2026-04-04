from __future__ import annotations

import pandas as pd
from rapidfuzz import fuzz

from .contracts import Alert, DimensionMetrics


def analyze_duplication(df: pd.DataFrame) -> DimensionMetrics:
    score = 100.0
    alerts: list[Alert] = []

    exact_dup_ratio = float(df.duplicated().mean()) if len(df) else 0.0
    near_dup_ratio = 0.0

    object_cols = [c for c in df.columns if df[c].dtype == "object"]
    if object_cols and len(df) > 1:
        sample = df[object_cols].astype(str).head(min(300, len(df)))
        row_strings = sample.apply(lambda row: " | ".join(row.values.tolist()), axis=1).tolist()
        near = 0
        total_pairs = 0
        for i in range(len(row_strings)):
            for j in range(i + 1, min(i + 30, len(row_strings))):
                total_pairs += 1
                if fuzz.ratio(row_strings[i], row_strings[j]) >= 92:
                    near += 1
        near_dup_ratio = float(near / total_pairs) if total_pairs else 0.0

    score -= min(50.0, exact_dup_ratio * 100)
    score -= min(20.0, near_dup_ratio * 100)

    if exact_dup_ratio > 0.05:
        alerts.append(
            Alert(
                severity="warn" if exact_dup_ratio < 0.15 else "critical",
                dimension="duplication",
                message="High exact duplicate ratio",
                metric_key="exact_duplicate_ratio",
                value=exact_dup_ratio,
            )
        )

    metrics = {"exact_duplicate_ratio": exact_dup_ratio, "near_duplicate_ratio": near_dup_ratio}
    return DimensionMetrics(name="duplication", score=max(0.0, score), metrics=metrics, alerts=alerts)
