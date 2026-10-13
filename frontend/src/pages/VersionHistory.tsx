import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client';
import { useDataset } from '../context/DatasetContext';
import { 
  History, 
  GitBranch, 
  RotateCcw, 
  Eye, 
  Plus, 
  CheckCircle2, 
  Layers, 
  Clock, 
  FileCode,
  Loader2
} from 'lucide-react';

export const VersionHistory: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { dataset, selectedVersionId, setSelectedVersionId, refreshDataset } = useDataset();
  const [versions, setVersions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRestoring, setIsRestoring] = useState(false);
  const [branchModalVerId, setBranchModalVerId] = useState<string | null>(null);
  const [newBranchName, setNewBranchName] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const fetchVersions = async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const data = await api.getVersions(id);
      setVersions(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchVersions();
  }, [id]);

  const handleRestore = async (versionId: string, verNum: number) => {
    if (!id) return;
    if (!window.confirm(`Restore dataset to Version ${verNum}? (Newer versions will NOT be deleted).`)) {
      return;
    }
    setIsRestoring(true);
    try {
      await api.restoreVersion(id, versionId);
      setSelectedVersionId(versionId);
      await refreshDataset();
      setMessage(`Successfully restored active dataset pointer to Version ${verNum}.`);
      await fetchVersions();
    } catch (err: any) {
      alert(err.message || 'Restore failed.');
    } finally {
      setIsRestoring(false);
    }
  };

  const handleCreateBranch = async () => {
    if (!id || !branchModalVerId || !newBranchName.trim()) return;
    try {
      const res = await api.branchVersion(id, branchModalVerId, newBranchName.trim());
      setBranchModalVerId(null);
      setNewBranchName('');
      setMessage(`Created branch '${newBranchName}' at version ${res.version_number}.`);
      await refreshDataset();
      await fetchVersions();
    } catch (err: any) {
      alert(err.message || 'Branch creation failed.');
    }
  };

  if (isLoading) {
    return <div className="p-16 text-center text-slate-400 text-xs">Loading version graph...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <History className="w-6 h-6 text-indigo-400" />
            <span>Dataset Version History</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Immutable lineage log. Every transformation saves a permanent Parquet checkpoint.
          </p>
        </div>
        <Link
          to={`/datasets/${id}/lineage`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-600 hover:text-white text-xs font-semibold transition-all"
        >
          <GitBranch className="w-3.5 h-3.5" />
          <span>Compare Versions & Lineage</span>
        </Link>
      </div>

      {message && (
        <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{message}</span>
        </div>
      )}

      {/* Version Timeline */}
      <div className="space-y-4">
        {versions.map((ver, idx) => {
          const isActive = dataset?.current_version_id === ver.id;
          return (
            <div
              key={ver.id}
              className={`glass-card p-5 transition-all ${
                isActive ? 'border-indigo-500/60 bg-indigo-950/20 shadow-lg shadow-indigo-950/30' : 'hover:border-slate-700'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2.5">
                    <span className="font-extrabold text-white text-base">
                      Version {ver.version_number}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-indigo-300 border border-slate-700 flex items-center gap-1">
                      <GitBranch className="w-3 h-3 text-indigo-400" />
                      {ver.branch_name}
                    </span>
                    {isActive && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-950 text-emerald-300 border border-emerald-800">
                        Active Pointer
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-slate-300 flex items-center gap-2">
                    <span className="font-semibold text-indigo-400 uppercase text-[11px]">
                      Operation: {ver.transformation_operation}
                    </span>
                    <span>•</span>
                    <span className="text-slate-400">
                      {ver.row_count?.toLocaleString()} rows, {ver.column_count} cols
                    </span>
                  </div>

                  {ver.transformation_params && Object.keys(ver.transformation_params).length > 0 && (
                    <div className="text-[11px] font-mono text-slate-400 bg-slate-900/80 px-2.5 py-1 rounded max-w-2xl truncate border border-slate-800/80">
                      Params: {JSON.stringify(ver.transformation_params)}
                    </div>
                  )}

                  <div className="text-[10px] text-slate-500 flex items-center gap-2 pt-1">
                    <span>Created: {new Date(ver.created_at).toLocaleString()}</span>
                    <span>•</span>
                    <span className="font-mono truncate max-w-xs" title={ver.file_checksum || ''}>
                      SHA256: {ver.file_checksum ? ver.file_checksum.slice(0, 16) + '...' : 'Not available'}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex sm:flex-col items-end gap-2 shrink-0">
                  <button
                    onClick={() => {
                      setSelectedVersionId(ver.id);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 flex items-center gap-1.5 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Select & Inspect</span>
                  </button>

                  {!isActive && (
                    <button
                      onClick={() => handleRestore(ver.id, ver.version_number)}
                      disabled={isRestoring}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-semibold border border-amber-800/50 flex items-center gap-1.5 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restore to V{ver.version_number}</span>
                    </button>
                  )}

                  <button
                    onClick={() => setBranchModalVerId(ver.id)}
                    className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 pt-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Branch from here</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Branch Modal */}
      {branchModalVerId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="glass-card max-w-sm w-full p-6 space-y-4">
            <h3 className="font-bold text-base text-white">Create Dataset Branch</h3>
            <p className="text-xs text-slate-400">
              Create an experimental branch based on the selected version without modifying the main lineage.
            </p>
            <input
              type="text"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              placeholder="e.g. experiment/imputed"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setBranchModalVerId(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateBranch}
                disabled={!newBranchName.trim()}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
              >
                Create Branch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
