from __future__ import annotations

from .contracts import DimensionMetrics


DEFAULT_WEIGHTS = {
    "bias": 0.30,
    "noise": 0.25,
    "duplication": 0.20,
    "imbalance": 0.25,
}


def compose_score(dimensions: list[DimensionMetrics], weights: dict[str, float] | None = None) -> tuple[float, dict[str, float]]:
    active_weights = weights or DEFAULT_WEIGHTS
    index = {d.name: d.score for d in dimensions}
    breakdown = {}
    weighted_score = 0.0

    for name, weight in active_weights.items():
        s = float(index.get(name, 100.0))
        breakdown[name] = s
        weighted_score += s * weight

    return round(weighted_score, 2), breakdown
