import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useDataset } from '../context/DatasetContext';
import { 
  Wand2, 
  Sparkles, 
  Layers, 
  CheckCircle2, 
  AlertTriangle, 
  Eye, 
  ArrowRight, 
  Loader2, 
  ChevronRight,
  Database
} from 'lucide-react';

export const TransformationBuilder: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { dataset, selectedVersionId, refreshDataset } = useDataset();
  const navigate = useNavigate();

  const [operations, setOperations] = useState<any[]>([]);
  const [selectedOp, setSelectedOp] = useState<string>('drop_missing');
  const [params, setParams] = useState<Record<string, any>>({});
  const [arrayInputs, setArrayInputs] = useState<Record<string, string>>({});
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [isLoadingOps, setIsLoadingOps] = useState(true);

  // Preview state
  const [preview, setPreview] = useState<any | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        const ops = await api.getOperations();
        setOperations(ops.filter((operation: any) => operation.operation !== 'train_test_split'));
        if (id) {
          const prev = await api.getPreview(id, selectedVersionId || undefined, 1, 1);
          setAvailableColumns(prev.columns || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoadingOps(false);
      }
    };
    init();
  }, [id, selectedVersionId]);

  const currentOpDef = operations.find((o) => o.operation === selectedOp);

  const defaultParams = (operation: any) => (operation?.params || []).reduce((values: Record<string, any>, param: any) => {
    if (param.default !== undefined) values[param.name] = param.default;
    else if (param.type === 'boolean') values[param.name] = false;
    else if (param.type === 'multiselect') values[param.name] = [];
    return values;
  }, {});

  useEffect(() => {
    if (currentOpDef) {
      const defaults = defaultParams(currentOpDef);
      setParams(defaults);
      setArrayInputs(
        (currentOpDef.params || [])
          .filter((param: any) => param.type === 'array')
          .reduce((values: Record<string, string>, param: any) => {
            values[param.name] = Array.isArray(defaults[param.name]) ? JSON.stringify(defaults[param.name]) : '';
            return values;
          }, {}),
      );
      setPreview(null);
    }
  }, [selectedOp, operations]);

  const handleParamChange = (name: string, val: any) => {
    setParams((prev) => ({ ...prev, [name]: val }));
    setPreview(null);
  };

  const handlePreview = async () => {
    if (!id) return;
    setIsPreviewing(true);
    setMessage(null);
    try {
      const res = await api.previewTransformation({
        dataset_id: id,
        version_id: selectedVersionId,
        operation: selectedOp,
        parameters: params,
      });
      setPreview(res);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Preview generation failed.' });
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleExecute = async () => {
    if (!id) return;
    setIsExecuting(true);
    setMessage(null);
    try {
      const res = await api.executeTransformation({
        dataset_id: id,
        version_id: selectedVersionId,
        operation: selectedOp,
        parameters: params,
      });
      setMessage({ type: 'success', text: res.message || 'Transformation successfully executed!' });
      await refreshDataset();
      setPreview(null);
      // Optional: redirect to preview after 1.2s
      setTimeout(() => {
        navigate(`/datasets/${id}/preview`);
      }, 1200);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Transformation failed.' });
    } finally {
      setIsExecuting(false);
    }
  };

  if (isLoadingOps) {
    return <div className="p-16 text-center text-slate-400 text-xs">Loading transformation suite...</div>;
  }

  // Group operations by category
  const categories = Array.from(new Set(operations.map((o) => o.category)));

  return (
    <div className="space-y-6">
      <div className="rounded-[2rem] border border-[#E7E5E4] bg-[#FFFDFB] p-5 shadow-[0_20px_60px_rgba(28,25,23,0.06)] sm:p-6">
        <div className="flex flex-col gap-4 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#E7E5E4] bg-[#F8E5DD] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#E05A2B]">
              <Wand2 className="h-3.5 w-3.5" />
              data cleaning
            </div>
            <h1 className="font-display text-4xl tracking-[-0.04em] text-[#1C1917]">
              Transformation Builder
            </h1>
            <p className="mt-2 text-sm text-[#78716C]">
              Construct safe, idempotent transformations that create new immutable dataset versions.
            </p>
          </div>
        </div>
      </div>

      {message && (
        <div className={`rounded-2xl border p-4 text-xs ${
          message.type === 'success'
            ? 'border-[#B7E4D0] bg-[#EAFBF1] text-[#0F766E]'
            : 'border-[#F5C4B3] bg-[#FFF2ED] text-[#B45309]'
        } flex items-center gap-2.5`}>
          {message.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[#0F766E]" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-[#E05A2B]" />}
          <span>{message.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-4 rounded-[1.75rem] border border-[#E7E5E4] bg-white p-4 shadow-sm">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#78716C]">
            Transformation Categories
          </div>

          <div className="max-h-[600px] space-y-4 overflow-y-auto pr-1">
            {categories.map((cat) => (
              <div key={cat} className="space-y-1.5">
                <div className="px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#E05A2B]">
                  {cat}
                </div>
                {operations
                  .filter((o) => o.category === cat)
                  .map((op) => {
                    const isSelected = selectedOp === op.operation;
                    return (
                      <button
                        key={op.operation}
                        onClick={() => {
                          setSelectedOp(op.operation);
                        }}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-medium transition-all ${
                          isSelected
                            ? 'bg-[#E05A2B] text-white shadow-[0_12px_24px_rgba(224,90,43,0.22)]'
                            : 'bg-[#FAF7F2] text-[#1C1917] hover:border hover:border-[#E7E5E4] hover:bg-[#F8F2EC]'
                        }`}
                      >
                        <span>{op.title}</span>
                        {isSelected && <ChevronRight className="h-3.5 w-3.5" />}
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6 lg:col-span-8">
          <div className="rounded-[1.75rem] border border-[#E7E5E4] bg-white p-6 shadow-sm">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold text-[#1C1917]">
                <span>{currentOpDef?.title}</span>
                <span className="rounded-full border border-[#E7E5E4] bg-[#F8E5DD] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#E05A2B]">
                  {currentOpDef?.operation}
                </span>
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#78716C]">
                {currentOpDef?.description}
              </p>
            </div>

            {/* Dynamic Params */}
            <div className="space-y-4 border-t border-[#E7E5E4] pt-4">
              {currentOpDef?.params?.map((param: any) => {
                const val = params[param.name];

                if (param.type === 'single_column') {
                  return (
                    <div key={param.name}>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[#78716C]">
                        {param.name} {param.required && <span className="text-[#E05A2B]">*</span>}
                      </label>
                      <select
                        value={val || ''}
                        onChange={(e) => handleParamChange(param.name, e.target.value)}
                        className="w-full rounded-xl border border-[#E7E5E4] bg-[#FAF7F2] px-3 py-2.5 text-sm text-[#1C1917] focus:border-[#E05A2B] focus:outline-none focus:ring-2 focus:ring-[#E05A2B]/20"
                      >
                        <option value="">Select column...</option>
                        {availableColumns.map((col) => (
                          <option key={col} value={col}>
                            {col}
                          </option>
                        ))}
                      </select>
                      {param.description && <div className="mt-1 text-[11px] text-[#78716C]">{param.description}</div>}
                    </div>
                  );
                }

                if (param.type === 'columns' || param.type === 'numeric_columns' || param.type === 'string_columns') {
                  const selectedCols = Array.isArray(val) ? val : [];
                  return (
                    <div key={param.name}>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[#78716C]">
                        {param.name} (Select one or more) {param.required && <span className="text-[#E05A2B]">*</span>}
                      </label>
                      <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto rounded-xl border border-[#E7E5E4] bg-[#FAF7F2] p-3">
                        {availableColumns.map((col) => {
                          const isChecked = selectedCols.includes(col);
                          return (
                            <button
                              type="button"
                              key={col}
                              onClick={() => {
                                const next = isChecked
                                  ? selectedCols.filter((c: string) => c !== col)
                                  : [...selectedCols, col];
                                handleParamChange(param.name, next);
                              }}
                              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                                isChecked
                                  ? 'bg-[#E05A2B] text-white shadow-[0_8px_20px_rgba(224,90,43,0.2)]'
                                  : 'bg-white text-[#1C1917] ring-1 ring-[#E7E5E4] hover:ring-[#E05A2B]'
                              }`}
                            >
                              {col}
                            </button>
                          );
                        })}
                      </div>
                      {param.description && <div className="mt-1 text-[11px] text-[#78716C]">{param.description}</div>}
                    </div>
                  );
                }

                if (param.type === 'select') {
                  return (
                    <div key={param.name}>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[#78716C]">
                        {param.name}
                      </label>
                      <select
                        value={val !== undefined ? val : param.default || ''}
                        onChange={(e) => handleParamChange(param.name, e.target.value)}
                        className="w-full rounded-xl border border-[#E7E5E4] bg-[#FAF7F2] px-3 py-2.5 text-sm text-[#1C1917] focus:border-[#E05A2B] focus:outline-none focus:ring-2 focus:ring-[#E05A2B]/20"
                      >
                        {param.options?.map((opt: string) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                      {param.description && <div className="mt-1 text-[11px] text-[#78716C]">{param.description}</div>}
                    </div>
                  );
                }

                if (param.type === 'boolean') {
                  return (
                    <label key={param.name} className="flex items-center gap-3 rounded-xl border border-[#E7E5E4] bg-[#FAF7F2] p-3 text-sm font-medium text-[#1C1917]">
                      <input
                        type="checkbox"
                        checked={val !== undefined ? Boolean(val) : Boolean(param.default)}
                        onChange={(e) => handleParamChange(param.name, e.target.checked)}
                        className="h-4 w-4 accent-[#E05A2B]"
                      />
                      <span>{param.name}</span>
                    </label>
                  );
                }

                if (param.type === 'multiselect') {
                  const selectedValues = Array.isArray(val) ? val : [];
                  return (
                    <div key={param.name}>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[#78716C]">{param.name}</label>
                      <div className="flex flex-wrap gap-2 rounded-xl border border-[#E7E5E4] bg-[#FAF7F2] p-3">
                        {(param.options || []).map((option: string) => (
                          <button
                            type="button"
                            key={option}
                            onClick={() => handleParamChange(param.name, selectedValues.includes(option) ? selectedValues.filter((item: string) => item !== option) : [...selectedValues, option])}
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${selectedValues.includes(option) ? 'bg-[#E05A2B] text-white shadow-[0_8px_20px_rgba(224,90,43,0.2)]' : 'bg-white text-[#1C1917] ring-1 ring-[#E7E5E4]'}`}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                }

                if (param.type === 'array') {
                  const inputValue = arrayInputs[param.name] ?? (Array.isArray(val) ? JSON.stringify(val) : '');
                  return (
                    <div key={param.name}>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[#78716C]">
                        {param.name} {param.required && <span className="text-[#E05A2B]">*</span>}
                      </label>
                      <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => {
                          const rawValue = e.target.value;
                          setArrayInputs((prev) => ({ ...prev, [param.name]: rawValue }));
                          if (!rawValue.trim()) {
                            handleParamChange(param.name, []);
                            setMessage(null);
                            return;
                          }
                          try {
                            const parsed = JSON.parse(rawValue);
                            if (!Array.isArray(parsed)) {
                              throw new Error();
                            }
                            handleParamChange(param.name, parsed);
                            setMessage(null);
                          } catch {
                            setMessage(null);
                          }
                        }}
                        onBlur={() => {
                          try {
                            if (inputValue.trim() && !Array.isArray(JSON.parse(inputValue))) {
                              throw new Error();
                            }
                          } catch {
                            if (inputValue.trim()) {
                              setMessage({ type: 'error', text: `${param.name} must be a valid JSON array, for example ["Low", "Medium", "High"].` });
                            }
                          }
                        }}
                        placeholder='["Low", "Medium", "High"]'
                        className="w-full rounded-xl border border-[#E7E5E4] bg-[#FAF7F2] px-3 py-2.5 text-sm text-[#1C1917] placeholder:text-[#A8A29E] focus:border-[#E05A2B] focus:outline-none focus:ring-2 focus:ring-[#E05A2B]/20"
                      />
                      {param.description && <div className="mt-1 text-[11px] text-[#78716C]">{param.description}</div>}
                    </div>
                  );
                }

                return (
                  <div key={param.name}>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[#78716C]">
                      {param.name} {param.required && <span className="text-[#E05A2B]">*</span>}
                    </label>
                    <input
                      type={param.type === 'number' ? 'number' : 'text'}
                      value={val !== undefined ? val : ''}
                      onChange={(e) => handleParamChange(param.name, param.type === 'number' ? parseFloat(e.target.value) : e.target.value)}
                      placeholder={param.placeholder || ''}
                      className="w-full rounded-xl border border-[#E7E5E4] bg-[#FAF7F2] px-3 py-2.5 text-sm text-[#1C1917] placeholder:text-[#A8A29E] focus:border-[#E05A2B] focus:outline-none focus:ring-2 focus:ring-[#E05A2B]/20"
                    />
                    {param.description && <div className="mt-1 text-[11px] text-[#78716C]">{param.description}</div>}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-[#E7E5E4] pt-4">
              <button
                type="button"
                onClick={handlePreview}
                disabled={isPreviewing}
                className="flex items-center gap-1.5 rounded-xl border border-[#E7E5E4] bg-[#FAF7F2] px-4 py-2 text-xs font-semibold text-[#1C1917] transition-all hover:border-[#E05A2B] hover:text-[#E05A2B] disabled:opacity-50"
              >
                {isPreviewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                <span>Preview Impact</span>
              </button>

              <button
                type="button"
                onClick={handleExecute}
                disabled={isExecuting}
                className="flex items-center gap-1.5 rounded-xl bg-[#E05A2B] px-4 py-2 text-xs font-semibold text-white shadow-[0_12px_28px_rgba(224,90,43,0.22)] transition-all hover:-translate-y-0.5 hover:bg-[#d75229] disabled:opacity-60"
              >
                {isExecuting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                <span>Apply & Create New Version</span>
              </button>
            </div>
          </div>

          {/* Transformation Impact Preview Card */}
          {preview && (
            <div className="glass-card p-6 space-y-4 border-indigo-500/30">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Eye className="w-4 h-4 text-indigo-400" />
                  <span>Preview & Safety Impact Summary</span>
                </h3>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  preview.is_potentially_destructive ? 'bg-amber-950 text-amber-300 border border-amber-800' : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                }`}>
                  {preview.is_potentially_destructive ? 'Potentially Destructive' : 'Safe Operation'}
                </span>
              </div>

              {preview.destruction_warnings && preview.destruction_warnings.length > 0 && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-1">
                  {preview.destruction_warnings.map((w: string, i: number) => (
                    <div key={i} className="flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              {preview.details?.target_type && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-500 text-[10px] uppercase font-semibold">Valid Values</span>
                    <div className="font-bold text-emerald-400 text-sm">{preview.details.valid_count ?? 'N/A'}</div>
                  </div>
                  <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-500 text-[10px] uppercase font-semibold">Invalid Values</span>
                    <div className="font-bold text-amber-400 text-sm">{preview.details.invalid_count ?? 0}</div>
                  </div>
                  <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-500 text-[10px] uppercase font-semibold">Target Type</span>
                    <div className="font-bold text-indigo-400 text-sm">{preview.details.target_type}</div>
                  </div>
                  <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-500 text-[10px] uppercase font-semibold">New Nulls</span>
                    <div className="font-bold text-rose-400 text-sm">{preview.details.new_null_count ?? 0}</div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-slate-500 text-[10px] uppercase font-semibold">Rows Before</span>
                  <div className="font-bold text-white text-sm">{preview.rows_before?.toLocaleString()}</div>
                </div>
                <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-slate-500 text-[10px] uppercase font-semibold">Rows After</span>
                  <div className="font-bold text-indigo-400 text-sm">{preview.rows_after?.toLocaleString()}</div>
                </div>
                <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-slate-500 text-[10px] uppercase font-semibold">Rows Dropped</span>
                  <div className="font-bold text-rose-400 text-sm">{preview.rows_before - preview.rows_after}</div>
                </div>
                <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-slate-500 text-[10px] uppercase font-semibold">Columns</span>
                  <div className="font-bold text-white text-sm">{preview.columns_after}</div>
                </div>
              </div>

              {/* Sample After Rows Preview */}
              {preview.sample_preview_after && preview.sample_preview_after.length > 0 && (
                <div className="space-y-2 pt-2">
                  <div className="text-xs font-bold text-slate-300">Sample Result (First 5 Rows)</div>
                  <div className="overflow-x-auto max-h-48 border border-slate-800 rounded-lg no-scrollbar">
                    <table className="w-full text-left text-[11px] font-mono">
                      <thead className="bg-slate-900 text-slate-400">
                        <tr>
                          {Object.keys(preview.sample_preview_after[0]).map((col) => (
                            <th key={col} className="p-2 border-b border-slate-800 whitespace-nowrap">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {preview.sample_preview_after.map((r: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-800/30">
                            {Object.values(r).map((val: any, vIdx: number) => (
                              <td key={vIdx} className="p-2 whitespace-nowrap truncate max-w-[160px] text-slate-300">
                                {val === null ? <span className="text-rose-400 italic">null</span> : String(val)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
