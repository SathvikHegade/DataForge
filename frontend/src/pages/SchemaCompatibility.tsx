import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client';
import { useDataset } from '../context/DatasetContext';
import { 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Plus, 
  Trash2, 
  Wand2, 
  ArrowRight,
  Sparkles,
  Loader2
} from 'lucide-react';

export const SchemaCompatibility: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { dataset, selectedVersionId } = useDataset();
  const [columns, setColumns] = useState<any[]>([]);
  const [report, setReport] = useState<any | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [isLoadingSchema, setIsLoadingSchema] = useState(true);

  const runAnalysis = async (schemaColumns = columns) => {
    if (!id) return;
    setIsComparing(true);
    try {
      const res = await api.compareSchema(id, selectedVersionId || undefined, undefined, schemaColumns);
      setReport(res);
    } catch (err) {
      console.error(err);
    } finally {
      setIsComparing(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    const loadSchema = async () => {
      setIsLoadingSchema(true);
      try {
        const inferredColumns = await api.getInferredSchema(id, selectedVersionId || undefined);
        setColumns(inferredColumns);
        await runAnalysis(inferredColumns);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoadingSchema(false);
      }
    };
    loadSchema();
  }, [id, selectedVersionId]);

  const handleAddColumn = () => {
    setColumns([...columns, { name: '', data_type: 'string', required: true, nullable: true }]);
  };

  const handleRemoveColumn = (idx: number) => {
    setColumns(columns.filter((_, i) => i !== idx));
  };

  const handleUpdateColumn = (idx: number, field: string, value: any) => {
    const updated = [...columns];
    updated[idx][field] = value;
    setColumns(updated);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-indigo-400" />
            <span>Schema Definition & Compatibility Engine</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Compare active dataset version against target data contracts and detect type mismatches, null violations, and out-of-bound values.
          </p>
        </div>
        <button
          onClick={() => runAnalysis()}
          disabled={isComparing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shadow-lg shadow-indigo-600/25 transition-all"
        >
          {isComparing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
          <span>Run Compatibility Analysis</span>
        </button>
      </div>

      {/* Compatibility Status Banner */}
      {report && (
        <div className={`glass-card p-5 border ${
          report.compatibility_status === 'compatible'
            ? 'border-emerald-500/30 bg-emerald-950/20'
            : report.compatibility_status === 'warnings'
            ? 'border-amber-500/30 bg-amber-950/20'
            : 'border-rose-500/30 bg-rose-950/20'
        }`}>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              {report.compatibility_status === 'compatible' ? (
                <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0" />
              ) : report.compatibility_status === 'warnings' ? (
                <AlertTriangle className="w-8 h-8 text-amber-400 shrink-0" />
              ) : (
                <XCircle className="w-8 h-8 text-rose-400 shrink-0" />
              )}
              <div>
                <h3 className="text-base font-bold text-white capitalize">
                  Schema Status: {report.compatibility_status}
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  {report.compatibility_status === 'compatible'
                    ? 'Dataset strictly satisfies all target column types and constraints.'
                    : `${report.issues.length} contract violations detected. Corrective transformations recommended.`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-semibold">
              <div className="text-center px-3 py-1 bg-slate-900/60 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px]">Expected</span>
                <span className="text-white text-sm">{report.total_expected_columns}</span>
              </div>
              <div className="text-center px-3 py-1 bg-slate-900/60 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px]">Matched</span>
                <span className="text-emerald-400 text-sm">{report.matched_columns_count}</span>
              </div>
              <div className="text-center px-3 py-1 bg-slate-900/60 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px]">Issues</span>
                <span className="text-rose-400 text-sm">{report.issues.length}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Contract Issues List */}
      {report && report.issues && report.issues.length > 0 && (
        <div className="glass-card p-5 space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>Detected Mismatch Issues</span>
          </h3>
          <div className="space-y-2">
            {report.issues.map((iss: any, idx: number) => (
              <div key={idx} className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      iss.severity === 'critical' ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'bg-amber-950 text-amber-300 border border-amber-800'
                    }`}>
                      {iss.severity}
                    </span>
                    <span className="font-bold text-slate-200">{iss.column}</span>
                    <span className="text-[11px] text-slate-500 font-mono">({iss.issue_type})</span>
                  </div>
                  <p className="text-slate-300">{iss.message}</p>
                  {iss.sample_values && iss.sample_values.length > 0 && (
                    <div className="text-[10px] text-slate-400 font-mono">
                      Invalid Samples: {JSON.stringify(iss.sample_values)}
                    </div>
                  )}
                </div>

                <div className="shrink-0 flex items-center gap-3">
                  <span className="text-[11px] text-slate-400">{iss.suggested_action}</span>
                  <Link
                    to={`/datasets/${id}/transform`}
                    className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1"
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

      {/* Target Schema Definition Builder */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-sm font-bold text-white">Expected Schema Contract</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Specify expected column names, target data types, nullability, and boundary constraints.
            </p>
          </div>
          <button
            onClick={handleAddColumn}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Column</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900/60 text-slate-400 border-b border-slate-800 font-semibold uppercase text-[10px]">
                <th className="py-2.5 px-3">Column Name</th>
                <th className="py-2.5 px-3">Target Type</th>
                <th className="py-2.5 px-3">Required</th>
                <th className="py-2.5 px-3">Nullable</th>
                <th className="py-2.5 px-3">Allowed Enums / Range</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {isLoadingSchema ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">Inferring schema from the selected dataset version...</td>
                </tr>
              ) : columns.map((col, idx) => (
                <tr key={idx} className="hover:bg-slate-800/20">
                  <td className="py-2 px-3">
                    <input
                      type="text"
                      value={col.name}
                      onChange={(e) => handleUpdateColumn(idx, 'name', e.target.value)}
                      placeholder="col_name"
                      className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono w-40"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <select
                      value={col.data_type}
                      onChange={(e) => handleUpdateColumn(idx, 'data_type', e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="string">string</option>
                      <option value="integer">integer</option>
                      <option value="float">float</option>
                      <option value="boolean">boolean</option>
                      <option value="date">date</option>
                      <option value="datetime">datetime</option>
                      <option value="categorical">categorical</option>
                    </select>
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="checkbox"
                      checked={col.required !== false}
                      onChange={(e) => handleUpdateColumn(idx, 'required', e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="checkbox"
                      checked={col.nullable !== false}
                      onChange={(e) => handleUpdateColumn(idx, 'nullable', e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0"
                    />
                  </td>
                  <td className="py-2 px-3 text-slate-400 text-[11px]">
                    {col.allowed_values ? (
                      <span className="font-mono text-indigo-300">[{col.allowed_values.join(', ')}]</span>
                    ) : (col.min_value !== undefined || col.max_value !== undefined) ? (
                      <span className="font-mono text-slate-300">[{col.min_value ?? '-∞'}, {col.max_value ?? '+∞'}]</span>
                    ) : (
                      <span className="text-slate-600">No constraints</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <button
                      onClick={() => handleRemoveColumn(idx)}
                      className="text-slate-500 hover:text-rose-400 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
