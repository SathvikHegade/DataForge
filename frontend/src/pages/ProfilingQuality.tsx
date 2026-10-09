import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client';
import { useDataset } from '../context/DatasetContext';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { 
  BarChart3, 
  AlertTriangle, 
  CheckCircle2, 
  Search, 
  CircleHelp, 
  ArrowRight, 
  Wand2, 
  Layers, 
  RefreshCw,
  Loader2
} from 'lucide-react';

export const ProfilingQuality: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { selectedVersionId } = useDataset();
  const [profile, setProfile] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [searchCol, setSearchCol] = useState<string>('');

  const [error, setError] = useState<string>('');

  const fetchProfile = async () => {
    if (!id) return;
    setIsLoading(true);
    setError('');
    try {
      const data = await api.getProfile(id, selectedVersionId || undefined);
      setProfile(data);
      if (data.columns && data.columns.length > 0 && !selectedColumn) {
        setSelectedColumn(data.columns[0]);
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to generate profile.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [id, selectedVersionId]);

  if (isLoading) {
    return (
      <div className="p-16 flex flex-col items-center justify-center text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-2" />
        <span className="text-xs">Computing full statistical and quality distribution...</span>
      </div>
    );
  }

  if (error) {
    const isMissingFile = error.toLowerCase().includes('missing') || error.toLowerCase().includes('storage') || error.toLowerCase().includes('no such file') || error.toLowerCase().includes('unable to read');
    return (
      <div className="space-y-4">
        <div className="glass-card border-rose-900/40 bg-rose-950/20 p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-900/30 text-rose-400">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h3 className="mt-3 text-sm font-bold text-white">Dataset File Unavailable</h3>
          <p className="mx-auto mt-1 max-w-lg text-xs text-rose-300/80">
            {error}
          </p>
          {isMissingFile && (
            <p className="mx-auto mt-2 max-w-md text-[11px] text-slate-400">
              When the server on Render restarts, ephemeral local files are reset. Please re-upload your file to generate a fresh profile and visualizations.
            </p>
          )}
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              onClick={fetchProfile}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </button>
            <Link
              to="/upload"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
            >
              Re-upload Dataset <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="glass-card p-12 text-center text-slate-400 text-sm">
        No profile available. Click below to generate profile.
        <div className="mt-4">
          <button
            onClick={fetchProfile}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold"
          >
            Generate Profile
          </button>
        </div>
      </div>
    );
  }

  // Filter columns list
  const filteredColumns = profile.columns.filter((c: string) => {
    const matchesSearch = c.toLowerCase().includes(searchCol.toLowerCase());
    if (!matchesSearch) return false;
    if (filterType === 'numeric') return !!profile.numerical_profiles[c];
    if (filterType === 'categorical') return !!profile.categorical_profiles[c];
    if (filterType === 'date') return !!profile.date_profiles[c];
    return true;
  });

  const activeColProfile = selectedColumn
    ? profile.numerical_profiles[selectedColumn] ||
      profile.categorical_profiles[selectedColumn] ||
      profile.date_profiles[selectedColumn]
    : null;

  const isNumeric = selectedColumn && !!profile.numerical_profiles[selectedColumn];
  const isCategorical = selectedColumn && !!profile.categorical_profiles[selectedColumn];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-indigo-400" />
            <span>Data Profiling & Quality Analysis</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Version {profile.version_number} • {profile.row_count?.toLocaleString()} rows • {profile.column_count} columns
          </p>
        </div>
        <button
          onClick={fetchProfile}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Analysis</span>
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Health Score */}
        <div className="glass-card p-4">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Data Quality Score
          </div>
          <div className={`text-2xl font-black ${
            profile.overall_health_score >= 80 ? 'text-emerald-400' : profile.overall_health_score >= 50 ? 'text-amber-400' : 'text-rose-400'
          }`}>
            {profile.overall_health_score}/100
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Weighted metric factoring nulls & anomalies</div>
        </div>

        {/* Missing Values */}
        <div className="glass-card p-4">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Total Missing Values
          </div>
          <div className="text-2xl font-bold text-white">
            {profile.total_missing_values?.toLocaleString() || 0}
            <span className="text-xs font-normal text-slate-400 ml-1">
              ({profile.total_missing_percentage}%)
            </span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Empty or null cell values</div>
        </div>

        {/* Duplicate Rows */}
        <div className="glass-card p-4">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Duplicate Rows
          </div>
          <div className="text-2xl font-bold text-white">
            {profile.duplicate_row_count?.toLocaleString() || 0}
            <span className="text-xs font-normal text-slate-400 ml-1">
              ({profile.duplicate_row_percentage}%)
            </span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Exact identical records</div>
        </div>

        {/* Quality Alerts */}
        <div className="glass-card p-4">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Detected Quality Issues
          </div>
          <div className="text-2xl font-bold text-amber-400">
            {profile.quality_issues?.length || 0}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Actionable recommendations generated</div>
        </div>
      </div>

      {/* Quality Issues Feed */}
      {profile.quality_issues && profile.quality_issues.length > 0 && (
        <div className="glass-card p-5 space-y-3">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span>Detected Quality Issues & Corrective Recommendations</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {profile.quality_issues.map((issue: any, idx: number) => (
              <div
                key={idx}
                className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      issue.severity === 'critical' ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'bg-amber-950 text-amber-300 border border-amber-800'
                    }`}>
                      {issue.severity}
                    </span>
                    {issue.column && (
                      <span className="issue-column-badge text-[11px] font-mono px-1.5 py-0.5 rounded">
                        {issue.column}
                      </span>
                    )}
                  </div>
                  <h4 className="text-xs font-bold text-slate-200 mt-1">{issue.title}</h4>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{issue.description}</p>
                  {issue.sample_values && issue.sample_values.length > 0 && (
                    <div className="mt-2 text-[10px] text-slate-500 font-mono truncate">
                      Samples: {JSON.stringify(issue.sample_values)}
                    </div>
                  )}
                </div>
                <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between">
                  <span className="text-[10px] text-indigo-300 font-medium">{issue.suggested_action}</span>
                  <Link
                    to={`/datasets/${id}/transform`}
                    className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                  >
                    <span>Fix</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Column Deep-Dive Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column Browser */}
        <div className="glass-card p-4 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Columns ({profile.columns.length})
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search column..."
              value={searchCol}
              onChange={(e) => setSearchCol(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-md pl-8 pr-2 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex gap-1 text-[10px] font-semibold">
            {['all', 'numeric', 'categorical', 'date'].map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-2 py-1 rounded capitalize ${
                  filterType === t ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="max-h-[500px] overflow-y-auto space-y-1 pr-1">
            {filteredColumns.map((colName: string) => {
              const dtype = profile.column_types[colName];
              const isSel = selectedColumn === colName;
              return (
                <button
                  key={colName}
                  onClick={() => setSelectedColumn(colName)}
                  className={`w-full text-left p-2 rounded-lg text-xs flex items-center justify-between transition-colors ${
                    isSel ? 'bg-indigo-600/20 border border-indigo-500/50 text-white' : 'hover:bg-slate-800/60 text-slate-300'
                  }`}
                >
                  <span className="font-medium truncate max-w-[140px]">{colName}</span>
                  <span className="text-[10px] font-mono text-slate-400 px-1 py-0.5 bg-slate-800 rounded">
                    {dtype}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Column Detail Card */}
        <div className="lg:col-span-2 glass-card p-6 space-y-5">
          {selectedColumn && activeColProfile ? (
            <>
              <div className="flex justify-between items-start border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <span>{selectedColumn}</span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700">
                      {activeColProfile.inferred_type}
                    </span>
                  </h3>
                  <div className="text-xs text-slate-400 mt-1 flex items-center gap-3">
                    <span>Missing: {activeColProfile.missing_count} ({activeColProfile.missing_percentage}%)</span>
                    <span>•</span>
                    <span>Total: {activeColProfile.count?.toLocaleString()}</span>
                  </div>
                </div>

                <Link
                  to={`/datasets/${id}/transform`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-600 hover:text-white text-xs font-semibold transition-all"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>Transform This Column</span>
                </Link>
              </div>

              {/* Numerical Statistics & Histogram */}
              {isNumeric && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                      <span className="text-slate-500 text-[10px] uppercase font-semibold">Mean</span>
                      <div className="font-bold text-white text-sm">{activeColProfile.mean ?? 'N/A'}</div>
                    </div>
                    <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                      <span className="text-slate-500 text-[10px] uppercase font-semibold">Median</span>
                      <div className="font-bold text-white text-sm">{activeColProfile.median ?? 'N/A'}</div>
                    </div>
                    <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                      <span className="text-slate-500 text-[10px] uppercase font-semibold">Min / Max</span>
                      <div className="font-bold text-white text-sm">{activeColProfile.min} / {activeColProfile.max}</div>
                    </div>
                    <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                      <span className="text-slate-500 text-[10px] uppercase font-semibold">Outliers (IQR)</span>
                      <div className="font-bold text-amber-400 text-sm">
                        {activeColProfile.outlier_count} ({activeColProfile.outlier_percentage}%)
                      </div>
                    </div>
                  </div>

                  {/* Histogram Chart */}
                  {activeColProfile.histogram && activeColProfile.histogram.length > 0 && (
                    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-2">
                      <div className="text-xs font-bold text-slate-300">Distribution Histogram (10 Bins)</div>
                      <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={activeColProfile.histogram}>
                            <XAxis dataKey="bin_start" stroke="#64748b" fontSize={10} />
                            <YAxis stroke="#64748b" fontSize={10} />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '11px' }}
                            />
                            <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Categorical Frequencies */}
              {isCategorical && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                      <span className="text-slate-500 text-[10px] uppercase font-semibold">Unique Categories</span>
                      <div className="font-bold text-white text-base">{activeColProfile.unique_count}</div>
                    </div>
                    <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                      <span className="text-slate-500 text-[10px] uppercase font-semibold">Cardinality Ratio</span>
                      <div className="font-bold text-white text-base">{activeColProfile.cardinality_ratio}</div>
                    </div>
                  </div>

                  <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-2">
                    <div className="text-xs font-bold text-slate-300">Top Frequency Distribution</div>
                    <div className="space-y-2 pt-1">
                      {activeColProfile.top_values.map((tv: any, idx: number) => (
                        <div key={idx} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="font-medium text-slate-200">{tv.value || '(empty)'}</span>
                            <span className="text-slate-400">{tv.count} ({tv.percentage}%)</span>
                          </div>
                          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-indigo-500 h-full rounded-full transition-all"
                              style={{ width: `${Math.min(tv.percentage, 100)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="p-8 text-center text-slate-500 text-xs">Select a column on the left to inspect its profiling statistics.</div>
          )}
        </div>
      </div>
    </div>
  );
};
