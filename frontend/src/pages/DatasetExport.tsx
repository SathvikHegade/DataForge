import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useDataset } from '../context/DatasetContext';
import { api } from '../api/client';
import {
  Download,
  FileSpreadsheet,
  FileText,
  FileCode,
  Database,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  GitBranch
} from 'lucide-react';

type ExportFormat = 'csv' | 'xlsx' | 'json' | 'parquet';

interface FormatOption {
  id: ExportFormat;
  label: string;
  description: string;
  icon: React.ElementType;
  mime: string;
}

const FORMAT_OPTIONS: FormatOption[] = [
  {
    id: 'csv',
    label: 'CSV',
    description: 'Comma-separated values. Universal compatibility with spreadsheets, databases, and data tools.',
    icon: FileText,
    mime: 'text/csv',
  },
  {
    id: 'xlsx',
    label: 'Excel (.xlsx)',
    description: 'Microsoft Excel workbook. Ideal for business reports, pivot tables, and manual review.',
    icon: FileSpreadsheet,
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  {
    id: 'json',
    label: 'JSON',
    description: 'JavaScript Object Notation. Best for web applications, APIs, and structured data interchange.',
    icon: FileCode,
    mime: 'application/json',
  },
  {
    id: 'parquet',
    label: 'Parquet',
    description: 'Apache Parquet columnar format. Optimal for analytics, Spark, and ML pipelines.',
    icon: Database,
    mime: 'application/octet-stream',
  },
];

export const DatasetExport: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { dataset, selectedVersionId, versions } = useDataset();
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('csv');
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const currentVer = versions.find((v: any) => v.id === selectedVersionId) || dataset?.current_version;

  const handleExport = async () => {
    if (!id || !dataset) return;
    setIsExporting(true);
    setError(null);
    setSuccess(null);

    try {
      const { blob, filename } = await api.exportDataset(id, {
        version_id: selectedVersionId || undefined,
        format: selectedFormat,
      });

      // Trigger browser download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setSuccess(`Successfully exported "${filename}" (${(blob.size / 1024).toFixed(1)} KB)`);
    } catch (err: any) {
      setError(err.message || 'Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  if (!dataset) {
    return <div className="text-slate-400 text-sm">Loading dataset details...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Download className="w-6 h-6 text-cyan-400" />
            <span>Export Dataset</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Download the selected version of <span className="font-semibold text-slate-200">{dataset.name}</span> in your preferred format.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-950 text-indigo-300 border border-indigo-800 flex items-center gap-1">
            <GitBranch className="w-3.5 h-3.5" />
            v{currentVer?.version_number || 1} ({currentVer?.branch_name || 'main'})
          </span>
        </div>
      </div>

      {/* Version Info Card */}
      <div className="glass-card p-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-slate-800">
            <GitBranch className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <div className="text-sm font-bold text-white">
              Exporting Version {currentVer?.version_number || 1}
            </div>
            <div className="text-xs text-slate-400">
              {currentVer?.transformation_operation || 'Original upload'} •{' '}
              {currentVer?.row_count?.toLocaleString() || 0} rows •{' '}
              {currentVer?.column_count || 0} columns •{' '}
              Branch: {currentVer?.branch_name || 'main'}
            </div>
          </div>
        </div>
      </div>

      {/* Format Selection */}
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">
          Choose Export Format
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {FORMAT_OPTIONS.map((fmt) => {
            const Icon = fmt.icon;
            const isSelected = selectedFormat === fmt.id;
            return (
              <button
                key={fmt.id}
                id={`export-format-${fmt.id}`}
                onClick={() => setSelectedFormat(fmt.id)}
                className={`glass-card p-5 text-left transition-all group flex flex-col justify-between ${
                  isSelected
                    ? 'border-indigo-500/60 bg-indigo-950/20 shadow-lg shadow-indigo-950/30 ring-1 ring-indigo-500/40'
                    : 'hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`p-2 rounded-lg transition-colors ${
                      isSelected ? 'bg-indigo-600/30' : 'bg-slate-800 group-hover:bg-slate-700'
                    }`}>
                      <Icon className={`w-5 h-5 ${isSelected ? 'text-indigo-300' : 'text-cyan-400'}`} />
                    </div>
                    <h3 className={`font-bold text-sm transition-colors ${
                      isSelected ? 'text-indigo-300' : 'text-white group-hover:text-indigo-400'
                    }`}>
                      {fmt.label}
                    </h3>
                    {isSelected && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 ml-auto" />
                    )}
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {fmt.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Error / Success Messages */}
      {error && (
        <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{success}</span>
        </div>
      )}

      {/* Export Button */}
      <div className="flex items-center gap-4">
        <button
          id="export-download-button"
          onClick={handleExport}
          disabled={isExporting}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-950/30"
        >
          {isExporting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Generating {selectedFormat.toUpperCase()}...</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              <span>Download as {selectedFormat.toUpperCase()}</span>
            </>
          )}
        </button>

        <span className="text-xs text-slate-500">
          Version {currentVer?.version_number || 1} will be exported
        </span>
      </div>
    </div>
  );
};
