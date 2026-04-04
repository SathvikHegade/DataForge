# DataForge Sentinel Backend

This backend adds a full Dataset Quality Analyzer pipeline:
- Bias analysis
- Noise and missingness checks
- Duplication detection (exact + near)
- Class imbalance metrics
- Composite quality score
- AI-grounded remediation summary

## Quick Start

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn api:app --reload
```

API docs: `http://localhost:8000/docs`

## CLI

```bash
python cli.py analyze --file ../sample.csv --target target --sensitive gender,region
```

Output report is written to `backend/artifacts/cli_report.json`.
