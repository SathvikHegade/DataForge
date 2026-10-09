import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  Label,
} from 'recharts';
import {
  BarChart3,
  Download,
  Loader2,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { api } from '../api/client';
import { useDataset } from '../context/DatasetContext';

const chartTypes = [
  ['histogram', 'Histogram'], ['kde', 'KDE Plot'], ['box', 'Box Plot'],
  ['bar', 'Bar Chart'], ['violin', 'Violin Plot'], ['scatter', 'Scatter Plot'],
  ['correlation_heatmap', 'Correlation Heatmap'], ['pair_plot', 'Pair Plot'],
  ['line', 'Line Chart'], ['grouped_box', 'Grouped Box Plot'],
  ['missing_bar', 'Missing Value Bar'], ['missing_heatmap', 'Missing Value Heatmap'],
  ['outlier', 'Outlier Analysis'], ['class_distribution', 'Class Distribution'],
] as const;

type Metadata = {
  columns: string[];
  numeric_columns: string[];
  categorical_columns: string[];
  date_columns: string[];
  recommendations: { chart_type: string; columns: string[]; reason: string }[];
  row_count: number;
};

type Visualization = {
  chart_type: string;
  title: string;
  data: any[];
  insights: { label: string; value: string | number | null }[];
  metadata: Record<string, any>;
};

const selectClass = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none';

export const DataVisualisation: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { selectedVersionId } = useDataset();
  const chartRef = useRef<HTMLDivElement>(null);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [visualization, setVisualization] = useState<Visualization | null>(null);
  const [chartType, setChartType] = useState('histogram');
  const [columns, setColumns] = useState<string[]>([]);
  const [bins, setBins] = useState(20);
  const [correlationMethod, setCorrelationMethod] = useState('pearson');
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');

  const selectedType = useMemo(() => chartTypes.find(([value]) => value === chartType)?.[1] || chartType, [chartType]);
  const needsTwoColumns = ['scatter', 'grouped_box', 'line'].includes(chartType);
  const needsManyColumns = ['correlation_heatmap', 'pair_plot'].includes(chartType);
  const isMissingChart = chartType.startsWith('missing_');
  const numericColumns = metadata?.numeric_columns || [];
  const categoricalColumns = metadata?.categorical_columns || [];

  const loadMetadata = async () => {
    if (!id) return;
    setIsLoading(true);
    setError('');
    try {
      const data = await api.getVisualizationMetadata(id, selectedVersionId || undefined);
      setMetadata(data);
      setColumns((current) => current.length ? current : data.numeric_columns.slice(0, 1));
      if (data.recommendations[0]) {
        setChartType(data.recommendations[0].chart_type);
        setColumns(data.recommendations[0].columns);
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to load visualization metadata.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setMetadata(null);
    setVisualization(null);
    loadMetadata();
  }, [id, selectedVersionId]);

  const generate = async () => {
    if (!id) return;
    setIsGenerating(true);
    setError('');
    try {
      const data = await api.createVisualization(id, {
        chart_type: chartType,
        columns,
        bins,
        correlation_method: correlationMethod,
        sample_size: 5000,
      }, selectedVersionId || undefined);
      setVisualization(data);
    } catch (err: any) {
      setVisualization(null);
      setError(err?.message || 'Unable to generate this visualization.');
    } finally {
      setIsGenerating(false);
    }
  };

  const applyRecommendation = (recommendation: Metadata['recommendations'][number]) => {
    setChartType(recommendation.chart_type);
    setColumns(recommendation.columns);
  };

  const toggleColumn = (column: string) => {
    setColumns((current) => current.includes(column) ? current.filter((item) => item !== column) : [...current, column].slice(-8));
  };

  const downloadChart = async () => {
    if (!chartRef.current) return;
    const svg = chartRef.current.querySelector('svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 700;
    const context = canvas.getContext('2d');
    if (!context) return;
    const image = new Image();
    image.onload = () => {
      context.fillStyle = '#0f172a';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const link = document.createElement('a');
      link.download = `${chartType}-${columns[0] || 'dataset'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgData)}`;
  };

  const renderChart = () => {
    if (!visualization) return null;
    const data = visualization.data;
    if (chartType === 'scatter') {
      return <ResponsiveContainer width="100%" height="100%"><ScatterChart><CartesianGrid stroke="#334155" strokeDasharray="3 3" /><XAxis dataKey="x" name={columns[0]} stroke="#94a3b8" /><YAxis dataKey="y" name={columns[1]} stroke="#94a3b8" /><Tooltip /><Scatter data={data} fill="#818cf8" /></ScatterChart></ResponsiveContainer>;
    }
    if (chartType === 'kde') {
      return <ResponsiveContainer width="100%" height="100%"><LineChart data={data}><CartesianGrid stroke="#334155" strokeDasharray="3 3" /><XAxis dataKey="x" stroke="#94a3b8" /><YAxis stroke="#94a3b8" /><Tooltip /><Line type="monotone" dataKey="density" stroke="#34d399" dot={false} /></LineChart></ResponsiveContainer>;
    }
    if (chartType === 'violin') {
      return <ResponsiveContainer width="100%" height="100%"><LineChart data={data}><CartesianGrid stroke="#334155" strokeDasharray="3 3" /><XAxis dataKey="x" stroke="#94a3b8" /><YAxis stroke="#94a3b8" /><Tooltip /><Line type="monotone" dataKey="density" stroke="#c084fc" dot={false} /></LineChart></ResponsiveContainer>;
    }
    if (chartType === 'pair_plot') {
      const pairColumns = visualization.metadata.columns || [];
      const pairData = data.map((row: any) => ({ x: row[pairColumns[0]], y: row[pairColumns[1]] }));
      return <ResponsiveContainer width="100%" height="100%"><ScatterChart><CartesianGrid stroke="#334155" strokeDasharray="3 3" /><XAxis dataKey="x" name={pairColumns[0]} stroke="#94a3b8" /><YAxis dataKey="y" name={pairColumns[1]} stroke="#94a3b8" /><Tooltip /><Scatter data={pairData} fill="#f59e0b" /></ScatterChart></ResponsiveContainer>;
    }
    if (chartType === 'missing_bar') {
      return <ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical"><CartesianGrid stroke="#334155" strokeDasharray="3 3" /><XAxis type="number" stroke="#94a3b8" /><YAxis dataKey="column" type="category" width={110} stroke="#94a3b8" /><Tooltip /><Bar dataKey="missing" fill="#fb7185" /></BarChart></ResponsiveContainer>;
    }
    if (chartType === 'bar' || chartType === 'class_distribution') {
      return <ResponsiveContainer width="100%" height="100%"><BarChart data={data}><CartesianGrid stroke="#334155" strokeDasharray="3 3" /><XAxis dataKey="value" stroke="#94a3b8" /><YAxis stroke="#94a3b8" /><Tooltip /><Bar dataKey="count" fill="#818cf8">{data.map((_: any, index: number) => <Cell key={index} fill={index === 0 ? '#34d399' : '#818cf8'} />)}</Bar></BarChart></ResponsiveContainer>;
    }
    if (chartType === 'correlation_heatmap') {
      const values = data as { x: string; y: string; value: number | null }[];
      return <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${visualization.metadata.columns?.length || 1}, minmax(48px, 1fr))` }}>{values.map((item, index) => <div key={index} title={`${item.y} / ${item.x}: ${item.value}`} className="flex min-h-12 items-center justify-center rounded text-[10px] text-white" style={{ backgroundColor: item.value === null ? '#334155' : `rgba(99, 102, 241, ${Math.abs(item.value)})` }}>{item.value ?? '-'}</div>)}</div>;
    }
    if (chartType === 'missing_heatmap') {
      return <div className="grid max-h-[420px] grid-cols-[repeat(auto-fit,minmax(10px,1fr))] gap-px overflow-auto bg-slate-800 p-1">{data.map((item: any, index: number) => <div key={index} title={`${item.column}, row ${item.row}`} className={`h-3 ${item.missing ? 'bg-rose-400' : 'bg-slate-700'}`} />)}</div>;
    }
    if (chartType === 'box' || chartType === 'outlier' || chartType === 'grouped_box') {
      const groupKey = chartType === 'grouped_box' ? 'group' : 'column';
      const colLabel = columns[0] || 'Column';
      const title = chartType === 'grouped_box'
        ? `Grouped Box Plot — ${columns.join(' vs ')}`
        : `Box Plot — ${colLabel}`;

      return (
        <div className="flex flex-col h-full w-full gap-2">
          {/* Chart title */}
          <div className="text-center text-sm font-semibold text-slate-200 tracking-wide">{title}</div>
          <div className="flex-1 w-full" style={{ minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 10, right: 30, left: 20, bottom: 40 }}>
                <CartesianGrid stroke="#334155" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey={groupKey} stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 11 }}>
                  <Label value={chartType === 'grouped_box' ? 'Group' : 'Column'} offset={-10} position="insideBottom" fill="#64748b" fontSize={12} />
                </XAxis>
                <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 11 }} width={55}>
                  <Label value="Value" angle={-90} position="insideLeft" fill="#64748b" fontSize={12} offset={10} />
                </YAxis>
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                  formatter={(value: any, name: string) => {
                    const labels: Record<string, string> = {
                      median: 'Median', q1: 'Q1 (25th)', q3: 'Q3 (75th)',
                      min: 'Min (whisker)', max: 'Max (whisker)', mean: 'Mean'
                    };
                    return [typeof value === 'number' ? value.toFixed(4) : value, labels[name] || name];
                  }}
                />
                {/* IQR range bar (Q1 → Q3) — rendered as a stacked bar trick: transparent base + colored range */}
                <Bar dataKey="q1" stackId="box" fill="transparent" isAnimationActive={false} />
                <Bar dataKey={(d: any) => d.q3 - d.q1} stackId="box" fill="#7c3aed" fillOpacity={0.55}
                  stroke="#a78bfa" strokeWidth={1.5} radius={[3, 3, 0, 0]} isAnimationActive={false}
                  name="q3" />
                {/* Median line as a thin bar overlay */}
                <Bar dataKey="median" fill="none" stroke="#f0abfc" strokeWidth={2.5}
                  isAnimationActive={false} name="median" />
                {/* Min / Max whisker dots */}
                <Scatter dataKey="min" fill="#94a3b8" name="min" shape={(props: any) => {
                  const { cx, cy } = props;
                  return <line x1={cx - 8} y1={cy} x2={cx + 8} y2={cy} stroke="#94a3b8" strokeWidth={2} />;
                }} />
                <Scatter dataKey="max" fill="#94a3b8" name="max" shape={(props: any) => {
                  const { cx, cy } = props;
                  return <line x1={cx - 8} y1={cy} x2={cx + 8} y2={cy} stroke="#94a3b8" strokeWidth={2} />;
                }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {/* Legend */}
          <div className="flex items-center justify-center gap-4 text-[11px] text-slate-400 pb-1 flex-wrap">
            <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-3 rounded-sm bg-violet-600/60 border border-violet-400" />IQR (Q1–Q3)</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-0.5 bg-fuchsia-300" />Median</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-0.5 bg-slate-400" />Whiskers (Min/Max)</span>
          </div>
        </div>
      );
    }
    return <ResponsiveContainer width="100%" height="100%"><ComposedChart data={data}><CartesianGrid stroke="#334155" strokeDasharray="3 3" /><XAxis dataKey={chartType === 'line' ? 'x' : 'bin_start'} stroke="#94a3b8" /><YAxis stroke="#94a3b8" /><Tooltip /><Bar dataKey={chartType === 'line' ? 'y' : 'count'} fill="#818cf8" /><Line dataKey={chartType === 'line' ? 'y' : 'count'} stroke="#34d399" dot={false} /></ComposedChart></ResponsiveContainer>;
  };

  if (isLoading) return <div className="flex min-h-96 items-center justify-center text-slate-400"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading visualization workspace...</div>;

  return <div className="space-y-6">
    <div className="flex flex-col justify-between gap-4 border-b border-slate-800 pb-4 sm:flex-row sm:items-center">
      <div><h1 className="flex items-center gap-2 text-2xl font-bold text-white"><BarChart3 className="h-6 w-6 text-indigo-400" /> Data Visualisation</h1><p className="mt-1 text-xs text-slate-400">Explore {metadata?.row_count?.toLocaleString() || 0} rows without moving the dataset into the browser.</p></div>
      <button onClick={loadMetadata} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"><RefreshCw className="h-3.5 w-3.5" /> Refresh metadata</button>
    </div>
    {error && <div className="flex items-center gap-2 rounded-lg border border-rose-700 bg-rose-950/80 p-3 text-xs font-medium text-rose-100"><TriangleAlert className="h-4 w-4 shrink-0 text-rose-400" /> {error}</div>}
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[280px_1fr]">
      <aside className="space-y-4">
        <section className="glass-card space-y-3 p-4"><div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Chart controls</div><select className={selectClass} value={chartType} onChange={(event) => { setChartType(event.target.value); setVisualization(null); }} aria-label="Chart type">{chartTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{!isMissingChart && <div><div className="mb-2 text-[11px] font-semibold text-slate-400">Columns {needsManyColumns ? '(up to 4)' : needsTwoColumns ? '(choose 2)' : '(choose 1)'}</div><div className="max-h-48 space-y-1 overflow-y-auto">{metadata?.columns.map((column) => <label key={column} className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={columns.includes(column)} onChange={() => toggleColumn(column)} className="accent-indigo-500" /> <span className="truncate">{column}</span></label>)}</div></div>}{['histogram', 'kde'].includes(chartType) && <label className="block text-xs text-slate-400">Bins <input className="mt-1 w-full accent-indigo-500" type="range" min="5" max="100" value={bins} onChange={(event) => setBins(Number(event.target.value))} /><span className="text-slate-200">{bins}</span></label>}{chartType === 'correlation_heatmap' && <label className="block text-xs text-slate-400">Method<select className={`${selectClass} mt-1`} value={correlationMethod} onChange={(event) => setCorrelationMethod(event.target.value)}><option value="pearson">Pearson</option><option value="spearman">Spearman</option></select></label>}<button onClick={generate} disabled={isGenerating || (!isMissingChart && columns.length === 0)} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-900/30 hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50">{isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generate chart</button></section>
        {metadata?.recommendations.length ? <section className="glass-card space-y-3 p-4"><div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Recommended for this dataset</div>{metadata.recommendations.map((recommendation, index) => <button key={`${recommendation.chart_type}-${index}`} onClick={() => applyRecommendation(recommendation)} className="block w-full rounded-lg border border-slate-800 bg-slate-900/70 p-2 text-left hover:border-indigo-500/50"><div className="text-xs font-semibold text-indigo-300">{recommendation.chart_type.replace(/_/g, ' ')}</div><div className="mt-1 text-[10px] text-slate-500">{recommendation.reason}</div></button>)}</section> : null}
      </aside>
      <section className="glass-card min-h-[520px] p-5" ref={chartRef}>{!visualization ? <div className="flex h-[460px] flex-col items-center justify-center text-center text-slate-500"><BarChart3 className="mb-3 h-10 w-10 text-slate-700" /><div className="text-sm font-semibold text-slate-300">Choose controls and generate a chart</div><div className="mt-1 max-w-md text-xs">The backend computes bounded chart data and returns only what this visualization needs.</div></div> : <><div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h2 className="text-base font-bold text-white">{visualization.title}</h2><div className="mt-1 text-[11px] text-slate-500">{visualization.metadata.sampled ? `Showing a sample of ${visualization.metadata.sample_size?.toLocaleString()} rows` : 'Using the complete dataset'}</div></div><button onClick={downloadChart} className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"><Download className="h-3.5 w-3.5" /> Download PNG</button></div><div className="h-[390px]">{renderChart()}</div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{visualization.insights.map((insight) => <div key={insight.label} className="rounded-lg border border-slate-800 bg-slate-900/70 p-3"><div className="text-[10px] uppercase tracking-wider text-slate-500">{insight.label}</div><div className="mt-1 text-sm font-bold text-slate-100">{insight.value ?? 'Insufficient data'}</div></div>)}</div></>}
      </section>
    </div>
  </div>;
};
