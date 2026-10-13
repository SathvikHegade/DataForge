import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Database, 
  UploadCloud, 
  Cpu, 
  Settings
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const navItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/datasets', label: 'Dataset Library', icon: Database },
    { to: '/datasets/upload', label: 'Upload Dataset', icon: UploadCloud },
    { to: '/jobs', label: 'Job Monitoring', icon: Cpu },
    { to: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="w-56 shrink-0 border-r border-[#E7E5E4] bg-[#FFFDFB] py-4 text-[#1C1917]">
      <div className="space-y-1 px-3">
        <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-[#78716C]">
          Platform
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                  isActive
                    ? 'border border-[#E7E5E4] bg-[#F8E5DD] text-[#E05A2B]'
                    : 'text-[#57534E] hover:bg-[#F5F2EE] hover:text-[#1C1917]'
                }`
              }
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </div>

      <div className="space-y-1 px-4 text-xs text-[#78716C]">
        <div className="font-semibold text-[#1C1917]">DataForge v1.0.0</div>
        <div>Polars • PyArrow</div>
      </div>
    </aside>
  );
};
