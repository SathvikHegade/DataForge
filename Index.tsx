import { useState, useCallback } from 'react';
import { Header } from '@/components/Header';
import { FileUpload } from '@/components/FileUpload';
import { DataPreview } from '@/components/DataPreview';
import { CleaningOptions, CleaningConfig } from '@/components/CleaningOptions';
import { CleaningLog } from '@/components/CleaningLog';
import { StatsOverview } from '@/components/StatsOverview';
import { MLPipeline } from '@/components/MLPipeline';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { parseCSV, dataToCSV } from '@/utils/csvParser';
import { parseExcel, parseJSON } from '@/utils/fileParser';
import { analyzeColumns } from '@/utils/dataAnalyzer';
import { 
  removeDuplicates, 
  handleMissingValues, 
  trimWhitespace, 
  standardizeCase,
  removeOutliers,
  coerceColumnTypes
} from '@/utils/dataCleaner';
import { DataRow, ColumnStats, CleaningLog as CleaningLogType } from '@/types/dataset';
import { Download, RotateCcw, ArrowRight, Sparkles, Brain } from 'lucide-react';

const defaultConfig: CleaningConfig = {
  removeDuplicates: true,
  handleMissing: true,
  missingStrategy: 'remove',
  missingThreshold: 0.5, // Remove rows with >50% missing values
  missingTarget: 'rows',
  missingColumns: [],
  removeEnabled: false,
  trimWhitespace: true,
  standardizeCase: false,
  caseType: 'lower',
  removeOutliers: false,
  outlierMethod: 'iqr',
  coercionEnabled: false,
  coercionType: 'float',
  coercionColumns: [],
};

const Index = () => {
  const [originalData, setOriginalData] = useState<DataRow[]>([]);
  const [cleanedData, setCleanedData] = useState<DataRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [cleanedColumns, setCleanedColumns] = useState<string[]>([]); // Track processed data columns separately
  const [columnStats, setColumnStats] = useState<ColumnStats[]>([]);
  const [cleanedColumnStats, setCleanedColumnStats] = useState<ColumnStats[]>([]);
  const [logs, setLogs] = useState<CleaningLogType[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [config, setConfig] = useState<CleaningConfig>(defaultConfig);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('original');
  const [pipelineMode, setPipelineMode] = useState<'basic' | 'ml'>('basic');

  const handleFileSelect = useCallback(async (file: File) => {
    setIsLoading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      let parsed: { data: DataRow[]; columns: string[] } = { data: [], columns: [] };

      if (ext === 'xlsx' || ext === 'xls') {
        const buffer = await file.arrayBuffer();
        parsed = await parseExcel(buffer);
      } else if (ext === 'json') {
        const text = await file.text();
        parsed = parseJSON(text);
      } else {
        const text = await file.text();
        parsed = parseCSV(text);
      }

      const { data, columns: cols } = parsed;
      const stats = analyzeColumns(data, cols);

      setOriginalData(data);
      setCleanedData([]);
      setColumns(cols);
      setCleanedColumns([]); // Reset cleaned columns
      setColumnStats(stats);
      setCleanedColumnStats([]);
      setLogs([]);
      setFileName(file.name);
      setActiveTab('original');
    } catch (error) {
      console.error('Error parsing file:', error);
      // show minimal fallback: reset state so user can try again
      setOriginalData([]);
      setColumns([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleClean = useCallback(() => {
    setIsLoading(true);
    
    // Use setTimeout to allow UI to update
    setTimeout(() => {
      let data = [...originalData];
      const allLogs: CleaningLogType[] = [];
      let currentStats = columnStats;
      // Work with a local copy of columns that can be updated when we drop columns
      let currentColumns = [...columns];
      
      console.log('Starting clean with', data.length, 'rows');

      if (config.trimWhitespace) {
        const result = trimWhitespace(data, currentColumns);
        data = result.data;
        allLogs.push(...result.logs);
        console.log('After trimWhitespace:', data.length, 'rows');
      }

      if (config.standardizeCase) {
        const result = standardizeCase(data, currentColumns, config.caseType);
        data = result.data;
        allLogs.push(...result.logs);
        console.log('After standardizeCase:', data.length, 'rows');
      }

      if (config.removeDuplicates) {
        const result = removeDuplicates(data, currentColumns);
        data = result.data;
        allLogs.push(...result.logs);
        console.log('After removeDuplicates:', data.length, 'rows');
      }

      if (config.handleMissing || config.removeEnabled) {
        // If removal is enabled, do removal first (columns or rows), then apply fill strategies
        if (config.removeEnabled) {
          currentStats = analyzeColumns(data, currentColumns);
          console.log('Removing missing values using target:', config.missingTarget, 'threshold:', config.missingThreshold);
          const removeResult = handleMissingValues(
            data,
            currentColumns,
            currentStats,
            'remove',
            undefined,
            config.missingThreshold,
            config.missingTarget,
            config.missingColumns || []
          );

          data = removeResult.data;
          allLogs.push(...removeResult.logs);

          if ((removeResult as any).columns) {
            currentColumns = (removeResult as any).columns;
            currentStats = analyzeColumns(data, currentColumns);
          }

          console.log('After removal of missing:', data.length, 'rows');
          console.log('Logs from removal:', removeResult.logs);
        }

        // Next, apply fill strategies (mean/median/mode) if selected
        // Optionally coerce selected columns to a target type before filling
        if (config.coercionEnabled && (config.coercionColumns || []).length > 0 && config.coercionType) {
          currentStats = analyzeColumns(data, currentColumns);
          console.log('Coercing columns:', config.coercionColumns, 'to', config.coercionType);
          const coercionResult = coerceColumnTypes(data, currentColumns, config.coercionColumns || [], config.coercionType);
          data = coercionResult.data;
          allLogs.push(...coercionResult.logs);
          currentStats = analyzeColumns(data, currentColumns);
          console.log('After coercion:', data.length, 'rows');
        }

        if (config.handleMissing && config.missingStrategy && config.missingStrategy !== 'remove') {
          currentStats = analyzeColumns(data, currentColumns);
          console.log('Filling missing values with strategy:', config.missingStrategy);
          const fillResult = handleMissingValues(
            data,
            currentColumns,
            currentStats,
            config.missingStrategy,
            undefined,
            undefined,
            'rows',
            []
          );

          data = fillResult.data;
          allLogs.push(...fillResult.logs);
          console.log('After filling missing:', data.length, 'rows');
        }
      }

      if (config.removeOutliers) {
        currentStats = analyzeColumns(data, currentColumns);
        const result = removeOutliers(data, currentColumns, currentStats, config.outlierMethod);
        data = result.data;
        allLogs.push(...result.logs);
        console.log('After removeOutliers:', data.length, 'rows');
      }

      const finalStats = analyzeColumns(data, currentColumns);
      
      console.log('Final cleaned data:', data.length, 'rows');
      console.log('Sample rows:', data.slice(0, 3));
      
      setCleanedData(data);
      setCleanedColumns(currentColumns); // Track cleaned columns (same as original in basic mode)
      setCleanedColumnStats(finalStats);
      setLogs(allLogs);
      setActiveTab('cleaned');
      setIsLoading(false);
    }, 100);
  }, [originalData, columns, columnStats, config]);

  const handleDownload = useCallback(() => {
    console.log('Downloading:', cleanedData.length, 'rows with columns:', cleanedColumns);
    console.log('Sample cleaned data:', cleanedData.slice(0, 2));
    const csv = dataToCSV(cleanedData, cleanedColumns);
    console.log('CSV preview:', csv.substring(0, 500));
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cleaned_${fileName}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [cleanedData, cleanedColumns, fileName]);

  const handleReset = useCallback(() => {
    setOriginalData([]);
    setCleanedData([]);
    setColumns([]);
    setCleanedColumns([]); // Reset cleaned columns
    setColumnStats([]);
    setCleanedColumnStats([]);
    setLogs([]);
    setFileName('');
    setConfig(defaultConfig);
    setPipelineMode('basic');
  }, []);

  // ML Pipeline callback
  const handleApplyPipeline = useCallback((processedData: DataRow[], pipelineLogs: CleaningLogType[]) => {
    setCleanedData(processedData);
    const newColumns = processedData.length > 0 ? Object.keys(processedData[0]) : columns;
    setCleanedColumns(newColumns); // Track cleaned data columns separately
    setCleanedColumnStats(analyzeColumns(processedData, newColumns));
    setLogs(prev => [...prev, ...pipelineLogs]);
    setActiveTab('cleaned');
  }, [columns]);

  const hasData = originalData.length > 0;
  const hasCleaned = cleanedData.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-6 py-8">
        {!hasData ? (
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12 animate-fade-in">
              <h2 className="text-4xl font-bold text-foreground mb-4">
                Clean Your Data in
                <span className="bg-gradient-to-r from-[hsl(199,89%,48%)] to-[hsl(172,66%,50%)] bg-clip-text text-transparent"> Seconds</span>
              </h2>
              <p className="text-lg text-muted-foreground max-w-xl mx-auto">
                Upload your CSV file and let our intelligent cleaning tools remove duplicates, 
                handle missing values, and standardize your data automatically.
              </p>
            </div>
            
            <FileUpload onFileSelect={handleFileSelect} isLoading={isLoading} />
            
            {/* Features Section */}
            <div className="mt-12 grid grid-cols-3 gap-6">
              {[
                { title: 'Remove Duplicates', desc: 'Identify and remove duplicate rows' },
                { title: 'Handle Missing Data', desc: 'Fill or remove null values intelligently' },
                { title: 'Standardize Format', desc: 'Fix casing and trim whitespace' },
              ].map((feature, i) => (
                <div 
                  key={i} 
                  className="text-center p-6 rounded-xl bg-card border border-border shadow-card animate-slide-up"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[hsl(199,89%,48%)] to-[hsl(172,66%,50%)] mx-auto mb-4 flex items-center justify-center shadow-glow">
                    <span className="text-white font-bold">{i + 1}</span>
                  </div>
                  <h3 className="font-semibold text-foreground mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.desc}</p>
                </div>
              ))}
            </div>

            {/* How To Use Section */}
            <div className="mt-16 animate-fade-in">
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-foreground mb-2">How to Use</h3>
                <p className="text-muted-foreground">Get started in just 4 simple steps</p>
              </div>
              
              <div className="relative">
                {/* Connection Line */}
                <div className="absolute top-8 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-border to-transparent hidden md:block" />
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  {[
                    { 
                      step: '1', 
                      title: 'Upload Your File', 
                      desc: 'Drag & drop or click to upload your CSV file',
                      icon: '📁'
                    },
                    { 
                      step: '2', 
                      title: 'Preview Data', 
                      desc: 'Review your data and see column statistics',
                      icon: '👀'
                    },
                    { 
                      step: '3', 
                      title: 'Configure Cleaning', 
                      desc: 'Select which cleaning operations to apply',
                      icon: '⚙️'
                    },
                    { 
                      step: '4', 
                      title: 'Download Results', 
                      desc: 'Export your cleaned dataset as CSV',
                      icon: '✅'
                    },
                  ].map((item, i) => (
                    <div 
                      key={i}
                      className="relative text-center animate-slide-up"
                      style={{ animationDelay: `${i * 100 + 300}ms` }}
                    >
                      <div className="relative z-10 w-16 h-16 rounded-full bg-card border-2 border-border mx-auto mb-4 flex items-center justify-center text-2xl shadow-elevated">
                        {item.icon}
                      </div>
                      <h4 className="font-semibold text-foreground mb-1">{item.title}</h4>
                      <p className="text-sm text-muted-foreground">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tips Section */}
              <div className="mt-12 p-6 rounded-xl bg-muted/30 border border-border">
                <h4 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                  <span>💡</span> Pro Tips
                </h4>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-primary">•</span>
                    <span>Ensure your CSV has headers in the first row</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">•</span>
                    <span>Use "Remove rows" for small datasets, "Fill with mean/median" for large ones</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">•</span>
                    <span>Check the cleaning log to see exactly what changed</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary">•</span>
                    <span>Compare original vs cleaned data using the tabs</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-foreground">{fileName}</h2>
                <p className="text-muted-foreground">
                  {originalData.length} rows × {columns.length} columns
                </p>
              </div>
              <div className="flex items-center gap-3">
                {hasCleaned && (
                  <Button onClick={handleDownload} variant="outline" className="gap-2">
                    <Download className="w-4 h-4" />
                    Download Cleaned
                  </Button>
                )}
                <Button onClick={handleReset} variant="ghost" className="gap-2">
                  <RotateCcw className="w-4 h-4" />
                  New File
                </Button>
              </div>
            </div>

            {/* Pipeline Mode Toggle */}
            <div className="flex items-center justify-center gap-2 p-1 rounded-lg bg-muted w-fit mx-auto">
              <Button
                variant={pipelineMode === 'basic' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setPipelineMode('basic')}
                className="gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Basic Cleaning
              </Button>
              <Button
                variant={pipelineMode === 'ml' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setPipelineMode('ml')}
                className="gap-2"
              >
                <Brain className="w-4 h-4" />
                ML Pipeline
              </Button>
            </div>

            <StatsOverview 
              totalRows={activeTab === 'cleaned' && hasCleaned ? cleanedData.length : originalData.length}
              totalColumns={activeTab === 'cleaned' && hasCleaned ? cleanedColumns.length : columns.length}
              columnStats={activeTab === 'cleaned' && hasCleaned ? cleanedColumnStats : columnStats}
              cleanedRows={hasCleaned ? cleanedData.length : undefined}
            />

            {pipelineMode === 'basic' ? (
              <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="bg-muted">
                      <TabsTrigger value="original" className="data-[state=active]:bg-background">
                        Original Data
                      </TabsTrigger>
                      <TabsTrigger 
                        value="cleaned" 
                        disabled={!hasCleaned}
                        className="data-[state=active]:bg-background"
                      >
                        Cleaned Data
                        {hasCleaned && (
                          <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-success/10 text-success">
                            {cleanedData.length}
                          </span>
                        )}
                      </TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="original" className="mt-4">
                      <DataPreview 
                        data={originalData}
                        columns={columns}
                        columnStats={columnStats}
                        title="Original Dataset"
                      />
                    </TabsContent>
                    
                    <TabsContent value="cleaned" className="mt-4">
                      {hasCleaned && (
                        <DataPreview 
                          data={cleanedData}
                          columns={cleanedColumns}
                          columnStats={cleanedColumnStats}
                          title="Cleaned Dataset"
                        />
                      )}
                    </TabsContent>
                  </Tabs>

                  {hasCleaned && (
                    <div className="flex items-center justify-center gap-4 p-6 rounded-xl bg-success/5 border border-success/20">
                      <div className="text-center">
                        <p className="text-3xl font-bold text-foreground">{originalData.length}</p>
                        <p className="text-sm text-muted-foreground">Original</p>
                      </div>
                      <ArrowRight className="w-6 h-6 text-success" />
                      <div className="text-center">
                        <p className="text-3xl font-bold text-success">{cleanedData.length}</p>
                        <p className="text-sm text-muted-foreground">Cleaned</p>
                      </div>
                      <div className="ml-4 px-4 py-2 rounded-lg bg-success/10">
                        <p className="text-lg font-semibold text-success">
                          {originalData.length - cleanedData.length} rows removed
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-6">
                  <CleaningOptions 
                    config={config}
                    onConfigChange={setConfig}
                    onClean={handleClean}
                    isLoading={isLoading}
                    columns={columns}
                  />
                  <CleaningLog logs={logs} />
                </div>
              </div>
            ) : (
              <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="bg-muted">
                      <TabsTrigger value="original" className="data-[state=active]:bg-background">
                        Original Data
                      </TabsTrigger>
                      <TabsTrigger 
                        value="cleaned" 
                        disabled={!hasCleaned}
                        className="data-[state=active]:bg-background"
                      >
                        Processed Data
                        {hasCleaned && (
                          <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-success/10 text-success">
                            {cleanedData.length}
                          </span>
                        )}
                      </TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="original" className="mt-4">
                      <DataPreview 
                        data={originalData}
                        columns={columns}
                        columnStats={columnStats}
                        title="Original Dataset"
                      />
                    </TabsContent>
                    
                    <TabsContent value="cleaned" className="mt-4">
                      {hasCleaned && (
                        <DataPreview 
                          data={cleanedData}
                          columns={cleanedColumns}
                          columnStats={cleanedColumnStats}
                          title="Processed Dataset"
                        />
                      )}
                    </TabsContent>
                  </Tabs>

                  {hasCleaned && (
                    <div className="flex items-center justify-center gap-4 p-6 rounded-xl bg-primary/5 border border-primary/20">
                      <div className="text-center">
                        <p className="text-3xl font-bold text-foreground">{originalData.length}</p>
                        <p className="text-sm text-muted-foreground">Original Rows</p>
                      </div>
                      <ArrowRight className="w-6 h-6 text-primary" />
                      <div className="text-center">
                        <p className="text-3xl font-bold text-primary">{cleanedData.length}</p>
                        <p className="text-sm text-muted-foreground">Processed Rows</p>
                      </div>
                      <div className="text-center ml-4">
                        <p className="text-3xl font-bold text-accent">{Object.keys(cleanedData[0] || {}).length}</p>
                        <p className="text-sm text-muted-foreground">Features</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-6">
                  <MLPipeline
                    data={hasCleaned ? cleanedData : originalData}
                    columns={hasCleaned ? Object.keys(cleanedData[0] || {}) : columns}
                    columnStats={hasCleaned ? cleanedColumnStats : columnStats}
                    onApplyPipeline={handleApplyPipeline}
                  />
                  <CleaningLog logs={logs} />
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
