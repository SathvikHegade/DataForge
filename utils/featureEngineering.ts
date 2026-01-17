import { DataRow, CleaningLog } from '@/types/dataset';

// Time-based feature extraction
export function extractTimeFeatures(
  data: DataRow[],
  column: string,
  features: ('hour' | 'day' | 'weekday' | 'month' | 'year' | 'quarter' | 'dayofyear' | 'week')[]
): { data: DataRow[]; newColumns: string[]; log: CleaningLog } {
  const newColumns: string[] = [];
  
  const resultData = data.map(row => {
    const newRow = { ...row };
    const value = row[column];
    
    let date: Date | null = null;
    if (value instanceof Date) {
      date = value;
    } else if (typeof value === 'string' || typeof value === 'number') {
      date = new Date(value);
      if (isNaN(date.getTime())) date = null;
    }

    features.forEach(feature => {
      const colName = `${column}_${feature}`;
      if (!newColumns.includes(colName)) newColumns.push(colName);
      
      if (!date) {
        newRow[colName] = null;
        return;
      }

      switch (feature) {
        case 'hour':
          newRow[colName] = date.getHours();
          break;
        case 'day':
          newRow[colName] = date.getDate();
          break;
        case 'weekday':
          newRow[colName] = date.getDay();
          break;
        case 'month':
          newRow[colName] = date.getMonth() + 1;
          break;
        case 'year':
          newRow[colName] = date.getFullYear();
          break;
        case 'quarter':
          newRow[colName] = Math.floor(date.getMonth() / 3) + 1;
          break;
        case 'dayofyear':
          const start = new Date(date.getFullYear(), 0, 0);
          const diff = date.getTime() - start.getTime();
          newRow[colName] = Math.floor(diff / (1000 * 60 * 60 * 24));
          break;
        case 'week':
          const firstDay = new Date(date.getFullYear(), 0, 1);
          const days = Math.floor((date.getTime() - firstDay.getTime()) / (24 * 60 * 60 * 1000));
          newRow[colName] = Math.ceil((days + 1) / 7);
          break;
      }
    });

    return newRow;
  });

  return {
    data: resultData,
    newColumns,
    log: {
      operation: 'Time Feature Extraction',
      column,
      details: `Created ${newColumns.length} time features: ${features.join(', ')}`,
      rowsAffected: data.length,
      timestamp: new Date(),
      category: 'feature'
    }
  };
}

// Rolling window features
export function createRollingFeatures(
  data: DataRow[],
  column: string,
  windowSizes: number[],
  functions: ('mean' | 'sum' | 'min' | 'max' | 'std')[]
): { data: DataRow[]; newColumns: string[]; log: CleaningLog } {
  const newColumns: string[] = [];
  const resultData = [...data];

  windowSizes.forEach(windowSize => {
    functions.forEach(func => {
      const colName = `${column}_rolling_${func}_${windowSize}`;
      newColumns.push(colName);

      resultData.forEach((_, i) => {
        const windowValues: number[] = [];
        
        for (let j = Math.max(0, i - windowSize + 1); j <= i; j++) {
          const value = data[j][column];
          if (typeof value === 'number') {
            windowValues.push(value);
          }
        }

        if (windowValues.length === 0) {
          resultData[i] = { ...resultData[i], [colName]: null };
          return;
        }

        let result: number;
        switch (func) {
          case 'mean':
            result = windowValues.reduce((a, b) => a + b, 0) / windowValues.length;
            break;
          case 'sum':
            result = windowValues.reduce((a, b) => a + b, 0);
            break;
          case 'min':
            result = Math.min(...windowValues);
            break;
          case 'max':
            result = Math.max(...windowValues);
            break;
          case 'std':
            const mean = windowValues.reduce((a, b) => a + b, 0) / windowValues.length;
            result = Math.sqrt(windowValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / windowValues.length);
            break;
        }

        resultData[i] = { ...resultData[i], [colName]: Math.round(result * 1000) / 1000 };
      });
    });
  });

  return {
    data: resultData,
    newColumns,
    log: {
      operation: 'Rolling Features',
      column,
      details: `Created ${newColumns.length} rolling features with windows: ${windowSizes.join(', ')}`,
      rowsAffected: data.length,
      timestamp: new Date(),
      category: 'feature'
    }
  };
}

// Lag features
export function createLagFeatures(
  data: DataRow[],
  column: string,
  lags: number[]
): { data: DataRow[]; newColumns: string[]; log: CleaningLog } {
  const newColumns: string[] = [];
  const resultData = data.map((row, i) => {
    const newRow = { ...row };
    
    lags.forEach(lag => {
      const colName = `${column}_lag_${lag}`;
      if (!newColumns.includes(colName)) newColumns.push(colName);
      
      if (i >= lag) {
        newRow[colName] = data[i - lag][column];
      } else {
        newRow[colName] = null;
      }
    });

    return newRow;
  });

  return {
    data: resultData,
    newColumns,
    log: {
      operation: 'Lag Features',
      column,
      details: `Created ${lags.length} lag features: ${lags.join(', ')}`,
      rowsAffected: data.length,
      timestamp: new Date(),
      category: 'feature'
    }
  };
}

// Polynomial features
export function createPolynomialFeatures(
  data: DataRow[],
  columns: string[],
  degree: number = 2,
  interactionOnly: boolean = false
): { data: DataRow[]; newColumns: string[]; log: CleaningLog } {
  const newColumns: string[] = [];
  
  const resultData = data.map(row => {
    const newRow = { ...row };

    // Single column powers
    if (!interactionOnly) {
      columns.forEach(col => {
        const value = row[col];
        if (typeof value === 'number') {
          for (let d = 2; d <= degree; d++) {
            const colName = `${col}_pow${d}`;
            if (!newColumns.includes(colName)) newColumns.push(colName);
            newRow[colName] = Math.pow(value, d);
          }
        }
      });
    }

    // Interactions
    for (let i = 0; i < columns.length; i++) {
      for (let j = i + 1; j < columns.length; j++) {
        const v1 = row[columns[i]];
        const v2 = row[columns[j]];
        
        if (typeof v1 === 'number' && typeof v2 === 'number') {
          const colName = `${columns[i]}_x_${columns[j]}`;
          if (!newColumns.includes(colName)) newColumns.push(colName);
          newRow[colName] = v1 * v2;
        }
      }
    }

    return newRow;
  });

  return {
    data: resultData,
    newColumns,
    log: {
      operation: 'Polynomial Features',
      details: `Created ${newColumns.length} polynomial features (degree: ${degree})`,
      rowsAffected: data.length,
      timestamp: new Date(),
      category: 'feature'
    }
  };
}

// Binning / Discretization
export function binNumericFeature(
  data: DataRow[],
  column: string,
  method: 'quantile' | 'uniform' | 'custom',
  numBins: number = 5,
  customBins?: number[]
): { data: DataRow[]; log: CleaningLog } {
  const values = data.map(row => row[column]).filter(v => typeof v === 'number') as number[];
  const sorted = [...values].sort((a, b) => a - b);
  
  let bins: number[];
  
  if (method === 'custom' && customBins) {
    bins = customBins;
  } else if (method === 'quantile') {
    bins = [];
    for (let i = 1; i < numBins; i++) {
      const idx = Math.floor((i / numBins) * sorted.length);
      bins.push(sorted[idx]);
    }
  } else {
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const step = (max - min) / numBins;
    bins = [];
    for (let i = 1; i < numBins; i++) {
      bins.push(min + i * step);
    }
  }

  const binColumn = `${column}_binned`;
  
  const resultData = data.map(row => {
    const value = row[column];
    if (typeof value !== 'number') {
      return { ...row, [binColumn]: null };
    }

    let binIdx = 0;
    for (let i = 0; i < bins.length; i++) {
      if (value > bins[i]) {
        binIdx = i + 1;
      }
    }

    return { ...row, [binColumn]: binIdx };
  });

  return {
    data: resultData,
    log: {
      operation: 'Feature Binning',
      column,
      details: `Created ${numBins} bins using ${method} method`,
      rowsAffected: data.length,
      timestamp: new Date(),
      category: 'feature'
    }
  };
}

// Aggregation features (for grouped data)
export function createAggregationFeatures(
  data: DataRow[],
  groupByColumn: string,
  aggColumn: string,
  functions: ('mean' | 'sum' | 'count' | 'min' | 'max' | 'std')[]
): { data: DataRow[]; newColumns: string[]; log: CleaningLog } {
  const newColumns: string[] = [];
  
  // Calculate aggregations per group
  const groupStats: Record<string, Record<string, number>> = {};
  const groupValues: Record<string, number[]> = {};
  
  data.forEach(row => {
    const groupKey = String(row[groupByColumn] ?? 'null');
    const value = row[aggColumn];
    
    if (!groupValues[groupKey]) {
      groupValues[groupKey] = [];
    }
    
    if (typeof value === 'number') {
      groupValues[groupKey].push(value);
    }
  });

  Object.entries(groupValues).forEach(([groupKey, values]) => {
    groupStats[groupKey] = {};
    
    if (values.length === 0) return;
    
    functions.forEach(func => {
      let result: number;
      switch (func) {
        case 'mean':
          result = values.reduce((a, b) => a + b, 0) / values.length;
          break;
        case 'sum':
          result = values.reduce((a, b) => a + b, 0);
          break;
        case 'count':
          result = values.length;
          break;
        case 'min':
          result = Math.min(...values);
          break;
        case 'max':
          result = Math.max(...values);
          break;
        case 'std':
          const mean = values.reduce((a, b) => a + b, 0) / values.length;
          result = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length);
          break;
      }
      groupStats[groupKey][func] = result;
    });
  });

  // Apply to data
  const resultData = data.map(row => {
    const newRow = { ...row };
    const groupKey = String(row[groupByColumn] ?? 'null');
    
    functions.forEach(func => {
      const colName = `${aggColumn}_by_${groupByColumn}_${func}`;
      if (!newColumns.includes(colName)) newColumns.push(colName);
      newRow[colName] = groupStats[groupKey]?.[func] ?? null;
    });

    return newRow;
  });

  return {
    data: resultData,
    newColumns,
    log: {
      operation: 'Aggregation Features',
      details: `Created ${newColumns.length} aggregation features grouped by ${groupByColumn}`,
      rowsAffected: data.length,
      timestamp: new Date(),
      category: 'feature'
    }
  };
}

// Text features (basic)
export function createTextFeatures(
  data: DataRow[],
  column: string
): { data: DataRow[]; newColumns: string[]; log: CleaningLog } {
  const newColumns = [
    `${column}_length`,
    `${column}_word_count`,
    `${column}_char_count`,
    `${column}_digit_count`,
    `${column}_upper_count`
  ];

  const resultData = data.map(row => {
    const newRow = { ...row };
    const value = row[column];
    
    if (typeof value !== 'string') {
      newColumns.forEach(col => {
        newRow[col] = null;
      });
      return newRow;
    }

    newRow[`${column}_length`] = value.length;
    newRow[`${column}_word_count`] = value.split(/\s+/).filter(w => w).length;
    newRow[`${column}_char_count`] = value.replace(/\s/g, '').length;
    newRow[`${column}_digit_count`] = (value.match(/\d/g) || []).length;
    newRow[`${column}_upper_count`] = (value.match(/[A-Z]/g) || []).length;

    return newRow;
  });

  return {
    data: resultData,
    newColumns,
    log: {
      operation: 'Text Features',
      column,
      details: `Created ${newColumns.length} text-based features`,
      rowsAffected: data.length,
      timestamp: new Date(),
      category: 'feature'
    }
  };
}
