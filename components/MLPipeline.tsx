import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DataRow, ColumnStats, CleaningLog } from '@/types/dataset';
import { 
  Wand2, Target, Layers, Binary, MapPin, AlertTriangle, 
  Scale, CheckCircle2, FileDown, ChevronDown, ChevronUp,
  Brain, Sparkles, LineChart, Database, Loader2, Gauge, RefreshCw, Zap
} from 'lucide-react';

// Import utilities
import { 
  removeDuplicates, 
  removeNearDuplicates,
  handleMissingValues, 
  trimWhitespace, 
  standardizeCase,
  normalizeColumnNames,
  removeOutliers,
  dropHighMissingColumns,
  removeLowVarianceFeatures,
  cleanNaNValues,
  removeAllNullColumns
} from '@/utils/dataCleaner';
import { oneHotEncode, labelEncode, frequencyEncode, targetEncode, binaryEncode } from '@/utils/encoders';
import { extractTimeFeatures, createRollingFeatures, createLagFeatures, createPolynomialFeatures, binNumericFeature } from '@/utils/featureEngineering';
import { gridEncode, geoCluster, hexEncode } from '@/utils/geoFeatures';
import { standardScale, minMaxScale, robustScale, logTransform, sqrtTransform } from '@/utils/scalers';
import { checkMLReadiness } from '@/utils/mlReadiness';
import { generateAuditReport, generateTextReport, generatePipelineConfig, exportPipelineJSON } from '@/utils/auditReport';
import { analyzeColumns } from '@/utils/dataAnalyzer';
import { trainLinearRegression, trainLogisticRegression, trainDecisionTree, autoTrainBaseline } from '@/utils/baselineModel';

interface MLPipelineProps {
  data: DataRow[];
  columns: string[];
  columnStats: ColumnStats[];
  onApplyPipeline: (processedData: DataRow[], logs: CleaningLog[]) => void;
}

export function MLPipeline({ data, columns, columnStats, onApplyPipeline }: MLPipelineProps) {
  const [targetColumn, setTargetColumn] = useState<string>('');
  const [expandedSections, setExpandedSections] = useState<string[]>(['target', 'cleaning']);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Cleaning config
  const [cleaningConfig, setCleaningConfig] = useState({
    removeDuplicates: true,
    removeNearDuplicates: false,
    nearDuplicateTolerance: 0.95,
    handleMissing: true,
    missingStrategy: 'remove' as 'remove' | 'mean' | 'median' | 'mode' | 'forward' | 'backward' | 'constant',
    missingThreshold: 0.5, // Remove rows only if >50% of values are missing
    missingConstant: '',
    trimWhitespace: true,
    standardizeCase: false,
    caseType: 'lower' as 'lower' | 'upper' | 'title',
    normalizeColumnNames: true,
    removeHighMissing: false,
    highMissingThreshold: 0.5,
    removeLowVariance: false,
    lowVarianceThreshold: 0.01,
  });

  // Outlier config
  const [outlierConfig, setOutlierConfig] = useState({
    enabled: false,
    method: 'iqr' as 'iqr' | 'zscore' | 'percentile',
    treatment: 'cap' as 'cap' | 'remove' | 'replace' | 'flag',
    threshold: 1.5,
    replacement: 'median' as 'mean' | 'median',
  });

  // Encoding config
  const [encodingConfig, setEncodingConfig] = useState({
    enabled: false,
    method: 'onehot' as 'onehot' | 'label' | 'frequency' | 'target' | 'binary',
    selectedColumns: [] as string[],
    maxCategories: 10,
  });

  // Feature engineering config
  const [featureConfig, setFeatureConfig] = useState({
    timeFeatures: false,
    timeColumn: '',
    rollingFeatures: false,
    rollingColumn: '',
    rollingWindows: [3, 7],
    lagFeatures: false,
    lagColumn: '',
    lagPeriods: [1, 2, 3],
    polynomialFeatures: false,
    polynomialColumns: [] as string[],
    polynomialDegree: 2,
    binning: false,
    binColumn: '',
    binCount: 5,
    binMethod: 'equal' as 'equal' | 'quantile',
  });

  // Geo config
  const [geoConfig, setGeoConfig] = useState({
    enabled: false,
    latColumn: '',
    lonColumn: '',
    method: 'grid' as 'grid' | 'cluster' | 'hex',
    gridSize: 0.1,
    numClusters: 5,
    hexResolution: 7,
  });

  // Scaling config
  const [scalingConfig, setScalingConfig] = useState({
    enabled: false,
    method: 'standard' as 'standard' | 'minmax' | 'robust',
    selectedColumns: [] as string[],
    transform: 'none' as 'none' | 'log' | 'sqrt' | 'boxcox',
  });

  // Imbalance handling config
  const [imbalanceConfig, setImbalanceConfig] = useState({
    enabled: false,
    method: 'smote' as 'smote' | 'oversample' | 'undersample',
    targetRatio: 1.0,
    k: 5,
  });

  // Baseline model config
  const [modelConfig, setModelConfig] = useState({
    enabled: false,
    autoSelect: true,
    modelType: 'auto' as 'auto' | 'linear' | 'logistic' | 'tree',
  });

  // Results state
  const [mlReadinessScore, setMlReadinessScore] = useState<number | null>(null);
  const [mlReadinessReport, setMlReadinessReport] = useState<any>(null);
  const [pipelineLogs, setPipelineLogs] = useState<CleaningLog[]>([]);
  const [baselineModel, setBaselineModel] = useState<any>(null);
  
  // Loading states
  const [isCheckingReadiness, setIsCheckingReadiness] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isAutoPreparing, setIsAutoPreparing] = useState(false);
  const [autoPrepareApplied, setAutoPrepareApplied] = useState(false);
  const [pipelineApplied, setPipelineApplied] = useState(false);

  // Apply the ML pipeline
  const handleApplyPipeline = useCallback(async () => {
    if (data.length === 0) return;
    
    setIsProcessing(true);
    const logs: CleaningLog[] = [];
    
    // Helper to yield to the browser to prevent UI freezing
    // This allows React to update the UI and keep the page responsive
    // Increased timeout to 10ms for better UI responsiveness
    const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 10));
    
    try {
      let processedData = [...data];
      let currentColumns = [...columns];
      let currentStats = columnStats;
      
      // Yield to browser to show loading state
      await yieldToMain();

        // 1. Cleaning operations
        if (cleaningConfig.trimWhitespace) {
          const result = trimWhitespace(processedData, currentColumns);
          processedData = result.data;
          logs.push(...result.logs);
          await yieldToMain();
        }

        if (cleaningConfig.normalizeColumnNames) {
          const result = normalizeColumnNames(currentColumns);
          // Apply the mapping to rename columns in the data
          processedData = processedData.map(row => {
            const newRow: DataRow = {};
            Object.entries(row).forEach(([key, value]) => {
              newRow[result.mapping[key] || key] = value;
            });
            return newRow;
          });
          currentColumns = result.columns;
          logs.push(result.log);
          await yieldToMain();
        }

        if (cleaningConfig.standardizeCase) {
          const result = standardizeCase(processedData, currentColumns, cleaningConfig.caseType);
          processedData = result.data;
          logs.push(...result.logs);
          await yieldToMain();
        }

        if (cleaningConfig.removeDuplicates) {
          const result = removeDuplicates(processedData, currentColumns);
          processedData = result.data;
          logs.push(...result.logs);
          await yieldToMain();
        }

        if (cleaningConfig.removeNearDuplicates) {
          await yieldToMain(); // Yield before expensive operation
          const result = removeNearDuplicates(processedData, currentColumns, cleaningConfig.nearDuplicateTolerance);
          processedData = result.data;
          logs.push(...result.logs);
          await yieldToMain();
        }

        if (cleaningConfig.removeHighMissing) {
          await yieldToMain();
          currentStats = analyzeColumns(processedData, currentColumns);
          await yieldToMain();
          const result = dropHighMissingColumns(processedData, currentColumns, currentStats, cleaningConfig.highMissingThreshold * 100);
          processedData = result.data;
          currentColumns = result.columns;
          logs.push(...result.logs);
          await yieldToMain();
        }

        if (cleaningConfig.handleMissing) {
          await yieldToMain();
          currentStats = analyzeColumns(processedData, currentColumns);
          await yieldToMain();
          console.log('ML Pipeline: Handling missing values, rows before:', processedData.length);
          // Use configured threshold for 'remove' strategy
          const threshold = cleaningConfig.missingStrategy === 'remove' ? cleaningConfig.missingThreshold : undefined;
          const result = handleMissingValues(processedData, currentColumns, currentStats, cleaningConfig.missingStrategy, cleaningConfig.missingConstant || undefined, threshold);
          processedData = result.data;
          logs.push(...result.logs);
          console.log('ML Pipeline: After handling missing, rows:', processedData.length);
          await yieldToMain();
        }

        if (cleaningConfig.removeLowVariance) {
          await yieldToMain();
          currentStats = analyzeColumns(processedData, currentColumns);
          await yieldToMain();
          const result = removeLowVarianceFeatures(processedData, currentColumns, currentStats, cleaningConfig.lowVarianceThreshold);
          processedData = result.data;
          currentColumns = result.columns;
          logs.push(...result.logs);
          await yieldToMain();
        }

        // Yield to prevent UI blocking
        await yieldToMain();

        // 2. Outlier handling
        if (outlierConfig.enabled) {
          currentStats = analyzeColumns(processedData, currentColumns);
          const result = removeOutliers(
            processedData, 
            currentColumns, 
            currentStats, 
            outlierConfig.method,
            outlierConfig.treatment,
            outlierConfig.threshold
          );
          processedData = result.data;
          logs.push(...result.logs);
        }

        // Yield to prevent UI blocking
        await yieldToMain();

        // 3. Feature Engineering
        if (featureConfig.timeFeatures && featureConfig.timeColumn) {
          const result = extractTimeFeatures(processedData, featureConfig.timeColumn, ['hour', 'day', 'weekday', 'month', 'year']);
          processedData = result.data;
          currentColumns = processedData.length > 0 ? Object.keys(processedData[0]) : currentColumns;
          logs.push(result.log);
          await yieldToMain();
        }

        if (featureConfig.rollingFeatures && featureConfig.rollingColumn) {
          const result = createRollingFeatures(processedData, featureConfig.rollingColumn, featureConfig.rollingWindows, ['mean', 'std']);
          processedData = result.data;
          currentColumns = processedData.length > 0 ? Object.keys(processedData[0]) : currentColumns;
          logs.push(result.log);
          await yieldToMain();
        }

        if (featureConfig.lagFeatures && featureConfig.lagColumn) {
          const result = createLagFeatures(processedData, featureConfig.lagColumn, featureConfig.lagPeriods);
          processedData = result.data;
          currentColumns = processedData.length > 0 ? Object.keys(processedData[0]) : currentColumns;
          logs.push(result.log);
          await yieldToMain();
        }

        if (featureConfig.polynomialFeatures && featureConfig.polynomialColumns.length > 0) {
          const result = createPolynomialFeatures(processedData, featureConfig.polynomialColumns, featureConfig.polynomialDegree);
          processedData = result.data;
          currentColumns = processedData.length > 0 ? Object.keys(processedData[0]) : currentColumns;
          logs.push(result.log);
          await yieldToMain();
        }

        if (featureConfig.binning && featureConfig.binColumn) {
          const result = binNumericFeature(
            processedData, 
            featureConfig.binColumn, 
            featureConfig.binMethod === 'quantile' ? 'quantile' : 'uniform',
            featureConfig.binCount
          );
          processedData = result.data;
          currentColumns = processedData.length > 0 ? Object.keys(processedData[0]) : currentColumns;
          logs.push(result.log);
          await yieldToMain();
        }

        // Yield to prevent UI blocking
        await yieldToMain();

        // 4. Geo Features
        if (geoConfig.enabled && geoConfig.latColumn && geoConfig.lonColumn) {
          if (geoConfig.method === 'grid') {
            const result = gridEncode(processedData, geoConfig.latColumn, geoConfig.lonColumn, geoConfig.gridSize);
            processedData = result.data;
            logs.push(result.log);
          } else if (geoConfig.method === 'cluster') {
            const result = geoCluster(processedData, geoConfig.latColumn, geoConfig.lonColumn, geoConfig.numClusters);
            processedData = result.data;
            logs.push(result.log);
          } else if (geoConfig.method === 'hex') {
            const result = hexEncode(processedData, geoConfig.latColumn, geoConfig.lonColumn, geoConfig.hexResolution);
            processedData = result.data;
            logs.push(result.log);
          }
          currentColumns = processedData.length > 0 ? Object.keys(processedData[0]) : currentColumns;
        }

        // Yield to prevent UI blocking
        await yieldToMain();

        // 5. Categorical Encoding
        if (encodingConfig.enabled && encodingConfig.selectedColumns.length > 0) {
          for (const col of encodingConfig.selectedColumns) {
            await yieldToMain(); // Yield before each column encoding
            let result;
            switch (encodingConfig.method) {
              case 'onehot':
                result = oneHotEncode(processedData, col, false);
                break;
              case 'label':
                result = labelEncode(processedData, col);
                break;
              case 'frequency':
                result = frequencyEncode(processedData, col);
                break;
              case 'target':
                if (targetColumn) {
                  result = targetEncode(processedData, col, targetColumn);
                }
                break;
              case 'binary':
                result = binaryEncode(processedData, col);
                break;
            }
            if (result) {
              processedData = result.data;
              logs.push(result.log);
            }
          }
          currentColumns = processedData.length > 0 ? Object.keys(processedData[0]) : currentColumns;
        }

        // Yield to prevent UI blocking
        await yieldToMain();

        // 6. Scaling
        if (scalingConfig.enabled && scalingConfig.selectedColumns.length > 0) {
          // Apply transforms first
          if (scalingConfig.transform === 'log') {
            const result = logTransform(processedData, scalingConfig.selectedColumns);
            processedData = result.data;
            logs.push(result.log);
            await yieldToMain();
          } else if (scalingConfig.transform === 'sqrt') {
            const result = sqrtTransform(processedData, scalingConfig.selectedColumns);
            processedData = result.data;
            logs.push(result.log);
            await yieldToMain();
          }

          // Apply scaling
          let scaleResult;
          switch (scalingConfig.method) {
            case 'standard':
              scaleResult = standardScale(processedData, scalingConfig.selectedColumns);
              break;
            case 'minmax':
              scaleResult = minMaxScale(processedData, scalingConfig.selectedColumns);
              break;
            case 'robust':
              scaleResult = robustScale(processedData, scalingConfig.selectedColumns);
              break;
          }
          if (scaleResult) {
            processedData = scaleResult.data;
            logs.push(scaleResult.log);
            await yieldToMain();
          }
        }

        // Yield to prevent UI blocking
        await yieldToMain();

        // Train baseline model if enabled
        if (modelConfig.enabled && targetColumn) {
          console.log('🚀 Starting baseline model training...', { enabled: modelConfig.enabled, targetColumn });
          try {
            // Recalculate stats for the processed data to get accurate column info
            await yieldToMain();
            currentStats = analyzeColumns(processedData, currentColumns);
            await yieldToMain();
            
            const numericColumns = currentColumns.filter(col => {
              if (col === targetColumn) return false;
              const stats = currentStats.find(s => s.name === col);
              return stats && stats.type === 'number';
            });

            console.log('🎯 Baseline Model Training:', {
              totalColumns: currentColumns.length,
              numericColumns: numericColumns.length,
              targetColumn,
              columnsToUse: numericColumns.slice(0, 5)
            });

            if (numericColumns.length > 0) {
              let model;
              
              if (modelConfig.autoSelect) {
                await yieldToMain(); // Yield before model training
                const result = autoTrainBaseline(processedData, numericColumns, targetColumn);
                model = result.model;
                logs.push(result.log);
                await yieldToMain();
              } else {
                const targetStats = currentStats.find(s => s.name === targetColumn);
                const isClassification = targetStats && targetStats.type !== 'number';
                
                await yieldToMain(); // Yield before model training
                if (modelConfig.modelType === 'linear' && !isClassification) {
                  model = trainLinearRegression(processedData, numericColumns, targetColumn);
                } else if (modelConfig.modelType === 'logistic' && isClassification) {
                  model = trainLogisticRegression(processedData, numericColumns, targetColumn);
                } else if (modelConfig.modelType === 'tree') {
                  model = trainDecisionTree(processedData, numericColumns, targetColumn);
                } else {
                  const result = autoTrainBaseline(processedData, numericColumns, targetColumn);
                  model = result.model;
                  logs.push(result.log);
                }
                
                if (model && 'type' in model) {
                  logs.push({
                    operation: 'Baseline Model',
                    details: `Trained ${model.type} model`,
                    rowsAffected: processedData.length,
                    timestamp: new Date(),
                    category: 'model'
                  });
                }
              }
              
              console.log('✅ Model trained successfully:', model);
              setBaselineModel(model);
              console.log('✅ Baseline model state updated');
            } else {
              console.warn('⚠️ No numeric features available for model training');
              setBaselineModel(null);
              logs.push({
                operation: 'Baseline Model',
                details: 'No numeric features available for training',
                rowsAffected: 0,
                timestamp: new Date(),
                category: 'model'
              });
            }
          } catch (error) {
            console.error('Model training error:', error);
            logs.push({
              operation: 'Baseline Model Error',
              details: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
              rowsAffected: 0,
              timestamp: new Date(),
              category: 'model'
            });
          }
        }

        // Final step: Clean any NaN values that might have been generated
        await yieldToMain();
        const nanCleanResult = cleanNaNValues(processedData, currentColumns);
        processedData = nanCleanResult.data;
        logs.push(...nanCleanResult.logs);

        // Remove columns that are entirely null (created by feature engineering with insufficient data)
        await yieldToMain();
        const nullColumnResult = removeAllNullColumns(processedData, 1.0); // Remove only 100% null columns
        processedData = nullColumnResult.data;
        currentColumns = nullColumnResult.columns;
        logs.push(...nullColumnResult.logs);

        console.log('🎉 Pipeline complete! Final data:', processedData.length, 'rows');
        console.log('Sample final data:', processedData.slice(0, 3));
        console.log('Final columns:', currentColumns);

        setPipelineLogs(logs);
        onApplyPipeline(processedData, logs);
        setPipelineApplied(true);
        
      } catch (error) {
        console.error('Pipeline error:', error);
        logs.push({
          operation: 'Pipeline Error',
          details: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          rowsAffected: 0,
          timestamp: new Date(),
          category: 'cleaning'
        });
      } finally {
        setIsProcessing(false);
      }
  }, [data, columns, columnStats, cleaningConfig, outlierConfig, featureConfig, geoConfig, encodingConfig, scalingConfig, targetColumn, onApplyPipeline, modelConfig]);

  // Check ML Readiness
  const handleCheckReadiness = useCallback(() => {
    if (data.length === 0) return;
    
    setIsCheckingReadiness(true);
    
    // Use setTimeout to show loading state
    setTimeout(() => {
      const report = checkMLReadiness(data, columns, columnStats, targetColumn || undefined);
      setMlReadinessScore(report.score);
      setMlReadinessReport(report);
      setIsCheckingReadiness(false);
    }, 100);
  }, [data, columns, columnStats, targetColumn]);

  // Only calculate ML readiness after pipeline is applied
  useEffect(() => {
    if (pipelineApplied && data.length > 0) {
      handleCheckReadiness();
    } else {
      setMlReadinessScore(null);
      setMlReadinessReport(null);
    }
  }, [data, pipelineApplied, handleCheckReadiness]);

  // Export Report
  const handleExportReport = useCallback(() => {
    if (data.length === 0) return;

    setIsExporting(true);

    setTimeout(() => {
      // Generate audit report
      const report = generateAuditReport(
        data,
        data, // Use same data if no processing done yet
        pipelineLogs,
        targetColumn || undefined,
        undefined
      );

      // Generate text report
      const textReport = generateTextReport(report);

      // Generate pipeline config
      const pipelineConfig = generatePipelineConfig(
        pipelineLogs,
        targetColumn || undefined,
        undefined,
        scalingConfig.enabled ? scalingConfig : undefined
      );

      // Create download for text report
      const blob = new Blob([textReport], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ml_pipeline_report_${new Date().toISOString().split('T')[0]}.txt`;
      a.click();
      URL.revokeObjectURL(url);

      // Also download pipeline config as JSON
      setTimeout(() => {
        const jsonBlob = new Blob([exportPipelineJSON(pipelineConfig)], { type: 'application/json' });
        const jsonUrl = URL.createObjectURL(jsonBlob);
        const jsonLink = document.createElement('a');
        jsonLink.href = jsonUrl;
        jsonLink.download = `ml_pipeline_config_${new Date().toISOString().split('T')[0]}.json`;
        jsonLink.click();
        URL.revokeObjectURL(jsonUrl);
        setIsExporting(false);
      }, 500);
    }, 100);
  }, [data, pipelineLogs, targetColumn, scalingConfig]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => 
      prev.includes(section) 
        ? prev.filter(s => s !== section)
        : [...prev, section]
    );
  };

  const numericColumns = columnStats.filter(c => c.type === 'number').map(c => c.name);
  const categoricalColumns = columnStats.filter(c => c.type === 'string').map(c => c.name);

  // Auto-Prepare for ML - automatically configure all settings
  const handleAutoPrepare = useCallback(() => {
    console.log('Auto-Prepare clicked');
    console.log('Data length:', data.length);
    console.log('Column stats:', columnStats);
    console.log('Numeric columns:', numericColumns);
    console.log('Categorical columns:', categoricalColumns);
    
    if (data.length === 0) {
      console.log('No data, returning early');
      return;
    }

    setIsAutoPreparing(true);

    // Use setTimeout to allow loading state to show
    setTimeout(() => {
      // Detect potential ID columns (unique values close to row count, or names containing 'id')
      const potentialIdColumns = columnStats.filter(s => {
        const isHighlyUnique = s.uniqueCount > data.length * 0.9;
        const hasIdInName = s.name.toLowerCase().includes('id') || 
                            s.name.toLowerCase().includes('index') ||
                            s.name.toLowerCase().includes('key');
        return isHighlyUnique || hasIdInName;
      }).map(s => s.name);
      
      console.log('Potential ID columns:', potentialIdColumns);

      // Get columns to encode (categorical, excluding target and IDs)
      const columnsToEncode = categoricalColumns.filter(
        col => col !== targetColumn && !potentialIdColumns.includes(col)
      );
      console.log('Columns to encode:', columnsToEncode);

      // Get columns to scale (numeric, excluding target and IDs)
      const columnsToScale = numericColumns.filter(
        col => col !== targetColumn && !potentialIdColumns.includes(col)
      );
      console.log('Columns to scale:', columnsToScale);

      // Auto-configure cleaning settings
      console.log('Setting cleaning config...');
      setCleaningConfig({
        removeDuplicates: true,
        removeNearDuplicates: false,
        nearDuplicateTolerance: 0.95,
        handleMissing: true,
        missingStrategy: 'median',
        missingThreshold: 0.5,
        missingConstant: '',
        trimWhitespace: true,
        standardizeCase: false,
        caseType: 'lower',
        normalizeColumnNames: true,
        removeHighMissing: true,
        highMissingThreshold: 0.5,
        removeLowVariance: true,
        lowVarianceThreshold: 0.01,
      });

      // Auto-configure outlier handling
      console.log('Setting outlier config...');
      setOutlierConfig({
        enabled: true,
        method: 'iqr',
        treatment: 'cap',
        threshold: 1.5,
        replacement: 'median',
      });

      // Auto-configure encoding for all categorical columns
      console.log('Setting encoding config, columnsToEncode:', columnsToEncode);
      setEncodingConfig({
        enabled: columnsToEncode.length > 0,
        method: columnsToEncode.some(col => {
          const stat = columnStats.find(s => s.name === col);
          return stat && stat.uniqueCount > 10;
        }) ? 'label' : 'onehot',
        selectedColumns: columnsToEncode,
        maxCategories: 10,
      });

      // Auto-configure scaling for all numeric columns
      console.log('Setting scaling config, columnsToScale:', columnsToScale);
      setScalingConfig({
        enabled: columnsToScale.length > 0,
        method: 'standard',
        selectedColumns: columnsToScale,
        transform: 'none',
      });

      // Mark as applied
      setAutoPrepareApplied(true);
      setIsAutoPreparing(false);
      
      console.log('Auto-prepare complete!');

      // Don't recalculate readiness - data hasn't changed yet
      // User needs to click "Apply Pipeline" to actually process the data
    }, 300);

  }, [data, columnStats, categoricalColumns, numericColumns, targetColumn, handleCheckReadiness]);

  const getColumnBadgeVariant = (colName: string): 'default' | 'secondary' | 'outline' => {
    const stat = columnStats.find(s => s.name === colName);
    if (stat?.type === 'number') return 'default';
    if (stat?.type === 'string') return 'secondary';
    return 'outline';
  };

  const SectionHeader = ({ 
    id, 
    icon: Icon, 
    title, 
    description,
    isExpanded 
  }: { 
    id: string; 
    icon: any; 
    title: string; 
    description: string;
    isExpanded: boolean;
  }) => (
    <CollapsibleTrigger 
      className="flex items-center justify-between w-full p-4 hover:bg-muted/50 rounded-lg transition-colors"
      onClick={() => toggleSection(id)}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div className="text-left">
          <h3 className="font-semibold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
    </CollapsibleTrigger>
  );

  return (
    <div className="space-y-4">
      <Card className="border-2 border-primary/20 shadow-elevated">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-glow">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl">ML Data Pipeline</CardTitle>
              <CardDescription>Configure your complete ML-ready dataset preparation</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          
          {/* Auto-Prepare Button */}
          <div className={`p-4 rounded-xl border-2 transition-all duration-300 ${
            autoPrepareApplied 
              ? 'bg-gradient-to-r from-green-500/10 via-green-400/10 to-green-500/10 border-green-500/50' 
              : 'bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 border-primary/30'
          }`}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-glow ${
                  autoPrepareApplied 
                    ? 'bg-gradient-to-br from-green-500 to-green-600' 
                    : 'bg-gradient-to-br from-primary to-accent'
                }`}>
                  {autoPrepareApplied ? (
                    <CheckCircle2 className="w-6 h-6 text-white" />
                  ) : (
                    <Zap className="w-6 h-6 text-white" />
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">
                    {autoPrepareApplied ? 'Auto-Prepare Applied!' : 'Auto-Prepare for ML'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {autoPrepareApplied 
                      ? '✓ Settings configured! Now click "Apply Pipeline" below to process your data and improve the ML Readiness Score.'
                      : 'Automatically configure all settings to make your data ML-ready'
                    }
                  </p>
                </div>
              </div>
              <Button 
                onClick={handleAutoPrepare}
                className={`gap-2 hover:opacity-90 shadow-glow ${
                  autoPrepareApplied 
                    ? 'bg-gradient-to-r from-green-500 to-green-600' 
                    : 'bg-gradient-to-r from-primary to-accent'
                }`}
                disabled={data.length === 0 || isAutoPreparing}
              >
                {isAutoPreparing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}
                {isAutoPreparing ? 'Preparing...' : (autoPrepareApplied ? 'Re-apply' : 'Auto-Prepare')}
              </Button>
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              <p className="flex flex-wrap gap-x-4 gap-y-1">
                <span className={autoPrepareApplied ? 'text-green-600' : ''}>✓ Remove duplicates & missing values</span>
                <span className={autoPrepareApplied ? 'text-green-600' : ''}>✓ Handle outliers (IQR capping)</span>
                <span className={autoPrepareApplied ? 'text-green-600' : ''}>✓ Encode all categorical columns</span>
                <span className={autoPrepareApplied ? 'text-green-600' : ''}>✓ Scale all numeric columns</span>
                <span className={autoPrepareApplied ? 'text-green-600' : ''}>✓ Drop low-variance features</span>
              </p>
            </div>
          </div>

          {/* ML Readiness Score */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-muted/50 to-muted/30 border">
            {!pipelineApplied ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="rounded-full bg-muted p-4 mb-3">
                  <Brain className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="font-medium text-foreground mb-1">ML Readiness Locked</p>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Apply the pipeline below to check ML readiness
                </p>
              </div>
            ) : (
            <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  mlReadinessScore === null ? 'bg-muted' :
                  mlReadinessScore >= 80 ? 'bg-green-500/20' :
                  mlReadinessScore >= 60 ? 'bg-yellow-500/20' :
                  mlReadinessScore >= 40 ? 'bg-orange-500/20' : 'bg-red-500/20'
                }`}>
                  <Gauge className={`w-6 h-6 ${
                    mlReadinessScore === null ? 'text-muted-foreground' :
                    mlReadinessScore >= 80 ? 'text-green-500' :
                    mlReadinessScore >= 60 ? 'text-yellow-500' :
                    mlReadinessScore >= 40 ? 'text-orange-500' : 'text-red-500'
                  }`} />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">ML Readiness Score</p>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-3xl font-bold ${
                      mlReadinessScore === null ? 'text-muted-foreground' :
                      mlReadinessScore >= 80 ? 'text-green-500' :
                      mlReadinessScore >= 60 ? 'text-yellow-500' :
                      mlReadinessScore >= 40 ? 'text-orange-500' : 'text-red-500'
                    }`}>
                      {mlReadinessScore !== null ? `${Math.round(mlReadinessScore)}%` : '—'}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {mlReadinessScore === null ? 'Not calculated' :
                       mlReadinessScore >= 80 ? 'Ready for training' :
                       mlReadinessScore >= 60 ? 'Needs minor fixes' :
                       mlReadinessScore >= 40 ? 'Needs attention' : 'Needs significant work'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleCheckReadiness}
                  className="gap-2"
                  disabled={isCheckingReadiness}
                >
                  {isCheckingReadiness ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  {isCheckingReadiness ? 'Checking...' : 'Recalculate'}
                </Button>
              </div>
            </div>
            
            {/* Progress bar */}
            <div className="mt-3">
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-500 ${
                    mlReadinessScore === null ? 'bg-muted-foreground' :
                    mlReadinessScore >= 80 ? 'bg-green-500' :
                    mlReadinessScore >= 60 ? 'bg-yellow-500' :
                    mlReadinessScore >= 40 ? 'bg-orange-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${mlReadinessScore ?? 0}%` }}
                />
              </div>
            </div>

            {/* Issues summary */}
            {mlReadinessReport && mlReadinessReport.issues && mlReadinessReport.issues.length > 0 && (
              <div className="mt-3 pt-3 border-t border-muted">
                <p className="text-xs text-muted-foreground mb-2">Issues found:</p>
                <div className="flex flex-wrap gap-2">
                  {mlReadinessReport.issues.slice(0, 5).map((issue: any, idx: number) => (
                    <Badge 
                      key={idx} 
                      variant={issue.type === 'error' ? 'destructive' : issue.type === 'warning' ? 'secondary' : 'outline'}
                      className="text-xs"
                    >
                      {issue.message.length > 40 ? issue.message.substring(0, 40) + '...' : issue.message}
                    </Badge>
                  ))}
                  {mlReadinessReport.issues.length > 5 && (
                    <Badge variant="outline" className="text-xs">
                      +{mlReadinessReport.issues.length - 5} more
                    </Badge>
                  )}
                </div>
              </div>
            )}
            </>
            )}
          </div>

          {/* Target Selection */}
          <Collapsible open={expandedSections.includes('target')}>
            <SectionHeader 
              id="target"
              icon={Target}
              title="Target Variable"
              description="Select your target column for supervised learning"
              isExpanded={expandedSections.includes('target')}
            />
            <CollapsibleContent className="px-4 pb-4 space-y-4">
              <div className="p-4 rounded-lg bg-muted/30 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Target Column</label>
                  <Select value={targetColumn} onValueChange={setTargetColumn}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select target column" />
                    </SelectTrigger>
                    <SelectContent>
                      {columns.map(col => {
                        const stat = columnStats.find(s => s.name === col);
                        return (
                          <SelectItem key={col} value={col}>
                            <div className="flex items-center gap-2">
                              <span>{col}</span>
                              <Badge variant={getColumnBadgeVariant(col)} className="text-xs">
                                {stat?.type}
                              </Badge>
                              {stat && stat.uniqueCount <= 10 && (
                                <Badge variant="outline" className="text-xs">
                                  {stat.uniqueCount} classes
                                </Badge>
                              )}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                
                {targetColumn && (
                  <div className="p-3 rounded-lg bg-background border">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Detected Task:</span>
                      {(() => {
                        const stat = columnStats.find(s => s.name === targetColumn);
                        if (!stat) return null;
                        const isClassification = stat.uniqueCount <= 10 || stat.type === 'string';
                        return (
                          <Badge variant={isClassification ? 'default' : 'secondary'}>
                            {isClassification ? 'Classification' : 'Regression'}
                            {isClassification && stat.uniqueCount && ` (${stat.uniqueCount} classes)`}
                          </Badge>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Data Cleaning */}
          <Collapsible open={expandedSections.includes('cleaning')}>
            <SectionHeader 
              id="cleaning"
              icon={Sparkles}
              title="Data Cleaning"
              description="Remove duplicates, handle missing values, standardize format"
              isExpanded={expandedSections.includes('cleaning')}
            />
            <CollapsibleContent className="px-4 pb-4 space-y-4">
              <div className="p-4 rounded-lg bg-muted/30 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Duplicates */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Remove Duplicates</label>
                      <Switch 
                        checked={cleaningConfig.removeDuplicates}
                        onCheckedChange={v => setCleaningConfig(p => ({...p, removeDuplicates: v}))}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Near-Duplicate Detection</label>
                      <Switch 
                        checked={cleaningConfig.removeNearDuplicates}
                        onCheckedChange={v => setCleaningConfig(p => ({...p, removeNearDuplicates: v}))}
                      />
                    </div>
                    {cleaningConfig.removeNearDuplicates && (
                      <div className="space-y-2">
                        <label className="text-xs text-muted-foreground">
                          Similarity Threshold: {(cleaningConfig.nearDuplicateTolerance * 100).toFixed(0)}%
                        </label>
                        <Slider 
                          value={[cleaningConfig.nearDuplicateTolerance]}
                          onValueChange={([v]) => setCleaningConfig(p => ({...p, nearDuplicateTolerance: v}))}
                          min={0.8}
                          max={0.99}
                          step={0.01}
                        />
                      </div>
                    )}
                  </div>

                  {/* Missing Values */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Handle Missing Values</label>
                      <Switch 
                        checked={cleaningConfig.handleMissing}
                        onCheckedChange={v => setCleaningConfig(p => ({...p, handleMissing: v}))}
                      />
                    </div>
                    {cleaningConfig.handleMissing && (
                      <>
                        <Select 
                          value={cleaningConfig.missingStrategy} 
                          onValueChange={(v: any) => setCleaningConfig(p => ({...p, missingStrategy: v}))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="remove">Remove rows</SelectItem>
                            <SelectItem value="mean">Fill with mean</SelectItem>
                            <SelectItem value="median">Fill with median</SelectItem>
                            <SelectItem value="mode">Fill with mode</SelectItem>
                            <SelectItem value="forward">Forward fill</SelectItem>
                            <SelectItem value="backward">Backward fill</SelectItem>
                            <SelectItem value="constant">Constant value</SelectItem>
                          </SelectContent>
                        </Select>
                        {cleaningConfig.missingStrategy === 'remove' && (
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">
                              Remove if missing &gt; {Math.round(cleaningConfig.missingThreshold * 100)}% of columns
                            </label>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={cleaningConfig.missingThreshold * 100}
                              onChange={(e) => setCleaningConfig(p => ({...p, missingThreshold: parseInt(e.target.value) / 100}))}
                              className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer"
                            />
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Whitespace */}
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Trim Whitespace</label>
                    <Switch 
                      checked={cleaningConfig.trimWhitespace}
                      onCheckedChange={v => setCleaningConfig(p => ({...p, trimWhitespace: v}))}
                    />
                  </div>

                  {/* Normalize Columns */}
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Normalize Column Names</label>
                    <Switch 
                      checked={cleaningConfig.normalizeColumnNames}
                      onCheckedChange={v => setCleaningConfig(p => ({...p, normalizeColumnNames: v}))}
                    />
                  </div>

                  {/* Case Standardization */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Standardize Case</label>
                      <Switch 
                        checked={cleaningConfig.standardizeCase}
                        onCheckedChange={v => setCleaningConfig(p => ({...p, standardizeCase: v}))}
                      />
                    </div>
                    {cleaningConfig.standardizeCase && (
                      <Select 
                        value={cleaningConfig.caseType} 
                        onValueChange={(v: any) => setCleaningConfig(p => ({...p, caseType: v}))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="lower">lowercase</SelectItem>
                          <SelectItem value="upper">UPPERCASE</SelectItem>
                          <SelectItem value="title">Title Case</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* High Missing Columns */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Drop High Missing Columns</label>
                      <Switch 
                        checked={cleaningConfig.removeHighMissing}
                        onCheckedChange={v => setCleaningConfig(p => ({...p, removeHighMissing: v}))}
                      />
                    </div>
                    {cleaningConfig.removeHighMissing && (
                      <div className="space-y-2">
                        <label className="text-xs text-muted-foreground">
                          Threshold: {(cleaningConfig.highMissingThreshold * 100).toFixed(0)}% missing
                        </label>
                        <Slider 
                          value={[cleaningConfig.highMissingThreshold]}
                          onValueChange={([v]) => setCleaningConfig(p => ({...p, highMissingThreshold: v}))}
                          min={0.1}
                          max={0.9}
                          step={0.05}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Outlier Detection */}
          <Collapsible open={expandedSections.includes('outliers')}>
            <SectionHeader 
              id="outliers"
              icon={AlertTriangle}
              title="Outlier Detection"
              description="Identify and handle statistical outliers"
              isExpanded={expandedSections.includes('outliers')}
            />
            <CollapsibleContent className="px-4 pb-4">
              <div className="p-4 rounded-lg bg-muted/30 space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Enable Outlier Detection</label>
                  <Switch 
                    checked={outlierConfig.enabled}
                    onCheckedChange={v => setOutlierConfig(p => ({...p, enabled: v}))}
                  />
                </div>
                
                {outlierConfig.enabled && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Detection Method</label>
                      <Select 
                        value={outlierConfig.method} 
                        onValueChange={(v: any) => setOutlierConfig(p => ({...p, method: v}))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="iqr">IQR (Interquartile Range)</SelectItem>
                          <SelectItem value="zscore">Z-Score</SelectItem>
                          <SelectItem value="percentile">Percentile</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Treatment</label>
                      <Select 
                        value={outlierConfig.treatment} 
                        onValueChange={(v: any) => setOutlierConfig(p => ({...p, treatment: v}))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cap">Cap (Winsorize)</SelectItem>
                          <SelectItem value="remove">Remove rows</SelectItem>
                          <SelectItem value="replace">Replace with mean/median</SelectItem>
                          <SelectItem value="flag">Flag only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Threshold: {outlierConfig.threshold}
                        {outlierConfig.method === 'iqr' && ' × IQR'}
                        {outlierConfig.method === 'zscore' && ' std devs'}
                      </label>
                      <Slider 
                        value={[outlierConfig.threshold]}
                        onValueChange={([v]) => setOutlierConfig(p => ({...p, threshold: v}))}
                        min={outlierConfig.method === 'zscore' ? 2 : 1}
                        max={outlierConfig.method === 'zscore' ? 4 : 3}
                        step={0.1}
                      />
                    </div>

                    {outlierConfig.treatment === 'replace' && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Replace with</label>
                        <Select 
                          value={outlierConfig.replacement} 
                          onValueChange={(v: any) => setOutlierConfig(p => ({...p, replacement: v}))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="mean">Mean</SelectItem>
                            <SelectItem value="median">Median</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Categorical Encoding */}
          <Collapsible open={expandedSections.includes('encoding')}>
            <SectionHeader 
              id="encoding"
              icon={Binary}
              title="Categorical Encoding"
              description="Convert categorical variables to numeric representations"
              isExpanded={expandedSections.includes('encoding')}
            />
            <CollapsibleContent className="px-4 pb-4">
              <div className="p-4 rounded-lg bg-muted/30 space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Enable Encoding</label>
                  <Switch 
                    checked={encodingConfig.enabled}
                    onCheckedChange={v => setEncodingConfig(p => ({...p, enabled: v}))}
                  />
                </div>
                
                {encodingConfig.enabled && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Encoding Method</label>
                      <Select 
                        value={encodingConfig.method} 
                        onValueChange={(v: any) => setEncodingConfig(p => ({...p, method: v}))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="onehot">One-Hot Encoding</SelectItem>
                          <SelectItem value="label">Label Encoding</SelectItem>
                          <SelectItem value="frequency">Frequency Encoding</SelectItem>
                          <SelectItem value="target">Target Encoding</SelectItem>
                          <SelectItem value="binary">Binary Encoding</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {encodingConfig.method === 'onehot' && 'Creates binary columns for each category'}
                        {encodingConfig.method === 'label' && 'Assigns integer values to each category'}
                        {encodingConfig.method === 'frequency' && 'Encodes with frequency of occurrence'}
                        {encodingConfig.method === 'target' && 'Encodes with target variable mean'}
                        {encodingConfig.method === 'binary' && 'Binary representation of labels'}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">Select Columns to Encode</label>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEncodingConfig(p => ({...p, selectedColumns: [...categoricalColumns]}))}
                          >
                            Select All
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEncodingConfig(p => ({...p, selectedColumns: []}))}
                          >
                            Clear
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-background border min-h-[60px]">
                        {categoricalColumns.length > 0 ? categoricalColumns.map(col => {
                          const isSelected = encodingConfig.selectedColumns.includes(col);
                          return (
                            <Badge 
                              key={col}
                              variant={isSelected ? 'default' : 'outline'}
                              className="cursor-pointer transition-colors"
                              onClick={() => {
                                setEncodingConfig(p => ({
                                  ...p,
                                  selectedColumns: isSelected 
                                    ? p.selectedColumns.filter(c => c !== col)
                                    : [...p.selectedColumns, col]
                                }));
                              }}
                            >
                              {col}
                              {columnStats.find(s => s.name === col)?.uniqueCount && (
                                <span className="ml-1 opacity-70">
                                  ({columnStats.find(s => s.name === col)?.uniqueCount})
                                </span>
                              )}
                            </Badge>
                          );
                        }) : (
                          <span className="text-sm text-muted-foreground">No categorical columns detected</span>
                        )}
                      </div>
                    </div>

                    {encodingConfig.method === 'onehot' && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium">
                          Max Categories: {encodingConfig.maxCategories}
                        </label>
                        <Slider 
                          value={[encodingConfig.maxCategories]}
                          onValueChange={([v]) => setEncodingConfig(p => ({...p, maxCategories: v}))}
                          min={2}
                          max={50}
                          step={1}
                        />
                        <p className="text-xs text-muted-foreground">
                          Columns with more categories will use frequency encoding instead
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Feature Engineering */}
          <Collapsible open={expandedSections.includes('features')}>
            <SectionHeader 
              id="features"
              icon={Layers}
              title="Feature Engineering"
              description="Create new features from existing columns"
              isExpanded={expandedSections.includes('features')}
            />
            <CollapsibleContent className="px-4 pb-4">
              <div className="p-4 rounded-lg bg-muted/30 space-y-6">
                {/* Time Features */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Extract Time Features</label>
                    <Switch 
                      checked={featureConfig.timeFeatures}
                      onCheckedChange={v => setFeatureConfig(p => ({...p, timeFeatures: v}))}
                    />
                  </div>
                  {featureConfig.timeFeatures && (
                    <Select 
                      value={featureConfig.timeColumn} 
                      onValueChange={(v) => setFeatureConfig(p => ({...p, timeColumn: v}))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select datetime column" />
                      </SelectTrigger>
                      <SelectContent>
                        {columns.map(col => (
                          <SelectItem key={col} value={col}>{col}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Rolling Features */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Rolling/Moving Features</label>
                    <Switch 
                      checked={featureConfig.rollingFeatures}
                      onCheckedChange={v => setFeatureConfig(p => ({...p, rollingFeatures: v}))}
                    />
                  </div>
                  {featureConfig.rollingFeatures && (
                    <div className="grid grid-cols-2 gap-4">
                      <Select 
                        value={featureConfig.rollingColumn} 
                        onValueChange={(v) => setFeatureConfig(p => ({...p, rollingColumn: v}))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select column" />
                        </SelectTrigger>
                        <SelectContent>
                          {numericColumns.map(col => (
                            <SelectItem key={col} value={col}>{col}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex gap-2">
                        {[3, 7, 14, 30].map(w => (
                          <Badge 
                            key={w}
                            variant={featureConfig.rollingWindows.includes(w) ? 'default' : 'outline'}
                            className="cursor-pointer"
                            onClick={() => {
                              setFeatureConfig(p => ({
                                ...p,
                                rollingWindows: p.rollingWindows.includes(w)
                                  ? p.rollingWindows.filter(x => x !== w)
                                  : [...p.rollingWindows, w]
                              }));
                            }}
                          >
                            {w}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Lag Features */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Lag Features</label>
                    <Switch 
                      checked={featureConfig.lagFeatures}
                      onCheckedChange={v => setFeatureConfig(p => ({...p, lagFeatures: v}))}
                    />
                  </div>
                  {featureConfig.lagFeatures && (
                    <div className="grid grid-cols-2 gap-4">
                      <Select 
                        value={featureConfig.lagColumn} 
                        onValueChange={(v) => setFeatureConfig(p => ({...p, lagColumn: v}))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select column" />
                        </SelectTrigger>
                        <SelectContent>
                          {numericColumns.map(col => (
                            <SelectItem key={col} value={col}>{col}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex gap-2">
                        {[1, 2, 3, 5, 7].map(l => (
                          <Badge 
                            key={l}
                            variant={featureConfig.lagPeriods.includes(l) ? 'default' : 'outline'}
                            className="cursor-pointer"
                            onClick={() => {
                              setFeatureConfig(p => ({
                                ...p,
                                lagPeriods: p.lagPeriods.includes(l)
                                  ? p.lagPeriods.filter(x => x !== l)
                                  : [...p.lagPeriods, l]
                              }));
                            }}
                          >
                            t-{l}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Polynomial Features */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Polynomial Features</label>
                    <Switch 
                      checked={featureConfig.polynomialFeatures}
                      onCheckedChange={v => setFeatureConfig(p => ({...p, polynomialFeatures: v}))}
                    />
                  </div>
                  {featureConfig.polynomialFeatures && (
                    <div className="space-y-3">
                      <div className="flex gap-2 mb-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setFeatureConfig(p => ({...p, polynomialColumns: [...numericColumns.slice(0, 10)]}))}
                        >
                          Select All
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setFeatureConfig(p => ({...p, polynomialColumns: []}))}
                        >
                          Clear
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {numericColumns.slice(0, 10).map(col => (
                          <Badge 
                            key={col}
                            variant={featureConfig.polynomialColumns.includes(col) ? 'default' : 'outline'}
                            className="cursor-pointer"
                            onClick={() => {
                              setFeatureConfig(p => ({
                                ...p,
                                polynomialColumns: p.polynomialColumns.includes(col)
                                  ? p.polynomialColumns.filter(c => c !== col)
                                  : [...p.polynomialColumns, col]
                              }));
                            }}
                          >
                            {col}
                          </Badge>
                        ))}
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs text-muted-foreground">
                          Degree: {featureConfig.polynomialDegree}
                        </label>
                        <Slider 
                          value={[featureConfig.polynomialDegree]}
                          onValueChange={([v]) => setFeatureConfig(p => ({...p, polynomialDegree: v}))}
                          min={2}
                          max={4}
                          step={1}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Binning */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Numeric Binning</label>
                    <Switch 
                      checked={featureConfig.binning}
                      onCheckedChange={v => setFeatureConfig(p => ({...p, binning: v}))}
                    />
                  </div>
                  {featureConfig.binning && (
                    <div className="grid grid-cols-3 gap-4">
                      <Select 
                        value={featureConfig.binColumn} 
                        onValueChange={(v) => setFeatureConfig(p => ({...p, binColumn: v}))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Column" />
                        </SelectTrigger>
                        <SelectContent>
                          {numericColumns.map(col => (
                            <SelectItem key={col} value={col}>{col}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select 
                        value={featureConfig.binMethod} 
                        onValueChange={(v: any) => setFeatureConfig(p => ({...p, binMethod: v}))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="equal">Equal Width</SelectItem>
                          <SelectItem value="quantile">Quantile</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Bins:</span>
                        <Select 
                          value={String(featureConfig.binCount)} 
                          onValueChange={(v) => setFeatureConfig(p => ({...p, binCount: parseInt(v)}))}
                        >
                          <SelectTrigger className="w-20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[3, 4, 5, 10, 20].map(n => (
                              <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Geospatial Features */}
          <Collapsible open={expandedSections.includes('geo')}>
            <SectionHeader 
              id="geo"
              icon={MapPin}
              title="Geospatial Processing"
              description="Process latitude/longitude coordinates"
              isExpanded={expandedSections.includes('geo')}
            />
            <CollapsibleContent className="px-4 pb-4">
              <div className="p-4 rounded-lg bg-muted/30 space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Enable Geo Processing</label>
                  <Switch 
                    checked={geoConfig.enabled}
                    onCheckedChange={v => setGeoConfig(p => ({...p, enabled: v}))}
                  />
                </div>
                
                {geoConfig.enabled && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Latitude Column</label>
                        <Select 
                          value={geoConfig.latColumn} 
                          onValueChange={(v) => setGeoConfig(p => ({...p, latColumn: v}))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select column" />
                          </SelectTrigger>
                          <SelectContent>
                            {numericColumns.map(col => (
                              <SelectItem key={col} value={col}>{col}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Longitude Column</label>
                        <Select 
                          value={geoConfig.lonColumn} 
                          onValueChange={(v) => setGeoConfig(p => ({...p, lonColumn: v}))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select column" />
                          </SelectTrigger>
                          <SelectContent>
                            {numericColumns.map(col => (
                              <SelectItem key={col} value={col}>{col}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Encoding Method</label>
                      <Select 
                        value={geoConfig.method} 
                        onValueChange={(v: any) => setGeoConfig(p => ({...p, method: v}))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="grid">Grid-based Zones</SelectItem>
                          <SelectItem value="cluster">K-Means Clustering</SelectItem>
                          <SelectItem value="hex">Hexagonal (H3-style)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {geoConfig.method === 'grid' && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium">
                          Grid Size: {geoConfig.gridSize}° (≈{(geoConfig.gridSize * 111).toFixed(1)} km)
                        </label>
                        <Slider 
                          value={[geoConfig.gridSize]}
                          onValueChange={([v]) => setGeoConfig(p => ({...p, gridSize: v}))}
                          min={0.01}
                          max={1}
                          step={0.01}
                        />
                      </div>
                    )}

                    {geoConfig.method === 'cluster' && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium">
                          Number of Clusters: {geoConfig.numClusters}
                        </label>
                        <Slider 
                          value={[geoConfig.numClusters]}
                          onValueChange={([v]) => setGeoConfig(p => ({...p, numClusters: v}))}
                          min={2}
                          max={20}
                          step={1}
                        />
                      </div>
                    )}

                    {geoConfig.method === 'hex' && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium">
                          Resolution: {geoConfig.hexResolution} (lower = larger hexagons)
                        </label>
                        <Slider 
                          value={[geoConfig.hexResolution]}
                          onValueChange={([v]) => setGeoConfig(p => ({...p, hexResolution: v}))}
                          min={3}
                          max={10}
                          step={1}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Feature Scaling */}
          <Collapsible open={expandedSections.includes('scaling')}>
            <SectionHeader 
              id="scaling"
              icon={Scale}
              title="Feature Scaling"
              description="Normalize or standardize numeric features"
              isExpanded={expandedSections.includes('scaling')}
            />
            <CollapsibleContent className="px-4 pb-4">
              <div className="p-4 rounded-lg bg-muted/30 space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Enable Scaling</label>
                  <Switch 
                    checked={scalingConfig.enabled}
                    onCheckedChange={v => setScalingConfig(p => ({...p, enabled: v}))}
                  />
                </div>
                
                {scalingConfig.enabled && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Scaling Method</label>
                        <Select 
                          value={scalingConfig.method} 
                          onValueChange={(v: any) => setScalingConfig(p => ({...p, method: v}))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="standard">Standard (Z-score)</SelectItem>
                            <SelectItem value="minmax">Min-Max (0-1)</SelectItem>
                            <SelectItem value="robust">Robust (IQR-based)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Additional Transform</label>
                        <Select 
                          value={scalingConfig.transform} 
                          onValueChange={(v: any) => setScalingConfig(p => ({...p, transform: v}))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="log">Log Transform</SelectItem>
                            <SelectItem value="sqrt">Square Root</SelectItem>
                            <SelectItem value="boxcox">Box-Cox</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">Select Columns to Scale</label>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setScalingConfig(p => ({...p, selectedColumns: [...numericColumns]}))}
                          >
                            Select All
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setScalingConfig(p => ({...p, selectedColumns: []}))}
                          >
                            Clear
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-background border min-h-[60px]">
                        {numericColumns.map(col => {
                          const isSelected = scalingConfig.selectedColumns.includes(col);
                          return (
                            <Badge 
                              key={col}
                              variant={isSelected ? 'default' : 'outline'}
                              className="cursor-pointer transition-colors"
                              onClick={() => {
                                setScalingConfig(p => ({
                                  ...p,
                                  selectedColumns: isSelected 
                                    ? p.selectedColumns.filter(c => c !== col)
                                    : [...p.selectedColumns, col]
                                }));
                              }}
                            >
                              {col}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Class Imbalance */}
          <Collapsible open={expandedSections.includes('imbalance')}>
            <SectionHeader 
              id="imbalance"
              icon={Database}
              title="Class Imbalance"
              description="Handle imbalanced classification datasets"
              isExpanded={expandedSections.includes('imbalance')}
            />
            <CollapsibleContent className="px-4 pb-4">
              <div className="p-4 rounded-lg bg-muted/30 space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Enable Imbalance Handling</label>
                  <Switch 
                    checked={imbalanceConfig.enabled}
                    onCheckedChange={v => setImbalanceConfig(p => ({...p, enabled: v}))}
                  />
                </div>
                
                {imbalanceConfig.enabled && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Method</label>
                      <Select 
                        value={imbalanceConfig.method} 
                        onValueChange={(v: any) => setImbalanceConfig(p => ({...p, method: v}))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="smote">SMOTE (Synthetic Oversampling)</SelectItem>
                          <SelectItem value="oversample">Random Oversampling</SelectItem>
                          <SelectItem value="undersample">Random Undersampling</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {imbalanceConfig.method === 'smote' && 'Creates synthetic samples for minority class'}
                        {imbalanceConfig.method === 'oversample' && 'Duplicates minority class samples'}
                        {imbalanceConfig.method === 'undersample' && 'Removes majority class samples'}
                      </p>
                    </div>

                    {imbalanceConfig.method === 'smote' && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium">K Neighbors: {imbalanceConfig.k}</label>
                        <Slider 
                          value={[imbalanceConfig.k]}
                          onValueChange={([v]) => setImbalanceConfig(p => ({...p, k: v}))}
                          min={1}
                          max={10}
                          step={1}
                        />
                      </div>
                    )}

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Target Ratio: {imbalanceConfig.targetRatio}</label>
                      <Slider 
                        value={[imbalanceConfig.targetRatio]}
                        onValueChange={([v]) => setImbalanceConfig(p => ({...p, targetRatio: v}))}
                        min={0.5}
                        max={1}
                        step={0.1}
                      />
                      <p className="text-xs text-muted-foreground">
                        1.0 = perfectly balanced classes
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Baseline Model */}
          <Collapsible open={expandedSections.includes('model')}>
            <SectionHeader 
              id="model"
              icon={LineChart}
              title="Baseline Model"
              description="Train a simple model to evaluate data quality"
              isExpanded={expandedSections.includes('model')}
            />
            <CollapsibleContent className="px-4 pb-4">
              <div className="p-4 rounded-lg bg-muted/30 space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Train Baseline Model</label>
                  <Switch 
                    checked={modelConfig.enabled}
                    onCheckedChange={v => setModelConfig(p => ({...p, enabled: v}))}
                  />
                </div>
                
                {modelConfig.enabled && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Auto-select Model</label>
                      <Switch 
                        checked={modelConfig.autoSelect}
                        onCheckedChange={v => setModelConfig(p => ({...p, autoSelect: v}))}
                      />
                    </div>

                    {!modelConfig.autoSelect && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Model Type</label>
                        <Select 
                          value={modelConfig.modelType} 
                          onValueChange={(v: any) => setModelConfig(p => ({...p, modelType: v}))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="linear">Linear Regression</SelectItem>
                            <SelectItem value="logistic">Logistic Regression</SelectItem>
                            <SelectItem value="tree">Decision Tree</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground">
                      A baseline model helps validate your preprocessing pipeline and provides initial performance metrics.
                    </p>
                  </div>
                )}

                {/* Baseline Model Results - Show outside modelConfig.enabled so it persists */}
                {baselineModel && (
                  <div className="mt-4 p-3 rounded-lg bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-200">
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle2 className="w-5 h-5 text-blue-600" />
                      <h4 className="font-semibold text-blue-900">Model Trained Successfully</h4>
                    </div>
                    
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Model Type:</span>
                        <span className="font-medium">{baselineModel.type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}</span>
                      </div>
                      
                      {baselineModel.metrics && (
                        <div className="mt-2 pt-2 border-t border-blue-200">
                          <p className="text-xs font-medium text-muted-foreground mb-2">Performance Metrics:</p>
                          {Object.entries(baselineModel.metrics).map(([key, value]) => (
                            <div key={key} className="flex justify-between py-1">
                              <span className="text-muted-foreground">{key.toUpperCase()}:</span>
                              <span className="font-mono font-semibold">{typeof value === 'number' ? value.toFixed(4) : String(value)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      <div className="mt-2 pt-2 border-t border-blue-200">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Features Used:</span>
                          <span className="font-medium">{baselineModel.features?.length || 0}</span>
                        </div>
                        <div className="flex justify-between text-xs mt-1">
                          <span className="text-muted-foreground">Target Column:</span>
                          <span className="font-medium">{baselineModel.target}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* ML Readiness Score */}
          {mlReadinessScore !== null && (
            <Card className="border-2 border-success/20">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="relative w-20 h-20">
                    <svg className="w-20 h-20 transform -rotate-90">
                      <circle cx="40" cy="40" r="36" fill="none" stroke="currentColor" 
                        className="text-muted" strokeWidth="8" />
                      <circle cx="40" cy="40" r="36" fill="none" 
                        className={mlReadinessScore >= 70 ? "text-success" : mlReadinessScore >= 50 ? "text-yellow-500" : "text-destructive"} 
                        strokeWidth="8"
                        strokeDasharray={`${mlReadinessScore * 2.26} 226`}
                        strokeLinecap="round" />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-xl font-bold">
                      {mlReadinessScore}%
                    </span>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold">ML Readiness Score</h4>
                    <p className="text-sm text-muted-foreground">
                      {mlReadinessScore >= 80 ? 'Your data is ready for ML!' :
                       mlReadinessScore >= 60 ? 'Good, but some improvements recommended' :
                       'Consider applying more preprocessing'}
                    </p>
                    {mlReadinessReport && mlReadinessReport.recommendations && mlReadinessReport.recommendations.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {mlReadinessReport.recommendations.slice(0, 3).map((rec: string, i: number) => (
                          <p key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                            <span className="text-primary">•</span> {rec}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button 
              className="flex-1 bg-gradient-to-r from-primary to-accent hover:opacity-90"
              size="lg"
              disabled={isProcessing || data.length === 0}
              onClick={handleApplyPipeline}
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4 mr-2" />
              )}
              {isProcessing ? 'Processing...' : 'Apply Pipeline'}
            </Button>
            <Button 
              variant="outline" 
              size="lg"
              disabled={isCheckingReadiness || data.length === 0}
              onClick={handleCheckReadiness}
            >
              {isCheckingReadiness ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-2" />
              )}
              {isCheckingReadiness ? 'Checking...' : 'Check ML Readiness'}
            </Button>
            <Button 
              variant="outline" 
              size="lg"
              disabled={isExporting || data.length === 0}
              onClick={handleExportReport}
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <FileDown className="w-4 h-4 mr-2" />
              )}
              {isExporting ? 'Exporting...' : 'Export Report'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
