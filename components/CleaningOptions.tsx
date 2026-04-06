import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, Loader2 } from 'lucide-react';
import { useState } from 'react';

export interface CleaningConfig {
  removeDuplicates: boolean;
  handleMissing: boolean;
  missingStrategy: 'mean' | 'median' | 'mode';
  missingThreshold: number; // 0-1, only remove rows if missing% > threshold
  // New: choose whether "remove" applies to rows or columns
  missingTarget?: 'rows' | 'columns';
  // New: when removing columns, which columns to remove (empty = auto by threshold)
  missingColumns?: string[];
  // New: enable removal as a separate option
  removeEnabled?: boolean;
  trimWhitespace: boolean;
  standardizeCase: boolean;
  caseType: 'lower' | 'upper' | 'title';
  removeOutliers: boolean;
  outlierMethod: 'iqr' | 'zscore';
  // Coerce selected columns to a target type
  coercionEnabled?: boolean;
  coercionType?: 'int' | 'float' | 'string' | 'boolean' | 'date';
  coercionColumns?: string[];
}

interface CleaningOptionsProps {
  config: CleaningConfig;
  onConfigChange: (config: CleaningConfig) => void;
  onClean: () => void;
  isLoading: boolean;
  // Columns available in the dataset (for column removal selection)
  columns?: string[];
}

export function CleaningOptions({ config, onConfigChange, onClean, isLoading, columns }: CleaningOptionsProps) {
  const [selectedCoerceColumn, setSelectedCoerceColumn] = useState<string | undefined>(undefined);
  const updateConfig = <K extends keyof CleaningConfig>(key: K, value: CleaningConfig[K]) => {
    onConfigChange({ ...config, [key]: value });
  };

  return (
    <Card className="shadow-card border-border">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          Cleaning Options
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Remove Duplicates */}
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="duplicates" className="text-sm font-medium">Remove Duplicates</Label>
            <p className="text-xs text-muted-foreground">Remove identical rows</p>
          </div>
          <Switch
            id="duplicates"
            checked={config.removeDuplicates}
            onCheckedChange={(v) => updateConfig('removeDuplicates', v)}
          />
        </div>

        {/* Trim Whitespace */}
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="whitespace" className="text-sm font-medium">Trim Whitespace</Label>
            <p className="text-xs text-muted-foreground">Remove extra spaces</p>
          </div>
          <Switch
            id="whitespace"
            checked={config.trimWhitespace}
            onCheckedChange={(v) => updateConfig('trimWhitespace', v)}
          />
        </div>

        {/* Remove Missing (separate) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="remove-missing" className="text-sm font-medium">Remove Missing</Label>
              <p className="text-xs text-muted-foreground">Remove rows or drop columns with many missing values</p>
            </div>
            <Switch
              id="remove-missing"
              checked={!!config.removeEnabled}
              onCheckedChange={(v) => updateConfig('removeEnabled', v as boolean)}
            />
          </div>

          {config.removeEnabled && (
            <>
              <Label className="text-xs text-muted-foreground">
                Remove if missing &gt; {Math.round(config.missingThreshold * 100)}% of columns
              </Label>
              <input
                type="range"
                min="0"
                max="100"
                value={config.missingThreshold * 100}
                onChange={(e) => updateConfig('missingThreshold', parseInt(e.target.value) / 100)}
                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer"
              />

              <div className="flex items-center gap-3 mt-2">
                <Label className="text-sm">Apply removal to</Label>
                <div className="flex items-center gap-2">
                  <button
                    className={`px-3 py-1 rounded ${config.missingTarget === 'rows' || !config.missingTarget ? 'bg-primary text-white' : 'bg-muted'}`}
                    onClick={() => updateConfig('missingTarget', 'rows')}
                    type="button"
                  >
                    Rows
                  </button>
                  <button
                    className={`px-3 py-1 rounded ${config.missingTarget === 'columns' ? 'bg-primary text-white' : 'bg-muted'}`}
                    onClick={() => updateConfig('missingTarget', 'columns')}
                    type="button"
                  >
                    Columns
                  </button>
                </div>
              </div>

              {config.missingTarget === 'columns' && (
                <div className="mt-3 space-y-2">
                  <Label className="text-xs text-muted-foreground">Choose columns to remove (optional)</Label>
                  <div className="max-h-40 overflow-auto border rounded p-2 bg-card">
                    {(columns || []).length === 0 ? (
                      <p className="text-xs text-muted-foreground">No columns available to select</p>
                    ) : (
                      (columns || []).map(col => (
                        <label key={col} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={(config.missingColumns || []).includes(col)}
                            onChange={(e) => {
                              const prev = config.missingColumns || [];
                              if (e.target.checked) {
                                updateConfig('missingColumns', [...prev, col]);
                              } else {
                                updateConfig('missingColumns', prev.filter(c => c !== col));
                              }
                            }}
                          />
                          <span className="truncate">{col}</span>
                        </label>
                      ))
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">If no columns selected, columns with missing% &gt; threshold will be dropped.</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Handle Missing Values */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="missing" className="text-sm font-medium">Handle Missing Values</Label>
              <p className="text-xs text-muted-foreground">Fill nulls using statistical strategies</p>
            </div>
            <Switch
              id="missing"
              checked={config.handleMissing}
              onCheckedChange={(v) => updateConfig('handleMissing', v as boolean)}
            />
          </div>

          {config.handleMissing && (
            <Select
              value={config.missingStrategy}
              onValueChange={(v) => updateConfig('missingStrategy', v as 'mean' | 'median' | 'mode')}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mean">Fill with mean</SelectItem>
                <SelectItem value="median">Fill with median</SelectItem>
                <SelectItem value="mode">Fill with mode</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Coerce Column Types */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="coerce" className="text-sm font-medium">Coerce Column Types</Label>
              <p className="text-xs text-muted-foreground">Convert selected columns to a single data type (int/float/string/...)</p>
            </div>
            <Switch
              id="coerce"
              checked={!!config.coercionEnabled}
              onCheckedChange={(v) => updateConfig('coercionEnabled', v as boolean)}
            />
          </div>

          {config.coercionEnabled && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={config.coercionType || 'float'}
                  onValueChange={(v) => updateConfig('coercionType', v as 'int' | 'float' | 'string' | 'boolean' | 'date')}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="int">Integer</SelectItem>
                    <SelectItem value="float">Float</SelectItem>
                    <SelectItem value="string">String</SelectItem>
                    <SelectItem value="boolean">Boolean</SelectItem>
                    <SelectItem value="date">Date</SelectItem>
                  </SelectContent>
                </Select>
                <div />
              </div>

              <div className="mt-2">
                <Label className="text-xs text-muted-foreground">Choose columns to coerce (select then Add)</Label>
                <div className="flex items-center gap-2 mb-2">
                  <Select
                    value={selectedCoerceColumn || ''}
                    onValueChange={(v) => setSelectedCoerceColumn(v)}
                  >
                    <SelectTrigger className="w-64">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(columns || []).map(col => (
                        <SelectItem key={col} value={col}>{col}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    onClick={() => {
                      if (!selectedCoerceColumn) return;
                      const prev = config.coercionColumns || [];
                      if (!prev.includes(selectedCoerceColumn)) {
                        updateConfig('coercionColumns', [...prev, selectedCoerceColumn]);
                      }
                      setSelectedCoerceColumn(undefined);
                    }}
                  >
                    Add
                  </Button>
                </div>

                <div className="max-h-40 overflow-auto border rounded p-2 bg-card">
                  {(columns || []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">No columns available</p>
                  ) : (
                    (columns || []).map(col => (
                      <label key={col} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={(config.coercionColumns || []).includes(col)}
                          onChange={(e) => {
                            const prev = config.coercionColumns || [];
                            if (e.target.checked) {
                              updateConfig('coercionColumns', [...prev, col]);
                            } else {
                              updateConfig('coercionColumns', prev.filter(c => c !== col));
                            }
                          }}
                        />
                        <span className="truncate">{col}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Standardize Case */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="case" className="text-sm font-medium">Standardize Case</Label>
              <p className="text-xs text-muted-foreground">Convert text casing</p>
            </div>
            <Switch
              id="case"
              checked={config.standardizeCase}
              onCheckedChange={(v) => updateConfig('standardizeCase', v)}
            />
          </div>
          {config.standardizeCase && (
            <Select
              value={config.caseType}
              onValueChange={(v) => updateConfig('caseType', v as 'lower' | 'upper' | 'title')}
            >
              <SelectTrigger className="w-full">
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

        {/* Remove Outliers */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="outliers" className="text-sm font-medium">Remove Outliers</Label>
              <p className="text-xs text-muted-foreground">Filter extreme values</p>
            </div>
            <Switch
              id="outliers"
              checked={config.removeOutliers}
              onCheckedChange={(v) => updateConfig('removeOutliers', v)}
            />
          </div>
          {config.removeOutliers && (
            <Select
              value={config.outlierMethod}
              onValueChange={(v) => updateConfig('outlierMethod', v as 'iqr' | 'zscore')}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="iqr">IQR Method</SelectItem>
                <SelectItem value="zscore">Z-Score (±3σ)</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        <Button
          onClick={onClean}
          className="w-full gradient-primary text-primary-foreground shadow-glow transition-opacity"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Cleaning...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              Clean Data
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
