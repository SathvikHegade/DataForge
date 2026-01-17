import { DataRow } from '@/types/dataset';

export function parseCSV(text: string): { data: DataRow[]; columns: string[] } {
  const lines = text.trim().split(/\r?\n/);
  
  if (lines.length === 0) {
    return { data: [], columns: [] };
  }

  // Parse header row
  const columns = parseCSVLine(lines[0]).map(col => col.trim());
  
  // Parse data rows
  const data: DataRow[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = parseCSVLine(line);
    const row: DataRow = {};
    
    columns.forEach((col, index) => {
      const value = values[index]?.trim() ?? '';
      
      // Check for null/missing values (case insensitive)
      const lowerValue = value.toLowerCase();
      if (value === '' || lowerValue === 'null' || lowerValue === 'na' || lowerValue === 'n/a' || lowerValue === 'nan' || lowerValue === 'none') {
        row[col] = null;
      } else if (!isNaN(Number(value)) && value !== '') {
        row[col] = Number(value);
      } else {
        row[col] = value;
      }
    });
    
    data.push(row);
  }
  
  return { data, columns };
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
        i++; // Skip next quote
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

export function dataToCSV(data: DataRow[], columns: string[]): string {
  const header = columns.map(col => escapeCSVValue(col)).join(',');
  
  const rows = data.map(row => {
    return columns.map(col => {
      const value = row[col];
      if (value === null || value === undefined) {
        return '';
      }
      return escapeCSVValue(String(value));
    }).join(',');
  });
  
  return [header, ...rows].join('\n');
}

function escapeCSVValue(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
