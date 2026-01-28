export interface DataRow {
  [key: string]: string | number | boolean | null | Date;
}

export interface ColumnStats {
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'mixed';
  totalCount: number;
  uniqueCount: number;
  missingCount: number;
  missingPercentage: number;
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  mode?: string | number;
  stdDev?: number;
  q1?: number;
  q3?: number;
  variance?: number;
  skewness?: number;
  topValues?: { value: string | number; count: number }[];
  cardinality?: number;
  isTarget?: boolean;
  isCategorical?: boolean;
}

export interface CleaningLog {
  operation: string;
  column?: string;
  details: string;
  rowsAffected: number;
  timestamp: Date;
  category?: 'cleaning' | 'transformation' | 'encoding' | 'feature' | 'validation' | 'split' | 'transform' | 'model';
}

export interface CleaningResult {
  data: DataRow[];
  logs: CleaningLog[];
  // Optional: when operations remove or rename columns, provide updated column list
  columns?: string[];
}

export interface ValidationIssue {
  type: 'error' | 'warning' | 'info';
  message: string;
  column?: string;
  suggestion?: string;
}

export interface DatasetInfo {
  fileName: string;
  fileSize: number;
  fileType: 'csv' | 'json' | 'excel';
  encoding?: string;
  delimiter?: string;
  rowCount: number;
  columnCount: number;
}

export interface MLTask {
  type: 'classification' | 'regression' | 'clustering' | 'unknown';
  targetColumn?: string;
  confidence: number;
  numClasses?: number;
  classDistribution?: Record<string, number>;
}

export interface SplitConfig {
  method: 'random' | 'stratified' | 'time-based' | 'group-based';
  trainRatio: number;
  validationRatio: number;
  testRatio: number;
  groupColumn?: string;
  timeColumn?: string;
  randomSeed: number;
}

export interface SplitResult {
  train: DataRow[];
  validation?: DataRow[];
  test: DataRow[];
  trainIndices?: number[];
  validationIndices?: number[];
  testIndices?: number[];
}

export interface ScalerConfig {
  method: 'standard' | 'minmax' | 'robust' | 'none';
  columns: string[];
  params: Record<string, { mean?: number; std?: number; min?: number; max?: number; q1?: number; q3?: number; median?: number; iqr?: number }>;
}

export interface MLReadinessReport {
  score: number;
  isReady: boolean;
  issues: ValidationIssue[];
  recommendations: string[];
  summary: {
    totalFeatures: number;
    numericFeatures: number;
    categoricalFeatures: number;
    missingValues: number;
    duplicateRows: number;
    outliers: number;
    highCardinalityColumns: number;
  };
}

export interface EncoderConfig {
  method: 'onehot' | 'label' | 'frequency' | 'target' | 'binary';
  mapping?: Record<string, number | number[]>;
  categories?: string[];
}

export interface OutlierConfig {
  method: 'iqr' | 'zscore' | 'percentile';
  treatment: 'cap' | 'remove' | 'replace' | 'flag';
  threshold: number;
  replacement?: number | 'mean' | 'median';
}

export interface GeoFeature {
  latColumn: string;
  lonColumn: string;
  method: 'grid' | 'cluster' | 'h3';
  resolution?: number;
  numClusters?: number;
}

export interface AuditReport {
  generatedAt: Date;
  summary: {
    originalRows: number;
    processedRows: number;
    rowsRemoved: number;
    originalColumns: number;
    processedColumns: number;
    columnsAdded: number;
    columnsRemoved: number;
    totalOperations: number;
  };
  transformations: {
    operation: string;
    details: string;
    rowsAffected: number;
    timestamp: Date;
    category: string;
  }[];
  dataQuality: {
    completeness: number;
    uniqueness: number;
    consistency: number;
    validity: number;
    overall: number;
  };
  warnings: string[];
  targetColumn?: string;
  splitConfig?: { trainSize: number; testSize: number; validationSize?: number };
}

export interface BaselineModel {
  type: string;
  features: string[];
  target: string;
  classes?: any[];
  coefficients?: {
    intercept: number;
    weights: Record<string, number>;
  };
  tree?: any;
  metrics: Record<string, number | object>;
  trainedAt: Date;
}

export interface TransformationPipeline {
  version: string;
  createdAt: Date;
  steps: {
    order: number;
    type: string;
    operation: string;
    config: Record<string, any>;
  }[];
  targetColumn?: string;
  splitConfig?: any;
  scalerConfig?: any;
}
