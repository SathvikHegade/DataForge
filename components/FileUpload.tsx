import { useCallback, useState } from 'react';
import { Upload, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
}

export function FileUpload({ onFileSelect, isLoading }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const showWarmAccent = isDragging || isLoading;

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
      const name = file.name.toLowerCase();
      if (name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.json')) {
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
        upload-zone relative w-full rounded-2xl transition-all duration-300 cursor-pointer
        ${showWarmAccent ? 'upload-zone-active' : 'hover:border-warning hover:bg-warning/5 hover:shadow-glow'}
        ${isLoading ? 'pointer-events-none opacity-80' : ''}
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        type="file"
        accept=".csv,.xlsx,.xls,.json"
        onChange={handleFileInput}
        className="absolute inset-0 z-10 w-full h-full opacity-0 cursor-pointer"
        disabled={isLoading}
      />

      {/* Extra edge runners (snakes) */}
      <span className="snake-runner snake-runner--2" aria-hidden="true" />
      <span className="snake-runner snake-runner--3" aria-hidden="true" />
      
      <div className="flex flex-col items-center justify-center py-10 sm:py-12 px-5 sm:px-6 min-h-[200px]">
        {isLoading ? (
          <>
            <Loader2 className="w-10 h-10 sm:w-12 sm:h-12 text-warning animate-spin mb-4" />
            <p className="text-lg font-medium text-foreground">Processing file…</p>
          </>
        ) : (
          <>
            <div className={`
              w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-all duration-300
              ${isDragging ? 'bg-warning text-warning-foreground shadow-glow scale-105' : 'bg-muted'}
            `}>
              {isDragging ? (
                <FileSpreadsheet className="w-7 h-7" />
              ) : (
                <Upload className="w-7 h-7 text-muted-foreground" />
              )}
            </div>
            
            <p className="text-lg font-medium text-foreground mb-2">
              {isDragging ? 'Drop your file here' : 'Drag & drop your dataset'}
            </p>
            <p className="text-sm text-muted-foreground mb-4">or click to browse</p>
            
            <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-muted text-xs text-muted-foreground w-full sm:w-auto justify-center sm:justify-start">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span className="truncate">Supports CSV, XLSX, XLS, JSON</span>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
