import { CleaningLog as CleaningLogType } from '@/types/dataset';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle2, Clock, FileText } from 'lucide-react';

interface CleaningLogProps {
  logs: CleaningLogType[];
}

export function CleaningLog({ logs }: CleaningLogProps) {
  if (logs.length === 0) {
    return (
      <Card className="shadow-card border-border">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Cleaning Log
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Clock className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">No operations performed yet</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalRowsAffected = logs.reduce((sum, log) => sum + log.rowsAffected, 0);

  return (
    <Card className="shadow-card border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Cleaning Log
          </CardTitle>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{logs.length} operations</span>
            <span className="px-2 py-1 rounded-md bg-success/10 text-success font-medium">
              {totalRowsAffected} changes
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-64">
          <div className="space-y-3">
            {logs.map((log, index) => (
              <div 
                key={index}
                className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 animate-slide-up"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-foreground text-sm">
                      {log.operation}
                      {log.column && (
                        <span className="text-muted-foreground font-normal"> → {log.column}</span>
                      )}
                    </p>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {log.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{log.details}</p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
