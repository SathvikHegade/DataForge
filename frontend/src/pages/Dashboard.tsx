import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { 
  Database, 
  UploadCloud, 
  Sparkles, 
  Layers, 
  ArrowUpRight, 
  Clock, 
  ShieldCheck, 
  FileCheck2, 
  Plus
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  const [datasets, setDatasets] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [dList, jList] = await Promise.all([
          api.getDatasets(),
          api.getJobs(undefined, 5),
        ]);
        setDatasets(dList || []);
        setJobs(jList || []);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const totalRows = datasets.reduce((acc, d) => acc + (d.row_count || 0), 0);

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Platform Overview</h1>
          <p className="text-sm text-slate-400 mt-1">
            Intelligent pipeline: Upload → Profile → Analyse → Transform → Validate → Prepare → Export
          </p>
        </div>
        <Link
          to="/datasets/upload"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-lg shadow-indigo-600/25 transition-all"
        >
          <UploadCloud className="w-4 h-4" />
          <span>Upload Dataset</span>
        </Link>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-5">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Datasets</span>
            <Database className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-white">{datasets.length}</div>
          <div className="text-xs text-slate-400 mt-1">Active in your workspace</div>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Processed Records</span>
            <Layers className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white">{totalRows.toLocaleString()}</div>
          <div className="text-xs text-slate-400 mt-1">Across all active versions</div>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Engines Running</span>
            <Sparkles className="w-5 h-5 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white">Polars</div>
          <div className="text-xs text-slate-400 mt-1">SIMD-optimized dataframe processing</div>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">System Status</span>
            <ShieldCheck className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400">Operational</div>
          <div className="text-xs text-slate-400 mt-1">Storage & DB connected</div>
        </div>
      </div>

      {/* Recent Datasets Table */}
      <div className="glass-card overflow-hidden">
        <div className="p-5 border-b border-slate-800 flex justify-between items-center">
          <div>
            <h2 className="text-base font-bold text-white">Recent Datasets</h2>
            <p className="text-xs text-slate-400 mt-0.5">Manage data preparation versions and pipelines</p>
          </div>
          <Link
            to="/datasets"
            className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
          >
            <span>View All</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {datasets.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-xl bg-slate-800/80 flex items-center justify-center text-slate-400 mx-auto mb-3">
              <Database className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-white">No datasets uploaded yet</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 mb-4">
              Get started by uploading your first CSV, Parquet, JSON, or Excel dataset to profile and prepare.
            </p>
            <Link
              to="/datasets/upload"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Upload Sample Dataset</span>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900/60 text-slate-400 border-b border-slate-800 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4">Dataset Name</th>
                  <th className="py-3 px-4">Format</th>
                  <th className="py-3 px-4">Active Version</th>
                  <th className="py-3 px-4">Rows</th>
                  <th className="py-3 px-4">Columns</th>
                  <th className="py-3 px-4">Created</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {datasets.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-100">
                      <Link to={`/datasets/${d.id}/overview`} className="hover:text-indigo-400 transition-colors">
                        {d.name}
                      </Link>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold uppercase bg-slate-800 text-slate-300 border border-slate-700">
                        {d.format}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-950/60 text-indigo-300 border border-indigo-800/60">
                        v{d.version_number || 1}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-300">{d.row_count?.toLocaleString() || 0}</td>
                    <td className="py-3 px-4 text-slate-300">{d.column_count || 0}</td>
                    <td className="py-3 px-4 text-slate-400">
                      {new Date(d.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <Link
                        to={`/datasets/${d.id}/profiling`}
                        className="text-xs font-semibold text-indigo-400 hover:text-indigo-300"
                      >
                        Profile
                      </Link>
                      <span className="text-slate-700">•</span>
                      <Link
                        to={`/datasets/${d.id}/transform`}
                        className="text-xs font-semibold text-indigo-400 hover:text-indigo-300"
                      >
                        Transform
                      </Link>
                      <span className="text-slate-700">•</span>
                      <Link
                        to={`/datasets/${d.id}/ml-readiness`}
                        className="text-xs font-semibold text-emerald-400 hover:text-emerald-300"
                      >
                        ML Ready
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Workflow Navigation Banner */}
      <div className="glass-card p-6 border-indigo-500/20 bg-gradient-to-r from-slate-900 via-indigo-950/20 to-slate-900">
        <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          The DataForge Guarantee: Safe, Traceable Preprocessing
        </h3>
        <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
          Every transformation validates inputs, creates an immutable parquet version, preserves the original upload,
          and validates that no partial results are ever published on failure. Machine learning preparation enforces
          leakage-aware splitting before parameter fitting.
        </p>
      </div>
    </div>
  );
};
