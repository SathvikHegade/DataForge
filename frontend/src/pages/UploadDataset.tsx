import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api/client';
import { 
  UploadCloud, 
  AlertCircle, 
  CheckCircle2, 
  Sparkles, 
  Loader2,
  FileCheck,
  ArrowRight,
  ExternalLink,
  Layers,
  Database,
  RefreshCw,
  FolderOpen
} from 'lucide-react';

type ImportTab = 'local' | 'kaggle' | 'huggingface';

interface ImportSuccessSummary {
  id: string;
  name: string;
  source: string;
  sourceUrl?: string;
  rowCount: number;
  columnCount: number;
  format: string;
}

export const UploadDataset: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ImportTab>('local');

  // Local Upload State
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Kaggle State
  const [kaggleUrl, setKaggleUrl] = useState('');
  const [kaggleName, setKaggleName] = useState('');
  const [kaggleDesc, setKaggleDesc] = useState('');
  const [kaggleValidation, setKaggleValidation] = useState<{ isValid: boolean; error?: string; identifier?: string }>({ isValid: false });

  // Hugging Face State
  const [hfUrl, setHfUrl] = useState('');
  const [hfName, setHfName] = useState('');
  const [hfDesc, setHfDesc] = useState('');
  const [hfValidation, setHfValidation] = useState<{ isValid: boolean; error?: string; repoId?: string }>({ isValid: false });
  const [hfSplits, setHfSplits] = useState<string[]>([]);
  const [selectedSplit, setSelectedSplit] = useState<string>('train');
  const [isFetchingSplits, setIsFetchingSplits] = useState(false);
  const [splitFetchError, setSplitFetchError] = useState<string | null>(null);

  // Common Import Execution States
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<ImportSuccessSummary | null>(null);

  const navigate = useNavigate();

  // Validate Kaggle Input on change
  useEffect(() => {
    const trimmed = kaggleUrl.trim();
    if (!trimmed) {
      setKaggleValidation({ isValid: false });
      return;
    }

    if (trimmed.includes('://')) {
      try {
        const url = new URL(trimmed);
        const host = url.hostname.toLowerCase();
        if (host !== 'kaggle.com' && host !== 'www.kaggle.com') {
          setKaggleValidation({ isValid: false, error: 'Only URLs from kaggle.com are supported.' });
          return;
        }
        const parts = url.pathname.replace(/^\/|\/$/g, '').split('/').filter(Boolean);
        if (parts.length >= 3 && parts[0] === 'datasets') {
          const id = `${parts[1]}/${parts[2]}`;
          setKaggleValidation({ isValid: true, identifier: id });
          if (!kaggleName) {
            setKaggleName(parts[2].replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
          }
          return;
        }
        if (parts.length >= 2 && parts[0] !== 'datasets') {
          const id = `${parts[0]}/${parts[1]}`;
          setKaggleValidation({ isValid: true, identifier: id });
          if (!kaggleName) {
            setKaggleName(parts[1].replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
          }
          return;
        }
        setKaggleValidation({ isValid: false, error: 'Expected URL format: https://www.kaggle.com/datasets/username/dataset-name' });
      } catch {
        setKaggleValidation({ isValid: false, error: 'Invalid URL format.' });
      }
    } else {
      const match = trimmed.match(/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/);
      if (match) {
        setKaggleValidation({ isValid: true, identifier: trimmed });
        if (!kaggleName) {
          const slug = trimmed.split('/')[1];
          setKaggleName(slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
        }
      } else {
        setKaggleValidation({ isValid: false, error: 'Expected format: username/dataset-name' });
      }
    }
  }, [kaggleUrl]);

  // Validate Hugging Face Input & Fetch Splits
  useEffect(() => {
    const trimmed = hfUrl.trim();
    if (!trimmed) {
      setHfValidation({ isValid: false });
      setHfSplits([]);
      setSplitFetchError(null);
      return;
    }

    let repoId: string | null = null;
    if (trimmed.includes('://')) {
      try {
        const url = new URL(trimmed);
        const host = url.hostname.toLowerCase();
        if (host !== 'huggingface.co' && host !== 'www.huggingface.co') {
          setHfValidation({ isValid: false, error: 'Only URLs from huggingface.co are supported.' });
          setHfSplits([]);
          return;
        }
        const parts = url.pathname.replace(/^\/|\/$/g, '').split('/').filter(Boolean);
        if (parts[0] === 'datasets') parts.shift();
        if (parts.length >= 2) {
          repoId = `${parts[0]}/${parts[1]}`;
        } else if (parts.length === 1) {
          repoId = parts[0];
        } else {
          setHfValidation({ isValid: false, error: 'Expected URL: https://huggingface.co/datasets/username/dataset-name' });
          setHfSplits([]);
          return;
        }
      } catch {
        setHfValidation({ isValid: false, error: 'Invalid URL format.' });
        setHfSplits([]);
        return;
      }
    } else {
      const match = trimmed.match(/^([a-zA-Z0-9_-]+\/)?[a-zA-Z0-9_.-]+$/);
      if (match) {
        repoId = trimmed;
      } else {
        setHfValidation({ isValid: false, error: 'Expected format: username/dataset-name' });
        setHfSplits([]);
        return;
      }
    }

    if (repoId) {
      setHfValidation({ isValid: true, repoId });
      if (!hfName) {
        const namePart = repoId.split('/').pop() || repoId;
        setHfName(namePart.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
      }

      // Fetch available splits
      const fetchSplits = async () => {
        setIsFetchingSplits(true);
        setSplitFetchError(null);
        try {
          const res = await api.getHuggingFaceSplits(trimmed);
          if (res && res.splits && res.splits.length > 0) {
            setHfSplits(res.splits);
            setSelectedSplit(res.default_split || res.splits[0]);
          } else {
            setHfSplits(['train']);
            setSelectedSplit('train');
          }
        } catch (err: any) {
          // If split inspection fails or offline, provide sensible default
          setHfSplits(['train', 'test', 'validation']);
          setSelectedSplit('train');
          setSplitFetchError(err.message || 'Could not verify splits; will attempt default "train" split.');
        } finally {
          setIsFetchingSplits(false);
        }
      };

      const timer = setTimeout(fetchSplits, 400);
      return () => clearTimeout(timer);
    }
  }, [hfUrl]);

  // Handle local file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      if (!name) {
        setName(selectedFile.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '));
      }
      setError(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      setFile(droppedFile);
      if (!name) {
        setName(droppedFile.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '));
      }
      setError(null);
    }
  };

  // Quick Load Sample Dataset helper
  const handleLoadSample = async () => {
    try {
      setIsProcessing(true);
      setProcessingStatus('Loading sample dirty customer churn dataset...');
      setError(null);

      const sampleCsv = `customer_id,name,age,gender,tenure_months,signup_date,monthly_charges,total_charges,contract_type,payment_method,churn
CUST-001,Alice Smith,34,Female,12,2023-01-15,65.5,786.0,Month-to-month,Credit Card,No
CUST-002,Bob Johnson,45,Male,24,2022-03-20,89.0,2136.0,One year,Bank Transfer,No
CUST-003,Carol White,29,Female,3,2023-11-05,45.2,135.6,Month-to-month,Electronic Check,Yes
CUST-004,David Brown,,Male,18,2022-08-12,70.0,1260.0,One year,Credit Card,No
CUST-005,Emma Wilson,52,Female,36,2021-05-30,110.5,3978.0,Two year,Credit Card,No
CUST-006,Frank Miller,38,Male,6,2023-07-22,55.0,330.0,Month-to-month,Mailed Check,Yes
CUST-007,Grace Davis,61,Female,48,2020-02-14,95.2,4569.6,Two year,Bank Transfer,No
CUST-008,Henry Taylor,24,Male,1,2024-01-08,30.0,30.0,Month-to-month,Electronic Check,Yes
CUST-009,Ivy Anderson,42,Female,15,2022-10-18,80.5,1207.5,Month-to-month,Credit Card,No
CUST-010,Jack Thomas,31,Male,9,2023-04-25,60.0,540.0,Month-to-month,Electronic Check,No
CUST-003,Carol White,29,Female,3,2023-11-05,45.2,135.6,Month-to-month,Electronic Check,Yes
CUST-011,Karen Martinez,49,Female,28,2021-12-10,102.3,unknown,One year,Credit Card,No
CUST-012,Leo Robinson,73,Male,999,2023-09-01,75.0,75000.0,Month-to-month,Electronic Check,Yes
CUST-013,Mia Clark,22,Female,4,2023-10-11,40.0,160.0,Month-to-month,Mailed Check,No
CUST-014,Noah Rodriguez,,Male,14,2022-11-19,85.5,1197.0,One year,Credit Card,No
CUST-015,Olivia Lewis,36,Female,22,2022-04-03,92.0,$2024.00,Month-to-month,Bank Transfer,Yes
CUST-016,Paul Lee,41,Male,0,2024-02-01,25.0,,Month-to-month,Mailed Check,No
CUST-017,Quinn Walker,27,Female,8,2023-06-14,68.0,544.0,Month-to-month,Electronic Check,No
CUST-018,Ryan Hall,58,Male,40,2020-09-27,105.0,4200.0,Two year,Credit Card,No
CUST-019,Sophia Allen,33,Female,11,2023-02-18,72.5,797.5,Month-to-month,Credit Card,Yes
CUST-007,Grace Davis,61,Female,48,2020-02-14,95.2,4569.6,Two year,Bank Transfer,No
CUST-020,Thomas Young,47,Male,30,2021-08-09,88.0,2640.0,One year,Bank Transfer,No
CUST-021,Uma Patel,30,Female,7,2023-07-15,50.0,350.0,Month-to-month,Electronic Check,No
CUST-022,Victor King,65,Male,60,2019-01-10,115.0,15000.0,Two year,Credit Card,No
CUST-023,Wendy Scott,26,Female,2,2023-12-01,35.0,70.0,Month-to-month,Mailed Check,Yes
CUST-024,Xavier Green,39,Male,19,2022-07-04,78.5,1491.5,One year,Electronic Check,No
CUST-025,Yara Baker,50,Female,33,2021-04-12,98.0,3234.0,Two year,Credit Card,No
CUST-026,Zack Nelson,28,Male,5,2023-08-20,48.0,240.0,Month-to-month,Electronic Check,Yes
CUST-027,Amber Bell,35,Female,13,2023-01-28,71.0,923.0,Month-to-month,Credit Card,No
CUST-028,Brian Adams,43,Male,26,2022-01-14,84.0,2184.0,One year,Bank Transfer,No`;

      const sampleBlob = new Blob([sampleCsv], { type: 'text/csv' });
      const sampleFileObj = new File([sampleBlob], 'dirty_customer_churn.csv', { type: 'text/csv' });
      
      const formData = new FormData();
      formData.append('file', sampleFileObj);
      formData.append('name', 'Sample Customer Churn (Flawed Data)');
      formData.append('description', 'Demo dataset containing missing values, duplicates, mixed types, and outliers for acceptance testing.');

      const result = await api.uploadDataset(formData);
      setSuccessData({
        id: result.id,
        name: result.name,
        source: 'Local Upload',
        rowCount: result.current_version?.row_count || 28,
        columnCount: result.current_version?.column_count || 11,
        format: result.format || 'csv'
      });
    } catch (err: any) {
      setError(err.message || 'Failed to upload sample dataset.');
    } finally {
      setIsProcessing(false);
      setProcessingStatus(null);
    }
  };

  // Submit Handler for Local Upload
  const handleLocalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a dataset file to upload.');
      return;
    }

    setIsProcessing(true);
    setProcessingStatus('Uploading and extracting schema metadata with Polars...');
    setError(null);

    const formData = new FormData();
    formData.append('file', file);
    if (name) formData.append('name', name);
    if (description) formData.append('description', description);

    try {
      const result = await api.uploadDataset(formData);
      setSuccessData({
        id: result.id,
        name: result.name,
        source: 'Local Upload',
        rowCount: result.current_version?.row_count || 0,
        columnCount: result.current_version?.column_count || 0,
        format: result.format || 'csv'
      });
    } catch (err: any) {
      setError(err.message || 'Upload failed. Please verify file format.');
    } finally {
      setIsProcessing(false);
      setProcessingStatus(null);
    }
  };

  // Submit Handler for Kaggle Import
  const handleKaggleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kaggleValidation.isValid) {
      setError(kaggleValidation.error || 'Please enter a valid Kaggle dataset URL or identifier.');
      return;
    }

    setIsProcessing(true);
    setProcessingStatus('Connecting to Kaggle API and downloading dataset...');
    setError(null);

    try {
      const result = await api.importKaggleDataset({
        url: kaggleUrl.trim(),
        name: kaggleName.trim() || undefined,
        description: kaggleDesc.trim() || undefined
      });

      setSuccessData({
        id: result.id,
        name: result.name,
        source: 'Kaggle',
        sourceUrl: result.source_url,
        rowCount: result.current_version?.row_count || 0,
        columnCount: result.current_version?.column_count || 0,
        format: result.format
      });
    } catch (err: any) {
      setError(err.message || 'Unable to import this Kaggle dataset. Please verify the URL and credentials.');
    } finally {
      setIsProcessing(false);
      setProcessingStatus(null);
    }
  };

  // Submit Handler for Hugging Face Import
  const handleHfSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hfValidation.isValid) {
      setError(hfValidation.error || 'Please enter a valid Hugging Face dataset URL or repository identifier.');
      return;
    }

    setIsProcessing(true);
    setProcessingStatus(`Importing Hugging Face dataset (split: ${selectedSplit})...`);
    setError(null);

    try {
      const result = await api.importHuggingFaceDataset({
        url: hfUrl.trim(),
        split: selectedSplit || undefined,
        name: hfName.trim() || undefined,
        description: hfDesc.trim() || undefined
      });

      setSuccessData({
        id: result.id,
        name: result.name,
        source: 'Hugging Face',
        sourceUrl: result.source_url,
        rowCount: result.current_version?.row_count || 0,
        columnCount: result.current_version?.column_count || 0,
        format: result.format
      });
    } catch (err: any) {
      setError(err.message || 'Unable to import this Hugging Face dataset. Please verify the repository identifier.');
    } finally {
      setIsProcessing(false);
      setProcessingStatus(null);
    }
  };

  const resetForm = () => {
    setSuccessData(null);
    setError(null);
    setFile(null);
    setName('');
    setDescription('');
    setKaggleUrl('');
    setKaggleName('');
    setKaggleDesc('');
    setHfUrl('');
    setHfName('');
    setHfDesc('');
    setHfSplits([]);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Add Dataset</h1>
        <p className="text-sm text-slate-400 mt-1">
          Import datasets from local files, Kaggle, or Hugging Face. Datasets are canonicalized as immutable baseline versions.
        </p>
      </div>

      {/* Success View */}
      {successData ? (
        <div className="glass-card p-8 border-emerald-500/40 bg-emerald-950/10 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                ✓ Dataset imported successfully
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Baseline version 1 has been verified and stored in the catalog.
              </p>
            </div>
          </div>

          <div className="glass-card bg-slate-900/60 p-5 rounded-xl border-slate-800 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-semibold">Dataset</span>
                <span className="font-bold text-white text-sm line-clamp-1">{successData.name}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-semibold">Source</span>
                <span className="font-semibold text-slate-200">
                  {successData.source}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-semibold">Rows</span>
                <span className="font-semibold text-slate-200">{successData.rowCount.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-semibold">Columns</span>
                <span className="font-semibold text-slate-200">{successData.columnCount}</span>
              </div>
            </div>

            {successData.sourceUrl && (
              <div className="pt-2 border-t border-slate-800 flex items-center gap-1.5 text-xs text-slate-400">
                <span className="text-slate-500">Source URL:</span>
                <a 
                  href={successData.sourceUrl} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 flex items-center gap-1 truncate"
                >
                  <span className="truncate">{successData.sourceUrl}</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={resetForm}
              className="w-full sm:w-auto px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
            >
              Import Another Dataset
            </button>
            <button
              type="button"
              onClick={() => navigate(`/datasets/${successData.id}/profiling`)}
              className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition-all"
            >
              <span>View Dataset</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Method Selection Tabs */}
          <div className="flex items-center p-1.5 bg-slate-900 border border-slate-800 rounded-xl gap-1">
            <button
              type="button"
              onClick={() => { setActiveTab('local'); setError(null); }}
              className={`flex-1 py-2.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                activeTab === 'local'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <UploadCloud className="w-4 h-4" />
              <span>Upload File</span>
            </button>

            <button
              type="button"
              onClick={() => { setActiveTab('kaggle'); setError(null); }}
              className={`flex-1 py-2.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                activeTab === 'kaggle'
                  ? 'bg-sky-600 text-white shadow-md shadow-sky-600/25'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              {/* Kaggle 'k' mark */}
              <span className="font-black text-xs">K</span>
              <span>Kaggle</span>
            </button>

            <button
              type="button"
              onClick={() => { setActiveTab('huggingface'); setError(null); }}
              className={`flex-1 py-2.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                activeTab === 'huggingface'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/25'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <span className="text-sm leading-none">🤗</span>
              <span>Hugging Face</span>
            </button>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-3">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold text-rose-200">Unable to import this dataset.</div>
                <div className="text-slate-300 leading-relaxed">{error}</div>
              </div>
            </div>
          )}

          {/* TAB 1: LOCAL UPLOAD */}
          {activeTab === 'local' && (
            <div className="space-y-5">
              {/* Quick Load Sample Banner */}
              <div className="glass-card p-4 border-indigo-500/30 bg-indigo-950/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-600/30 flex items-center justify-center text-indigo-400 shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">Need a test dataset right now?</div>
                    <div className="text-[11px] text-slate-300">
                      Load our built-in benchmark dataset with missing values, duplicate rows, mixed types, and outliers.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLoadSample}
                  disabled={isProcessing}
                  className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold whitespace-nowrap transition-all shadow-md shadow-indigo-600/20"
                >
                  {isProcessing ? 'Loading...' : 'Load Sample Churn Data'}
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleLocalSubmit} className="glass-card p-6 space-y-5">
                {/* Dropzone */}
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                    file
                      ? 'border-indigo-500 bg-indigo-950/20'
                      : 'border-slate-700 hover:border-slate-500 bg-slate-900/50'
                  }`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".csv,.parquet,.json,.xlsx,.xls,.txt"
                    className="hidden"
                  />

                  {file ? (
                    <div className="space-y-2">
                      <div className="w-12 h-12 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/40 flex items-center justify-center mx-auto">
                        <FileCheck className="w-6 h-6" />
                      </div>
                      <div className="font-semibold text-white text-sm">{file.name}</div>
                      <div className="text-xs text-slate-400">
                        {(file.size / 1024).toFixed(1)} KB • Click or drag to replace
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="w-12 h-12 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                        <UploadCloud className="w-6 h-6" />
                      </div>
                      <div className="text-sm font-semibold text-white">
                        Drag & drop your dataset here, or <span className="text-indigo-400">browse files</span>
                      </div>
                      <div className="text-xs text-slate-500">
                        Supported: CSV, Parquet, JSON, XLSX up to 500MB
                      </div>
                    </div>
                  )}
                </div>

                {/* Metadata Inputs */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Dataset Name
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Q3 Customer Churn"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Description (Optional)
                    </label>
                    <textarea
                      rows={2}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Source, business purpose, or preprocessing notes..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                </div>

                {/* Submit */}
                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={!file || isProcessing}
                    className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/25 transition-all"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{processingStatus || 'Processing...'}</span>
                      </>
                    ) : (
                      <>
                        <UploadCloud className="w-4 h-4" />
                        <span>Upload File</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 2: KAGGLE IMPORT */}
          {activeTab === 'kaggle' && (
            <form onSubmit={handleKaggleSubmit} className="glass-card p-6 space-y-5 border-sky-500/20">
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-sky-500/20 text-sky-400 flex items-center justify-center text-xs font-black">K</span>
                    <span>Kaggle Dataset</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Paste a Kaggle dataset URL or identifier to import directly via the official API.
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-950 text-sky-300 border border-sky-800">
                  Kaggle API
                </span>
              </div>

              {/* URL Input */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-300">
                  Paste Kaggle dataset URL or identifier
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={kaggleUrl}
                    onChange={(e) => setKaggleUrl(e.target.value)}
                    placeholder="https://www.kaggle.com/datasets/username/dataset-name or username/dataset-name"
                    className={`w-full bg-slate-900 border rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none transition-colors ${
                      kaggleValidation.isValid
                        ? 'border-emerald-500/60 focus:border-emerald-500'
                        : kaggleUrl && kaggleValidation.error
                        ? 'border-rose-500/60 focus:border-rose-500'
                        : 'border-slate-700 focus:border-sky-500'
                    }`}
                  />
                  {kaggleValidation.isValid && (
                    <div className="absolute right-3 top-3 text-emerald-400 flex items-center gap-1 text-[11px] font-semibold">
                      <CheckCircle2 className="w-4 h-4" />
                      <span className="hidden sm:inline">{kaggleValidation.identifier}</span>
                    </div>
                  )}
                </div>

                {kaggleUrl && kaggleValidation.error && (
                  <div className="text-[11px] text-rose-400 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{kaggleValidation.error}</span>
                  </div>
                )}

                {/* Quick Examples */}
                <div className="flex items-center gap-2 text-xs text-slate-400 pt-1 flex-wrap">
                  <span className="text-[11px] text-slate-500">Quick tests:</span>
                  <button
                    type="button"
                    onClick={() => setKaggleUrl('https://www.kaggle.com/datasets/heptapod/titanic')}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-sky-300 text-[11px] transition-colors"
                  >
                    heptapod/titanic
                  </button>
                  <button
                    type="button"
                    onClick={() => setKaggleUrl('https://www.kaggle.com/datasets/yasserh/breast-cancer-dataset')}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-sky-300 text-[11px] transition-colors"
                  >
                    yasserh/breast-cancer-dataset
                  </button>
                </div>
              </div>

              {/* Metadata */}
              <div className="space-y-4 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Dataset Name
                  </label>
                  <input
                    type="text"
                    required
                    value={kaggleName}
                    onChange={(e) => setKaggleName(e.target.value)}
                    placeholder="e.g. Titanic Passengers"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Description (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={kaggleDesc}
                    onChange={(e) => setKaggleDesc(e.target.value)}
                    placeholder="Preprocessing notes, Kaggle competition reference, or domain..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={!kaggleValidation.isValid || isProcessing}
                  className="px-5 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-sm font-semibold flex items-center gap-2 shadow-lg shadow-sky-600/25 transition-all"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{processingStatus || 'Importing dataset...'}</span>
                    </>
                  ) : (
                    <>
                      <span>Import Dataset</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: HUGGING FACE IMPORT */}
          {activeTab === 'huggingface' && (
            <form onSubmit={handleHfSubmit} className="glass-card p-6 space-y-5 border-amber-500/20">
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span className="text-base">🤗</span>
                    <span>Hugging Face Dataset</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Paste a Hugging Face Hub dataset URL or repository identifier.
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800">
                  HF datasets
                </span>
              </div>

              {/* URL Input */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-300">
                  Paste Hugging Face dataset URL or repository ID
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={hfUrl}
                    onChange={(e) => setHfUrl(e.target.value)}
                    placeholder="https://huggingface.co/datasets/username/dataset-name or username/dataset-name"
                    className={`w-full bg-slate-900 border rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none transition-colors ${
                      hfValidation.isValid
                        ? 'border-emerald-500/60 focus:border-emerald-500'
                        : hfUrl && hfValidation.error
                        ? 'border-rose-500/60 focus:border-rose-500'
                        : 'border-slate-700 focus:border-amber-500'
                    }`}
                  />
                  {hfValidation.isValid && (
                    <div className="absolute right-3 top-3 text-emerald-400 flex items-center gap-1 text-[11px] font-semibold">
                      <CheckCircle2 className="w-4 h-4" />
                      <span className="hidden sm:inline">{hfValidation.repoId}</span>
                    </div>
                  )}
                </div>

                {hfUrl && hfValidation.error && (
                  <div className="text-[11px] text-rose-400 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{hfValidation.error}</span>
                  </div>
                )}

                {/* Quick Examples */}
                <div className="flex items-center gap-2 text-xs text-slate-400 pt-1 flex-wrap">
                  <span className="text-[11px] text-slate-500">Quick tests:</span>
                  <button
                    type="button"
                    onClick={() => setHfUrl('https://huggingface.co/datasets/scikit-learn/iris')}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 text-[11px] transition-colors"
                  >
                    scikit-learn/iris
                  </button>
                  <button
                    type="button"
                    onClick={() => setHfUrl('https://huggingface.co/datasets/cornell-movie-review-data/rotten_tomatoes')}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 text-[11px] transition-colors"
                  >
                    cornell-movie-review-data/rotten_tomatoes
                  </button>
                </div>
              </div>

              {/* Split Selector */}
              {hfValidation.isValid && (
                <div className="p-3.5 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-amber-400" />
                      <span>Dataset Split</span>
                    </span>
                    {isFetchingSplits ? (
                      <span className="text-[11px] text-amber-400 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Detecting splits...</span>
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-500">
                        {hfSplits.length} split{hfSplits.length === 1 ? '' : 's'} available
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {hfSplits.map((splitName) => (
                      <button
                        key={splitName}
                        type="button"
                        onClick={() => setSelectedSplit(splitName)}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                          selectedSplit === splitName
                            ? 'bg-amber-600 text-white shadow-sm shadow-amber-600/30'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                        }`}
                      >
                        {splitName}
                      </button>
                    ))}
                  </div>

                  {splitFetchError && (
                    <div className="text-[11px] text-slate-400 italic pt-1">
                      {splitFetchError}
                    </div>
                  )}
                </div>
              )}

              {/* Metadata */}
              <div className="space-y-4 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Dataset Name
                  </label>
                  <input
                    type="text"
                    required
                    value={hfName}
                    onChange={(e) => setHfName(e.target.value)}
                    placeholder="e.g. Iris Classification Dataset"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Description (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={hfDesc}
                    onChange={(e) => setHfDesc(e.target.value)}
                    placeholder="Domain information, split notes, or model training target..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={!hfValidation.isValid || isProcessing}
                  className="px-5 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-semibold flex items-center gap-2 shadow-lg shadow-amber-600/25 transition-all"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{processingStatus || 'Importing dataset...'}</span>
                    </>
                  ) : (
                    <>
                      <span>Import Dataset</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
};
