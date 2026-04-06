import { useEffect, useState, useCallback } from 'react';
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
  const [isUploadFocusMode, setIsUploadFocusMode] = useState(false);
  const [focusedSection, setFocusedSection] = useState<'features' | 'how' | 'tips' | null>(null);

  useEffect(() => {
    const applyHashFocus = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'features' || hash === 'how' || hash === 'tips') {
        setFocusedSection(hash);
        return;
      }
      setFocusedSection(null);
    };

    applyHashFocus();
    window.addEventListener('hashchange', applyHashFocus);
    return () => window.removeEventListener('hashchange', applyHashFocus);
  }, []);

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
  const showUploadOverlay = !hasData && isUploadFocusMode;
  const showSectionOverlay = !hasData && focusedSection !== null;
  const showFocusOverlay = showUploadOverlay || showSectionOverlay;

  const clearSectionFocus = useCallback(() => {
    setFocusedSection(null);
    setIsUploadFocusMode(false);
    if (window.location.hash === '#features' || window.location.hash === '#how' || window.location.hash === '#tips') {
      history.replaceState(null, '', window.location.pathname + window.location.search);
      window.dispatchEvent(new Event('hashchange'));
    }
  }, []);

  return (
    <div className="min-h-screen">
      <div className="page-bg" aria-hidden="true" />
      <div className="page-texture" aria-hidden="true" />
      <div
        aria-hidden="true"
        className={`fixed inset-0 z-[40] transition-opacity duration-200 ${
          showFocusOverlay ? 'opacity-100' : 'opacity-0 pointer-events-none'
        } backdrop-blur-md bg-black/35`}
        onClick={clearSectionFocus}
      />
      <Header />

      <main className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-24 pb-14">
        {!hasData ? (
          <div className="space-y-14 flex flex-col items-center">
            <section id="home" className="w-full max-w-4xl flex flex-col gap-6 items-stretch">
              <div className="glass-panel rounded-3xl p-6 sm:p-8 animate-fade-in h-full w-full">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-muted/50 border border-border text-xs text-muted-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  AI-assisted dataset cleaning
                </div>

                <h2 className="mt-4 text-4xl sm:text-5xl font-semibold tracking-tight text-foreground">
                  Clean your dataset.
                  <span className="block bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">Instantly.</span>
                </h2>

                <p className="mt-4 text-base sm:text-lg text-muted-foreground leading-relaxed">
                  Upload a CSV, Excel, or JSON file and apply powerful cleaning steps like duplicate removal,
                  missing-value handling, whitespace trimming, and type coercion.
                </p>

                <div className="mt-6 flex flex-wrap gap-2">
                  <span className="px-3 py-1 rounded-full bg-muted/50 border border-border text-xs text-muted-foreground">No sign-up</span>
                  <span className="px-3 py-1 rounded-full bg-muted/50 border border-border text-xs text-muted-foreground">Fast preview</span>
                  <span className="px-3 py-1 rounded-full bg-muted/50 border border-border text-xs text-muted-foreground">Export cleaned CSV</span>
                </div>
              </div>

              <div className="glass-panel rounded-3xl p-5 sm:p-6 animate-slide-up h-full flex flex-col w-full relative z-[70]">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Upload dataset</h3>
                    <p className="text-sm text-muted-foreground">Drag and drop, or browse</p>
                  </div>
                </div>
                <div className="flex-1 flex">
                  <div
                    className="w-full"
                    onMouseEnter={() => setIsUploadFocusMode(true)}
                    onMouseLeave={() => setIsUploadFocusMode(false)}
                    onFocusCapture={() => setIsUploadFocusMode(true)}
                    onBlurCapture={() => setIsUploadFocusMode(false)}
                  >
                    <FileUpload onFileSelect={handleFileSelect} isLoading={isLoading} />
                  </div>
                </div>
              </div>
            </section>

            <section
              id="features"
              className={`w-full max-w-4xl space-y-6 relative ${focusedSection === 'features' ? 'z-[70]' : ''}`}
              onMouseLeave={focusedSection === 'features' ? clearSectionFocus : undefined}
            >
              <div className="text-center">
                <h3 className="text-2xl font-semibold text-foreground">Features</h3>
                <p className="text-muted-foreground">Practical tools for real-world messy data</p>
              </div>

              <div className="grid grid-cols-1 gap-5 items-stretch">
                {[
                  { title: 'Remove duplicates', desc: 'Detect and remove repeated rows reliably.' },
                  { title: 'Fix missing values', desc: 'Remove or fill missing entries with common strategies.' },
                  { title: 'Standardize fields', desc: 'Trim whitespace, normalize casing, and coerce types.' },
                ].map((feature, i) => (
                  <div
                    key={i}
                    className={`glass-panel rounded-2xl p-5 animate-slide-up h-full flex flex-col ${
                      focusedSection === 'features' ? 'ring-1 ring-warning/50' : ''
                    }`}
                    style={{ animationDelay: `${i * 80}ms` }}
                  >
                    <div className="w-10 h-10 rounded-xl bg-muted/50 border border-border flex items-center justify-center text-sm text-primary mb-3">
                      {i + 1}
                    </div>
                    <div className="font-semibold text-foreground">{feature.title}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{feature.desc}</div>
                  </div>
                ))}
              </div>
            </section>

            <section
              id="how"
              className={`w-full max-w-4xl flex flex-col gap-5 items-stretch relative ${focusedSection === 'how' || focusedSection === 'tips' ? 'z-[70]' : ''}`}
              onMouseLeave={focusedSection === 'how' ? clearSectionFocus : undefined}
            >
              <div className={`glass-panel rounded-2xl p-5 w-full ${focusedSection === 'how' ? 'ring-1 ring-warning/50' : ''}`}>
                <h3 className="text-xl font-semibold text-foreground">How it works</h3>
                <p className="text-sm text-muted-foreground mt-1">A simple flow from upload to export.</p>

                <div className="mt-5 grid grid-cols-1 gap-4 items-stretch">
                  {[
                    { title: 'Upload', desc: 'Drop your dataset file.' },
                    { title: 'Clean', desc: 'Pick the cleaning options you want.' },
                    { title: 'Export', desc: 'Download the cleaned result as CSV.' },
                  ].map((step, i) => (
                    <div key={i} className="rounded-2xl bg-muted/30 border border-border p-4 h-full">
                      <div className="text-xs text-muted-foreground">Step {i + 1}</div>
                      <div className="mt-1 font-semibold text-foreground">{step.title}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{step.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div
                id="tips"
                className={`glass-panel rounded-2xl p-5 h-full w-full ${focusedSection === 'tips' ? 'ring-1 ring-warning/50' : ''}`}
                onMouseLeave={focusedSection === 'tips' ? clearSectionFocus : undefined}
              >
                <h3 className="text-xl font-semibold text-foreground">Pro tips</h3>
                <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                  <li className="flex gap-2"><span className="text-primary">•</span><span>Keep headers in the first row for best results.</span></li>
                  <li className="flex gap-2"><span className="text-primary">•</span><span>Review the cleaning log to understand every change.</span></li>
                  <li className="flex gap-2"><span className="text-primary">•</span><span>Compare original vs cleaned using the tabs.</span></li>
                </ul>
              </div>
            </section>

            <footer className="w-full max-w-4xl text-center text-xs text-muted-foreground space-y-2">
              <div>Built with React + Tailwind. Your data stays in your browser.</div>
              <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
                <span>Terms of Service</span>
                <span>Privacy Policy</span>
                <span>User Agreement</span>
                <span>Accessibility</span>
              </div>
              <div>built by Sathvik Hegade</div>
              <div>SecureNote © 2026. All rights reserved.</div>
            </footer>
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
