import { DataRow, ColumnStats, CleaningResult, CleaningLog } from '@/types/dataset';

// Exact duplicate removal
export function removeDuplicates(data: DataRow[], columns: string[]): CleaningResult {
  const seen = new Set<string>();
  const uniqueData: DataRow[] = [];
  let duplicatesRemoved = 0;

  data.forEach(row => {
    const key = columns.map(col => JSON.stringify(row[col])).join('|');
    if (!seen.has(key)) {
      seen.add(key);
      uniqueData.push(row);
    } else {
      duplicatesRemoved++;
    }
  });

  const logs: CleaningLog[] = [];
  if (duplicatesRemoved > 0) {
    logs.push({
      operation: 'Remove Duplicates',
      details: `Removed ${duplicatesRemoved} exact duplicate row${duplicatesRemoved > 1 ? 's' : ''}`,
      rowsAffected: duplicatesRemoved,
      timestamp: new Date(),
      category: 'cleaning'
    });
  }

  return { data: uniqueData, logs };
}

// Near-duplicate detection with configurable tolerance
export function removeNearDuplicates(
  data: DataRow[], 
  columns: string[], 
  tolerance: number = 0.9
): CleaningResult {
  const uniqueData: DataRow[] = [];
  let removed = 0;

  data.forEach((row) => {
    let isDuplicate = false;
    
    for (const existingRow of uniqueData) {
      const similarity = calculateRowSimilarity(row, existingRow, columns);
      if (similarity >= tolerance) {
        isDuplicate = true;
        removed++;
        break;
      }
    }
    
    if (!isDuplicate) {
      uniqueData.push(row);
    }
  });

  const logs: CleaningLog[] = [];
  if (removed > 0) {
    logs.push({
      operation: 'Remove Near-Duplicates',
      details: `Removed ${removed} near-duplicate row${removed > 1 ? 's' : ''} (tolerance: ${(tolerance * 100).toFixed(0)}%)`,
      rowsAffected: removed,
      timestamp: new Date(),
      category: 'cleaning'
    });
  }

  return { data: uniqueData, logs };
}

function calculateRowSimilarity(row1: DataRow, row2: DataRow, columns: string[]): number {
  let matches = 0;
  const total = columns.length;

  columns.forEach(col => {
    const v1 = row1[col];
    const v2 = row2[col];

    if (v1 === v2) {
      matches++;
    } else if (typeof v1 === 'number' && typeof v2 === 'number') {
      const diff = Math.abs(v1 - v2);
      const max = Math.max(Math.abs(v1), Math.abs(v2), 1);
      if (diff / max < 0.01) matches += 0.9;
    } else if (typeof v1 === 'string' && typeof v2 === 'string') {
      const similarity = stringSimilarity(v1.toLowerCase(), v2.toLowerCase());
      matches += similarity;
    }
  });

  return matches / total;
}

function stringSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;
  
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) matches++;
  }
  
  return matches / longer.length;
}

// Handle missing values with multiple strategies
export function handleMissingValues(
  data: DataRow[],
  columns: string[],
  columnStats: ColumnStats[],
  strategy: 'remove' | 'mean' | 'median' | 'mode' | 'forward' | 'backward' | 'constant',
  constantValue?: string | number,
  threshold?: number
): CleaningResult {
  const logs: CleaningLog[] = [];
  let resultData = [...data];

  if (strategy === 'remove') {
    const originalCount = data.length;
    resultData = data.filter(row => {
      const missingCount = columns.filter(col => {
        const value = row[col];
        return value === null || value === undefined || value === '';
      }).length;
      
      if (threshold !== undefined) {
        return (missingCount / columns.length) <= threshold;
      }
      return missingCount === 0;
    });

    const removed = originalCount - resultData.length;
    if (removed > 0) {
      logs.push({
        operation: 'Remove Missing Values',
        details: `Removed ${removed} row${removed > 1 ? 's' : ''} with missing values`,
        rowsAffected: removed,
        timestamp: new Date(),
        category: 'cleaning'
      });
    }
  } else if (strategy === 'forward' || strategy === 'backward') {
    columns.forEach(col => {
      let columnFilled = 0;
      const indices = strategy === 'forward' 
        ? Array.from({ length: resultData.length }, (_, i) => i)
        : Array.from({ length: resultData.length }, (_, i) => resultData.length - 1 - i);
      
      let lastValidValue: string | number | boolean | null | Date = null;
      
      indices.forEach(i => {
        const value = resultData[i][col];
        if (value === null || value === undefined || value === '') {
          if (lastValidValue !== null) {
            resultData[i] = { ...resultData[i], [col]: lastValidValue };
            columnFilled++;
          }
        } else {
          lastValidValue = value;
        }
      });
      
      if (columnFilled > 0) {
        logs.push({
          operation: `${strategy === 'forward' ? 'Forward' : 'Backward'} Fill`,
          column: col,
          details: `Filled ${columnFilled} missing value${columnFilled > 1 ? 's' : ''}`,
          rowsAffected: columnFilled,
          timestamp: new Date(),
          category: 'cleaning'
        });
      }
    });
  } else {
    // Fill with mean/median/mode/constant
    columns.forEach(col => {
      const stats = columnStats.find(s => s.name === col);
      if (!stats) {
        console.log(`No stats found for column: ${col}`);
        return;
      }

      let fillValue: string | number | null = null;

      if (strategy === 'constant' && constantValue !== undefined) {
        fillValue = constantValue;
      } else if (strategy === 'mode' && stats.mode !== undefined) {
        // Mode works for both numeric and string columns
        fillValue = stats.mode;
        console.log(`Column ${col}: mode = "${fillValue}", type = ${typeof fillValue}, missing = ${stats.missingCount}`);
      } else if (stats.type === 'number') {
        // Mean and median only work for numeric columns
        if (strategy === 'mean' && stats.mean !== undefined) {
          fillValue = Math.round(stats.mean * 100) / 100;
        } else if (strategy === 'median' && stats.median !== undefined) {
          fillValue = stats.median;
        }
      }

      // Check if fillValue is valid (not null, undefined, or empty string)
      const isValidFillValue = fillValue !== null && fillValue !== undefined && fillValue !== '';
      
      if (isValidFillValue) {
        let columnFilled = 0;
        resultData = resultData.map(row => {
          const currentValue = row[col];
          const isMissing = currentValue === null || currentValue === undefined || currentValue === '';
          
          if (isMissing) {
            columnFilled++;
            console.log(`Filling row in ${col}: "${currentValue}" -> "${fillValue}"`);
            return { ...row, [col]: fillValue };
          }
          return row;
        });

        if (columnFilled > 0) {
          logs.push({
            operation: 'Fill Missing Values',
            column: col,
            details: `Filled ${columnFilled} value${columnFilled > 1 ? 's' : ''} with ${strategy} (${fillValue})`,
            rowsAffected: columnFilled,
            timestamp: new Date(),
            category: 'cleaning'
          });
          console.log(`Successfully filled ${columnFilled} values in ${col} with "${fillValue}"`);
        }
      } else {
        console.log(`Skipping column ${col}: fillValue = "${fillValue}" (invalid), mode = "${stats.mode}"`);
      }
    });
  }

  return { data: resultData, logs };
}

// Trim whitespace
export function trimWhitespace(data: DataRow[], columns: string[]): CleaningResult {
  let totalTrimmed = 0;

  const resultData = data.map(row => {
    const newRow = { ...row };
    columns.forEach(col => {
      if (typeof row[col] === 'string') {
        const trimmed = (row[col] as string).trim().replace(/\s+/g, ' ');
        if (trimmed !== row[col]) {
          newRow[col] = trimmed;
          totalTrimmed++;
        }
      }
    });
    return newRow;
  });

  const logs: CleaningLog[] = [];
  if (totalTrimmed > 0) {
    logs.push({
      operation: 'Trim Whitespace',
      details: `Trimmed whitespace in ${totalTrimmed} cell${totalTrimmed > 1 ? 's' : ''}`,
      rowsAffected: totalTrimmed,
      timestamp: new Date(),
      category: 'cleaning'
    });
  }

  return { data: resultData, logs };
}

// Standardize case
export function standardizeCase(
  data: DataRow[],
  columns: string[],
  caseType: 'lower' | 'upper' | 'title' | 'sentence'
): CleaningResult {
  let totalChanged = 0;

  const resultData = data.map(row => {
    const newRow = { ...row };
    columns.forEach(col => {
      if (typeof row[col] === 'string') {
        const original = row[col] as string;
        let transformed: string;

        switch (caseType) {
          case 'lower':
            transformed = original.toLowerCase();
            break;
          case 'upper':
            transformed = original.toUpperCase();
            break;
          case 'title':
            transformed = original.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
            break;
          case 'sentence':
            transformed = original.toLowerCase().replace(/(^\w|[.!?]\s+\w)/g, c => c.toUpperCase());
            break;
        }

        if (transformed !== original) {
          newRow[col] = transformed;
          totalChanged++;
        }
      }
    });
    return newRow;
  });

  const logs: CleaningLog[] = [];
  if (totalChanged > 0) {
    logs.push({
      operation: 'Standardize Case',
      details: `Converted ${totalChanged} value${totalChanged > 1 ? 's' : ''} to ${caseType} case`,
      rowsAffected: totalChanged,
      timestamp: new Date(),
      category: 'cleaning'
    });
  }

  return { data: resultData, logs };
}

// Normalize column names
export function normalizeColumnNames(columns: string[]): { 
  columns: string[]; 
  mapping: Record<string, string>;
  log: CleaningLog;
} {
  const mapping: Record<string, string> = {};
  let changesCount = 0;

  const normalizedColumns = columns.map(col => {
    const normalized = col
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .replace(/^_+|_+$/g, '')
      .replace(/_+/g, '_');
    
    if (normalized !== col) {
      changesCount++;
    }
    
    mapping[col] = normalized;
    return normalized;
  });

  return {
    columns: normalizedColumns,
    mapping,
    log: {
      operation: 'Normalize Column Names',
      details: `Normalized ${changesCount} column name${changesCount !== 1 ? 's' : ''}`,
      rowsAffected: changesCount,
      timestamp: new Date(),
      category: 'cleaning'
    }
  };
}

// Convert data types
export function convertDataTypes(
  data: DataRow[],
  _columns: string[],
  conversions: Record<string, 'number' | 'string' | 'date' | 'boolean'>
): CleaningResult {
  const logs: CleaningLog[] = [];
  let resultData = [...data];

  Object.entries(conversions).forEach(([col, targetType]) => {
    let converted = 0;
    let failed = 0;

    resultData = resultData.map(row => {
      const value = row[col];
      if (value === null || value === undefined) return row;

      let newValue: string | number | boolean | Date | null = value;

      try {
        switch (targetType) {
          case 'number':
            if (typeof value !== 'number') {
              const parsed = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
              if (!isNaN(parsed)) {
                newValue = parsed;
                converted++;
              } else {
                failed++;
              }
            }
            break;
          case 'string':
            if (typeof value !== 'string') {
              newValue = String(value);
              converted++;
            }
            break;
          case 'date':
            if (!(value instanceof Date)) {
              const date = new Date(String(value));
              if (!isNaN(date.getTime())) {
                newValue = date;
                converted++;
              } else {
                failed++;
              }
            }
            break;
          case 'boolean':
            if (typeof value !== 'boolean') {
              const str = String(value).toLowerCase();
              if (['true', '1', 'yes', 'y'].includes(str)) {
                newValue = true;
                converted++;
              } else if (['false', '0', 'no', 'n'].includes(str)) {
                newValue = false;
                converted++;
              } else {
                failed++;
              }
            }
            break;
        }
      } catch {
        failed++;
      }

      return { ...row, [col]: newValue };
    });

    if (converted > 0) {
      logs.push({
        operation: 'Convert Data Type',
        column: col,
        details: `Converted ${converted} value${converted > 1 ? 's' : ''} to ${targetType}${failed > 0 ? ` (${failed} failed)` : ''}`,
        rowsAffected: converted,
        timestamp: new Date(),
        category: 'transformation'
      });
    }
  });

  return { data: resultData, logs };
}

// Remove outliers with multiple methods
export function removeOutliers(
  data: DataRow[],
  columns: string[],
  columnStats: ColumnStats[],
  method: 'iqr' | 'zscore' | 'percentile',
  treatment: 'remove' | 'cap' | 'replace' | 'flag' = 'remove',
  threshold: number = 1.5
): CleaningResult {
  const logs: CleaningLog[] = [];
  let resultData = [...data];

  columns.forEach(col => {
    const stats = columnStats.find(s => s.name === col);
    if (!stats || stats.type !== 'number') return;

    let lowerBound: number;
    let upperBound: number;
    let outlierCount = 0;

    if (method === 'iqr' && stats.q1 !== undefined && stats.q3 !== undefined) {
      const iqr = stats.q3 - stats.q1;
      lowerBound = stats.q1 - threshold * iqr;
      upperBound = stats.q3 + threshold * iqr;
    } else if (method === 'zscore' && stats.mean !== undefined && stats.stdDev !== undefined) {
      lowerBound = stats.mean - threshold * stats.stdDev;
      upperBound = stats.mean + threshold * stats.stdDev;
    } else if (method === 'percentile' && stats.min !== undefined && stats.max !== undefined) {
      const range = stats.max - stats.min;
      lowerBound = stats.min + (threshold / 100) * range;
      upperBound = stats.max - (threshold / 100) * range;
    } else {
      return;
    }

    if (treatment === 'remove') {
      const originalLength = resultData.length;
      resultData = resultData.filter(row => {
        const value = row[col];
        if (typeof value !== 'number') return true;
        return value >= lowerBound && value <= upperBound;
      });
      outlierCount = originalLength - resultData.length;
    } else if (treatment === 'cap') {
      resultData = resultData.map(row => {
        const value = row[col];
        if (typeof value !== 'number') return row;
        if (value < lowerBound) {
          outlierCount++;
          return { ...row, [col]: lowerBound };
        }
        if (value > upperBound) {
          outlierCount++;
          return { ...row, [col]: upperBound };
        }
        return row;
      });
    } else if (treatment === 'replace') {
      const replaceValue = stats.median ?? stats.mean ?? 0;
      resultData = resultData.map(row => {
        const value = row[col];
        if (typeof value !== 'number') return row;
        if (value < lowerBound || value > upperBound) {
          outlierCount++;
          return { ...row, [col]: replaceValue };
        }
        return row;
      });
    } else if (treatment === 'flag') {
      const flagCol = `${col}_is_outlier`;
      resultData = resultData.map(row => {
        const value = row[col];
        if (typeof value !== 'number') return { ...row, [flagCol]: false };
        const isOutlier = value < lowerBound || value > upperBound;
        if (isOutlier) outlierCount++;
        return { ...row, [flagCol]: isOutlier };
      });
    }

    if (outlierCount > 0) {
      logs.push({
        operation: `Outlier ${treatment === 'remove' ? 'Removal' : treatment === 'cap' ? 'Capping' : treatment === 'flag' ? 'Flagging' : 'Replacement'}`,
        column: col,
        details: `${treatment === 'remove' ? 'Removed' : treatment === 'cap' ? 'Capped' : treatment === 'flag' ? 'Flagged' : 'Replaced'} ${outlierCount} outlier${outlierCount > 1 ? 's' : ''} using ${method.toUpperCase()} (threshold: ${threshold})`,
        rowsAffected: outlierCount,
        timestamp: new Date(),
        category: 'cleaning'
      });
    }
  });

  return { data: resultData, logs };
}

// Drop columns with high missing percentage
export function dropHighMissingColumns(
  data: DataRow[],
  columns: string[],
  columnStats: ColumnStats[],
  threshold: number = 50
): { data: DataRow[]; columns: string[]; logs: CleaningLog[] } {
  const columnsToDrop = columnStats
    .filter(s => s.missingPercentage > threshold)
    .map(s => s.name);

  if (columnsToDrop.length === 0) {
    return { data, columns, logs: [] };
  }

  const remainingColumns = columns.filter(c => !columnsToDrop.includes(c));
  const resultData = data.map(row => {
    const newRow: DataRow = {};
    remainingColumns.forEach(col => {
      newRow[col] = row[col];
    });
    return newRow;
  });

  return {
    data: resultData,
    columns: remainingColumns,
    logs: [{
      operation: 'Drop High-Missing Columns',
      details: `Dropped ${columnsToDrop.length} column${columnsToDrop.length > 1 ? 's' : ''} with >${threshold}% missing values: ${columnsToDrop.join(', ')}`,
      rowsAffected: data.length,
      timestamp: new Date(),
      category: 'cleaning'
    }]
  };
}

// Remove low variance features
export function removeLowVarianceFeatures(
  data: DataRow[],
  columns: string[],
  columnStats: ColumnStats[],
  threshold: number = 0.01
): { data: DataRow[]; columns: string[]; logs: CleaningLog[] } {
  const columnsToRemove: string[] = [];

  columnStats.forEach(stats => {
    if (stats.type === 'number' && stats.variance !== undefined) {
      if (stats.variance < threshold) {
        columnsToRemove.push(stats.name);
      }
    } else if (stats.uniqueCount <= 1) {
      columnsToRemove.push(stats.name);
    }
  });

  if (columnsToRemove.length === 0) {
    return { data, columns, logs: [] };
  }

  const remainingColumns = columns.filter(c => !columnsToRemove.includes(c));
  const resultData = data.map(row => {
    const newRow: DataRow = {};
    remainingColumns.forEach(col => {
      newRow[col] = row[col];
    });
    return newRow;
  });

  return {
    data: resultData,
    columns: remainingColumns,
    logs: [{
      operation: 'Remove Low-Variance Features',
      details: `Removed ${columnsToRemove.length} low-variance feature${columnsToRemove.length > 1 ? 's' : ''}: ${columnsToRemove.join(', ')}`,
      rowsAffected: data.length,
      timestamp: new Date(),
      category: 'feature'
    }]
  };
}

// Clean NaN and undefined values - converts them to null for consistency
export function cleanNaNValues(
  data: DataRow[],
  columns: string[]
): CleaningResult {
  let nansCleaned = 0;

  const resultData = data.map(row => {
    const newRow = { ...row };
    columns.forEach(col => {
      const value = row[col];
      // Check for NaN (number type but NaN value)
      if (typeof value === 'number' && isNaN(value)) {
        newRow[col] = null;
        nansCleaned++;
      }
      // Check for undefined
      else if (value === undefined) {
        newRow[col] = null;
        nansCleaned++;
      }
      // Check for string 'NaN' or 'undefined'
      else if (typeof value === 'string' && (value.toLowerCase() === 'nan' || value.toLowerCase() === 'undefined')) {
        newRow[col] = null;
        nansCleaned++;
      }
    });
    return newRow;
  });

  const logs: CleaningLog[] = [];
  if (nansCleaned > 0) {
    logs.push({
      operation: 'Clean NaN Values',
      details: `Converted ${nansCleaned} NaN/undefined value${nansCleaned > 1 ? 's' : ''} to null`,
      rowsAffected: nansCleaned,
      timestamp: new Date(),
      category: 'cleaning'
    });
  }

  return { data: resultData, logs };
}

// Remove columns that are entirely or mostly null
export function removeAllNullColumns(
  data: DataRow[],
  threshold: number = 1.0 // 1.0 = remove only if ALL values are null, 0.95 = remove if 95%+ are null
): { data: DataRow[]; columns: string[]; logs: CleaningLog[] } {
  if (data.length === 0) {
    return { data, columns: [], logs: [] };
  }

  const allColumns = Object.keys(data[0]);
  const columnsToKeep: string[] = [];
  const columnsToRemove: string[] = [];

  allColumns.forEach(col => {
    let nullCount = 0;
    data.forEach(row => {
      const value = row[col];
      if (value === null || value === undefined || value === '') {
        nullCount++;
      }
    });

    const nullPercentage = nullCount / data.length;
    
    if (nullPercentage >= threshold) {
      columnsToRemove.push(col);
    } else {
      columnsToKeep.push(col);
    }
  });

  if (columnsToRemove.length === 0) {
    return { data, columns: allColumns, logs: [] };
  }

  // Remove the columns from data
  const resultData = data.map(row => {
    const newRow: DataRow = {};
    columnsToKeep.forEach(col => {
      newRow[col] = row[col];
    });
    return newRow;
  });

  const logs: CleaningLog[] = [{
    operation: 'Remove All-Null Columns',
    details: `Removed ${columnsToRemove.length} column${columnsToRemove.length > 1 ? 's' : ''} with ${threshold === 1.0 ? 'all' : `${(threshold * 100).toFixed(0)}%+`} null values: ${columnsToRemove.join(', ')}`,
    rowsAffected: data.length,
    timestamp: new Date(),
    category: 'cleaning'
  }];

  return { data: resultData, columns: columnsToKeep, logs };
}
