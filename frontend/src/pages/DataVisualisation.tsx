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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_CHART_TYPES = [
  ['histogram',          'Histogram'],
  ['kde',                'KDE Plot'],
  ['box',                'Box Plot'],
  ['bar',                'Bar Chart'],
  ['violin',             'Violin Plot'],
  ['scatter',            'Scatter Plot'],
  ['correlation_heatmap','Correlation Heatmap'],
  ['pair_plot',          'Pair Plot'],
  ['line',               'Line Chart'],
  ['grouped_box',        'Grouped Box Plot'],
  ['missing_bar',        'Missing Value Bar'],
  ['missing_heatmap',    'Missing Value Heatmap'],
  ['outlier',            'Outlier Analysis'],
  ['class_distribution', 'Class Distribution'],
] as const;

const AGG_OPTIONS = [
  { value: 'count',   label: 'Count' },
  { value: 'sum',     label: 'Sum' },
  { value: 'mean',    label: 'Mean' },
  { value: 'median',  label: 'Median' },
  { value: 'min',     label: 'Min' },
  { value: 'max',     label: 'Max' },
  { value: 'std',     label: 'Std Dev' },
  { value: 'nunique', label: 'Unique Count' },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ChartCompatibility = {
  required_types: string[];
  n_columns: number;        // -1 means "multiple", 0 means none required
  aggregations: string[];
};

type Metadata = {
  columns: string[];
  column_types: Record<string, string>;
  numeric_columns: string[];
  categorical_columns: string[];
  date_columns: string[];
  boolean_columns: string[];
  missing_columns: string[];
  recommendations: { chart_type: string; columns: string[]; reason: string }[];
  chart_compatibility: Record<string, ChartCompatibility>;
  row_count: number;
};

type Visualization = {
  chart_type: string;
  title: string;
  x_axis_label: string;
  y_axis_label: string;
  data: any[];
  insights: { label: string; value: string | number | null }[];
  metadata: Record<string, any>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const selectClass =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none';

/** Return columns that are valid for a chart type, based on metadata compatibility. */
function getValidColumns(
  chartType: string,
  meta: Metadata,
  slot: 'primary' | 'secondary' | 'any',
): string[] {
  const compat = meta.chart_compatibility?.[chartType];
  if (!compat) return meta.columns;

  const { required_types } = compat;
  if (!required_types || required_types.length === 0) return meta.columns;

  const typeMap = meta.column_types;

  // For scatter/line/grouped_box the two columns need different constraints:
  if (chartType === 'scatter') {
    return meta.numeric_columns;
  }
  if (chartType === 'line') {
    if (slot === 'primary') return [...meta.date_columns, ...meta.numeric_columns];
    return meta.numeric_columns;
  }
  if (chartType === 'grouped_box') {
    if (slot === 'primary') return meta.numeric_columns;
    return [...meta.categorical_columns, ...meta.boolean_columns];
  }

  // Generic: filter columns whose type is in required_types
  return meta.columns.filter((col) => required_types.includes(typeMap[col]));
}

/** Get aggregations allowed for a chart type (empty = no aggregation picker shown). */
function getAllowedAggregations(chartType: string, meta: Metadata): string[] {
  const compat = meta.chart_compatibility?.[chartType];
  return compat?.aggregations ?? [];
}

/** Whether this chart type needs no column selection at all. */
function isMissingChart(chartType: string): boolean {
  return chartType === 'missing_bar' || chartType === 'missing_heatmap';
}

/** Number of columns this chart type expects. */
function nColumnsRequired(chartType: string, meta: Metadata): number {
  return meta.chart_compatibility?.[chartType]?.n_columns ?? 1;
}

// ---------------------------------------------------------------------------
// Tooltip formatters
// ---------------------------------------------------------------------------

const CustomTooltip = ({
  active, payload, label,
  xLabel, yLabel,
}: {
  active?: boolean;
  payload?: any[];
  label?: any;
  xLabel: string;
  yLabel: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-xl">
      {label !== undefined && (
        <div className="mb-1 font-semibold text-slate-300">
          {xLabel}: <span className="text-white">{label}</span>
        </div>
      )}
      {payload.map((entry: any, i: number) => (
        <div key={i} className="text-slate-400">
          {yLabel}: <span className="font-bold text-indigo-300">{entry.value}</span>
        </div>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Pair Plot Types & Helpers
// ---------------------------------------------------------------------------

interface PairPlotHistogramBin {
  bin_start: number;
  bin_end: number;
  count: number;
}

interface PairPlotDiagonalInfo {
  column: string;
  histogram: PairPlotHistogramBin[];
  stats: {
    count: number;
    mean: number | null;
    median: number | null;
    min: number | null;
    max: number | null;
  };
}

interface PairPlotCell {
  row_index: number;
  col_index: number;
  row_column: string;
  col_column: string;
  is_diagonal: boolean;
  correlation: number;
}

interface PairPlotData {
  columns: string[];
  matrix_size: number;
  diagonal: Record<string, PairPlotDiagonalInfo>;
  column_bounds: Record<string, { min: number; max: number }>;
  correlations: Record<string, number>;
  sample_points: Record<string, number>[];
  cells: PairPlotCell[][];
}

function formatNum(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '-';
  if (Math.abs(val) >= 100000 || (Math.abs(val) < 0.01 && val !== 0)) {
    return val.toExponential(1);
  }
  return Number.isInteger(val) ? val.toString() : val.toFixed(1);
}

function truncate(str: string, len: number): string {
  if (!str) return '';
  return str.length > len ? str.slice(0, len - 1) + '…' : str;
}

// ---------------------------------------------------------------------------
// Pair Plot N x N Matrix Component
// ---------------------------------------------------------------------------

const PairPlotMatrix: React.FC<{
  data: PairPlotData;
  title: string;
}> = ({ data, title }) => {
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);

  const columns = data.columns || [];
  const N = columns.length;
  if (N < 2) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-amber-400">
        <p className="font-semibold">Pair plot requires at least two compatible numeric columns.</p>
      </div>
    );
  }

  // Sizing adapts to number of variables
  const CELL_SIZE = N === 2 ? 260 : N === 3 ? 210 : N === 4 ? 180 : 160;
  const GAP = 8;
  const CARD_SIZE = CELL_SIZE - GAP;
  const MARGIN_LEFT = 100;
  const MARGIN_TOP = 42;
  const MARGIN_BOTTOM = 65;
  const MARGIN_RIGHT = 30;

  const TOTAL_W = MARGIN_LEFT + N * CELL_SIZE + MARGIN_RIGHT;
  const TOTAL_H = MARGIN_TOP + N * CELL_SIZE + MARGIN_BOTTOM;

  const bounds = data.column_bounds || {};
  const diagonal = data.diagonal || {};
  const correlations = data.correlations || {};
  const samplePoints = data.sample_points || [];

  return (
    <div className="space-y-3">
      {/* Matrix Sub-Header & Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs">
        <div className="flex items-center gap-4 text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm bg-indigo-600/80 border border-indigo-400" />
            <strong className="text-slate-300">Diagonal:</strong> Distribution
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-sky-400" />
            <strong className="text-slate-300">Off-Diagonal:</strong> Pairwise Scatter
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block rounded px-1 py-0.5 text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800">
              r = ±0.X
            </span>
            <strong className="text-slate-300">Pearson r</strong>
          </span>
        </div>
        <div className="text-[11px] text-slate-400">
          <span className="font-semibold text-indigo-300">{N} × {N} Matrix</span> ({N * N} subplots) ·{' '}
          <span className="text-slate-300">{samplePoints.length} sample points</span>
        </div>
      </div>

      {/* Matrix SVG container with horizontal & vertical scroll */}
      <div className="relative max-h-[700px] w-full overflow-auto rounded-xl border border-slate-800 bg-slate-950/90 p-3 shadow-inner">
        <svg
          viewBox={`0 0 ${TOTAL_W} ${TOTAL_H}`}
          width={TOTAL_W}
          height={TOTAL_H}
          className="select-none"
          style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
        >
          <defs>
            <linearGradient id="pairDiagGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#818cf8" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#4338ca" stopOpacity="0.85" />
            </linearGradient>
            <linearGradient id="pairDiagGradHover" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a5b4fc" stopOpacity="1" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.95" />
            </linearGradient>
          </defs>

          {/* Solid dark canvas background for PNG export */}
          <rect width={TOTAL_W} height={TOTAL_H} fill="#0b0f19" rx={8} />

          {/* Top Column Headers (X Variables) */}
          {columns.map((colName, j) => {
            const cx = MARGIN_LEFT + j * CELL_SIZE + CELL_SIZE / 2;
            return (
              <g key={`top-${colName}-${j}`}>
                <text
                  x={cx}
                  y={MARGIN_TOP - 12}
                  textAnchor="middle"
                  fill="#f8fafc"
                  fontSize={12}
                  fontWeight="700"
                  letterSpacing="0.02em"
                >
                  {truncate(colName, 18)}
                  <title>{colName}</title>
                </text>
              </g>
            );
          })}

          {/* Left Row Headers (Y Variables) */}
          {columns.map((rowName, i) => {
            const cy = MARGIN_TOP + i * CELL_SIZE + CELL_SIZE / 2;
            const yB = bounds[rowName] || { min: 0, max: 1 };
            return (
              <g key={`left-${rowName}-${i}`}>
                <text
                  x={MARGIN_LEFT - 14}
                  y={cy}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fill="#f8fafc"
                  fontSize={12}
                  fontWeight="700"
                  letterSpacing="0.02em"
                >
                  {truncate(rowName, 15)}
                  <title>{rowName}</title>
                </text>
                {/* Max tick at top */}
                <text
                  x={MARGIN_LEFT - 8}
                  y={MARGIN_TOP + i * CELL_SIZE + 18}
                  textAnchor="end"
                  fill="#64748b"
                  fontSize={8}
                  fontFamily="monospace"
                >
                  {formatNum(yB.max)}
                </text>
                {/* Min tick at bottom */}
                <text
                  x={MARGIN_LEFT - 8}
                  y={MARGIN_TOP + (i + 1) * CELL_SIZE - 12}
                  textAnchor="end"
                  fill="#64748b"
                  fontSize={8}
                  fontFamily="monospace"
                >
                  {formatNum(yB.min)}
                </text>
              </g>
            );
          })}

          {/* Bottom Column Ticks & Labels */}
          {columns.map((colName, j) => {
            const cx = MARGIN_LEFT + j * CELL_SIZE + CELL_SIZE / 2;
            const xB = bounds[colName] || { min: 0, max: 1 };
            const baseY = TOTAL_H - 14;
            return (
              <g key={`bot-${colName}-${j}`}>
                <text
                  x={cx}
                  y={baseY}
                  textAnchor="middle"
                  fill="#cbd5e1"
                  fontSize={11}
                  fontWeight="600"
                >
                  X: {truncate(colName, 18)}
                  <title>{colName}</title>
                </text>
                <text
                  x={MARGIN_LEFT + j * CELL_SIZE + 12}
                  y={TOTAL_H - 32}
                  textAnchor="start"
                  fill="#64748b"
                  fontSize={8}
                  fontFamily="monospace"
                >
                  {formatNum(xB.min)}
                </text>
                <text
                  x={MARGIN_LEFT + (j + 1) * CELL_SIZE - 12}
                  y={TOTAL_H - 32}
                  textAnchor="end"
                  fill="#64748b"
                  fontSize={8}
                  fontFamily="monospace"
                >
                  {formatNum(xB.max)}
                </text>
              </g>
            );
          })}

          {/* Matrix Cells */}
          {columns.map((rowName, i) =>
            columns.map((colName, j) => {
              const cellX = MARGIN_LEFT + j * CELL_SIZE;
              const cellY = MARGIN_TOP + i * CELL_SIZE;
              const cardX = cellX + GAP / 2;
              const cardY = cellY + GAP / 2;
              const isDiag = i === j;
              const isHovered = hoveredCell?.row === i && hoveredCell?.col === j;

              if (isDiag) {
                // Diagonal: Distribution histogram
                const diagInfo = diagonal[rowName];
                const hist = diagInfo?.histogram || [];
                const stats = diagInfo?.stats;
                const hPlotX = cardX + 12;
                const hPlotY = cardY + 36;
                const hPlotW = CARD_SIZE - 24;
                const hPlotH = CARD_SIZE - 52;
                const maxCount = Math.max(...hist.map((b) => b.count), 1);
                const colB = bounds[rowName] || { min: 0, max: 1 };

                return (
                  <g
                    key={`cell-${i}-${j}`}
                    onMouseEnter={() => setHoveredCell({ row: i, col: j })}
                    onMouseLeave={() => setHoveredCell(null)}
                    className="cursor-default"
                  >
                    <rect
                      x={cardX}
                      y={cardY}
                      width={CARD_SIZE}
                      height={CARD_SIZE}
                      fill={isHovered ? '#1e1e38' : '#14142b'}
                      stroke={isHovered ? '#818cf8' : '#312e81'}
                      strokeWidth={isHovered ? 1.8 : 1.2}
                      rx={6}
                    />
                    {/* Variable Name Header */}
                    <text
                      x={cardX + CARD_SIZE / 2}
                      y={cardY + 16}
                      textAnchor="middle"
                      fill="#c7d2fe"
                      fontSize={11}
                      fontWeight="700"
                    >
                      {truncate(rowName, 17)}
                      <title>{`Variable: ${rowName}\nDistribution & Summary Statistics`}</title>
                    </text>
                    {/* Stats subheader */}
                    <text
                      x={cardX + CARD_SIZE / 2}
                      y={cardY + 28}
                      textAnchor="middle"
                      fill="#94a3b8"
                      fontSize={9}
                      fontFamily="monospace"
                    >
                      μ: {formatNum(stats?.mean)} · med: {formatNum(stats?.median)}
                    </text>

                    {/* Histogram Bars */}
                    {hist.map((b, bi) => {
                      const bw = Math.max(hPlotW / hist.length - 1.5, 2);
                      const bh = (b.count / maxCount) * (hPlotH - 8);
                      const bx = hPlotX + bi * (hPlotW / hist.length);
                      const by = hPlotY + hPlotH - bh;
                      return (
                        <rect
                          key={bi}
                          x={bx}
                          y={by}
                          width={bw}
                          height={Math.max(bh, 1)}
                          fill={isHovered ? 'url(#pairDiagGradHover)' : 'url(#pairDiagGrad)'}
                          rx={1.5}
                        >
                          <title>{`Bin [${formatNum(b.bin_start)} – ${formatNum(b.bin_end)}]: ${b.count.toLocaleString()} rows`}</title>
                        </rect>
                      );
                    })}

                    {/* Base axis line */}
                    <line
                      x1={hPlotX}
                      y1={hPlotY + hPlotH}
                      x2={hPlotX + hPlotW}
                      y2={hPlotY + hPlotH}
                      stroke="#475569"
                      strokeWidth={1}
                    />
                    <text
                      x={hPlotX}
                      y={hPlotY + hPlotH + 11}
                      fill="#64748b"
                      fontSize={8}
                      fontFamily="monospace"
                    >
                      {formatNum(colB.min)}
                    </text>
                    <text
                      x={hPlotX + hPlotW}
                      y={hPlotY + hPlotH + 11}
                      fill="#64748b"
                      fontSize={8}
                      fontFamily="monospace"
                      textAnchor="end"
                    >
                      {formatNum(colB.max)}
                    </text>
                  </g>
                );
              }

              // Off-diagonal: Scatter plot of (X = colName, Y = rowName)
              const r = correlations[`${rowName}__${colName}`] ?? 0;
              const xB = bounds[colName] || { min: 0, max: 1 };
              const yB = bounds[rowName] || { min: 0, max: 1 };
              const xSpan = xB.max - xB.min || 1;
              const ySpan = yB.max - yB.min || 1;

              const sPlotX = cardX + 10;
              const sPlotY = cardY + 24;
              const sPlotW = CARD_SIZE - 20;
              const sPlotH = CARD_SIZE - 36;

              return (
                <g
                  key={`cell-${i}-${j}`}
                  onMouseEnter={() => setHoveredCell({ row: i, col: j })}
                  onMouseLeave={() => setHoveredCell(null)}
                  className="cursor-default"
                >
                  <rect
                    x={cardX}
                    y={cardY}
                    width={CARD_SIZE}
                    height={CARD_SIZE}
                    fill={isHovered ? '#131b2e' : '#0f172a'}
                    stroke={isHovered ? '#38bdf8' : '#334155'}
                    strokeWidth={isHovered ? 1.5 : 0.8}
                    rx={6}
                  />

                  {/* Correlation Badge (Top-Right) */}
                  <g>
                    <rect
                      x={cardX + CARD_SIZE - 52}
                      y={cardY + 5}
                      width={46}
                      height={15}
                      rx={3}
                      fill={r >= 0.3 ? '#064e3b' : r <= -0.3 ? '#4c0519' : '#1e293b'}
                      stroke={r >= 0.3 ? '#059669' : r <= -0.3 ? '#e11d48' : '#475569'}
                      strokeWidth={0.8}
                    />
                    <text
                      x={cardX + CARD_SIZE - 29}
                      y={cardY + 16}
                      textAnchor="middle"
                      fill={r >= 0.3 ? '#6ee7b7' : r <= -0.3 ? '#fda4af' : '#cbd5e1'}
                      fontSize={9}
                      fontWeight="700"
                      fontFamily="monospace"
                    >
                      {r > 0 ? '+' : ''}{r.toFixed(2)}
                      <title>{`Pearson correlation r (${colName} vs ${rowName}): ${r.toFixed(4)}`}</title>
                    </text>
                  </g>

                  {/* Scatter plot grid lines */}
                  <line
                    x1={sPlotX}
                    y1={sPlotY + sPlotH / 2}
                    x2={sPlotX + sPlotW}
                    y2={sPlotY + sPlotH / 2}
                    stroke="#1e293b"
                    strokeDasharray="3 3"
                    strokeWidth={0.8}
                  />
                  <line
                    x1={sPlotX + sPlotW / 2}
                    y1={sPlotY}
                    x2={sPlotX + sPlotW / 2}
                    y2={sPlotY + sPlotH}
                    stroke="#1e293b"
                    strokeDasharray="3 3"
                    strokeWidth={0.8}
                  />

                  {/* Scatter Points */}
                  {samplePoints.map((pt, pIdx) => {
                    const vx = pt[colName];
                    const vy = pt[rowName];
                    if (vx === null || vx === undefined || vy === null || vy === undefined) {
                      return null;
                    }
                    const px = sPlotX + ((vx - xB.min) / xSpan) * sPlotW;
                    const py = sPlotY + sPlotH - ((vy - yB.min) / ySpan) * sPlotH;

                    // Clamp to plot bounds
                    const cx = Math.max(sPlotX + 1, Math.min(sPlotX + sPlotW - 1, px));
                    const cy = Math.max(sPlotY + 1, Math.min(sPlotY + sPlotH - 1, py));

                    return (
                      <circle
                        key={pIdx}
                        cx={cx}
                        cy={cy}
                        r={2.2}
                        fill={isHovered ? '#38bdf8' : '#0ea5e9'}
                        fillOpacity={0.78}
                        stroke="#0284c7"
                        strokeWidth={0.4}
                      >
                        <title>{`X (${colName}): ${vx}\nY (${rowName}): ${vy}`}</title>
                      </circle>
                    );
                  })}

                  {/* Subtle inner border */}
                  <rect
                    x={sPlotX}
                    y={sPlotY}
                    width={sPlotW}
                    height={sPlotH}
                    fill="none"
                    stroke="#334155"
                    strokeWidth={0.6}
                  />
                </g>
              );
            }),
          )}
        </svg>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const DataVisualisation: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { selectedVersionId } = useDataset();
  const chartRef = useRef<HTMLDivElement>(null);

  const [meta, setMeta] = useState<Metadata | null>(null);
  const [viz, setViz] = useState<Visualization | null>(null);

  // Chart controls state
  const [chartType, setChartType] = useState('histogram');
  const [primaryColumns, setPrimaryColumns] = useState<string[]>([]);
  const [secondaryColumn, setSecondaryColumn] = useState('');
  const [aggregation, setAggregation] = useState('count');
  const [valueColumn, setValueColumn] = useState('');
  const [bins, setBins] = useState(20);
  const [correlationMethod, setCorrelationMethod] = useState('pearson');

  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [hoveredBox, setHoveredBox] = useState<number | null>(null);

  // Derived display values
  const nRequired = useMemo(() => (meta ? nColumnsRequired(chartType, meta) : 1), [chartType, meta]);
  const isMultiColumn = nRequired === -1;
  const isPairPlot = chartType === 'pair_plot';
  const needsTwoColumns = nRequired === 2 || chartType === 'scatter' || chartType === 'line' || chartType === 'grouped_box';
  const needsManyColumns = isMultiColumn || chartType === 'correlation_heatmap' || isPairPlot;
  const noColumnsNeeded = isMissingChart(chartType);
  const allowedAggs = useMemo(() => (meta ? getAllowedAggregations(chartType, meta) : []), [chartType, meta]);
  const showAggPicker = allowedAggs.length > 0;
  const showValueColumn = showAggPicker && aggregation !== 'count' && aggregation !== 'nunique';

  const primaryCandidates = useMemo(
    () => (meta ? getValidColumns(chartType, meta, 'primary') : []),
    [chartType, meta],
  );
  const secondaryCandidates = useMemo(
    () => (meta ? getValidColumns(chartType, meta, 'secondary') : []),
    [chartType, meta],
  );
  const valueCandidates = useMemo(() => meta?.numeric_columns ?? [], [meta]);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const loadMetadata = async () => {
    if (!id) return;
    setIsLoading(true);
    setError('');
    try {
      const data = await api.getVisualizationMetadata(id, selectedVersionId || undefined);
      setMeta(data);

      // Apply first recommendation
      if (data.recommendations[0]) {
        const rec = data.recommendations[0];
        setChartType(rec.chart_type);
        setPrimaryColumns(rec.columns.length > 0 ? rec.columns : []);
        setSecondaryColumn(rec.columns[1] ?? '');
      } else if (data.numeric_columns[0]) {
        setPrimaryColumns([data.numeric_columns[0]]);
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to load visualization metadata.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setMeta(null);
    setViz(null);
    loadMetadata();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, selectedVersionId]);

  // Reset column selections when chart type changes
  useEffect(() => {
    if (chartType === 'pair_plot') {
      const nums = meta?.numeric_columns ?? [];
      setPrimaryColumns(nums.slice(0, Math.min(nums.length, 4)));
    } else {
      setPrimaryColumns([]);
    }
    setSecondaryColumn('');
    setValueColumn('');
    setViz(null);
    setAggregation('count');
  }, [chartType, meta]);

  // ---------------------------------------------------------------------------
  // Chart generation
  // ---------------------------------------------------------------------------

  const generate = async () => {
    if (!id) return;
    setIsGenerating(true);
    setError('');

    if (chartType === 'pair_plot' && primaryColumns.length < 2) {
      setError('Pair plot requires at least two compatible numeric columns.');
      setIsGenerating(false);
      return;
    }

    // Build the columns array based on chart type
    let columns: string[] = primaryColumns.filter(Boolean);
    let x_column: string | undefined;
    let y_column: string | undefined;

    if (needsTwoColumns || chartType === 'grouped_box') {
      x_column = primaryColumns[0] || undefined;
      y_column = secondaryColumn || undefined;
      columns = [];
    } else if (needsManyColumns) {
      columns = primaryColumns;
    } else {
      columns = primaryColumns.slice(0, 1);
    }

    try {
      const data = await api.createVisualization(
        id,
        {
          chart_type: chartType,
          columns,
          x_column,
          y_column,
          bins,
          correlation_method: correlationMethod,
          sample_size: 5000,
          aggregation,
          value_column: showValueColumn ? valueColumn || undefined : undefined,
        },
        selectedVersionId || undefined,
      );
      setViz(data);
    } catch (err: any) {
      setViz(null);
      setError(err?.message || 'Unable to generate this visualization.');
    } finally {
      setIsGenerating(false);
    }
  };

  const applyRecommendation = (rec: Metadata['recommendations'][number]) => {
    setChartType(rec.chart_type);
    setPrimaryColumns(rec.columns.length > 0 ? rec.columns : []);
    setSecondaryColumn(rec.columns[1] ?? '');
    setViz(null);
    setAggregation('count');
  };

  const togglePrimary = (col: string) => {
    if (chartType === 'pair_plot') {
      setPrimaryColumns((cur) => {
        if (cur.includes(col)) {
          return cur.filter((c) => c !== col);
        }
        if (cur.length >= 6) {
          return cur;
        }
        return [...cur, col];
      });
    } else if (needsManyColumns || isMultiColumn) {
      setPrimaryColumns((cur) =>
        cur.includes(col) ? cur.filter((c) => c !== col) : [...cur, col].slice(-8),
      );
    } else {
      setPrimaryColumns([col]);
    }
  };

  // ---------------------------------------------------------------------------
  // Download PNG
  // ---------------------------------------------------------------------------

  const downloadChart = async () => {
    if (!chartRef.current) return;
    const svg = chartRef.current.querySelector('svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const svgW = svg.viewBox?.baseVal?.width || svg.clientWidth || 1000;
    const svgH = svg.viewBox?.baseVal?.height || svg.clientHeight || 600;
    const scale = 2;
    canvas.width = Math.round(svgW * scale);
    canvas.height = Math.round(svgH * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = '#0b0f19';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const link = document.createElement('a');
      link.download = `${viz?.title || chartType}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgData)}`;
  };

  // ---------------------------------------------------------------------------
  // Chart renderer — all axis labels come from viz.x_axis_label / viz.y_axis_label
  // ---------------------------------------------------------------------------

  const renderChart = () => {
    if (!viz) return null;
    const data = viz.data;
    const xLabel = viz.x_axis_label || '';
    const yLabel = viz.y_axis_label || '';

    if (chartType === 'scatter') {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ bottom: 32, left: 48, right: 16, top: 8 }}>
            <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
            <XAxis dataKey="x" name={xLabel} stroke="#94a3b8" tick={{ fontSize: 11 }}>
              <Label value={xLabel} position="insideBottom" offset={-16} fill="#94a3b8" fontSize={12} />
            </XAxis>
            <YAxis dataKey="y" name={yLabel} stroke="#94a3b8" tick={{ fontSize: 11 }}>
              <Label value={yLabel} angle={-90} position="insideLeft" offset={16} fill="#94a3b8" fontSize={12} />
            </YAxis>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]?.payload;
                return (
                  <div className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-lg">
                    <div className="text-slate-400">{xLabel}: <span className="font-bold text-indigo-300">{p?.x}</span></div>
                    <div className="text-slate-400">{yLabel}: <span className="font-bold text-emerald-300">{p?.y}</span></div>
                  </div>
                );
              }}
            />
            <Scatter data={data} fill="#818cf8" />
          </ScatterChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === 'kde' || chartType === 'violin') {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ bottom: 32, left: 48, right: 16, top: 8 }}>
            <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
            <XAxis dataKey="x" stroke="#94a3b8" tick={{ fontSize: 11 }}>
              <Label value={xLabel} position="insideBottom" offset={-16} fill="#94a3b8" fontSize={12} />
            </XAxis>
            <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }}>
              <Label value={yLabel} angle={-90} position="insideLeft" offset={16} fill="#94a3b8" fontSize={12} />
            </YAxis>
            <Tooltip
              content={<CustomTooltip xLabel={xLabel} yLabel={yLabel} />}
            />
            <Line
              type="monotone"
              dataKey="density"
              stroke={chartType === 'violin' ? '#c084fc' : '#34d399'}
              dot={false}
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === 'pair_plot') {
      const pairPlotData = (viz.data as unknown) as PairPlotData;
      if (!pairPlotData?.columns || pairPlotData.columns.length < 2) {
        return (
          <div className="flex h-64 flex-col items-center justify-center text-center text-amber-400">
            <TriangleAlert className="mb-2 h-8 w-8" />
            <p className="font-semibold">Pair plot requires at least two compatible numeric columns.</p>
          </div>
        );
      }
      return <PairPlotMatrix data={pairPlotData} title={viz.title} />;
    }

    if (chartType === 'missing_bar') {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ bottom: 8, left: 16, right: 16, top: 8 }}>
            <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
            <XAxis type="number" stroke="#94a3b8" tick={{ fontSize: 11 }}>
              <Label value={yLabel} position="insideBottom" offset={-8} fill="#94a3b8" fontSize={12} />
            </XAxis>
            <YAxis dataKey="column" type="category" width={120} stroke="#94a3b8" tick={{ fontSize: 10 }} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]?.payload;
                return (
                  <div className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-lg">
                    <div className="font-bold text-slate-200">{p?.column}</div>
                    <div className="text-slate-400">Missing: <span className="font-bold text-rose-300">{p?.missing}</span></div>
                    <div className="text-slate-400">Pct: <span className="font-bold text-rose-300">{p?.percentage}%</span></div>
                  </div>
                );
              }}
            />
            <Bar dataKey="missing" fill="#fb7185" />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === 'bar' || chartType === 'class_distribution') {
      const aggLabel = viz.metadata?.agg_label || yLabel;
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ bottom: 48, left: 48, right: 16, top: 8 }}>
            <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
            <XAxis
              dataKey="value"
              stroke="#94a3b8"
              tick={{ fontSize: 11 }}
              interval={0}
              angle={data.length > 8 ? -35 : 0}
              textAnchor={data.length > 8 ? 'end' : 'middle'}
            >
              <Label value={xLabel} position="insideBottom" offset={-36} fill="#94a3b8" fontSize={12} />
            </XAxis>
            <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }}>
              <Label value={aggLabel} angle={-90} position="insideLeft" offset={16} fill="#94a3b8" fontSize={12} />
            </YAxis>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]?.payload;
                return (
                  <div className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-lg">
                    <div className="font-bold text-slate-200">{p?.value}</div>
                    <div className="text-slate-400">{aggLabel}: <span className="font-bold text-indigo-300">{p?.y ?? p?.count}</span></div>
                    {p?.percentage != null && (
                      <div className="text-slate-400">Share: <span className="font-bold text-emerald-300">{p.percentage}%</span></div>
                    )}
                  </div>
                );
              }}
            />
            <Bar dataKey="y" fill="#818cf8">
              {data.map((_: any, index: number) => (
                <Cell key={index} fill={index === 0 ? '#34d399' : '#818cf8'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === 'correlation_heatmap') {
      const values = data as { x: string; y: string; value: number | null }[];
      return (
        <div
          className="grid gap-1"
          style={{
            gridTemplateColumns: `repeat(${viz.metadata.columns?.length || 1}, minmax(48px, 1fr))`,
          }}
        >
          {values.map((item, index) => (
            <div
              key={index}
              title={`${item.y} / ${item.x}: ${item.value}`}
              className="flex min-h-12 items-center justify-center rounded text-[10px] text-white"
              style={{
                backgroundColor:
                  item.value === null
                    ? '#334155'
                    : `rgba(99, 102, 241, ${Math.abs(item.value)})`,
              }}
            >
              {item.value?.toFixed(2) ?? '-'}
            </div>
          ))}
        </div>
      );
    }

    if (chartType === 'missing_heatmap') {
      return (
        <div className="grid max-h-[420px] grid-cols-[repeat(auto-fit,minmax(10px,1fr))] gap-px overflow-auto bg-slate-800 p-1">
          {data.map((item: any, index: number) => (
            <div
              key={index}
              title={`${item.column}, row ${item.row}`}
              className={`h-3 ${item.missing ? 'bg-rose-400' : 'bg-slate-700'}`}
            />
          ))}
        </div>
      );
    }

    if (chartType === 'box' || chartType === 'outlier' || chartType === 'grouped_box') {
      const isGrouped = chartType === 'grouped_box';
      const groupKey = isGrouped ? 'group' : 'column';
      const numCol = viz.y_axis_label || primaryColumns[0] || 'Value';
      const catCol = isGrouped ? (viz.x_axis_label || secondaryColumn || 'Group') : '';

      const chartTitle = isGrouped
        ? `Grouped Box Plot — ${numCol} by ${catCol}`
        : `Box Plot & Outlier Analysis — ${numCol}`;

      const allVals = data
        .flatMap((d: any) => [d.min, d.max, ...(d.outliers || [])])
        .filter((v: any) => v != null && !isNaN(v));
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

      const tickCount = 6;
      const yTicks = Array.from(
        { length: tickCount },
        (_, i) => yLow + (i / (tickCount - 1)) * (yHigh - yLow),
      );

      const fmt = (v: number | null | undefined) => {
        if (v == null || isNaN(v)) return '-';
        if (Math.abs(v) >= 10000 || (Math.abs(v) < 0.001 && v !== 0)) return v.toExponential(2);
        if (Number.isInteger(v)) return v.toString();
        return v.toFixed(Math.abs(v) < 1 ? 3 : 2);
      };

      const activeItem =
        hoveredBox !== null && data[hoveredBox]
          ? data[hoveredBox]
          : data.length === 1
          ? data[0]
          : null;

      return (
        <div className="flex flex-col h-full w-full select-none justify-between">
          <div className="flex items-center justify-between px-2 pb-1 border-b border-slate-800/80 mb-1">
            <div>
              <span className="text-xs font-bold text-slate-100 tracking-wide">{chartTitle}</span>
              <span className="ml-2 text-[10px] text-slate-400">
                {isGrouped
                  ? `Distribution across ${data.length} groups`
                  : 'Five-number summary & distribution'}
              </span>
            </div>
            {activeItem && (
              <div className="hidden sm:flex items-center gap-2 text-[10px] font-mono text-slate-300 bg-slate-900/90 px-2.5 py-0.5 rounded border border-slate-700">
                <span className="text-indigo-300 font-semibold">
                  {activeItem[groupKey] || numCol}:
                </span>
                <span>Med <strong className="text-amber-400">{fmt(activeItem.median)}</strong></span>
                <span>Q1 <strong className="text-violet-300">{fmt(activeItem.q1)}</strong></span>
                <span>Q3 <strong className="text-violet-300">{fmt(activeItem.q3)}</strong></span>
                <span>IQR <strong className="text-slate-200">{fmt(activeItem.q3 - activeItem.q1)}</strong></span>
                <span>Outliers <strong className="text-orange-400">{activeItem.outlier_count || 0}</strong></span>
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0 relative w-full">
            <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full h-full" style={{ fontFamily: 'inherit' }}>
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

              {yTicks.map((t, i) => (
                <line key={i} x1={PAD.left} y1={toY(t)} x2={PAD.left + plotW} y2={toY(t)} stroke="#334155" strokeWidth={0.8} strokeDasharray="4 3" />
              ))}

              <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + plotH} stroke="#64748b" strokeWidth={1.5} />

              {yTicks.map((t, i) => (
                <g key={i}>
                  <line x1={PAD.left - 5} y1={toY(t)} x2={PAD.left} y2={toY(t)} stroke="#64748b" strokeWidth={1.5} />
                  <text x={PAD.left - 10} y={toY(t)} textAnchor="end" dominantBaseline="middle" fill="#94a3b8" fontSize={10} fontFamily="monospace">
                    {fmt(t)}
                  </text>
                </g>
              ))}

              {/* Y-axis label — derived from numCol, never hardcoded */}
              <g transform={`rotate(-90, 26, ${PAD.top + plotH / 2})`}>
                <text x={26} y={PAD.top + plotH / 2} textAnchor="middle" dominantBaseline="central" fill="#f8fafc" fontSize={12} fontWeight="600" letterSpacing="0.03em">
                  {numCol} (Value)
                </text>
              </g>

              <text x={PAD.left - 6} y={PAD.top - 14} textAnchor="start" fill="#38bdf8" fontSize={11} fontWeight="600">
                ▲ {numCol}
              </text>

              <line x1={PAD.left} y1={PAD.top + plotH} x2={PAD.left + plotW} y2={PAD.top + plotH} stroke="#64748b" strokeWidth={1.5} />

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
                  <g key={i} className="cursor-pointer transition-all duration-150" onMouseEnter={() => setHoveredBox(i)} onMouseLeave={() => setHoveredBox(null)}>
                    <line x1={cx} y1={yMinW} x2={cx} y2={yMaxW} stroke={isHovered ? '#cbd5e1' : '#94a3b8'} strokeWidth={1.8} strokeDasharray="4 3" />
                    <line x1={cx - boxW * 0.3} y1={yMinW} x2={cx + boxW * 0.3} y2={yMinW} stroke={isHovered ? '#f8fafc' : '#cbd5e1'} strokeWidth={2} strokeLinecap="round" />
                    <line x1={cx - boxW * 0.3} y1={yMaxW} x2={cx + boxW * 0.3} y2={yMaxW} stroke={isHovered ? '#f8fafc' : '#cbd5e1'} strokeWidth={2} strokeLinecap="round" />
                    <rect x={x1} y={yQ3} width={boxW} height={Math.max(yQ1 - yQ3, 2)} fill={isHovered ? 'url(#boxGradientHover)' : 'url(#boxGradient)'} stroke={isHovered ? '#c7d2fe' : '#a5b4fc'} strokeWidth={isHovered ? 2 : 1.5} rx={4} />
                    <line x1={x1} y1={yMed} x2={x2} y2={yMed} stroke="#fbbf24" strokeWidth={3} strokeLinecap="round" />

                    {(d.outliers || []).slice(0, 50).map((ov: number, oi: number) => {
                      const jitter = ((oi % 5) - 2) * (boxW * 0.12);
                      return (
                        <circle key={oi} cx={cx + jitter} cy={toY(ov)} r={3} fill="#f97316" stroke="#ffedd5" strokeWidth={0.8} opacity={0.85}>
                          <title>Outlier: {fmt(ov)}</title>
                        </circle>
                      );
                    })}

                    {data.length === 1 && (
                      <g className="text-[10px]" opacity={0.92}>
                        <line x1={cx + boxW * 0.3 + 4} y1={yMaxW} x2={cx + boxW * 0.5 + 16} y2={yMaxW} stroke="#94a3b8" strokeWidth={1} />
                        <text x={cx + boxW * 0.5 + 20} y={yMaxW} dominantBaseline="middle" fill="#94a3b8" fontSize={10}>Max: <tspan fill="#f1f5f9" fontWeight="600">{fmt(d.max)}</tspan></text>
                        <line x1={x2 + 2} y1={yQ3} x2={cx + boxW * 0.5 + 16} y2={yQ3} stroke="#a5b4fc" strokeWidth={1} />
                        <text x={cx + boxW * 0.5 + 20} y={yQ3} dominantBaseline="middle" fill="#c7d2fe" fontSize={10}>Q3 (75%): <tspan fill="#f1f5f9" fontWeight="600">{fmt(d.q3)}</tspan></text>
                        <line x1={x2 + 2} y1={yMed} x2={cx + boxW * 0.5 + 16} y2={yMed} stroke="#fbbf24" strokeWidth={1.5} />
                        <text x={cx + boxW * 0.5 + 20} y={yMed} dominantBaseline="middle" fill="#fbbf24" fontSize={10} fontWeight="bold">Median: <tspan fill="#fef08a" fontWeight="700">{fmt(d.median)}</tspan></text>
                        <line x1={x2 + 2} y1={yQ1} x2={cx + boxW * 0.5 + 16} y2={yQ1} stroke="#a5b4fc" strokeWidth={1} />
                        <text x={cx + boxW * 0.5 + 20} y={yQ1} dominantBaseline="middle" fill="#c7d2fe" fontSize={10}>Q1 (25%): <tspan fill="#f1f5f9" fontWeight="600">{fmt(d.q1)}</tspan></text>
                        <line x1={cx + boxW * 0.3 + 4} y1={yMinW} x2={cx + boxW * 0.5 + 16} y2={yMinW} stroke="#94a3b8" strokeWidth={1} />
                        <text x={cx + boxW * 0.5 + 20} y={yMinW} dominantBaseline="middle" fill="#94a3b8" fontSize={10}>Min: <tspan fill="#f1f5f9" fontWeight="600">{fmt(d.min)}</tspan></text>
                      </g>
                    )}

                    {/* X tick label — from actual group/column name */}
                    <text x={cx} y={PAD.top + plotH + 18} textAnchor="middle" fill={isHovered ? '#f8fafc' : '#cbd5e1'} fontSize={11} fontWeight={isHovered ? '600' : '400'} transform={data.length > 5 ? `rotate(-25, ${cx}, ${PAD.top + plotH + 18})` : undefined}>
                      {label.length > 16 ? label.slice(0, 14) + '…' : label}
                    </text>
                  </g>
                );
              })}

              {/* X-axis label — derived from catCol or numCol, never hardcoded */}
              <text x={PAD.left + plotW / 2} y={SVG_H - 14} textAnchor="middle" fill="#f1f5f9" fontSize={12} fontWeight="600" letterSpacing="0.02em">
                {isGrouped ? `Grouped by: ${catCol || 'Category'}` : `Feature: ${numCol}`}
              </text>
            </svg>
          </div>

          <div className="flex items-center justify-center gap-4 sm:gap-6 text-[11px] text-slate-300 pt-1.5 border-t border-slate-800/80 flex-wrap">
            <span className="flex items-center gap-1.5"><span className="inline-block w-3.5 h-3 rounded bg-indigo-600 border border-indigo-300" /><span><strong>IQR Box</strong> (Q1–Q3: Middle 50%)</span></span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-1 rounded bg-amber-400" /><span><strong className="text-amber-300">Median</strong> (50th percentile)</span></span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-3.5 h-0.5 bg-slate-400" /><span><strong>Whiskers</strong> (Min &amp; Max)</span></span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full bg-orange-500 border border-orange-200" /><span><strong className="text-orange-300">Outliers</strong></span></span>
          </div>
        </div>
      );
    }

    // Histogram / line fallback
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ bottom: 40, left: 56, right: 16, top: 8 }}
        >
          <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
          <XAxis
            dataKey={chartType === 'line' ? 'x' : 'bin_start'}
            stroke="#94a3b8"
            tick={{ fontSize: 11 }}
          >
            <Label value={xLabel} position="insideBottom" offset={-28} fill="#94a3b8" fontSize={12} />
          </XAxis>
          <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }}>
            <Label value={yLabel} angle={-90} position="insideLeft" offset={16} fill="#94a3b8" fontSize={12} />
          </YAxis>
          <Tooltip
            content={({ active, payload, label: lbl }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-lg">
                  <div className="text-slate-400">{xLabel}: <span className="font-bold text-slate-200">{lbl}</span></div>
                  <div className="text-slate-400">{yLabel}: <span className="font-bold text-indigo-300">{payload[0]?.value}</span></div>
                </div>
              );
            }}
          />
          <Bar dataKey={chartType === 'line' ? 'y' : 'count'} fill="#818cf8" />
          {chartType === 'line' && (
            <Line type="monotone" dataKey="y" stroke="#34d399" dot={false} strokeWidth={2} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    );
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (isLoading)
    return (
      <div className="flex min-h-96 items-center justify-center text-slate-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading visualization workspace...
      </div>
    );

  const columnPickerLabel = isPairPlot
    ? '(choose 2–6 numeric)'
    : needsManyColumns
    ? '(choose multiple)'
    : needsTwoColumns
    ? '(X axis / primary)'
    : '(choose 1)';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-800 pb-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <BarChart3 className="h-6 w-6 text-indigo-400" /> Data Visualisation
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Explore {meta?.row_count?.toLocaleString() || 0} rows. All charts computed server-side from the actual dataset schema.
          </p>
        </div>
        <button
          onClick={loadMetadata}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh metadata
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-rose-700 bg-rose-950/80 p-3.5 text-xs text-rose-100">
          <div className="flex items-center gap-2">
            <TriangleAlert className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
          {(error.toLowerCase().includes('missing') ||
            error.toLowerCase().includes('re-upload') ||
            error.toLowerCase().includes('unable to read')) && (
            <Link
              to="/upload"
              className="inline-flex items-center gap-1.5 self-start rounded bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 shrink-0"
            >
              Re-upload Dataset <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[300px_1fr]">
        {/* Sidebar controls */}
        <aside className="space-y-4">
          <section className="glass-card space-y-3 p-4">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Chart controls</div>

            {/* Chart type selector */}
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-400">Chart type</label>
              <select
                className={selectClass}
                value={chartType}
                onChange={(e) => { setChartType(e.target.value); setViz(null); }}
                aria-label="Chart type"
              >
                {ALL_CHART_TYPES.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            {/* Primary column selector — filtered by chart type */}
            {!noColumnsNeeded && (
              <div>
                <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-slate-400">
                  <span>{needsTwoColumns ? 'X Column / Primary' : `Column ${columnPickerLabel}`}</span>
                  {isPairPlot && (
                    <span className="text-[10px] text-indigo-400 font-normal">
                      {primaryColumns.length} selected (min 2, max 6)
                    </span>
                  )}
                </div>
                {primaryCandidates.length < (isPairPlot ? 2 : 1) ? (
                  <p className="rounded border border-amber-800/60 bg-amber-950/40 p-2 text-[10px] text-amber-300">
                    {isPairPlot
                      ? 'Pair plot requires at least two compatible numeric columns.'
                      : 'No compatible columns found for this chart type.'}
                  </p>
                ) : (
                  <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
                    {primaryCandidates.map((col) => {
                      const colType = meta?.column_types[col] ?? '';
                      const isSelected = primaryColumns.includes(col);
                      return (
                        <label key={col} className="flex items-center gap-2 rounded px-1.5 py-1 text-xs text-slate-300 hover:bg-slate-800/50 cursor-pointer">
                          <input
                            type={needsManyColumns || isMultiColumn ? 'checkbox' : 'radio'}
                            name="primary-col"
                            checked={isSelected}
                            onChange={() => togglePrimary(col)}
                            className="accent-indigo-500 rounded"
                          />
                          <span className="truncate flex-1" title={col}>{col}</span>
                          <span className="text-[9px] text-slate-500 uppercase tracking-wider shrink-0">{colType}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
                {isPairPlot && primaryColumns.length < 2 && primaryCandidates.length >= 2 && (
                  <p className="mt-1 text-[10px] text-amber-400">Select at least 2 numeric columns for pair plot.</p>
                )}
                {isPairPlot && primaryColumns.length > 5 && (
                  <p className="mt-1 text-[10px] text-sky-400">Note: 6 columns produce a 6×6 matrix (36 subplots).</p>
                )}
              </div>
            )}

            {/* Secondary column — for line/scatter/grouped_box */}
            {(needsTwoColumns) && !needsManyColumns && (
              <div>
                <div className="mb-1 text-[11px] font-semibold text-slate-400">
                  {chartType === 'grouped_box' ? 'Category Column' : 'Y Column'}
                </div>
                {secondaryCandidates.length === 0 ? (
                  <p className="text-[10px] text-amber-400">No compatible secondary columns.</p>
                ) : (
                  <select
                    className={selectClass}
                    value={secondaryColumn}
                    onChange={(e) => setSecondaryColumn(e.target.value)}
                  >
                    <option value="">— select column —</option>
                    {secondaryCandidates.map((col) => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Aggregation — only for bar/class_distribution */}
            {showAggPicker && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Aggregation
                </label>
                <select
                  className={selectClass}
                  value={aggregation}
                  onChange={(e) => { setAggregation(e.target.value); setViz(null); }}
                >
                  {AGG_OPTIONS.filter((o) => allowedAggs.includes(o.value)).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Value column — for aggregation other than count/nunique */}
            {showValueColumn && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Value Column (numeric)
                </label>
                <select
                  className={selectClass}
                  value={valueColumn}
                  onChange={(e) => setValueColumn(e.target.value)}
                >
                  <option value="">— select numeric column —</option>
                  {valueCandidates.map((col) => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Bins — histogram / kde */}
            {['histogram', 'kde'].includes(chartType) && (
              <label className="block text-xs text-slate-400">
                Bins
                <input
                  className="mt-1 w-full accent-indigo-500"
                  type="range"
                  min="5"
                  max="100"
                  value={bins}
                  onChange={(e) => setBins(Number(e.target.value))}
                />
                <span className="text-slate-200">{bins}</span>
              </label>
            )}

            {/* Correlation method */}
            {chartType === 'correlation_heatmap' && (
              <label className="block text-xs text-slate-400">
                Method
                <select
                  className={`${selectClass} mt-1`}
                  value={correlationMethod}
                  onChange={(e) => setCorrelationMethod(e.target.value)}
                >
                  <option value="pearson">Pearson</option>
                  <option value="spearman">Spearman</option>
                </select>
              </label>
            )}

            <button
              onClick={generate}
              disabled={
                isGenerating ||
                (!noColumnsNeeded && primaryColumns.length === 0) ||
                (isPairPlot && primaryColumns.length < 2) ||
                (needsTwoColumns && !secondaryColumn && !needsManyColumns)
              }
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-900/30 hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate chart
            </button>
          </section>

          {/* Recommendations — dynamically computed from schema */}
          {meta?.recommendations.length ? (
            <section className="glass-card space-y-3 p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Recommended for this dataset
              </div>
              {meta.recommendations.map((rec, idx) => (
                <button
                  key={`${rec.chart_type}-${idx}`}
                  onClick={() => applyRecommendation(rec)}
                  className="block w-full rounded-lg border border-slate-800 bg-slate-900/70 p-2 text-left hover:border-indigo-500/50"
                >
                  <div className="text-xs font-semibold text-indigo-300">
                    {rec.chart_type.replace(/_/g, ' ')}
                    {rec.columns.length > 0 && (
                      <span className="ml-1 text-slate-500 font-normal">
                        ({rec.columns.join(', ')})
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500">{rec.reason}</div>
                </button>
              ))}
            </section>
          ) : null}
        </aside>

        {/* Chart canvas */}
        <section className="glass-card min-h-[520px] p-5" ref={chartRef}>
          {!viz ? (
            <div className="flex h-[460px] flex-col items-center justify-center text-center text-slate-500">
              <BarChart3 className="mb-3 h-10 w-10 text-slate-700" />
              <div className="text-sm font-semibold text-slate-300">Choose controls and generate a chart</div>
              <div className="mt-1 max-w-md text-xs">
                {isPairPlot
                  ? 'Select 2 to 6 numeric columns to produce a true pairwise matrix with univariate distributions along the diagonal and scatter relationships on the off-diagonals.'
                  : 'The backend computes bounded chart data server-side — only what is needed for the selected chart type is returned.'}
              </div>
              {isPairPlot && primaryCandidates.length < 2 && (
                <div className="mt-3 rounded border border-amber-800/60 bg-amber-950/40 px-3 py-1.5 text-xs text-amber-300">
                  Pair plot requires at least two compatible numeric columns.
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  {/* Title is dynamically generated by the backend */}
                  <h2 className="text-base font-bold text-white">{viz.title}</h2>
                  {viz.x_axis_label && viz.y_axis_label && !isPairPlot && (
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      X: <span className="text-indigo-400">{viz.x_axis_label}</span>
                      {' · '}
                      Y: <span className="text-emerald-400">{viz.y_axis_label}</span>
                    </div>
                  )}
                  <div className="mt-1 text-[11px] text-slate-500">
                    {viz.metadata.sampled
                      ? `Showing a sample of ${viz.metadata.sample_size?.toLocaleString()} rows`
                      : 'Using the complete dataset'}
                  </div>
                </div>
                <button
                  onClick={downloadChart}
                  className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  <Download className="h-3.5 w-3.5" /> Download PNG
                </button>
              </div>

              <div className={chartType === 'pair_plot' ? 'w-full' : 'h-[390px]'}>{renderChart()}</div>

              {/* Insights — always derived from actual chart data */}
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {viz.insights.map((ins) => (
                  <div key={ins.label} className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">{ins.label}</div>
                    <div className="mt-1 text-sm font-bold text-slate-100">
                      {ins.value ?? 'Insufficient data'}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};
