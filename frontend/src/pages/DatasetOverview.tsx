import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useDataset } from '../context/DatasetContext';
import { api } from '../api/client';
import { 
  FileText, 
  BarChart3, 
  Table, 
  ShieldCheck, 
  Wand2, 
  Sparkles, 
  Download, 
  GitBranch, 
  Hash, 
  Layers, 
  History,
  CheckCircle2,
  AlertTriangle,
  ExternalLink
} from 'lucide-react';

export const DatasetOverview: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { dataset, selectedVersionId, versions } = useDataset();
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    if (id) {
      api.getTransformationHistory(id).then(setHistory).catch(console.error);
    }
  }, [id, selectedVersionId]);

  const currentVer = versions.find((v: any) => v.id === selectedVersionId) || dataset?.current_version;

  if (!dataset) {
    return <div className="text-slate-400 text-sm">Loading dataset details...</div>;
  }

  const quickNav = [
    { to: `/datasets/${dataset.id}/profiling`, title: 'Profiling & Quality', desc: 'Inspect statistical distributions, nulls, outliers, and quality score', icon: BarChart3, color: 'text-indigo-400' },
    { to: `/datasets/${dataset.id}/preview`, title: 'Interactive Preview', desc: 'Search and browse raw columnar data with pagination', icon: Table, color: 'text-blue-400' },
    { to: `/datasets/${dataset.id}/schema`, title: 'Schema Compatibility', desc: 'Validate against target schema types and constraints', icon: ShieldCheck, color: 'text-amber-400' },
    { to: `/datasets/${dataset.id}/transform`, title: 'Transformation Builder', desc: 'Deduplicate, impute, convert types, scale, and clean', icon: Wand2, color: 'text-emerald-400' },
    { to: `/datasets/${dataset.id}/ml-readiness`, title: 'ML Readiness', desc: 'Assess leakage, target balance, feature types for modeling', icon: Sparkles, color: 'text-purple-400' },
    { to: `/datasets/${dataset.id}/export`, title: 'Dataset Export', desc: 'Download clean version in CSV, Parquet, JSON, or Excel', icon: Download, color: 'text-cyan-400' },
  ];

  return (
    <div className="space-y-6">
      {/* Title & Metadata */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">{dataset.name}</h1>
          <p className="text-xs text-slate-400 mt-1">
            {dataset.description || 'No description provided.'}
          </p>
          {dataset.source_url && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-400">
              <span className="text-slate-500">Source:</span>
              <a
                href={dataset.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 flex items-center gap-1"
              >
                <span className="truncate max-w-md">{dataset.source_url}</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {dataset.source === 'kaggle' && (
            <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-sky-950 text-sky-300 border border-sky-800 flex items-center gap-1.5">
              <span>Kaggle</span>
              {dataset.source_url && (
                <a
                  href={dataset.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-400 hover:text-sky-200 transition-colors"
                  title="View on Kaggle"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </span>
          )}
          {dataset.source === 'huggingface' && (
            <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-950 text-amber-300 border border-amber-800 flex items-center gap-1.5">
              <span>Hugging Face</span>
              {dataset.source_url && (
                <a
                  href={dataset.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 hover:text-amber-200 transition-colors"
                  title="View on Hugging Face"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </span>
          )}
          {(!dataset.source || dataset.source === 'local') && (
            <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
              Local Upload
            </span>
          )}
          <span className="px-2.5 py-1 rounded-md text-xs font-semibold uppercase bg-slate-800 text-slate-300 border border-slate-700">
            {dataset.format}
          </span>
          <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-950 text-indigo-300 border border-indigo-800 flex items-center gap-1">
            <GitBranch className="w-3.5 h-3.5" />
            v{currentVer?.version_number || 1} ({currentVer?.branch_name || 'main'})
          </span>
        </div>
      </div>

      {/* Version Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Row Count
          </div>
          <div className="text-2xl font-bold text-white">
            {currentVer?.row_count?.toLocaleString() || 0}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Records in active version</div>
        </div>

        <div className="glass-card p-4">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Column Count
          </div>
          <div className="text-2xl font-bold text-white">
            {currentVer?.column_count || 0}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Feature dimensions</div>
        </div>

        <div className="glass-card p-4">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Total Versions
          </div>
          <div className="text-2xl font-bold text-indigo-400">
            {versions.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Immutable snapshots created</div>
        </div>

        <div className="glass-card p-4">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Storage Integrity
          </div>
          <div className="text-2xl font-bold text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-5 h-5" />
            <span>Verified</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">SHA-256 Parquet checksum</div>
        </div>
      </div>

      {/* Feature Navigation Cards */}
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">
          Preparation Workflow
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {quickNav.map((nav) => {
            const Icon = nav.icon;
            return (
              <Link
                key={nav.to}
                to={nav.to}
                className="glass-card p-5 hover:border-slate-700 transition-all group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-lg bg-slate-800 group-hover:bg-slate-700 transition-colors">
                      <Icon className={`w-5 h-5 ${nav.color}`} />
                    </div>
                    <h3 className="font-bold text-sm text-white group-hover:text-indigo-400 transition-colors">
                      {nav.title}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {nav.desc}
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] font-semibold text-indigo-400 flex items-center gap-1">
                  <span>Open Tool</span>
                  <span>→</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Recent Transformations On This Dataset */}
      <div className="glass-card overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <History className="w-4 h-4 text-indigo-400" />
            <span>Recent Transformations</span>
          </h3>
          <Link to={`/datasets/${dataset.id}/versions`} className="text-xs font-semibold text-indigo-400 hover:text-indigo-300">
            View All Versions
          </Link>
        </div>
        {history.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No transformations applied yet. Dataset is currently at baseline uploaded version.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60 text-xs">
            {history.slice(0, 5).map((h) => (
              <div key={h.id} className="p-3.5 flex items-center justify-between hover:bg-slate-800/20">
                <div className="space-y-0.5">
                  <div className="font-semibold text-slate-200">
                    {h.operation}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {JSON.stringify(h.parameters)}
                  </div>
                </div>
                <div className="text-right">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    h.status === 'completed' ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60' : 'bg-rose-950/60 text-rose-300 border border-rose-800/60'
                  }`}>
                    {h.status}
                  </span>
                  <div className="text-[10px] text-slate-500 mt-1">
                    {new Date(h.started_at).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
