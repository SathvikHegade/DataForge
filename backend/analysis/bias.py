from __future__ import annotations

from typing import Optional

import pandas as pd

from .contracts import Alert, DimensionMetrics


def analyze_bias(df: pd.DataFrame, target: Optional[str], sensitive_columns: list[str]) -> DimensionMetrics:
    metrics = {"group_disparity": {}, "proxy_bias_hints": []}
    alerts: list[Alert] = []
    score = 100.0

    if not target or target not in df.columns:
        return DimensionMetrics(name="bias", score=score, metrics=metrics, alerts=alerts)

    if not pd.api.types.is_numeric_dtype(df[target]):
        encoded = df[target].astype("category").cat.codes
        target_series = encoded
    else:
        target_series = df[target]

    base_rate = float((target_series > target_series.median()).mean())
    metrics["base_positive_rate"] = base_rate

    for col in sensitive_columns:
        if col not in df.columns:
            continue
        group_rates = (
            pd.DataFrame({"sensitive": df[col].astype(str), "target": target_series})
            .groupby("sensitive")["target"]
            .apply(lambda x: float((x > x.median()).mean()))
            .to_dict()
        )
        if not group_rates:
            continue
        disparity = max(group_rates.values()) - min(group_rates.values())
        metrics["group_disparity"][col] = {"rates": group_rates, "parity_difference": disparity}
        if disparity > 0.2:
            score -= min(30.0, disparity * 100)
            alerts.append(
                Alert(
                    severity="critical",
                    dimension="bias",
                    message=f"High demographic disparity for {col}",
                    metric_key=f"{col}.parity_difference",
                    value=disparity,
                )
            )
        elif disparity > 0.1:
            score -= min(15.0, disparity * 100)
            alerts.append(
                Alert(
                    severity="warn",
                    dimension="bias",
                    message=f"Moderate demographic disparity for {col}",
                    metric_key=f"{col}.parity_difference",
                    value=disparity,
                )
            )

    return DimensionMetrics(name="bias", score=max(0.0, score), metrics=metrics, alerts=alerts)
