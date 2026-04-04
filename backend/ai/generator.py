from __future__ import annotations

from typing import Any, Dict, List


def _severity_bucket(score: float) -> str:
    if score >= 85:
        return "Low risk"
    if score >= 65:
        return "Moderate risk"
    return "High risk"


def generate_grounded_report(result: Dict[str, Any]) -> Dict[str, Any]:
    quality = float(result.get("quality_score", 0))
    dimensions: List[Dict[str, Any]] = result.get("dimensions", [])
    weakest = sorted(dimensions, key=lambda x: x.get("score", 100))[:2]
    weak_names = [w.get("name", "unknown") for w in weakest]

    summary = (
        f"Dataset quality score is {quality:.2f}/100 ({_severity_bucket(quality)}). "
        f"Highest risk areas: {', '.join(weak_names) if weak_names else 'none'}."
    )

    actions = [
        {"priority": 1, "action": "Fix missing and noisy columns with highest null/outlier rates.", "effort": "medium"},
        {"priority": 2, "action": "Mitigate bias in sensitive groups by stratified sampling or reweighting.", "effort": "high"},
        {"priority": 3, "action": "Remove exact duplicates and inspect near duplicates before training.", "effort": "low"},
    ]
    return {
        "executive_summary": summary,
        "deployment_readiness": "Pass" if quality >= 80 else "Conditional Pass" if quality >= 60 else "Fail",
        "top_actions": actions,
        "confidence": "medium",
    }
