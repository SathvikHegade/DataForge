import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, TableIcon, AlertCircle } from 'lucide-react';
import { DataRow, ColumnStats } from '@/types/dataset';

interface DataPreviewProps {
  data: DataRow[];
  columns: string[];
  columnStats: ColumnStats[];
  title: string;
}

const ROWS_PER_PAGE = 10;

export function DataPreview({ data, columns, columnStats, title }: DataPreviewProps) {
  const [page, setPage] = useState(0);
  
  const totalPages = Math.ceil(data.length / ROWS_PER_PAGE);
  
  const pageData = useMemo(() => {
    const start = page * ROWS_PER_PAGE;
    return data.slice(start, start + ROWS_PER_PAGE);
  }, [data, page]);

  const getStatForColumn = (col: string) => {
    return columnStats.find(s => s.name === col);
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'number': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'string': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'date': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  const formatCellValue = (value: string | number | boolean | Date | null) => {
    if (value === null || value === undefined) {
      return <span className="text-muted-foreground italic">null</span>;
    }
    if (value === '') {
      return <span className="text-muted-foreground italic">empty</span>;
    }
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    if (value instanceof Date) {
      return value.toLocaleDateString();
    }
    return String(value);
  };

  return (
    <Card className="shadow-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <TableIcon className="w-5 h-5 text-primary" />
            {title}
          </CardTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{data.length} rows</span>
            <span>•</span>
            <span>{columns.length} columns</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  {columns.map((col) => {
                    const stat = getStatForColumn(col);
                    return (
                      <TableHead key={col} className="font-semibold whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <span>{col}</span>
                          <div className="flex items-center gap-1.5">
                            {stat && (
                              <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${getTypeColor(stat.type)}`}>
                                {stat.type}
                              </Badge>
                            )}
                            {stat && stat.missingCount > 0 && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-warning/10 text-warning">
                                <AlertCircle className="w-2.5 h-2.5 mr-0.5" />
                                {stat.missingCount}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageData.map((row, rowIndex) => (
                  <TableRow key={rowIndex} className="hover:bg-muted/30 transition-colors">
                    {columns.map((col) => (
                      <TableCell key={col} className="font-mono text-sm">
                        {formatCellValue(row[col])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Showing {page * ROWS_PER_PAGE + 1}-{Math.min((page + 1) * ROWS_PER_PAGE, data.length)} of {data.length}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-muted-foreground px-2">
                {page + 1} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
