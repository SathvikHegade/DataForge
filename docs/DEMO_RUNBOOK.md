# Demo Runbook (One Shot)

## 1) Start backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn api:app --reload
```

## 2) Start frontend
```bash
npm install
npm run dev
```

## 3) Demo flow
- Open app.
- In **Dataset Quality Analyzer**, click **Load Demo Dataset**.
- Click **Run Analysis**.
- Show:
  - Quality Gate badge
  - Four pillar risk bars
  - AI executive summary
  - What-if simulator and score delta
  - Before vs After snapshot cards

## 4) Export for judges
- JSON report: `http://localhost:8000/report/<job_id>.json`
- HTML report: `http://localhost:8000/report/<job_id>.html`
