import { DataRow, CleaningLog, AuditReport, TransformationPipeline } from '@/types/dataset';

// Generate comprehensive audit report
export function generateAuditReport(
  originalData: DataRow[],
  processedData: DataRow[],
  cleaningLogs: CleaningLog[],
  targetColumn?: string,
  splitConfig?: { trainSize: number; testSize: number; validationSize?: number }
): AuditReport {
  const originalColumns = originalData.length > 0 ? Object.keys(originalData[0]) : [];
  const processedColumns = processedData.length > 0 ? Object.keys(processedData[0]) : [];

  // Calculate data quality metrics
  const dataQuality = calculateDataQuality(processedData);

  // Detect potential issues
  const warnings = detectPotentialIssues(processedData, targetColumn);

  const report: AuditReport = {
    generatedAt: new Date(),
    summary: {
      originalRows: originalData.length,
      processedRows: processedData.length,
      rowsRemoved: originalData.length - processedData.length,
      originalColumns: originalColumns.length,
      processedColumns: processedColumns.length,
      columnsAdded: processedColumns.filter(c => !originalColumns.includes(c)).length,
      columnsRemoved: originalColumns.filter(c => !processedColumns.includes(c)).length,
      totalOperations: cleaningLogs.length
    },
    transformations: cleaningLogs.map(log => ({
      operation: log.operation,
      details: log.details,
      rowsAffected: log.rowsAffected,
      timestamp: log.timestamp,
      category: log.category || 'cleaning'
    })),
    dataQuality,
    warnings,
    targetColumn,
    splitConfig
  };

  return report;
}

// Calculate data quality metrics
function calculateDataQuality(data: DataRow[]): {
  completeness: number;
  uniqueness: number;
  consistency: number;
  validity: number;
  overall: number;
} {
  if (data.length === 0) {
    return { completeness: 0, uniqueness: 0, consistency: 0, validity: 0, overall: 0 };
  }

  const columns = Object.keys(data[0]);
  
  // Completeness: % of non-null values
  let totalCells = data.length * columns.length;
  let nonNullCells = 0;
  
  data.forEach(row => {
    columns.forEach(col => {
      if (row[col] !== null && row[col] !== undefined && row[col] !== '') {
        nonNullCells++;
      }
    });
  });
  
  const completeness = totalCells > 0 ? nonNullCells / totalCells : 0;

  // Uniqueness: % of unique rows
  const rowStrings = new Set(data.map(row => JSON.stringify(row)));
  const uniqueness = data.length > 0 ? rowStrings.size / data.length : 0;

  // Consistency: Check for type consistency within columns
  let consistentColumns = 0;
  columns.forEach(col => {
    const types = new Set<string>();
    data.forEach(row => {
      const val = row[col];
      if (val !== null && val !== undefined) {
        types.add(typeof val);
      }
    });
    if (types.size <= 1) {
      consistentColumns++;
    }
  });
  const consistency = columns.length > 0 ? consistentColumns / columns.length : 0;

  // Validity: Simplified check for reasonable values
  let validCells = 0;
  data.forEach(row => {
    columns.forEach(col => {
      const val = row[col];
      if (val === null || val === undefined) {
        validCells++; // Null is considered valid (handled by completeness)
      } else if (typeof val === 'number' && !isNaN(val) && isFinite(val)) {
        validCells++;
      } else if (typeof val === 'string') {
        validCells++;
      } else if (typeof val === 'boolean') {
        validCells++;
      }
    });
  });
  const validity = totalCells > 0 ? validCells / totalCells : 0;

  // Overall score (weighted average)
  const overall = (completeness * 0.3 + uniqueness * 0.2 + consistency * 0.25 + validity * 0.25);

  return {
    completeness: Math.round(completeness * 100) / 100,
    uniqueness: Math.round(uniqueness * 100) / 100,
    consistency: Math.round(consistency * 100) / 100,
    validity: Math.round(validity * 100) / 100,
    overall: Math.round(overall * 100) / 100
  };
}

// Detect potential issues
function detectPotentialIssues(data: DataRow[], targetColumn?: string): string[] {
  const warnings: string[] = [];
  
  if (data.length === 0) {
    warnings.push('Dataset is empty');
    return warnings;
  }

  const columns = Object.keys(data[0]);

  // Check for very small dataset
  if (data.length < 100) {
    warnings.push(`Dataset has only ${data.length} rows - may not be sufficient for ML training`);
  }

  // Check for high cardinality columns
  columns.forEach(col => {
    const values = data.map(r => r[col]).filter(v => v !== null && v !== undefined);
    const uniqueCount = new Set(values).size;
    
    if (typeof values[0] === 'string' && uniqueCount > data.length * 0.5) {
      warnings.push(`Column "${col}" has high cardinality (${uniqueCount} unique values) - consider encoding or removal`);
    }
  });

  // Check for target column issues
  if (targetColumn) {
    const targetValues = data.map(r => r[targetColumn]);
    const nullCount = targetValues.filter(v => v === null || v === undefined).length;
    
    if (nullCount > 0) {
      warnings.push(`Target column "${targetColumn}" has ${nullCount} missing values`);
    }

    // Check for class imbalance
    const classCounts = new Map<any, number>();
    targetValues.forEach(v => {
      if (v !== null && v !== undefined) {
        classCounts.set(v, (classCounts.get(v) || 0) + 1);
      }
    });

    if (classCounts.size <= 10) {
      const counts = Array.from(classCounts.values());
      const maxCount = Math.max(...counts);
      const minCount = Math.min(...counts);
      
      if (maxCount / minCount > 3) {
        warnings.push(`Target column has imbalanced classes (ratio ${(maxCount / minCount).toFixed(1)}:1)`);
      }
    }
  }

  // Check for constant columns
  columns.forEach(col => {
    const uniqueValues = new Set(data.map(r => r[col]));
    if (uniqueValues.size === 1) {
      warnings.push(`Column "${col}" has only one unique value - consider removal`);
    }
  });

  return warnings;
}

// Generate downloadable report as text
export function generateTextReport(report: AuditReport): string {
  const lines: string[] = [];
  
  lines.push('=' .repeat(60));
  lines.push('DATA CLEANING AUDIT REPORT');
  lines.push('=' .repeat(60));
  lines.push('');
  lines.push(`Generated: ${report.generatedAt.toLocaleString()}`);
  lines.push('');
  
  lines.push('-'.repeat(40));
  lines.push('SUMMARY');
  lines.push('-'.repeat(40));
  lines.push(`Original Rows: ${report.summary.originalRows}`);
  lines.push(`Processed Rows: ${report.summary.processedRows}`);
  lines.push(`Rows Removed: ${report.summary.rowsRemoved}`);
  lines.push(`Original Columns: ${report.summary.originalColumns}`);
  lines.push(`Processed Columns: ${report.summary.processedColumns}`);
  lines.push(`Columns Added: ${report.summary.columnsAdded}`);
  lines.push(`Columns Removed: ${report.summary.columnsRemoved}`);
  lines.push(`Total Operations: ${report.summary.totalOperations}`);
  lines.push('');

  if (report.targetColumn) {
    lines.push(`Target Column: ${report.targetColumn}`);
    lines.push('');
  }

  if (report.splitConfig) {
    lines.push('-'.repeat(40));
    lines.push('DATA SPLIT CONFIGURATION');
    lines.push('-'.repeat(40));
    lines.push(`Training Set: ${(report.splitConfig.trainSize * 100).toFixed(0)}%`);
    lines.push(`Test Set: ${(report.splitConfig.testSize * 100).toFixed(0)}%`);
    if (report.splitConfig.validationSize) {
      lines.push(`Validation Set: ${(report.splitConfig.validationSize * 100).toFixed(0)}%`);
    }
    lines.push('');
  }

  lines.push('-'.repeat(40));
  lines.push('DATA QUALITY SCORES');
  lines.push('-'.repeat(40));
  lines.push(`Completeness: ${(report.dataQuality.completeness * 100).toFixed(1)}%`);
  lines.push(`Uniqueness: ${(report.dataQuality.uniqueness * 100).toFixed(1)}%`);
  lines.push(`Consistency: ${(report.dataQuality.consistency * 100).toFixed(1)}%`);
  lines.push(`Validity: ${(report.dataQuality.validity * 100).toFixed(1)}%`);
  lines.push(`Overall Quality: ${(report.dataQuality.overall * 100).toFixed(1)}%`);
  lines.push('');

  if (report.warnings.length > 0) {
    lines.push('-'.repeat(40));
    lines.push('WARNINGS');
    lines.push('-'.repeat(40));
    report.warnings.forEach(w => lines.push(`⚠ ${w}`));
    lines.push('');
  }

  lines.push('-'.repeat(40));
  lines.push('TRANSFORMATION LOG');
  lines.push('-'.repeat(40));
  
  report.transformations.forEach((t, i) => {
    lines.push(`${i + 1}. ${t.operation}`);
    lines.push(`   Details: ${t.details}`);
    lines.push(`   Rows Affected: ${t.rowsAffected}`);
    lines.push(`   Time: ${t.timestamp.toLocaleString()}`);
    lines.push('');
  });

  lines.push('=' .repeat(60));
  lines.push('END OF REPORT');
  lines.push('=' .repeat(60));

  return lines.join('\n');
}

// Generate CSV summary
export function generateCSVSummary(report: AuditReport): string {
  const rows: string[] = [];
  
  rows.push('Section,Metric,Value');
  
  // Summary metrics
  rows.push(`Summary,Original Rows,${report.summary.originalRows}`);
  rows.push(`Summary,Processed Rows,${report.summary.processedRows}`);
  rows.push(`Summary,Rows Removed,${report.summary.rowsRemoved}`);
  rows.push(`Summary,Original Columns,${report.summary.originalColumns}`);
  rows.push(`Summary,Processed Columns,${report.summary.processedColumns}`);
  rows.push(`Summary,Columns Added,${report.summary.columnsAdded}`);
  rows.push(`Summary,Columns Removed,${report.summary.columnsRemoved}`);
  
  // Quality metrics
  rows.push(`Quality,Completeness,${report.dataQuality.completeness}`);
  rows.push(`Quality,Uniqueness,${report.dataQuality.uniqueness}`);
  rows.push(`Quality,Consistency,${report.dataQuality.consistency}`);
  rows.push(`Quality,Validity,${report.dataQuality.validity}`);
  rows.push(`Quality,Overall,${report.dataQuality.overall}`);
  
  // Transformations
  report.transformations.forEach((t, i) => {
    rows.push(`Transformation ${i + 1},Operation,"${t.operation}"`);
    rows.push(`Transformation ${i + 1},Details,"${t.details.replace(/"/g, '""')}"`);
    rows.push(`Transformation ${i + 1},Rows Affected,${t.rowsAffected}`);
  });
  
  return rows.join('\n');
}

// Generate JSON pipeline config
export function generatePipelineConfig(
  cleaningLogs: CleaningLog[],
  targetColumn?: string,
  splitConfig?: any,
  scalerConfig?: any
): TransformationPipeline {
  const pipeline: TransformationPipeline = {
    version: '1.0',
    createdAt: new Date(),
    steps: cleaningLogs.map((log, index) => ({
      order: index + 1,
      type: log.category || 'cleaning',
      operation: log.operation,
      config: extractConfigFromLog(log)
    })),
    targetColumn,
    splitConfig,
    scalerConfig
  };

  return pipeline;
}

// Extract configuration from log details
function extractConfigFromLog(log: CleaningLog): Record<string, any> {
  const config: Record<string, any> = {};
  
  // Parse common patterns from log details
  const strategyMatch = log.details.match(/strategy: (\w+)/);
  if (strategyMatch) {
    config.strategy = strategyMatch[1];
  }

  const columnMatch = log.details.match(/column[s]?: ([^,\)]+)/i);
  if (columnMatch) {
    config.columns = columnMatch[1].split(',').map(c => c.trim());
  }

  const thresholdMatch = log.details.match(/threshold: ([\d.]+)/);
  if (thresholdMatch) {
    config.threshold = parseFloat(thresholdMatch[1]);
  }

  return config;
}

// Export pipeline as JSON string
export function exportPipelineJSON(pipeline: TransformationPipeline): string {
  return JSON.stringify(pipeline, null, 2);
}

// Column-level statistics for reporting
export function generateColumnStats(data: DataRow[]): Array<{
  column: string;
  type: string;
  nonNull: number;
  nullCount: number;
  uniqueCount: number;
  min?: number | string;
  max?: number | string;
  mean?: number;
  median?: number;
  mode?: string | number;
}> {
  if (data.length === 0) return [];

  const columns = Object.keys(data[0]);
  
  return columns.map(col => {
    const values = data.map(r => r[col]);
    const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '');
    
    const uniqueSet = new Set(nonNullValues);
    const type = nonNullValues.length > 0 ? typeof nonNullValues[0] : 'unknown';
    
    const stats: any = {
      column: col,
      type,
      nonNull: nonNullValues.length,
      nullCount: values.length - nonNullValues.length,
      uniqueCount: uniqueSet.size
    };

    if (type === 'number') {
      const numValues = nonNullValues.filter(v => typeof v === 'number') as number[];
      if (numValues.length > 0) {
        stats.min = Math.min(...numValues);
        stats.max = Math.max(...numValues);
        stats.mean = numValues.reduce((a, b) => a + b, 0) / numValues.length;
        
        const sorted = [...numValues].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        stats.median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      }
    } else if (type === 'string') {
      const strValues = nonNullValues as string[];
      if (strValues.length > 0) {
        stats.min = strValues.reduce((a, b) => a < b ? a : b);
        stats.max = strValues.reduce((a, b) => a > b ? a : b);
        
        // Mode
        const counts = new Map<string, number>();
        strValues.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
        let maxCount = 0;
        let mode = '';
        counts.forEach((count, val) => {
          if (count > maxCount) {
            maxCount = count;
            mode = val;
          }
        });
        stats.mode = mode;
      }
    }

    return stats;
  });
}
