import { DataRow, ColumnStats, MLTask, MLReadinessReport, ValidationIssue, CleaningLog } from '@/types/dataset';

// Detect ML task type
export function detectMLTask(
  data: DataRow[],
  targetColumn: string,
  columnStats: ColumnStats[]
): MLTask {
  const stats = columnStats.find(s => s.name === targetColumn);
  
  if (!stats) {
    return { type: 'unknown', confidence: 0 };
  }

  const uniqueValues = stats.uniqueCount;
  const totalValues = stats.totalCount - stats.missingCount;

  // Calculate class distribution
  const classDistribution: Record<string, number> = {};
  data.forEach(row => {
    const value = row[targetColumn];
    if (value !== null && value !== undefined) {
      const key = String(value);
      classDistribution[key] = (classDistribution[key] || 0) + 1;
    }
  });

  // Determine task type
  if (stats.type === 'number') {
    // If numeric with many unique values, likely regression
    if (uniqueValues > 20 || uniqueValues / totalValues > 0.1) {
      return {
        type: 'regression',
        targetColumn,
        confidence: 0.85,
        numClasses: uniqueValues
      };
    }
    // Few unique numeric values, could be classification
    return {
      type: 'classification',
      targetColumn,
      confidence: 0.7,
      numClasses: uniqueValues,
      classDistribution
    };
  }

  // String type - classification
  return {
    type: 'classification',
    targetColumn,
    confidence: 0.9,
    numClasses: uniqueValues,
    classDistribution
  };
}

// Validate target column
export function validateTarget(
  data: DataRow[],
  targetColumn: string,
  columnStats: ColumnStats[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const stats = columnStats.find(s => s.name === targetColumn);

  if (!stats) {
    issues.push({
      type: 'error',
      message: `Target column "${targetColumn}" not found`,
      column: targetColumn
    });
    return issues;
  }

  // Check for missing values
  if (stats.missingCount > 0) {
    issues.push({
      type: 'error',
      message: `Target column has ${stats.missingCount} missing values (${stats.missingPercentage.toFixed(1)}%)`,
      column: targetColumn,
      suggestion: 'Remove rows with missing target values'
    });
  }

  // Check for class imbalance (classification)
  if (stats.type !== 'number' || stats.uniqueCount <= 20) {
    const classDistribution: Record<string, number> = {};
    data.forEach(row => {
      const value = row[targetColumn];
      if (value !== null && value !== undefined) {
        const key = String(value);
        classDistribution[key] = (classDistribution[key] || 0) + 1;
      }
    });

    const counts = Object.values(classDistribution);
    const maxCount = Math.max(...counts);
    const minCount = Math.min(...counts);
    const imbalanceRatio = maxCount / minCount;

    if (imbalanceRatio > 10) {
      issues.push({
        type: 'warning',
        message: `Severe class imbalance detected (ratio: ${imbalanceRatio.toFixed(1)}:1)`,
        column: targetColumn,
        suggestion: 'Consider using SMOTE, undersampling, or class weights'
      });
    } else if (imbalanceRatio > 3) {
      issues.push({
        type: 'warning',
        message: `Class imbalance detected (ratio: ${imbalanceRatio.toFixed(1)}:1)`,
        column: targetColumn,
        suggestion: 'Consider using stratified splitting and class weights'
      });
    }
  }

  // Check for very few samples
  if (data.length < 100) {
    issues.push({
      type: 'warning',
      message: `Dataset has only ${data.length} samples`,
      suggestion: 'Consider collecting more data for reliable ML models'
    });
  }

  return issues;
}

// ML Readiness check
export function checkMLReadiness(
  data: DataRow[],
  columns: string[],
  columnStats: ColumnStats[],
  targetColumn?: string
): MLReadinessReport {
  const issues: ValidationIssue[] = [];
  let score = 100;
  
  if (data.length === 0) {
    return {
      score: 0,
      isReady: false,
      issues: [{ type: 'error', message: 'No data provided' }],
      recommendations: ['Upload a dataset'],
      summary: {
        totalFeatures: 0,
        numericFeatures: 0,
        categoricalFeatures: 0,
        missingValues: 0,
        duplicateRows: 0,
        outliers: 0,
        highCardinalityColumns: 0
      }
    };
  }

  // PHASE 1: Detect if data is already processed/cleaned
  const engineeredPatterns = ['_binned', '_lag_', '_rolling_', '_mean', '_sum', '_std', '_min', '_max', '_count', '_diff', '_pct'];
  const hasEngineeredFeatures = columns.some(col => 
    engineeredPatterns.some(pattern => col.includes(pattern))
  );
  
  const numericStats = columnStats.filter(s => s.type === 'number');
  const categoricalStats = columnStats.filter(s => s.type !== 'number');
  
  // Check if most numeric columns are scaled (values in [0,1] or [-3,3] range)
  const scaledCount = numericStats.filter(s => 
    s.min !== undefined && s.max !== undefined && 
    ((s.min >= -0.1 && s.max <= 1.1) || (s.min >= -3.5 && s.max <= 3.5 && s.mean !== undefined && Math.abs(s.mean) < 1))
  ).length;
  const isLikelyScaled = numericStats.length >= 2 && scaledCount / numericStats.length >= 0.7;
  
  // Check for one-hot encoded columns (many binary columns)
  const binaryColumnCount = columnStats.filter(s => 
    s.type === 'number' && s.uniqueCount === 2
  ).length;
  const hasOneHotEncoding = binaryColumnCount >= 5 || (columns.length > 5 && binaryColumnCount / columns.length > 0.3);
  
  // Check if there are NO categorical columns (all encoded)
  const hasNoCategoricals = categoricalStats.length === 0 && columns.length > 3;
  
  // Data is considered PROCESSED if it shows clear signs of preparation
  const isProcessedData = hasEngineeredFeatures || (isLikelyScaled && hasOneHotEncoding) || hasNoCategoricals;
  
  console.log('🔍 ML Readiness Analysis:', {
    totalColumns: columns.length,
    numericColumns: numericStats.length,
    categoricalColumns: categoricalStats.length,
    binaryColumns: binaryColumnCount,
    scaledColumns: scaledCount,
    hasEngineeredFeatures,
    isLikelyScaled,
    hasOneHotEncoding,
    hasNoCategoricals,
    isProcessedData: isProcessedData ? '✅ YES' : '❌ NO'
  });

  // Initialize summary counters
  let totalMissing = 0;
  let duplicates = 0;
  let totalOutliers = 0;
  let highCardinalityCount = 0;

  // PHASE 2: Score based on data state
  if (isProcessedData) {
    // ========== PROCESSED DATA SCORING ==========
    score = 95; // Start high for processed data
    
    console.log('✅ Detected PROCESSED data - applying lenient scoring');
    
    // Only penalize CRITICAL issues in processed data
    columnStats.forEach(stats => {
      // Completely empty columns
      if (stats.missingPercentage === 100) {
        issues.push({
          type: 'error',
          message: `Column "${stats.name}" is completely empty`,
          column: stats.name,
          suggestion: 'Remove this column'
        });
        score -= 15;
      }
      // Very high missing percentage (shouldn't happen in processed data)
      else if (stats.missingPercentage > 50) {
        issues.push({
          type: 'warning',
          message: `Column "${stats.name}" has ${stats.missingPercentage.toFixed(1)}% missing`,
          column: stats.name
        });
        score -= 5;
      }
      
      totalMissing += stats.missingCount;
    });
    
    // Check for severe class imbalance (only if target specified)
    if (targetColumn) {
      const targetStats = columnStats.find(s => s.name === targetColumn);
      if (targetStats && targetStats.type !== 'number') {
        const valueCounts: Record<string, number> = {};
        data.forEach(row => {
          const val = String(row[targetColumn] ?? 'null');
          valueCounts[val] = (valueCounts[val] || 0) + 1;
        });
        
        const counts = Object.values(valueCounts);
        if (counts.length > 1) {
          const maxCount = Math.max(...counts);
          const minCount = Math.min(...counts);
          const ratio = maxCount / minCount;
          
          if (ratio > 20) {
            issues.push({
              type: 'warning',
              message: `Severe class imbalance detected (${ratio.toFixed(1)}:1)`,
              column: targetColumn,
              suggestion: 'Use class weights or resampling'
            });
            score -= 5;
          }
        }
      }
    }
    
    // Add positive feedback for good practices
    if (totalMissing === 0) {
      issues.push({
        type: 'success' as any,
        message: '✓ No missing values - data is clean'
      });
    }
    if (hasOneHotEncoding) {
      issues.push({
        type: 'success' as any,
        message: '✓ Categorical variables are encoded'
      });
    }
    if (isLikelyScaled) {
      issues.push({
        type: 'success' as any,
        message: '✓ Numeric features are scaled'
      });
    }
    if (hasNoCategoricals) {
      issues.push({
        type: 'success' as any,
        message: '✓ All features are numeric (ML-ready)'
      });
    }
    
  } else {
    // ========== RAW DATA SCORING ==========
    console.log('⚠️ Detected RAW data - applying strict scoring');
    
    // Check missing values
    columnStats.forEach(stats => {
      if (stats.name === targetColumn) return;
      totalMissing += stats.missingCount;
      
      if (stats.missingPercentage > 50) {
        issues.push({
          type: 'warning',
          message: `Column "${stats.name}" has ${stats.missingPercentage.toFixed(1)}% missing values`,
          column: stats.name,
          suggestion: 'Drop this column or impute values'
        });
        score -= 5;
      } else if (stats.missingPercentage > 10) {
        issues.push({
          type: 'warning',
          message: `Column "${stats.name}" has ${stats.missingPercentage.toFixed(1)}% missing values`,
          column: stats.name,
          suggestion: 'Impute missing values'
        });
        score -= 3;
      } else if (stats.missingPercentage > 0) {
        score -= 1;
      }
    });

    // Check for duplicates
    const seen = new Set<string>();
    data.forEach(row => {
      const key = columns.map(col => JSON.stringify(row[col])).join('|');
      if (seen.has(key)) {
        duplicates++;
      } else {
        seen.add(key);
      }
    });

    if (duplicates > 0) {
      const dupPercentage = (duplicates / data.length) * 100;
      issues.push({
        type: 'warning',
        message: `Found ${duplicates} duplicate rows (${dupPercentage.toFixed(1)}%)`,
        suggestion: 'Remove duplicates before training'
      });
      score -= Math.min(10, Math.floor(dupPercentage));
    }

    // Check for categorical columns (need encoding)
    columnStats.forEach(stats => {
      if (stats.name === targetColumn) return;
      
      if (stats.type !== 'number') {
        if (stats.uniqueCount > 50) {
          highCardinalityCount++;
          issues.push({
            type: 'warning',
            message: `Column "${stats.name}" has high cardinality (${stats.uniqueCount} categories)`,
            column: stats.name,
            suggestion: 'Apply encoding (frequency, target, or grouping)'
          });
          score -= 4;
        } else if (stats.uniqueCount > 1) {
          issues.push({
            type: 'info',
            message: `Column "${stats.name}" is categorical - needs encoding`,
            column: stats.name,
            suggestion: 'Use one-hot or label encoding'
          });
          score -= 2;
        }
      }
    });

    // Check for unscaled numeric columns
    const unscaledNumericCount = numericStats.filter(s => {
      if (s.name === targetColumn) return false;
      return s.max !== undefined && s.min !== undefined && (s.max - s.min) > 10;
    }).length;
    
    if (unscaledNumericCount > 0) {
      issues.push({
        type: 'info',
        message: `${unscaledNumericCount} numeric column(s) may need scaling`,
        suggestion: 'Apply standardization or min-max scaling'
      });
      score -= Math.min(10, unscaledNumericCount * 2);
    }

    // Check for outliers
    columnStats.forEach(stats => {
      if (stats.type === 'number' && stats.name !== targetColumn && stats.q1 !== undefined && stats.q3 !== undefined) {
        const iqr = stats.q3 - stats.q1;
        const lowerBound = stats.q1 - 1.5 * iqr;
        const upperBound = stats.q3 + 1.5 * iqr;
        
        let outliers = 0;
        data.forEach(row => {
          const value = row[stats.name];
          if (typeof value === 'number' && (value < lowerBound || value > upperBound)) {
            outliers++;
          }
        });
        
        if (outliers > data.length * 0.1) {
          issues.push({
            type: 'info',
            message: `Column "${stats.name}" has ${outliers} outliers (${(outliers / data.length * 100).toFixed(1)}%)`,
            column: stats.name,
            suggestion: 'Consider capping or removing outliers'
          });
          score -= 2;
        }
        
        totalOutliers += outliers;
      }
    });

    // Check for constant columns
    columnStats.forEach(stats => {
      if (stats.uniqueCount <= 1) {
        issues.push({
          type: 'warning',
          message: `Column "${stats.name}" has only ${stats.uniqueCount} unique value`,
          column: stats.name,
          suggestion: 'Remove this column'
        });
        score -= 5;
      }
    });

    // Target validation
    if (targetColumn) {
      const targetIssues = validateTarget(data, targetColumn, columnStats);
      issues.push(...targetIssues);
      score -= targetIssues.filter(i => i.type === 'error').length * 15;
      score -= targetIssues.filter(i => i.type === 'warning').length * 5;
    }

    // Check dataset size
    if (data.length < 100) {
      issues.push({
        type: 'warning',
        message: `Small dataset (${data.length} rows)`,
        suggestion: 'More data will improve model performance'
      });
      score -= 5;
    }
  }

  // Final score bounds
  score = Math.max(0, Math.min(100, score));

  const numericFeatures = columnStats.filter(s => s.type === 'number' && s.name !== targetColumn).length;
  const categoricalFeatures = columnStats.filter(s => s.type !== 'number' && s.name !== targetColumn).length;
  
  const hasErrors = issues.some(i => i.type === 'error');
  const isReady = !hasErrors && score >= 70;

  const recommendations = issues
    .filter(i => i.suggestion)
    .map(i => i.suggestion!)
    .filter((v, i, a) => a.indexOf(v) === i) // unique
    .slice(0, 5);

  console.log('📊 Final ML Readiness:', {
    score: `${score}%`,
    isReady,
    issuesCount: issues.length,
    dataState: isProcessedData ? 'PROCESSED' : 'RAW'
  });

  return {
    score,
    isReady,
    issues,
    recommendations,
    summary: {
      totalFeatures: columns.length - (targetColumn ? 1 : 0),
      numericFeatures,
      categoricalFeatures,
      missingValues: totalMissing,
      duplicateRows: duplicates,
      outliers: totalOutliers,
      highCardinalityColumns: highCardinalityCount
    }
  };
}

// Handle class imbalance
export function handleImbalance(
  data: DataRow[],
  targetColumn: string,
  method: 'oversample' | 'undersample' | 'smote',
  targetRatio: number = 1.0,
  seed: number = 42
): { data: DataRow[]; log: CleaningLog } {
  // Calculate class distribution
  const classCounts: Record<string, DataRow[]> = {};
  data.forEach(row => {
    const key = String(row[targetColumn] ?? 'null');
    if (!classCounts[key]) classCounts[key] = [];
    classCounts[key].push(row);
  });

  const classes = Object.keys(classCounts);
  const counts = classes.map(c => classCounts[c].length);
  const maxCount = Math.max(...counts);
  const minCount = Math.min(...counts);
  const minorityClass = classes[counts.indexOf(minCount)];

  let resultData: DataRow[] = [];
  let details = '';

  // Seeded random
  const seededRandom = (s: number) => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };

  if (method === 'oversample') {
    // Oversample minority classes
    const targetCount = Math.floor(maxCount * targetRatio);
    
    classes.forEach(cls => {
      const samples = classCounts[cls];
      if (samples.length >= targetCount) {
        resultData.push(...samples);
      } else {
        // Add original samples
        resultData.push(...samples);
        // Duplicate random samples
        let currentSeed = seed;
        while (resultData.filter(r => String(r[targetColumn]) === cls).length < targetCount) {
          const idx = Math.floor(seededRandom(currentSeed++) * samples.length);
          resultData.push({ ...samples[idx] });
        }
      }
    });
    
    details = `Oversampled minority classes to ${targetCount} samples each`;
  } else if (method === 'undersample') {
    // Undersample majority class
    const targetCount = Math.floor(minCount * targetRatio);
    
    classes.forEach(cls => {
      const samples = classCounts[cls];
      if (samples.length <= targetCount) {
        resultData.push(...samples);
      } else {
        // Random sample
        const shuffled = [...samples];
        let currentSeed = seed;
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(seededRandom(currentSeed++) * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        resultData.push(...shuffled.slice(0, targetCount));
      }
    });
    
    details = `Undersampled to ${targetCount} samples per class`;
  } else if (method === 'smote') {
    // Simplified SMOTE: interpolate between minority class samples
    resultData.push(...data);
    
    const minoritySamples = classCounts[minorityClass];
    const numericColumns = Object.keys(data[0]).filter(col => 
      col !== targetColumn && typeof data[0][col] === 'number'
    );
    
    const numToGenerate = maxCount - minCount;
    let currentSeed = seed;
    
    for (let i = 0; i < numToGenerate; i++) {
      // Pick random minority sample
      const idx1 = Math.floor(seededRandom(currentSeed++) * minoritySamples.length);
      const idx2 = Math.floor(seededRandom(currentSeed++) * minoritySamples.length);
      const sample1 = minoritySamples[idx1];
      const sample2 = minoritySamples[idx2];
      
      // Interpolate
      const newSample: DataRow = { ...sample1 };
      const alpha = seededRandom(currentSeed++);
      
      numericColumns.forEach(col => {
        const v1 = sample1[col];
        const v2 = sample2[col];
        if (typeof v1 === 'number' && typeof v2 === 'number') {
          newSample[col] = v1 + alpha * (v2 - v1);
        }
      });
      
      resultData.push(newSample);
    }
    
    details = `Generated ${numToGenerate} synthetic samples using SMOTE for class "${minorityClass}"`;
  }

  return {
    data: resultData,
    log: {
      operation: 'Handle Class Imbalance',
      details,
      rowsAffected: resultData.length - data.length,
      timestamp: new Date(),
      category: 'transformation'
    }
  };
}

// Generate recommendations
export function generateRecommendations(
  report: MLReadinessReport,
  mlTask: MLTask
): string[] {
  const recommendations: string[] = [];

  if (report.summary.missingValues > 0) {
    recommendations.push('Handle missing values using imputation or removal based on the percentage and importance of affected columns.');
  }

  if (report.summary.duplicateRows > 0) {
    recommendations.push('Remove duplicate rows to prevent data leakage and improve model generalization.');
  }

  if (report.summary.highCardinalityColumns > 0) {
    recommendations.push('Use frequency encoding or target encoding for high-cardinality categorical features instead of one-hot encoding.');
  }

  if (report.summary.outliers > report.summary.totalFeatures * 10) {
    recommendations.push('Consider outlier treatment (capping, removal, or transformation) for numeric features with many outliers.');
  }

  if (mlTask.type === 'classification' && mlTask.classDistribution) {
    const counts = Object.values(mlTask.classDistribution);
    const ratio = Math.max(...counts) / Math.min(...counts);
    if (ratio > 3) {
      recommendations.push('Use class weights, SMOTE, or stratified sampling to handle class imbalance.');
    }
  }

  if (report.summary.numericFeatures > 5) {
    recommendations.push('Apply feature scaling (StandardScaler or MinMaxScaler) for numeric features before training.');
  }

  if (report.summary.categoricalFeatures > 3) {
    recommendations.push('Encode categorical features appropriately - use target encoding for high-cardinality features.');
  }

  if (mlTask.type === 'regression') {
    recommendations.push('Consider log transformation for skewed target variables.');
    recommendations.push('Check for multicollinearity between features using correlation analysis.');
  }

  if (!report.isReady) {
    recommendations.unshift('⚠️ Dataset is not ML-ready. Address critical issues before proceeding.');
  }

  return recommendations;
}
