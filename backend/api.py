from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse

from analysis.engine import run_full_analysis
from ai.generator import generate_grounded_report

APP_DIR = Path(__file__).resolve().parent
ARTIFACTS = APP_DIR / "artifacts"
ARTIFACTS.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="DataForge Sentinel API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze")
async def analyze(
    file: UploadFile = File(...),
    target_column: str | None = Form(default=None),
    sensitive_columns: str | None = Form(default=None),
) -> JSONResponse:
    job_id = str(uuid.uuid4())
    raw_path = ARTIFACTS / f"{job_id}_{file.filename}"
    raw_path.write_bytes(await file.read())

    config = {
        "target_column": target_column,
        "sensitive_columns": [c.strip() for c in (sensitive_columns or "").split(",") if c.strip()],
    }
    result = run_full_analysis(str(raw_path), config=config)
    ai_report = generate_grounded_report(result)
    payload = {"job_id": job_id, "result": result, "ai_report": ai_report}
    (ARTIFACTS / f"{job_id}.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return JSONResponse(payload)


@app.get("/analyze/{job_id}")
def get_analysis(job_id: str) -> JSONResponse:
    return JSONResponse(_read_json(ARTIFACTS / f"{job_id}.json"))


@app.get("/report/{job_id}.json")
def report_json(job_id: str) -> JSONResponse:
    return JSONResponse(_read_json(ARTIFACTS / f"{job_id}.json"))


@app.get("/report/{job_id}.html")
def report_html(job_id: str) -> HTMLResponse:
    payload = _read_json(ARTIFACTS / f"{job_id}.json")
    score = float(payload["result"]["quality_score"])
    score_color = "#2FBF71" if score >= 85 else "#F2A900" if score >= 65 else "#E5484D"
    breakdown = payload["result"].get("score_breakdown", {})
    bars = "".join(
        [
            f"<div style='margin: 8px 0'><div style='display:flex;justify-content:space-between'>"
            f"<span style='text-transform:capitalize'>{k}</span><span>{v:.2f}</span></div>"
            f"<div style='height:8px;background:#2A2A33;border-radius:6px;overflow:hidden'>"
            f"<div style='height:8px;width:{max(2,min(100,v))}%;background:linear-gradient(90deg,#C46A2D,#7A5AF8)'></div></div></div>"
            for k, v in breakdown.items()
        ]
    )
    actions = "".join(
        [
            f"<li><strong>{a['priority']}.</strong> {a['action']} <em>({a['effort']})</em></li>"
            for a in payload["ai_report"].get("top_actions", [])
        ]
    )
    html = f"""
    <html>
      <head><title>DataForge Sentinel Report</title></head>
      <body style="font-family: Inter, Arial, sans-serif; margin: 2rem; background:#0B0B0F; color:#EDE8E4;">
        <h1 style="margin:0 0 4px 0">DataForge Sentinel Report</h1>
        <p style="opacity:0.8;margin:0 0 16px 0"><strong>Job:</strong> {job_id}</p>
        <div style="padding:16px;border:1px solid #2A2A33;background:#13131A;border-radius:12px">
          <p style="margin:0 0 6px 0;opacity:0.8">Quality Score</p>
          <h2 style="margin:0;color:{score_color}">{score:.2f}</h2>
          <p style="margin:8px 0 0 0">{payload['ai_report']['deployment_readiness']}</p>
        </div>
        <div style="padding:16px;border:1px solid #2A2A33;background:#13131A;border-radius:12px;margin-top:14px">
          <h3 style="margin-top:0">Pillar Scores</h3>
          {bars}
        </div>
        <div style="padding:16px;border:1px solid #2A2A33;background:#13131A;border-radius:12px;margin-top:14px">
          <h3 style="margin-top:0">AI Executive Summary</h3>
          <p>{payload['ai_report']['executive_summary']}</p>
          <ol>{actions}</ol>
        </div>
        <details style="margin-top:14px">
          <summary>Raw JSON</summary>
          <pre>{json.dumps(payload['result'], indent=2)}</pre>
        </details>
      </body>
    </html>
    """
    return HTMLResponse(content=html)
