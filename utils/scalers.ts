import { DataRow, CleaningLog, ScalerConfig } from '@/types/dataset';

// Standard Scaler (z-score normalization)
export function standardScale(
  data: DataRow[],
  columns: string[],
  excludeColumns: string[] = []
): { data: DataRow[]; scaler: ScalerConfig; log: CleaningLog } {
  const columnsToScale = columns.filter(c => !excludeColumns.includes(c));
  const params: Record<string, { mean: number; std: number }> = {};

  // Calculate mean and std for each column
  columnsToScale.forEach(col => {
    const values = data.map(row => row[col]).filter(v => typeof v === 'number') as number[];
    if (values.length === 0) return;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const std = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length);
    
    params[col] = { mean, std: std || 1 };
  });

  // Apply scaling
  const resultData = data.map(row => {
    const newRow = { ...row };
    
    Object.entries(params).forEach(([col, { mean, std }]) => {
      const value = row[col];
      if (typeof value === 'number') {
        newRow[col] = (value - mean) / std;
      } else if (value === null || value === undefined || value === '') {
        newRow[col] = null; // Keep null as null, don't convert to NaN
      }
    });

    return newRow;
  });

  return {
    data: resultData,
    scaler: {
      method: 'standard',
      columns: Object.keys(params),
      params
    },
    log: {
      operation: 'Standard Scaling',
      details: `Scaled ${Object.keys(params).length} columns using StandardScaler (z-score)`,
      rowsAffected: data.length,
      timestamp: new Date(),
      category: 'transformation'
    }
  };
}

// Min-Max Scaler
export function minMaxScale(
  data: DataRow[],
  columns: string[],
  excludeColumns: string[] = [],
  featureRange: [number, number] = [0, 1]
): { data: DataRow[]; scaler: ScalerConfig; log: CleaningLog } {
  const columnsToScale = columns.filter(c => !excludeColumns.includes(c));
  const params: Record<string, { min: number; max: number }> = {};

  // Calculate min and max for each column
  columnsToScale.forEach(col => {
    const values = data.map(row => row[col]).filter(v => typeof v === 'number') as number[];
    if (values.length === 0) return;

    params[col] = {
      min: Math.min(...values),
      max: Math.max(...values)
    };
  });

  const [rangeMin, rangeMax] = featureRange;

  // Apply scaling
  const resultData = data.map(row => {
    const newRow = { ...row };
    
    Object.entries(params).forEach(([col, { min, max }]) => {
      const value = row[col];
      if (typeof value === 'number') {
        const range = max - min || 1;
        const scaled = (value - min) / range;
        newRow[col] = scaled * (rangeMax - rangeMin) + rangeMin;
      } else if (value === null || value === undefined || value === '') {
        newRow[col] = null; // Keep null as null, don't convert to NaN
      }
    });

    return newRow;
  });

  return {
    data: resultData,
    scaler: {
      method: 'minmax',
      columns: Object.keys(params),
      params
    },
    log: {
      operation: 'Min-Max Scaling',
      details: `Scaled ${Object.keys(params).length} columns to range [${rangeMin}, ${rangeMax}]`,
      rowsAffected: data.length,
      timestamp: new Date(),
      category: 'transformation'
    }
  };
}

// Robust Scaler (using median and IQR)
export function robustScale(
  data: DataRow[],
  columns: string[],
  excludeColumns: string[] = []
): { data: DataRow[]; scaler: ScalerConfig; log: CleaningLog } {
  const columnsToScale = columns.filter(c => !excludeColumns.includes(c));
  const params: Record<string, { median: number; iqr: number }> = {};

  // Calculate median and IQR for each column
  columnsToScale.forEach(col => {
    const values = data.map(row => row[col]).filter(v => typeof v === 'number') as number[];
    if (values.length === 0) return;

    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    
    const q1Idx = Math.floor(sorted.length * 0.25);
    const q3Idx = Math.floor(sorted.length * 0.75);
    const iqr = sorted[q3Idx] - sorted[q1Idx] || 1;

    params[col] = { median, iqr };
  });

  // Apply scaling
  const resultData = data.map(row => {
    const newRow = { ...row };
    
    Object.entries(params).forEach(([col, { median, iqr }]) => {
      const value = row[col];
      if (typeof value === 'number') {
        newRow[col] = (value - median) / iqr;
      } else if (value === null || value === undefined || value === '') {
        newRow[col] = null; // Keep null as null, don't convert to NaN
      }
    });

    return newRow;
  });

  return {
    data: resultData,
    scaler: {
      method: 'robust',
      columns: Object.keys(params),
      params
    },
    log: {
      operation: 'Robust Scaling',
      details: `Scaled ${Object.keys(params).length} columns using RobustScaler (median/IQR)`,
      rowsAffected: data.length,
      timestamp: new Date(),
      category: 'transformation'
    }
  };
}

// Apply saved scaler to new data
export function applyScaler(
  data: DataRow[],
  scaler: ScalerConfig
): DataRow[] {
  return data.map(row => {
    const newRow = { ...row };
    
    scaler.columns.forEach(col => {
      const value = row[col];
      const colParams = scaler.params[col];
      
      if (typeof value !== 'number' || !colParams) return;

      switch (scaler.method) {
        case 'standard':
          if (colParams.mean !== undefined && colParams.std !== undefined) {
            newRow[col] = (value - colParams.mean) / colParams.std;
          }
          break;
        case 'minmax':
          if (colParams.min !== undefined && colParams.max !== undefined) {
            const range = colParams.max - colParams.min || 1;
            newRow[col] = (value - colParams.min) / range;
          }
          break;
        case 'robust':
          if (colParams.mean !== undefined && colParams.std !== undefined) {
            // For robust, we stored median as mean and iqr as std
            newRow[col] = (value - colParams.mean) / colParams.std;
          }
          break;
      }
    });

    return newRow;
  });
}

// Inverse transform
export function inverseScale(
  data: DataRow[],
  scaler: ScalerConfig
): DataRow[] {
  return data.map(row => {
    const newRow = { ...row };
    
    scaler.columns.forEach(col => {
      const value = row[col];
      const colParams = scaler.params[col];
      
      if (typeof value !== 'number' || !colParams) return;

      switch (scaler.method) {
        case 'standard':
          if (colParams.mean !== undefined && colParams.std !== undefined) {
            newRow[col] = value * colParams.std + colParams.mean;
          }
          break;
        case 'minmax':
          if (colParams.min !== undefined && colParams.max !== undefined) {
            const range = colParams.max - colParams.min;
            newRow[col] = value * range + colParams.min;
          }
          break;
        case 'robust':
          if (colParams.mean !== undefined && colParams.std !== undefined) {
            newRow[col] = value * colParams.std + colParams.mean;
          }
          break;
      }
    });

    return newRow;
  });
}

// Log transform
export function logTransform(
  data: DataRow[],
  columns: string[],
  offset: number = 1
): { data: DataRow[]; log: CleaningLog } {
  let transformed = 0;

  const resultData = data.map(row => {
    const newRow = { ...row };
    
    columns.forEach(col => {
      const value = row[col];
      if (typeof value === 'number' && value + offset > 0) {
        newRow[col] = Math.log(value + offset);
        transformed++;
      } else if (value === null || value === undefined || value === '') {
        newRow[col] = null; // Keep null as null
      }
    });

    return newRow;
  });

  return {
    data: resultData,
    log: {
      operation: 'Log Transform',
      details: `Applied log transform to ${columns.length} columns with offset ${offset}`,
      rowsAffected: transformed,
      timestamp: new Date(),
      category: 'transformation'
    }
  };
}

// Square root transform
export function sqrtTransform(
  data: DataRow[],
  columns: string[]
): { data: DataRow[]; log: CleaningLog } {
  let transformed = 0;

  const resultData = data.map(row => {
    const newRow = { ...row };
    
    columns.forEach(col => {
      const value = row[col];
      if (typeof value === 'number' && value >= 0) {
        newRow[col] = Math.sqrt(value);
        transformed++;
      } else if (value === null || value === undefined || value === '') {
        newRow[col] = null; // Keep null as null
      }
    });

    return newRow;
  });

  return {
    data: resultData,
    log: {
      operation: 'Square Root Transform',
      details: `Applied sqrt transform to ${columns.length} columns`,
      rowsAffected: transformed,
      timestamp: new Date(),
      category: 'transformation'
    }
  };
}

// Box-Cox transform (simplified)
export function boxCoxTransform(
  data: DataRow[],
  columns: string[],
  lambda: number = 0.5
): { data: DataRow[]; log: CleaningLog } {
  let transformed = 0;

  const resultData = data.map(row => {
    const newRow = { ...row };
    
    columns.forEach(col => {
      const value = row[col];
      if (typeof value === 'number' && value > 0) {
        if (lambda === 0) {
          newRow[col] = Math.log(value);
        } else {
          newRow[col] = (Math.pow(value, lambda) - 1) / lambda;
        }
        transformed++;
      } else if (value === null || value === undefined || value === '') {
        newRow[col] = null; // Keep null as null
      }
    });

    return newRow;
  });

  return {
    data: resultData,
    log: {
      operation: 'Box-Cox Transform',
      details: `Applied Box-Cox transform (λ=${lambda}) to ${columns.length} columns`,
      rowsAffected: transformed,
      timestamp: new Date(),
      category: 'transformation'
    }
  };
}
