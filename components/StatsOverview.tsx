import { Card, CardContent } from '@/components/ui/card';
import { Rows3, Columns3, AlertTriangle, Hash } from 'lucide-react';
import { ColumnStats } from '@/types/dataset';

interface StatsOverviewProps {
  totalRows: number;
  totalColumns: number;
  columnStats: ColumnStats[];
  cleanedRows?: number;
}

export function StatsOverview({ totalRows, totalColumns, columnStats, cleanedRows }: StatsOverviewProps) {
  const totalMissing = columnStats.reduce((sum, stat) => sum + stat.missingCount, 0);
  const totalUnique = columnStats.reduce((sum, stat) => sum + stat.uniqueCount, 0);
  const avgUnique = totalColumns > 0 ? Math.round(totalUnique / totalColumns) : 0;
  
  const stats = [
    {
      label: 'Total Rows',
      value: totalRows.toLocaleString(),
      subValue: cleanedRows !== undefined ? `${cleanedRows.toLocaleString()} after cleaning` : undefined,
      icon: Rows3,
      color: 'text-blue-500',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    },
    {
      label: 'Columns',
      value: totalColumns.toString(),
      icon: Columns3,
      color: 'text-green-500',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
    },
    {
      label: 'Missing Values',
      value: totalMissing.toLocaleString(),
      subValue: `${((totalMissing / (totalRows * totalColumns)) * 100).toFixed(1)}% of data`,
      icon: AlertTriangle,
      color: 'text-amber-500',
      bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    },
    {
      label: 'Avg. Unique Values',
      value: avgUnique.toLocaleString(),
      subValue: 'per column',
      icon: Hash,
      color: 'text-purple-500',
      bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map((stat, index) => (
        <Card 
          key={index} 
          className="shadow-card border-border animate-slide-up transform transition-transform transition-colors duration-150 ease-in-out hover:-translate-y-1 hover:shadow-lg hover:bg-gradient-to-r hover:from-primary/10 hover:to-primary/5 w-full"
          style={{ animationDelay: `${index * 50}ms` }}
        >
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="text-2xl font-bold text-foreground mt-1">{stat.value}</p>
                {stat.subValue && (
                  <p className="text-xs text-muted-foreground mt-0.5">{stat.subValue}</p>
                )}
              </div>
              <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl ${stat.bgColor} flex items-center justify-center`}>
                <stat.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${stat.color}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
