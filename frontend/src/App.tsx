import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DatasetProvider } from './context/DatasetContext';
import { AppLayout } from './components/layout/AppLayout';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { DatasetLibrary } from './pages/DatasetLibrary';
import { UploadDataset } from './pages/UploadDataset';
import { DatasetOverview } from './pages/DatasetOverview';
import { ProfilingQuality } from './pages/ProfilingQuality';
import { TransformationBuilder } from './pages/TransformationBuilder';
import { ValidationReportPage } from './pages/ValidationReportPage';
import { MLReadinessPage } from './pages/MLReadinessPage';
import { SchemaCompatibility } from './pages/SchemaCompatibility';
import { VersionHistory } from './pages/VersionHistory';
import { LineageComparison } from './pages/LineageComparison';
import { InteractivePreview } from './pages/InteractivePreview';
import { DataVisualisation } from './pages/DataVisualisation';
import { LandingPage } from './pages/LandingPage';
import { DatasetExport } from './pages/DatasetExport';
import { api } from './api/client';

// Protected Route wrapper
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#F8E5DD] border border-[#E7E5E4] flex items-center justify-center animate-pulse text-[#E05A2B]">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24">
              <path d="M4 7h16M4 12h16M4 17h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div className="text-[#78716C] text-sm font-medium animate-pulse">Loading DataForge...</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

// Public Route - redirect to dashboard if already logged in
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400 text-sm animate-pulse">Loading...</div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

const RootRoute: React.FC = () => {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center">
        <div className="text-[#78716C] text-sm animate-pulse">Loading DataForge...</div>
      </div>
    );
  }

  return <LandingPage />;
};

const ProtectedWorkspace: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute>
    <DatasetProvider>
      <AppLayout>{children}</AppLayout>
    </DatasetProvider>
  </ProtectedRoute>
);

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<RootRoute />} />
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />

      {/* Protected routes */}
      <Route path="/dashboard" element={<ProtectedWorkspace><Dashboard /></ProtectedWorkspace>} />
      <Route path="/datasets" element={<ProtectedWorkspace><DatasetLibrary /></ProtectedWorkspace>} />
      <Route path="/datasets/upload" element={<ProtectedWorkspace><UploadDataset /></ProtectedWorkspace>} />
      <Route path="/datasets/:id/overview" element={<ProtectedWorkspace><DatasetOverview /></ProtectedWorkspace>} />
      <Route path="/datasets/:id/preview" element={<ProtectedWorkspace><InteractivePreview /></ProtectedWorkspace>} />
      <Route path="/datasets/:id/profiling" element={<ProtectedWorkspace><ProfilingQuality /></ProtectedWorkspace>} />
      <Route path="/datasets/:id/visualizations" element={<ProtectedWorkspace><DataVisualisation /></ProtectedWorkspace>} />
      <Route path="/datasets/:id/transform" element={<ProtectedWorkspace><TransformationBuilder /></ProtectedWorkspace>} />
      <Route path="/datasets/:id/validate" element={<ProtectedWorkspace><ValidationReportPage /></ProtectedWorkspace>} />
      <Route path="/datasets/:id/ml-readiness" element={<ProtectedWorkspace><MLReadinessPage /></ProtectedWorkspace>} />
      <Route path="/datasets/:id/schema" element={<ProtectedWorkspace><SchemaCompatibility /></ProtectedWorkspace>} />
      <Route path="/datasets/:id/versions" element={<ProtectedWorkspace><VersionHistory /></ProtectedWorkspace>} />
      <Route path="/datasets/:id/lineage" element={<ProtectedWorkspace><LineageComparison /></ProtectedWorkspace>} />
      <Route path="/datasets/:id/export" element={<ProtectedWorkspace><DatasetExport /></ProtectedWorkspace>} />
      <Route path="/jobs" element={<ProtectedWorkspace><JobsPage /></ProtectedWorkspace>} />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

// Inline Jobs page since it's simple
const JobsPage: React.FC = () => {
  const [jobs, setJobs] = React.useState<any[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getJobs(undefined, 50);
        setJobs(Array.isArray(data) ? data : data.items || []);
      } catch {
        setJobs([]);
      } finally {
        setIsLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  const statusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-emerald-400 bg-emerald-950/40 border-emerald-800/50';
      case 'failed': return 'text-rose-400 bg-rose-950/40 border-rose-800/50';
      case 'running': return 'text-blue-400 bg-blue-950/40 border-blue-800/50 animate-pulse';
      case 'pending': return 'text-amber-400 bg-amber-950/40 border-amber-800/50';
      default: return 'text-slate-400 bg-slate-800/40 border-slate-700/50';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Background Jobs</h1>
        <p className="text-slate-400 text-sm mt-1">Monitor profiling, transformation, and export tasks</p>
      </div>
      <div className="glass-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">Loading jobs...</div>
        ) : jobs.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No jobs found. Run profiling or transformations to see tasks here.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Job Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Progress</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Dataset</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {jobs.map((job) => (
                <tr key={job.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 text-slate-200 font-medium capitalize">{job.job_type?.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${statusColor(job.status)}`}>
                      {job.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-slate-800 max-w-[80px]">
                        <div
                          className="h-1.5 rounded-full bg-indigo-500 transition-all"
                          style={{ width: `${job.progress || (job.status === 'completed' ? 100 : 0)}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-400">{job.progress || (job.status === 'completed' ? 100 : 0)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs font-mono truncate max-w-[120px]">{job.dataset_id?.slice(0, 8)}...</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{new Date(job.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
