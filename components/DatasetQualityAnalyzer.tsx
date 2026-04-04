import { useState } from 'react';

type AnalyzeResponse = {
  job_id: string;
  result: {
    quality_score: number;
    score_breakdown: Record<string, number>;
    dimensions?: Array<{
      name: string;
      score: number;
    }>;
  };
  ai_report: {
    executive_summary: string;
    deployment_readiness: string;
    top_actions: Array<{ priority: number; action: string; effort: string }>;
  };
};

const API_BASE =
  (globalThis as { __DATAFORGE_API__?: string }).__DATAFORGE_API__ ?? 'http://localhost:8000';

export function DatasetQualityAnalyzer() {
  const [file, setFile] = useState<File | null>(null);
  const [targetColumn, setTargetColumn] = useState('');
  const [sensitiveColumns, setSensitiveColumns] = useState('');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState('');
  const [simBias, setSimBias] = useState(0);
  const [simNoise, setSimNoise] = useState(0);
  const [simDuplication, setSimDuplication] = useState(0);
  const [simImbalance, setSimImbalance] = useState(0);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [scoreHistory, setScoreHistory] = useState<number[]>([]);

  const handleAnalyze = async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      if (targetColumn) form.append('target_column', targetColumn);
      if (sensitiveColumns) form.append('sensitive_columns', sensitiveColumns);
      const res = await fetch(`${API_BASE}/analyze`, { method: 'POST', body: form });
      if (!res.ok) throw new Error('Analysis failed');
      const payload: AnalyzeResponse = await res.json();
      setLastScore(report?.result.quality_score ?? null);
      setReport(payload);
      setScoreHistory((prev) => [...prev.slice(-9), payload.result.quality_score]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze dataset');
    } finally {
      setLoading(false);
    }
  };

  const loadDemoDataset = () => {
    const demoCsv = `id,gender,region,target,amount,comment
1,F,North,1,120,good
2,M,North,1,125,good
3,F,South,0,130,bad
4,M,South,0,9999,bad
4,M,South,0,9999,bad
5,F,West,1,,unknown
6,F,West,1,123,good
7,M,East,0,121,bad`;
    const demoFile = new File([demoCsv], 'demo_hackathon.csv', { type: 'text/csv' });
    setFile(demoFile);
    setTargetColumn('target');
    setSensitiveColumns('gender,region');
    setError('');
  };

  const getTone = (value: number) => {
    if (value >= 85) return 'text-success';
    if (value >= 65) return 'text-warning';
    return 'text-destructive';
  };

  const simulatedScore = report
    ? Math.min(
        100,
        report.result.quality_score +
          simBias * 0.3 +
          simNoise * 0.25 +
          simDuplication * 0.2 +
          simImbalance * 0.25
      )
    : 0;
  const scoreBreakdownEntries = report ? Object.entries(report.result.score_breakdown) : [];
  const graphLabels: Record<string, string> = {
    bias: 'Bias',
    noise: 'Noise',
    duplication: 'Duplication',
    imbalance: 'Imbalance',
  };
  const gaugeRadius = 52;
  const gaugeCircumference = 2 * Math.PI * gaugeRadius;
  const gaugeOffset = report
    ? gaugeCircumference * (1 - Math.max(0, Math.min(100, report.result.quality_score)) / 100)
    : gaugeCircumference;
  const sparklinePoints = (() => {
    if (scoreHistory.length === 0) return '';
    const width = 280;
    const height = 84;
    const pad = 10;
    const plotW = width - pad * 2;
    const plotH = height - pad * 2;
    const max = 100;
    const min = 0;
    return scoreHistory
      .map((v, i) => {
        const x = pad + (scoreHistory.length === 1 ? plotW / 2 : (i / (scoreHistory.length - 1)) * plotW);
        const y = pad + (1 - (v - min) / (max - min)) * plotH;
        return `${x},${y}`;
      })
      .join(' ');
  })();
  const qualityGate = (score: number) => (score >= 80 ? 'Pass' : score >= 60 ? 'Conditional Pass' : 'Fail');
  const qualityGateTone = (score: number) =>
    score >= 80 ? 'text-success border-success/40' : score >= 60 ? 'text-warning border-warning/40' : 'text-destructive border-destructive/40';

  return (
    <section className="rounded-2xl border border-border bg-card/70 p-6 shadow-elevated backdrop-blur">
      <h3 className="text-xl font-semibold text-foreground">Dataset Quality Analyzer</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Run bias, noise, duplication, and class-imbalance checks with an AI remediation brief.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <input type="file" accept=".csv,.parquet,.jsonl" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        <input placeholder="target column (optional)" value={targetColumn} onChange={(e) => setTargetColumn(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        <input placeholder="sensitive columns: gender,region" value={sensitiveColumns} onChange={(e) => setSensitiveColumns(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={handleAnalyze} disabled={!file || loading} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {loading ? 'Analyzing...' : 'Run Analysis'}
        </button>
        <button onClick={loadDemoDataset} disabled={loading} className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium">
          Load Demo Dataset
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {report && (
        <div className="mt-5 space-y-4">
          <div className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${qualityGateTone(report.result.quality_score)}`}>
            Quality Gate: {qualityGate(report.result.quality_score)}
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-xl border border-border bg-background/40 p-4 lg:col-span-1">
              <p className="text-xs uppercase text-muted-foreground">Quality Gauge</p>
              <div className="mt-3 flex items-center justify-center">
                <svg width="160" height="160" viewBox="0 0 140 140" role="img" aria-label="quality gauge">
                  <circle cx="70" cy="70" r={gaugeRadius} fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
                  <circle
                    cx="70"
                    cy="70"
                    r={gaugeRadius}
                    fill="none"
                    stroke="url(#qualityGradient)"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={gaugeCircumference}
                    strokeDashoffset={gaugeOffset}
                    transform="rotate(-90 70 70)"
                  />
                  <defs>
                    <linearGradient id="qualityGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#C46A2D" />
                      <stop offset="100%" stopColor="#7A5AF8" />
                    </linearGradient>
                  </defs>
                  <text x="70" y="66" textAnchor="middle" className="fill-muted-foreground text-[9px] uppercase">
                    Score
                  </text>
                  <text x="70" y="84" textAnchor="middle" className="fill-foreground text-[16px] font-semibold">
                    {report.result.quality_score.toFixed(1)}
                  </text>
                </svg>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-background/40 p-4 lg:col-span-2">
              <p className="text-xs uppercase text-muted-foreground">Pillar Bar Chart</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {scoreBreakdownEntries.map(([key, value]) => (
                  <div key={`graph-${key}`}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{graphLabels[key] ?? key}</span>
                      <span className={getTone(value)}>{value.toFixed(1)}</span>
                    </div>
                    <div className="h-3 w-full rounded bg-muted">
                      <div className="h-3 rounded gradient-primary" style={{ width: `${Math.max(3, Math.min(100, value))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-background/50 p-4">
              <p className="text-sm text-muted-foreground">Quality Score</p>
              <p className={`text-3xl font-bold ${getTone(report.result.quality_score)}`}>
                {report.result.quality_score.toFixed(2)}
              </p>
              <p className="mt-1 text-sm text-accent">Readiness: {report.ai_report.deployment_readiness}</p>
            </div>
            <div className="rounded-xl border border-border bg-background/50 p-4">
              <p className="text-sm text-muted-foreground">What-if Simulated Score</p>
              <p className={`text-3xl font-bold ${getTone(simulatedScore)}`}>{simulatedScore.toFixed(2)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Delta: {(simulatedScore - report.result.quality_score).toFixed(2)}
              </p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-background/40 p-4">
              <p className="text-xs uppercase text-muted-foreground">Before Snapshot</p>
              <p className="mt-1 text-2xl font-bold">{(lastScore ?? report.result.quality_score).toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">Previous analysis score</p>
              <div className="mt-2 h-3 w-full rounded bg-muted">
                <div
                  className="h-3 rounded bg-secondary"
                  style={{ width: `${Math.max(3, Math.min(100, lastScore ?? report.result.quality_score))}%` }}
                />
              </div>
            </div>
            <div className="rounded-xl border border-border bg-background/40 p-4">
              <p className="text-xs uppercase text-muted-foreground">After Snapshot</p>
              <p className="mt-1 text-2xl font-bold">{simulatedScore.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">After selected remediation simulation</p>
              <div className="mt-2 h-3 w-full rounded bg-muted">
                <div className="h-3 rounded gradient-primary" style={{ width: `${Math.max(3, Math.min(100, simulatedScore))}%` }} />
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-background/40 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase text-muted-foreground">Risk Trend (Run History)</p>
              <p className="text-xs text-muted-foreground">{scoreHistory.length} runs</p>
            </div>
            <div className="mt-3">
              <svg viewBox="0 0 280 84" className="h-24 w-full">
                <line x1="10" y1="74" x2="270" y2="74" stroke="hsl(var(--muted-foreground) / 0.35)" strokeDasharray="3 3" />
                <line x1="10" y1="10" x2="270" y2="10" stroke="hsl(var(--muted-foreground) / 0.2)" strokeDasharray="3 3" />
                {scoreHistory.length > 0 && (
                  <>
                    <polyline
                      fill="none"
                      stroke="url(#sparkGradient)"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={sparklinePoints}
                    />
                    {scoreHistory.map((value, idx) => {
                      const points = sparklinePoints.split(' ');
                      const [cx, cy] = points[idx].split(',');
                      return <circle key={`dot-${idx}`} cx={cx} cy={cy} r="2.8" fill={value >= 80 ? '#2FBF71' : value >= 65 ? '#F2A900' : '#E5484D'} />;
                    })}
                    <defs>
                      <linearGradient id="sparkGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#C46A2D" />
                        <stop offset="100%" stopColor="#7A5AF8" />
                      </linearGradient>
                    </defs>
                  </>
                )}
              </svg>
            </div>
            <p className="text-xs text-muted-foreground">
              Tracks total quality score for each analysis run in this session.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            {Object.entries(report.result.score_breakdown).map(([key, value]) => (
              <div key={key} className="rounded-lg border border-border bg-background/40 p-3">
                <p className="text-xs uppercase text-muted-foreground">{key}</p>
                <p className={`text-lg font-semibold ${getTone(value)}`}>{value.toFixed(1)}</p>
                <div className="mt-2 h-2 w-full rounded bg-muted">
                  <div
                    className="h-2 rounded gradient-primary"
                    style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-border bg-background/40 p-4">
            <p className="text-sm font-medium">What-if Improvement Simulator</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Simulate remediation impact to showcase before-vs-after to judges.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="text-sm">
                Bias mitigation (+{simBias.toFixed(1)})
                <input
                  type="range"
                  min={0}
                  max={20}
                  step={0.5}
                  value={simBias}
                  onChange={(e) => setSimBias(parseFloat(e.target.value))}
                  className="mt-1 w-full"
                />
              </label>
              <label className="text-sm">
                Noise cleanup (+{simNoise.toFixed(1)})
                <input
                  type="range"
                  min={0}
                  max={20}
                  step={0.5}
                  value={simNoise}
                  onChange={(e) => setSimNoise(parseFloat(e.target.value))}
                  className="mt-1 w-full"
                />
              </label>
              <label className="text-sm">
                Deduplication improvement (+{simDuplication.toFixed(1)})
                <input
                  type="range"
                  min={0}
                  max={20}
                  step={0.5}
                  value={simDuplication}
                  onChange={(e) => setSimDuplication(parseFloat(e.target.value))}
                  className="mt-1 w-full"
                />
              </label>
              <label className="text-sm">
                Rebalancing impact (+{simImbalance.toFixed(1)})
                <input
                  type="range"
                  min={0}
                  max={20}
                  step={0.5}
                  value={simImbalance}
                  onChange={(e) => setSimImbalance(parseFloat(e.target.value))}
                  className="mt-1 w-full"
                />
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-background/40 p-4">
            <p className="text-sm font-medium">AI Executive Summary</p>
            <p className="mt-2 text-sm text-muted-foreground">{report.ai_report.executive_summary}</p>
            <ul className="mt-3 space-y-1 text-sm">
              {report.ai_report.top_actions.map((action) => (
                <li key={action.priority}>
                  {action.priority}. {action.action} ({action.effort})
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
