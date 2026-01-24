import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, Loader2 } from 'lucide-react';

export interface CleaningConfig {
  removeDuplicates: boolean;
  handleMissing: boolean;
  missingStrategy: 'remove' | 'mean' | 'median' | 'mode';
  missingThreshold: number; // 0-1, only remove rows if missing% > threshold
  trimWhitespace: boolean;
  standardizeCase: boolean;
  caseType: 'lower' | 'upper' | 'title';
  removeOutliers: boolean;
  outlierMethod: 'iqr' | 'zscore';
}

interface CleaningOptionsProps {
  config: CleaningConfig;
  onConfigChange: (config: CleaningConfig) => void;
  onClean: () => void;
  isLoading: boolean;
}

export function CleaningOptions({ config, onConfigChange, onClean, isLoading }: CleaningOptionsProps) {
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

        {/* Handle Missing Values */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="missing" className="text-sm font-medium">Handle Missing Values</Label>
              <p className="text-xs text-muted-foreground">Fill or remove nulls</p>
            </div>
            <Switch
              id="missing"
              checked={config.handleMissing}
              onCheckedChange={(v) => updateConfig('handleMissing', v)}
            />
          </div>
          {config.handleMissing && (
            <>
              <Select
                value={config.missingStrategy}
                onValueChange={(v) => updateConfig('missingStrategy', v as 'remove' | 'mean' | 'median' | 'mode')}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="remove">Remove rows</SelectItem>
                  <SelectItem value="mean">Fill with mean</SelectItem>
                  <SelectItem value="median">Fill with median</SelectItem>
                  <SelectItem value="mode">Fill with mode</SelectItem>
                </SelectContent>
              </Select>
              {config.missingStrategy === 'remove' && (
                <div className="space-y-1">
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
                </div>
              )}
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
