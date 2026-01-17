import { DataRow, ColumnStats, CleaningLog, EncoderConfig } from '@/types/dataset';

// One-hot encoding
export function oneHotEncode(
  data: DataRow[],
  column: string,
  dropFirst: boolean = false
): { data: DataRow[]; newColumns: string[]; encoder: EncoderConfig; log: CleaningLog } {
  const uniqueValues = [...new Set(data.map(row => row[column]).filter(v => v !== null && v !== undefined))];
  const categories = uniqueValues.map(v => String(v)).sort();
  
  const valuesToEncode = dropFirst ? categories.slice(1) : categories;
  const newColumns = valuesToEncode.map(v => `${column}_${v}`);

  const resultData = data.map(row => {
    const newRow = { ...row };
    const value = String(row[column] ?? '');
    
    valuesToEncode.forEach((cat, i) => {
      newRow[newColumns[i]] = value === cat ? 1 : 0;
    });
    
    delete newRow[column];
    return newRow;
  });

  return {
    data: resultData,
    newColumns,
    encoder: {
      method: 'onehot',
      categories,
    },
    log: {
      operation: 'One-Hot Encoding',
      column,
      details: `Created ${newColumns.length} binary columns from ${categories.length} categories`,
      rowsAffected: data.length,
      timestamp: new Date(),
      category: 'encoding'
    }
  };
}

// Label encoding
export function labelEncode(
  data: DataRow[],
  column: string
): { data: DataRow[]; encoder: EncoderConfig; log: CleaningLog } {
  const uniqueValues = [...new Set(data.map(row => row[column]).filter(v => v !== null && v !== undefined))];
  const categories = uniqueValues.map(v => String(v)).sort();
  
  const mapping: Record<string, number> = {};
  categories.forEach((cat, i) => {
    mapping[cat] = i;
  });

  const resultData = data.map(row => {
    const value = row[column];
    if (value === null || value === undefined) {
      return { ...row, [column]: null };
    }
    return { ...row, [column]: mapping[String(value)] ?? null };
  });

  return {
    data: resultData,
    encoder: {
      method: 'label',
      mapping,
      categories,
    },
    log: {
      operation: 'Label Encoding',
      column,
      details: `Encoded ${categories.length} categories to integers (0-${categories.length - 1})`,
      rowsAffected: data.length,
      timestamp: new Date(),
      category: 'encoding'
    }
  };
}

// Frequency encoding
export function frequencyEncode(
  data: DataRow[],
  column: string
): { data: DataRow[]; encoder: EncoderConfig; log: CleaningLog } {
  const counts: Record<string, number> = {};
  
  data.forEach(row => {
    const value = row[column];
    if (value !== null && value !== undefined) {
      const key = String(value);
      counts[key] = (counts[key] || 0) + 1;
    }
  });

  const total = data.length;
  const mapping: Record<string, number> = {};
  Object.entries(counts).forEach(([key, count]) => {
    mapping[key] = count / total;
  });

  const resultData = data.map(row => {
    const value = row[column];
    if (value === null || value === undefined) {
      return { ...row, [column]: null };
    }
    return { ...row, [column]: mapping[String(value)] ?? 0 };
  });

  return {
    data: resultData,
    encoder: {
      method: 'frequency',
      mapping,
      categories: Object.keys(counts),
    },
    log: {
      operation: 'Frequency Encoding',
      column,
      details: `Encoded ${Object.keys(counts).length} categories by their frequency`,
      rowsAffected: data.length,
      timestamp: new Date(),
      category: 'encoding'
    }
  };
}

// Target encoding (mean encoding)
export function targetEncode(
  data: DataRow[],
  column: string,
  targetColumn: string,
  smoothing: number = 1
): { data: DataRow[]; encoder: EncoderConfig; log: CleaningLog } {
  const globalMean = data.reduce((sum, row) => {
    const target = row[targetColumn];
    return sum + (typeof target === 'number' ? target : 0);
  }, 0) / data.length;

  const categoryStats: Record<string, { sum: number; count: number }> = {};
  
  data.forEach(row => {
    const value = row[column];
    const target = row[targetColumn];
    
    if (value !== null && value !== undefined && typeof target === 'number') {
      const key = String(value);
      if (!categoryStats[key]) {
        categoryStats[key] = { sum: 0, count: 0 };
      }
      categoryStats[key].sum += target;
      categoryStats[key].count++;
    }
  });

  const mapping: Record<string, number> = {};
  Object.entries(categoryStats).forEach(([key, { sum, count }]) => {
    // Apply smoothing: (count * categoryMean + smoothing * globalMean) / (count + smoothing)
    const categoryMean = sum / count;
    mapping[key] = (count * categoryMean + smoothing * globalMean) / (count + smoothing);
  });

  const resultData = data.map(row => {
    const value = row[column];
    if (value === null || value === undefined) {
      return { ...row, [column]: globalMean };
    }
    return { ...row, [column]: mapping[String(value)] ?? globalMean };
  });

  return {
    data: resultData,
    encoder: {
      method: 'target',
      mapping,
      categories: Object.keys(categoryStats),
    },
    log: {
      operation: 'Target Encoding',
      column,
      details: `Encoded ${Object.keys(categoryStats).length} categories using target mean (smoothing: ${smoothing})`,
      rowsAffected: data.length,
      timestamp: new Date(),
      category: 'encoding'
    }
  };
}

// Binary encoding
export function binaryEncode(
  data: DataRow[],
  column: string
): { data: DataRow[]; newColumns: string[]; encoder: EncoderConfig; log: CleaningLog } {
  const uniqueValues = [...new Set(data.map(row => row[column]).filter(v => v !== null && v !== undefined))];
  const categories = uniqueValues.map(v => String(v)).sort();
  
  const numBits = Math.ceil(Math.log2(categories.length + 1));
  const newColumns = Array.from({ length: numBits }, (_, i) => `${column}_bit${i}`);

  const mapping: Record<string, number[]> = {};
  categories.forEach((cat, i) => {
    const binary = (i + 1).toString(2).padStart(numBits, '0');
    mapping[cat] = binary.split('').map(b => parseInt(b));
  });

  const resultData = data.map(row => {
    const newRow = { ...row };
    const value = row[column];
    
    if (value === null || value === undefined) {
      newColumns.forEach(col => {
        newRow[col] = 0;
      });
    } else {
      const bits = mapping[String(value)] || new Array(numBits).fill(0);
      newColumns.forEach((col, i) => {
        newRow[col] = bits[i];
      });
    }
    
    delete newRow[column];
    return newRow;
  });

  return {
    data: resultData,
    newColumns,
    encoder: {
      method: 'binary',
      mapping,
      categories,
    },
    log: {
      operation: 'Binary Encoding',
      column,
      details: `Created ${numBits} binary columns from ${categories.length} categories`,
      rowsAffected: data.length,
      timestamp: new Date(),
      category: 'encoding'
    }
  };
}

// Detect categorical columns
export function detectCategoricalColumns(
  columnStats: ColumnStats[],
  maxCardinality: number = 50,
  maxUniqueRatio: number = 0.5
): string[] {
  return columnStats
    .filter(stats => {
      if (stats.type === 'number') return false;
      if (stats.uniqueCount <= maxCardinality) return true;
      if (stats.uniqueCount / stats.totalCount <= maxUniqueRatio) return true;
      return false;
    })
    .map(stats => stats.name);
}

// Warn for high cardinality
export function getHighCardinalityWarnings(
  columnStats: ColumnStats[],
  threshold: number = 50
): { column: string; cardinality: number }[] {
  return columnStats
    .filter(stats => stats.type !== 'number' && stats.uniqueCount > threshold)
    .map(stats => ({
      column: stats.name,
      cardinality: stats.uniqueCount
    }));
}
