from __future__ import annotations

import math
from typing import Optional

import pandas as pd

from .contracts import Alert, DimensionMetrics


def analyze_imbalance(df: pd.DataFrame, target: Optional[str]) -> DimensionMetrics:
    metrics = {"class_distribution": {}, "imbalance_ratio": None, "normalized_entropy": None}
    alerts: list[Alert] = []
    score = 100.0

    if not target or target not in df.columns:
        return DimensionMetrics(name="imbalance", score=score, metrics=metrics, alerts=alerts)

    counts = df[target].astype(str).value_counts(dropna=False)
    total = counts.sum()
    dist = (counts / total).to_dict()
    metrics["class_distribution"] = dist

    if len(counts) > 1:
        imbalance_ratio = float(counts.max() / max(1, counts.min()))
        probs = [v / total for v in counts.values]
        entropy = -sum(p * math.log(p + 1e-12, 2) for p in probs)
        norm_entropy = float(entropy / math.log(len(counts), 2))
        metrics["imbalance_ratio"] = imbalance_ratio
        metrics["normalized_entropy"] = norm_entropy
        score -= min(50.0, (imbalance_ratio - 1) * 8)
        score -= min(20.0, (1 - norm_entropy) * 100)
        if imbalance_ratio > 3:
            alerts.append(
                Alert(
                    severity="critical" if imbalance_ratio > 10 else "warn",
                    dimension="imbalance",
                    message="Potential class imbalance",
                    metric_key="imbalance_ratio",
                    value=imbalance_ratio,
                )
            )

    return DimensionMetrics(name="imbalance", score=max(0.0, score), metrics=metrics, alerts=alerts)
