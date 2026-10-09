import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
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
  ArrowRight,
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
  const [hoveredBox, setHoveredBox] = useState<number | null>(null);

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
      const isGrouped = chartType === 'grouped_box';
      const groupKey = isGrouped ? 'group' : 'column';
      const numCol = columns[0] || 'Value';
      const catCol = isGrouped ? (columns[1] || 'Group') : '';

      const chartTitle = isGrouped
        ? `Grouped Box Plot — ${numCol} by ${catCol}`
        : `Box Plot & Outlier Analysis — ${numCol}`;

      // Compute global Y scale across all boxes
      const allVals = data.flatMap((d: any) => [d.min, d.max, ...(d.outliers || [])]).filter((v: any) => v != null && !isNaN(v));
      const yMin = allVals.length ? Math.min(...allVals) : 0;
      const yMax = allVals.length ? Math.max(...allVals) : 1;
      const yRange = yMax - yMin;
      const yPad = yRange === 0 ? 1 : yRange * 0.12;
      const yLow = yMin - yPad;
      const yHigh = yMax + yPad;

      const SVG_W = 680;
      const SVG_H = 380;
      const PAD = { top: 38, right: data.length === 1 ? 140 : 35, bottom: 68, left: 95 };
      const plotW = SVG_W - PAD.left - PAD.right;
      const plotH = SVG_H - PAD.top - PAD.bottom;

      const toY = (v: number) => {
        if (yHigh === yLow) return PAD.top + plotH / 2;
        return PAD.top + plotH - ((v - yLow) / (yHigh - yLow)) * plotH;
      };

      const n = data.length || 1;
      const slotW = plotW / n;
      const boxW = Math.min(slotW * 0.45, data.length === 1 ? 80 : 54);

      // Y axis ticks
      const tickCount = 6;
      const yTicks = Array.from({ length: tickCount }, (_, i) => yLow + (i / (tickCount - 1)) * (yHigh - yLow));

      const fmt = (v: number | null | undefined) => {
        if (v == null || isNaN(v)) return '-';
        if (Math.abs(v) >= 10000 || (Math.abs(v) < 0.001 && v !== 0)) return v.toExponential(2);
        if (Number.isInteger(v)) return v.toString();
        return v.toFixed(Math.abs(v) < 1 ? 3 : 2);
      };

      const activeItem = hoveredBox !== null && data[hoveredBox] ? data[hoveredBox] : (data.length === 1 ? data[0] : null);

      return (
        <div className="flex flex-col h-full w-full select-none justify-between">
          {/* Subheader with title and quick summary */}
          <div className="flex items-center justify-between px-2 pb-1 border-b border-slate-800/80 mb-1">
            <div>
              <span className="text-xs font-bold text-slate-100 tracking-wide">{chartTitle}</span>
              <span className="ml-2 text-[10px] text-slate-400">
                {isGrouped ? `Distribution across ${data.length} groups` : `Five-number summary & distribution`}
              </span>
            </div>
            {activeItem && (
              <div className="hidden sm:flex items-center gap-2 text-[10px] font-mono text-slate-300 bg-slate-900/90 px-2.5 py-0.5 rounded border border-slate-700">
                <span className="text-indigo-300 font-semibold">{activeItem[groupKey] || numCol}:</span>
                <span>Med <strong className="text-amber-400">{fmt(activeItem.median)}</strong></span>
                <span>Q1 <strong className="text-violet-300">{fmt(activeItem.q1)}</strong></span>
                <span>Q3 <strong className="text-violet-300">{fmt(activeItem.q3)}</strong></span>
                <span>IQR <strong className="text-slate-200">{fmt(activeItem.q3 - activeItem.q1)}</strong></span>
                <span>Outliers <strong className="text-orange-400">{activeItem.outlier_count || 0}</strong></span>
              </div>
            )}
          </div>

          {/* Chart SVG */}
          <div className="flex-1 min-h-0 relative w-full">
            <svg
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              className="w-full h-full"
              style={{ fontFamily: 'inherit' }}
            >
              <defs>
                <linearGradient id="boxGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="#4338ca" stopOpacity="0.85" />
                </linearGradient>
                <linearGradient id="boxGradientHover" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#818cf8" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.95" />
                </linearGradient>
              </defs>

              {/* Grid lines */}
              {yTicks.map((t, i) => (
                <line
                  key={i}
                  x1={PAD.left}
                  y1={toY(t)}
                  x2={PAD.left + plotW}
                  y2={toY(t)}
                  stroke="#334155"
                  strokeWidth={0.8}
                  strokeDasharray="4 3"
                />
              ))}

              {/* Y Axis line */}
              <line
                x1={PAD.left}
                y1={PAD.top}
                x2={PAD.left}
                y2={PAD.top + plotH}
                stroke="#64748b"
                strokeWidth={1.5}
              />

              {/* Y Axis Ticks & Tick Labels */}
              {yTicks.map((t, i) => (
                <g key={i}>
                  <line
                    x1={PAD.left - 5}
                    y1={toY(t)}
                    x2={PAD.left}
                    y2={toY(t)}
                    stroke="#64748b"
                    strokeWidth={1.5}
                  />
                  <text
                    x={PAD.left - 10}
                    y={toY(t)}
                    textAnchor="end"
                    dominantBaseline="middle"
                    fill="#94a3b8"
                    fontSize={10}
                    fontFamily="monospace"
                  >
                    {fmt(t)}
                  </text>
                </g>
              ))}

              {/* PROMINENT Y-AXIS LABEL (Rotated, bold, high contrast) */}
              <g transform={`rotate(-90, 26, ${PAD.top + plotH / 2})`}>
                <text
                  x={26}
                  y={PAD.top + plotH / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#f8fafc"
                  fontSize={12}
                  fontWeight="600"
                  letterSpacing="0.03em"
                >
                  {numCol} (Value)
                </text>
              </g>

              {/* Y-axis top indicator tag */}
              <text
                x={PAD.left - 6}
                y={PAD.top - 14}
                textAnchor="start"
                fill="#38bdf8"
                fontSize={11}
                fontWeight="600"
              >
                ▲ {numCol}
              </text>

              {/* X Axis line */}
              <line
                x1={PAD.left}
                y1={PAD.top + plotH}
                x2={PAD.left + plotW}
                y2={PAD.top + plotH}
                stroke="#64748b"
                strokeWidth={1.5}
              />

              {/* Boxes & Whiskers */}
              {data.map((d: any, i: number) => {
                const cx = PAD.left + (i + 0.5) * slotW;
                const x1 = cx - boxW / 2;
                const x2 = cx + boxW / 2;
                const yQ1 = toY(d.q1);
                const yQ3 = toY(d.q3);
                const yMed = toY(d.median);
                const yMinW = toY(d.min);
                const yMaxW = toY(d.max);
                const label = String(d[groupKey] ?? '');
                const isHovered = hoveredBox === i;

                return (
                  <g
                    key={i}
                    className="cursor-pointer transition-all duration-150"
                    onMouseEnter={() => setHoveredBox(i)}
                    onMouseLeave={() => setHoveredBox(null)}
                  >
                    {/* Whisker dashed vertical line */}
                    <line
                      x1={cx}
                      y1={yMinW}
                      x2={cx}
                      y2={yMaxW}
                      stroke={isHovered ? '#cbd5e1' : '#94a3b8'}
                      strokeWidth={1.8}
                      strokeDasharray="4 3"
                    />

                    {/* Whisker Cap - Min */}
                    <line
                      x1={cx - boxW * 0.3}
                      y1={yMinW}
                      x2={cx + boxW * 0.3}
                      y2={yMinW}
                      stroke={isHovered ? '#f8fafc' : '#cbd5e1'}
                      strokeWidth={2}
                      strokeLinecap="round"
                    />

                    {/* Whisker Cap - Max */}
                    <line
                      x1={cx - boxW * 0.3}
                      y1={yMaxW}
                      x2={cx + boxW * 0.3}
                      y2={yMaxW}
                      stroke={isHovered ? '#f8fafc' : '#cbd5e1'}
                      strokeWidth={2}
                      strokeLinecap="round"
                    />

                    {/* IQR Box (Q3 to Q1) */}
                    <rect
                      x={x1}
                      y={yQ3}
                      width={boxW}
                      height={Math.max(yQ1 - yQ3, 2)}
                      fill={isHovered ? 'url(#boxGradientHover)' : 'url(#boxGradient)'}
                      stroke={isHovered ? '#c7d2fe' : '#a5b4fc'}
                      strokeWidth={isHovered ? 2 : 1.5}
                      rx={4}
                    />

                    {/* Median Line */}
                    <line
                      x1={x1}
                      y1={yMed}
                      x2={x2}
                      y2={yMed}
                      stroke="#fbbf24"
                      strokeWidth={3}
                      strokeLinecap="round"
                    />

                    {/* Outliers */}
                    {(d.outliers || []).slice(0, 50).map((ov: number, oi: number) => {
                      const jitter = ((oi % 5) - 2) * (boxW * 0.12);
                      return (
                        <circle
                          key={oi}
                          cx={cx + jitter}
                          cy={toY(ov)}
                          r={3}
                          fill="#f97316"
                          stroke="#ffedd5"
                          strokeWidth={0.8}
                          opacity={0.85}
                        >
                          <title>Outlier: {fmt(ov)}</title>
                        </circle>
                      );
                    })}

                    {/* Direct Callout Labels when there is only 1 box */}
                    {data.length === 1 && (
                      <g className="text-[10px]" opacity={0.92}>
                        {/* Max callout */}
                        <line x1={cx + boxW * 0.3 + 4} y1={yMaxW} x2={cx + boxW * 0.5 + 16} y2={yMaxW} stroke="#94a3b8" strokeWidth={1} />
                        <text x={cx + boxW * 0.5 + 20} y={yMaxW} dominantBaseline="middle" fill="#94a3b8" fontSize={10}>
                          Max: <tspan fill="#f1f5f9" fontWeight="600">{fmt(d.max)}</tspan>
                        </text>

                        {/* Q3 callout */}
                        <line x1={x2 + 2} y1={yQ3} x2={cx + boxW * 0.5 + 16} y2={yQ3} stroke="#a5b4fc" strokeWidth={1} />
                        <text x={cx + boxW * 0.5 + 20} y={yQ3} dominantBaseline="middle" fill="#c7d2fe" fontSize={10}>
                          Q3 (75%): <tspan fill="#f1f5f9" fontWeight="600">{fmt(d.q3)}</tspan>
                        </text>

                        {/* Median callout */}
                        <line x1={x2 + 2} y1={yMed} x2={cx + boxW * 0.5 + 16} y2={yMed} stroke="#fbbf24" strokeWidth={1.5} />
                        <text x={cx + boxW * 0.5 + 20} y={yMed} dominantBaseline="middle" fill="#fbbf24" fontSize={10} fontWeight="bold">
                          Median: <tspan fill="#fef08a" fontWeight="700">{fmt(d.median)}</tspan>
                        </text>

                        {/* Q1 callout */}
                        <line x1={x2 + 2} y1={yQ1} x2={cx + boxW * 0.5 + 16} y2={yQ1} stroke="#a5b4fc" strokeWidth={1} />
                        <text x={cx + boxW * 0.5 + 20} y={yQ1} dominantBaseline="middle" fill="#c7d2fe" fontSize={10}>
                          Q1 (25%): <tspan fill="#f1f5f9" fontWeight="600">{fmt(d.q1)}</tspan>
                        </text>

                        {/* Min callout */}
                        <line x1={cx + boxW * 0.3 + 4} y1={yMinW} x2={cx + boxW * 0.5 + 16} y2={yMinW} stroke="#94a3b8" strokeWidth={1} />
                        <text x={cx + boxW * 0.5 + 20} y={yMinW} dominantBaseline="middle" fill="#94a3b8" fontSize={10}>
                          Min: <tspan fill="#f1f5f9" fontWeight="600">{fmt(d.min)}</tspan>
                        </text>
                      </g>
                    )}

                    {/* X Tick (Category Name under box) */}
                    <text
                      x={cx}
                      y={PAD.top + plotH + 18}
                      textAnchor="middle"
                      fill={isHovered ? '#f8fafc' : '#cbd5e1'}
                      fontSize={11}
                      fontWeight={isHovered ? '600' : '400'}
                      transform={data.length > 5 ? `rotate(-25, ${cx}, ${PAD.top + plotH + 18})` : undefined}
                    >
                      {label.length > 16 ? label.slice(0, 14) + '…' : label}
                    </text>
                  </g>
                );
              })}

              {/* PROMINENT X-AXIS LABEL (Bold, high contrast, bottom) */}
              <text
                x={PAD.left + plotW / 2}
                y={SVG_H - 14}
                textAnchor="middle"
                fill="#f1f5f9"
                fontSize={12}
                fontWeight="600"
                letterSpacing="0.02em"
              >
                {isGrouped ? `Grouped by: ${catCol || 'Category'}` : `Feature: ${numCol}`}
              </text>
            </svg>
          </div>

          {/* Explanatory Legend */}
          <div className="flex items-center justify-center gap-4 sm:gap-6 text-[11px] text-slate-300 pt-1.5 border-t border-slate-800/80 flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3.5 h-3 rounded bg-indigo-600 border border-indigo-300" />
              <span><strong>IQR Box</strong> (Q1–Q3: Middle 50%)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-1 rounded bg-amber-400" />
              <span><strong className="text-amber-300">Median</strong> (50th percentile)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3.5 h-0.5 bg-slate-400" />
              <span><strong>Whiskers</strong> (Min &amp; Max)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-orange-500 border border-orange-200" />
              <span><strong className="text-orange-300">Outliers</strong></span>
            </span>
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
    {error && (
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-rose-700 bg-rose-950/80 p-3.5 text-xs text-rose-100">
        <div className="flex items-center gap-2">
          <TriangleAlert className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
        {(error.toLowerCase().includes('missing') || error.toLowerCase().includes('re-upload') || error.toLowerCase().includes('unable to read')) && (
          <Link
            to="/upload"
            className="inline-flex items-center gap-1.5 self-start rounded bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 shrink-0"
          >
            Re-upload Dataset <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    )}
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
