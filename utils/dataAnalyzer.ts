import { DataRow, ColumnStats } from '@/types/dataset';

export function analyzeColumns(data: DataRow[], columns: string[]): ColumnStats[] {
  return columns.map(col => analyzeColumn(data, col));
}

function analyzeColumn(data: DataRow[], columnName: string): ColumnStats {
  const values = data.map(row => row[columnName]);
  const totalCount = values.length;
  
  // Count missing values
  const missingCount = values.filter(v => v === null || v === undefined || v === '').length;
  const missingPercentage = totalCount > 0 ? (missingCount / totalCount) * 100 : 0;
  
  // Get non-null values
  const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '');
  
  // Determine type
  const numericValues = nonNullValues.filter(v => typeof v === 'number') as number[];
  const stringValues = nonNullValues.filter(v => typeof v === 'string') as string[];
  
  let type: 'string' | 'number' | 'date' | 'mixed' = 'string';
  
  if (numericValues.length === nonNullValues.length && numericValues.length > 0) {
    type = 'number';
  } else if (stringValues.length > 0 && numericValues.length > 0) {
    type = 'mixed';
  } else if (stringValues.length > 0) {
    // Check if dates
    const datePattern = /^\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|\d{2}-\d{2}-\d{4}/;
    const dateCount = stringValues.filter(v => datePattern.test(v)).length;
    if (dateCount > stringValues.length * 0.5) {
      type = 'date';
    }
  }
  
  // Count unique values
  const uniqueSet = new Set(nonNullValues.map(v => String(v)));
  const uniqueCount = uniqueSet.size;
  
  // Calculate mode
  const valueCounts = new Map<string | number, number>();
  nonNullValues.forEach(v => {
    const key = v as string | number;
    valueCounts.set(key, (valueCounts.get(key) || 0) + 1);
  });
  
  // Generic placeholder values to skip when calculating mode
  const genericValues = ['other', 'unknown', 'n/a', 'na', 'none', 'missing', 'undefined', 'not specified'];
  
  let mode: string | number | undefined;
  let maxCount = 0;
  valueCounts.forEach((count, value) => {
    // Skip generic placeholder values
    const isGeneric = typeof value === 'string' && genericValues.includes(value.toLowerCase());
    if (!isGeneric && count > maxCount) {
      maxCount = count;
      mode = value;
    }
  });
  
  // If no valid mode found (all values are generic), use the most common one anyway
  if (mode === undefined && valueCounts.size > 0) {
    valueCounts.forEach((count, value) => {
      if (count > maxCount) {
        maxCount = count;
        mode = value;
      }
    });
  }
  
  // Calculate numeric stats
  let min: number | undefined;
  let max: number | undefined;
  let mean: number | undefined;
  let median: number | undefined;
  let stdDev: number | undefined;
  let q1: number | undefined;
  let q3: number | undefined;
  
  if (type === 'number' && numericValues.length > 0) {
    const sorted = [...numericValues].sort((a, b) => a - b);
    
    min = sorted[0];
    max = sorted[sorted.length - 1];
    mean = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
    
    // Median
    const mid = Math.floor(sorted.length / 2);
    median = sorted.length % 2 !== 0 
      ? sorted[mid] 
      : (sorted[mid - 1] + sorted[mid]) / 2;
    
    // Standard deviation
    const squaredDiffs = numericValues.map(v => Math.pow(v - mean!, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / numericValues.length;
    stdDev = Math.sqrt(avgSquaredDiff);
    
    // Quartiles
    const q1Index = Math.floor(sorted.length * 0.25);
    const q3Index = Math.floor(sorted.length * 0.75);
    q1 = sorted[q1Index];
    q3 = sorted[q3Index];
  }
  
  return {
    name: columnName,
    type,
    totalCount,
    uniqueCount,
    missingCount,
    missingPercentage,
    min,
    max,
    mean,
    median,
    mode,
    stdDev,
    q1,
    q3,
  };
}
