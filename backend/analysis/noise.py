from __future__ import annotations

import numpy as np
import pandas as pd

from .contracts import Alert, DimensionMetrics


def analyze_noise(df: pd.DataFrame) -> DimensionMetrics:
    score = 100.0
    alerts: list[Alert] = []

    missing_ratio = df.isna().mean().to_dict()
    row_missing_ratio = float(df.isna().mean(axis=1).mean())

    numeric_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
    outlier_rates = {}
    for col in numeric_cols:
        series = df[col].dropna()
        if series.empty:
            outlier_rates[col] = 0.0
            continue
        q1, q3 = np.percentile(series, [25, 75])
        iqr = q3 - q1
        lower, upper = q1 - 1.5 * iqr, q3 + 1.5 * iqr
        rate = float(((series < lower) | (series > upper)).mean())
        outlier_rates[col] = rate

    avg_missing = float(np.mean(list(missing_ratio.values()))) if missing_ratio else 0.0
    avg_outliers = float(np.mean(list(outlier_rates.values()))) if outlier_rates else 0.0

    score -= min(35.0, avg_missing * 100)
    score -= min(35.0, avg_outliers * 100)

    if avg_missing > 0.2:
        alerts.append(Alert(severity="critical", dimension="noise", message="High missingness", metric_key="avg_missing", value=avg_missing))
    elif avg_missing > 0.1:
        alerts.append(Alert(severity="warn", dimension="noise", message="Moderate missingness", metric_key="avg_missing", value=avg_missing))

    metrics = {
        "missing_ratio_by_column": missing_ratio,
        "avg_row_missing_ratio": row_missing_ratio,
        "outlier_rate_by_numeric_column": outlier_rates,
        "avg_missing": avg_missing,
        "avg_outlier_rate": avg_outliers,
    }
    return DimensionMetrics(name="noise", score=max(0.0, score), metrics=metrics, alerts=alerts)
