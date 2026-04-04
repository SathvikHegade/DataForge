from __future__ import annotations

import json
from pathlib import Path

import typer

from analysis.engine import run_full_analysis
from ai.generator import generate_grounded_report

app = typer.Typer(help="DataForge Sentinel CLI")


@app.command("analyze")
def analyze(
    file: str = typer.Option(..., "--file"),
    target: str = typer.Option("", "--target"),
    sensitive: str = typer.Option("", "--sensitive"),
    output: str = typer.Option("backend/artifacts/cli_report.json", "--output"),
) -> None:
    config = {
        "target_column": target or None,
        "sensitive_columns": [c.strip() for c in sensitive.split(",") if c.strip()],
    }
    result = run_full_analysis(file, config=config)
    ai_report = generate_grounded_report(result)
    payload = {"result": result, "ai_report": ai_report}
    out_path = Path(output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    typer.echo(f"Saved report to {out_path}")
    typer.echo(f"Quality Score: {result['quality_score']}")


if __name__ == "__main__":
    app()
