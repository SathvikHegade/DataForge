import React from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { 
  FileText, 
  BarChart3, 
  Table, 
  ShieldCheck, 
  Wand2, 
  CheckCircle2, 
  History, 
  GitFork, 
  Sparkles
} from 'lucide-react';
import { LineChart, Download } from 'lucide-react';


export const DatasetSubNav: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  if (!id) return null;

  const tabs = [
    { to: `/datasets/${id}/overview`, label: 'Overview', icon: FileText },
    { to: `/datasets/${id}/profiling`, label: 'Profile', icon: BarChart3 },
    { to: `/datasets/${id}/visualizations`, label: 'Visualise', icon: LineChart },
    { to: `/datasets/${id}/preview`, label: 'Preview', icon: Table },
    { to: `/datasets/${id}/schema`, label: 'Schema', icon: ShieldCheck },
    { to: `/datasets/${id}/transform`, label: 'Transform', icon: Wand2 },
    { to: `/datasets/${id}/validate`, label: 'Validate', icon: CheckCircle2 },
    { to: `/datasets/${id}/versions`, label: 'Versions', icon: History },
    { to: `/datasets/${id}/lineage`, label: 'Lineage', icon: GitFork },
    { to: `/datasets/${id}/ml-readiness`, label: 'ML Readiness', icon: Sparkles },
    { to: `/datasets/${id}/export`, label: 'Export', icon: Download },
  ];

  return (
    <div className="border-b border-[#E7E5E4] bg-[#FFFDFB] px-4 lg:px-6">
      <nav className="no-scrollbar flex space-x-1 overflow-x-auto py-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-[#E05A2B] text-white shadow-[0_8px_20px_rgba(224,90,43,0.2)]'
                    : 'text-[#57534E] hover:bg-[#F5F2EE] hover:text-[#1C1917]'
                }`
              }
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
};
