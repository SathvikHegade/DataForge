import { useCallback, useState } from 'react';
import { Upload, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
}

export function FileUpload({ onFileSelect, isLoading }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.name.endsWith('.csv')) {
        onFileSelect(file);
      }
    }
  }, [onFileSelect]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onFileSelect(files[0]);
    }
  }, [onFileSelect]);

  return (
    <Card
      className={`
        relative w-full border-2 border-dashed transition-all duration-300 cursor-pointer transform transition-transform duration-150 ease-in-out transition-colors
        ${isDragging 
          ? 'border-primary bg-primary/5 shadow-glow' 
          : 'border-border hover:border-primary/50 hover:-translate-y-1 hover:shadow-lg hover:bg-gradient-to-r hover:from-primary/10 hover:to-primary/5'
        }
        ${isLoading ? 'pointer-events-none opacity-70' : ''}
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        type="file"
        accept=".csv"
        onChange={handleFileInput}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        disabled={isLoading}
      />
      
      <div className="flex flex-col items-center justify-center py-10 sm:py-16 px-4 sm:px-6 min-h-[160px] sm:min-h-[220px]">
        {isLoading ? (
          <>
            <Loader2 className="w-10 h-10 sm:w-12 sm:h-12 text-primary animate-spin mb-4" />
            <p className="text-lg font-medium text-foreground">Processing file...</p>
          </>
        ) : (
          <>
            <div className={`
              w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center mb-4 transition-all duration-300
              ${isDragging ? 'gradient-primary shadow-glow scale-110' : 'bg-muted'}
            `}>
              {isDragging ? (
                <FileSpreadsheet className="w-7 h-7 sm:w-8 sm:h-8 text-primary-foreground" />
              ) : (
                <Upload className="w-7 h-7 sm:w-8 sm:h-8 text-muted-foreground" />
              )}
            </div>
            
            <p className="text-lg font-medium text-foreground mb-2">
              {isDragging ? 'Drop your file here' : 'Drag & drop your CSV file'}
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              or click to browse from your computer
            </p>
            
            <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-muted text-xs text-muted-foreground w-full sm:w-auto justify-center sm:justify-start">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span className="truncate">Supports CSV files up to 50MB</span>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
