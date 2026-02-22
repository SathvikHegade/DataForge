import { DataRow, DatasetInfo, ValidationIssue } from '@/types/dataset';

export function parseCSV(text: string): { data: DataRow[]; columns: string[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return { data: [], columns: [] };

  const columns = parseCSVLine(lines[0]).map(col => col.trim());
  const data: DataRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    const row: DataRow = {};

    columns.forEach((col, index) => {
      const value = values[index]?.trim() ?? '';
      row[col] = parseValue(value);
    });

    data.push(row);
  }

  return { data, columns };
}

export function parseJSON(text: string): { data: DataRow[]; columns: string[] } {
  try {
    const parsed = JSON.parse(text);
    const dataArray = Array.isArray(parsed) ? parsed : parsed.data || [parsed];
    
    if (dataArray.length === 0) return { data: [], columns: [] };
    
    const columns = Object.keys(dataArray[0]);
    const data = dataArray.map((item: Record<string, unknown>) => {
      const row: DataRow = {};
      columns.forEach(col => {
        row[col] = parseValue(String(item[col] ?? ''));
      });
      return row;
    });

    return { data, columns };
  } catch {
    throw new Error('Invalid JSON format');
  }
}

export function parseExcel(_buffer: ArrayBuffer): { data: DataRow[]; columns: string[] } {
  // Basic Excel parsing - in production, use a library like xlsx
  // For now, we'll throw an error suggesting CSV conversion
  throw new Error('Excel parsing requires xlsx library. Please convert to CSV.');
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }

  result.push(current);
  return result;
}

function parseValue(value: string): string | number | null {
  if (value === '' || value.toLowerCase() === 'null' || value.toLowerCase() === 'na' || value.toLowerCase() === 'n/a' || value.toLowerCase() === 'nan') {
    return null;
  }
  
  // Try to parse as number
  const num = Number(value);
  if (!isNaN(num) && value.trim() !== '') {
    return num;
  }
  
  return value;
}

export function dataToCSV(data: DataRow[], columns: string[]): string {
  const header = columns.map(col => escapeCSVValue(col)).join(',');
  const rows = data.map(row => {
    return columns.map(col => {
      const value = row[col];
      if (value === null || value === undefined) return '';
      return escapeCSVValue(String(value));
    }).join(',');
  });

  return [header, ...rows].join('\n');
}

export function dataToJSON(data: DataRow[], pretty = true): string {
  return JSON.stringify(data, null, pretty ? 2 : 0);
}

function escapeCSVValue(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function validateFile(file: File): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const maxSize = 50 * 1024 * 1024; // 50MB

  if (file.size > maxSize) {
    issues.push({
      type: 'error',
      message: `File size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size (50MB)`,
      suggestion: 'Consider splitting your dataset or using a smaller sample'
    });
  }

  const validTypes = ['.csv', '.json', '.xlsx', '.xls'];
  const extension = '.' + file.name.split('.').pop()?.toLowerCase();
  
  if (!validTypes.includes(extension)) {
    issues.push({
      type: 'error',
      message: `File type "${extension}" is not supported`,
      suggestion: 'Please upload a CSV, JSON, or Excel file'
    });
  }

  return issues;
}

export function detectDelimiter(text: string): string {
  const delimiters = [',', ';', '\t', '|'];
  const firstLine = text.split('\n')[0];
  
  let maxCount = 0;
  let detected = ',';

  delimiters.forEach(d => {
    const count = (firstLine.match(new RegExp(d === '|' ? '\\|' : d, 'g')) || []).length;
    if (count > maxCount) {
      maxCount = count;
      detected = d;
    }
  });

  return detected;
}

export function detectEncoding(buffer: ArrayBuffer): string {
  const arr = new Uint8Array(buffer);
  
  // Check for BOM
  if (arr[0] === 0xEF && arr[1] === 0xBB && arr[2] === 0xBF) {
    return 'UTF-8';
  }
  if (arr[0] === 0xFF && arr[1] === 0xFE) {
    return 'UTF-16 LE';
  }
  if (arr[0] === 0xFE && arr[1] === 0xFF) {
    return 'UTF-16 BE';
  }
  
  return 'UTF-8';
}

export function getDatasetInfo(file: File, data: DataRow[], columns: string[]): DatasetInfo {
  const extension = file.name.split('.').pop()?.toLowerCase();
  let fileType: 'csv' | 'json' | 'excel' = 'csv';
  
  if (extension === 'json') fileType = 'json';
  else if (extension === 'xlsx' || extension === 'xls') fileType = 'excel';

  return {
    fileName: file.name,
    fileSize: file.size,
    fileType,
    rowCount: data.length,
    columnCount: columns.length,
  };
}
