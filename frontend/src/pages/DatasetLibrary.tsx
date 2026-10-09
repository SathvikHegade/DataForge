import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { 
  Database, 
  Search, 
  Trash2, 
  UploadCloud, 
  ArrowRight, 
  Layers, 
  FileCode, 
  AlertTriangle,
  Loader2
} from 'lucide-react';

export const DatasetLibrary: React.FC = () => {
  const [datasets, setDatasets] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('updated_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [isLoading, setIsLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchDatasets = async () => {
    setIsLoading(true);
    try {
      const query = `search=${encodeURIComponent(search)}&sort_by=${sortBy}&sort_order=${sortOrder}`;
      const data = await api.getDatasets(query);
      setDatasets(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDatasets();
  }, [search, sortBy, sortOrder]);

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      await api.deleteDataset(deleteId);
      setDeleteId(null);
      await fetchDatasets();
    } catch (err) {
      console.error(err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Dataset Library</h1>
          <p className="text-sm text-slate-400 mt-1">
            Browse, manage, and inspect all datasets and their version histories
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

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search datasets by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-semibold text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="updated_at">Recently Updated</option>
            <option value="created_at">Recently Created</option>
            <option value="name">Name</option>
            <option value="file_size_bytes">File Size</option>
          </select>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-semibold text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>
      </div>

      {/* Dataset Grid */}
      {isLoading ? (
        <div className="p-16 flex flex-col items-center justify-center text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-2" />
          <span className="text-xs">Loading dataset catalog...</span>
        </div>
      ) : datasets.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Database className="w-12 h-12 text-slate-500 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-white">No datasets found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 mb-4">
            {search ? 'Try adjusting your search query' : 'Upload your first dataset to start profiling and transformation.'}
          </p>
          <Link
            to="/datasets/upload"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Upload Dataset</span>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {datasets.map((d) => (
            <div key={d.id} className="glass-card flex flex-col justify-between hover:border-slate-700 transition-all p-5 group">
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700">
                      {d.format}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-800">
                      v{d.version_number || 1}
                    </span>
                    {d.source === 'kaggle' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-950 text-sky-300 border border-sky-800">
                        Kaggle
                      </span>
                    )}
                    {d.source === 'huggingface' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800">
                        Hugging Face
                      </span>
                    )}
                    {(!d.source || d.source === 'local') && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                        Local Upload
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setDeleteId(d.id)}
                    className="text-slate-500 hover:text-rose-400 p-1 rounded hover:bg-rose-950/20 transition-colors"
                    title="Delete dataset"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <Link to={`/datasets/${d.id}/overview`} className="block">
                  <h3 className="font-bold text-white text-base group-hover:text-indigo-400 transition-colors line-clamp-1">
                    {d.name}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                    {d.description || `Original file: ${d.original_filename}`}
                  </p>
                </Link>

                <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-800/80 text-xs text-slate-400">
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-semibold">Rows</span>
                    <span className="font-semibold text-slate-200">{d.row_count?.toLocaleString() || 0}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-semibold">Columns</span>
                    <span className="font-semibold text-slate-200">{d.column_count || 0}</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-800 flex items-center justify-between">
                <span className="text-[11px] text-slate-500">
                  {new Date(d.updated_at).toLocaleDateString()}
                </span>
                <Link
                  to={`/datasets/${d.id}/overview`}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300"
                >
                  <span>Open Workspace</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="glass-card max-w-sm w-full p-6 space-y-4 border-rose-500/30">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="font-bold text-base text-white">Delete Dataset?</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              This will permanently delete this dataset, all its immutable version artifacts, transformation logs, and quality reports. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteId(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1.5"
              >
                {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
