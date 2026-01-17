import { DataRow, BaselineModel, CleaningLog } from '@/types/dataset';

// Simple Linear Regression for numeric targets
export function trainLinearRegression(
  data: DataRow[],
  featureColumns: string[],
  targetColumn: string
): BaselineModel {
  const features = extractFeatures(data, featureColumns);
  const targets = data.map(r => Number(r[targetColumn])).filter(t => !isNaN(t));

  if (features.length === 0 || targets.length === 0) {
    throw new Error('Insufficient data for training');
  }

  // Add bias term (column of 1s)
  const X = features.map(row => [1, ...row]);
  const y = targets;

  // Simple OLS: coefficients = (X'X)^-1 * X'y
  const coefficients = ordinaryLeastSquares(X, y);

  // Calculate predictions and metrics
  const predictions = X.map(row => 
    row.reduce((sum, val, i) => sum + val * coefficients[i], 0)
  );

  const mse = predictions.reduce((sum, pred, i) => 
    sum + Math.pow(pred - y[i], 2), 0) / predictions.length;
  
  const rmse = Math.sqrt(mse);
  
  // R-squared
  const yMean = y.reduce((a, b) => a + b, 0) / y.length;
  const ssRes = predictions.reduce((sum, pred, i) => sum + Math.pow(y[i] - pred, 2), 0);
  const ssTot = y.reduce((sum, val) => sum + Math.pow(val - yMean, 2), 0);
  const r2 = 1 - (ssRes / ssTot);

  // MAE
  const mae = predictions.reduce((sum, pred, i) => 
    sum + Math.abs(pred - y[i]), 0) / predictions.length;

  return {
    type: 'linear_regression',
    features: featureColumns,
    target: targetColumn,
    coefficients: {
      intercept: coefficients[0],
      weights: Object.fromEntries(featureColumns.map((col, i) => [col, coefficients[i + 1]]))
    },
    metrics: {
      mse: Math.round(mse * 1000) / 1000,
      rmse: Math.round(rmse * 1000) / 1000,
      mae: Math.round(mae * 1000) / 1000,
      r2: Math.round(r2 * 1000) / 1000
    },
    trainedAt: new Date()
  };
}

// Simple Logistic Regression for binary classification
export function trainLogisticRegression(
  data: DataRow[],
  featureColumns: string[],
  targetColumn: string,
  maxIterations: number = 100,
  learningRate: number = 0.01
): BaselineModel {
  const features = extractFeatures(data, featureColumns);
  const targets = data.map(r => r[targetColumn]);
  
  // Get unique classes
  const classes = [...new Set(targets)].slice(0, 2);
  const y = targets.map(t => t === classes[1] ? 1 : 0);

  if (features.length === 0) {
    throw new Error('Insufficient data for training');
  }

  // Add bias term
  const X = features.map(row => [1, ...row]);
  
  // Initialize weights
  let weights = new Array(X[0].length).fill(0);

  // Gradient descent
  for (let iter = 0; iter < maxIterations; iter++) {
    const predictions = X.map(row => sigmoid(dotProduct(row, weights)));
    
    // Calculate gradients
    const gradients = weights.map((_, j) => 
      X.reduce((sum, row, i) => sum + (predictions[i] - y[i]) * row[j], 0) / X.length
    );

    // Update weights
    weights = weights.map((w, j) => w - learningRate * gradients[j]);
  }

  // Final predictions and metrics
  const predictions = X.map(row => sigmoid(dotProduct(row, weights)));
  const binaryPredictions = predictions.map(p => p >= 0.5 ? 1 : 0);

  // Confusion matrix
  let tp = 0, tn = 0, fp = 0, fn = 0;
  binaryPredictions.forEach((pred, i) => {
    if (pred === 1 && y[i] === 1) tp++;
    else if (pred === 0 && y[i] === 0) tn++;
    else if (pred === 1 && y[i] === 0) fp++;
    else fn++;
  });

  const accuracy = (tp + tn) / (tp + tn + fp + fn);
  const precision = tp / (tp + fp) || 0;
  const recall = tp / (tp + fn) || 0;
  const f1 = 2 * (precision * recall) / (precision + recall) || 0;

  // Log loss
  const yNumbers = y as number[];
  const logLoss = -yNumbers.reduce((sum: number, actual: number, i: number) => {
    const pred = Math.max(0.001, Math.min(0.999, predictions[i]));
    return sum + actual * Math.log(pred) + (1 - actual) * Math.log(1 - pred);
  }, 0) / y.length;

  return {
    type: 'logistic_regression',
    features: featureColumns,
    target: targetColumn,
    classes,
    coefficients: {
      intercept: weights[0],
      weights: Object.fromEntries(featureColumns.map((col, i) => [col, weights[i + 1]]))
    },
    metrics: {
      accuracy: Math.round(accuracy * 1000) / 1000,
      precision: Math.round(precision * 1000) / 1000,
      recall: Math.round(recall * 1000) / 1000,
      f1: Math.round(f1 * 1000) / 1000,
      logLoss: Math.round(logLoss * 1000) / 1000,
      confusionMatrix: { tp, tn, fp, fn }
    },
    trainedAt: new Date()
  };
}

// Simple Decision Tree (for demonstration)
export function trainDecisionTree(
  data: DataRow[],
  featureColumns: string[],
  targetColumn: string,
  maxDepth: number = 5,
  minSamples: number = 10
): BaselineModel {
  const features = extractFeatures(data, featureColumns);
  const targets = data.map(r => r[targetColumn]);
  const uniqueTargets = [...new Set(targets)];

  const isClassification = uniqueTargets.length <= 10 || 
    targets.every(t => typeof t === 'string');

  // Build tree
  const tree = buildTree(features, targets, featureColumns, maxDepth, minSamples, 0, isClassification);

  // Calculate metrics using tree predictions
  const predictions = features.map(row => predictTree(row, tree, featureColumns));

  let metrics: Record<string, number | object>;
  
  if (isClassification) {
    let correct = 0;
    predictions.forEach((pred, i) => {
      if (pred === targets[i]) correct++;
    });
    metrics = {
      accuracy: Math.round((correct / predictions.length) * 1000) / 1000,
      numNodes: countNodes(tree)
    };
  } else {
    const numPredictions = predictions.map(Number);
    const numTargets = targets.map(Number);
    
    const mse = numPredictions.reduce((sum, pred, i) => 
      sum + Math.pow(pred - numTargets[i], 2), 0) / predictions.length;
    
    metrics = {
      mse: Math.round(mse * 1000) / 1000,
      rmse: Math.round(Math.sqrt(mse) * 1000) / 1000,
      numNodes: countNodes(tree)
    };
  }

  return {
    type: isClassification ? 'decision_tree_classifier' : 'decision_tree_regressor',
    features: featureColumns,
    target: targetColumn,
    tree,
    metrics,
    trainedAt: new Date()
  };
}

// Helper functions
function extractFeatures(data: DataRow[], columns: string[]): number[][] {
  return data.map(row => 
    columns.map(col => {
      const val = row[col];
      return typeof val === 'number' ? val : parseFloat(val as string) || 0;
    })
  ).filter(row => row.every(v => !isNaN(v)));
}

function ordinaryLeastSquares(X: number[][], y: number[]): number[] {
  const n = X.length;
  const p = X[0].length;

  // X'X
  const XtX: number[][] = Array(p).fill(0).map(() => Array(p).fill(0));
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) {
      for (let k = 0; k < n; k++) {
        XtX[i][j] += X[k][i] * X[k][j];
      }
    }
  }

  // X'y
  const Xty: number[] = Array(p).fill(0);
  for (let i = 0; i < p; i++) {
    for (let k = 0; k < n; k++) {
      Xty[i] += X[k][i] * y[k];
    }
  }

  // Solve XtX * beta = Xty using simple method (Gaussian elimination)
  return solveLinearSystem(XtX, Xty);
}

function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = A.length;
  const augmented = A.map((row, i) => [...row, b[i]]);

  // Forward elimination
  for (let i = 0; i < n; i++) {
    // Find pivot
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
        maxRow = k;
      }
    }
    [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];

    // Check for singular matrix
    if (Math.abs(augmented[i][i]) < 1e-10) {
      augmented[i][i] = 1e-10;
    }

    // Eliminate
    for (let k = i + 1; k < n; k++) {
      const factor = augmented[k][i] / augmented[i][i];
      for (let j = i; j <= n; j++) {
        augmented[k][j] -= factor * augmented[i][j];
      }
    }
  }

  // Back substitution
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = augmented[i][n];
    for (let j = i + 1; j < n; j++) {
      x[i] -= augmented[i][j] * x[j];
    }
    x[i] /= augmented[i][i];
  }

  return x;
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, z))));
}

function dotProduct(a: number[], b: number[]): number {
  return a.reduce((sum, val, i) => sum + val * b[i], 0);
}

// Decision tree node type
interface TreeNode {
  type: 'leaf' | 'split';
  value?: any;
  feature?: number;
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
}

function buildTree(
  features: number[][],
  targets: any[],
  featureNames: string[],
  maxDepth: number,
  minSamples: number,
  depth: number,
  isClassification: boolean
): TreeNode {
  // Base cases
  if (depth >= maxDepth || features.length < minSamples) {
    return { type: 'leaf', value: getMajorityOrMean(targets, isClassification) };
  }

  // Check if all targets are the same
  if (new Set(targets).size === 1) {
    return { type: 'leaf', value: targets[0] };
  }

  // Find best split
  const { feature, threshold, gain } = findBestSplit(features, targets, isClassification);

  if (gain <= 0) {
    return { type: 'leaf', value: getMajorityOrMean(targets, isClassification) };
  }

  // Split data
  const leftIndices: number[] = [];
  const rightIndices: number[] = [];
  
  features.forEach((row, i) => {
    if (row[feature] <= threshold) {
      leftIndices.push(i);
    } else {
      rightIndices.push(i);
    }
  });

  if (leftIndices.length === 0 || rightIndices.length === 0) {
    return { type: 'leaf', value: getMajorityOrMean(targets, isClassification) };
  }

  const leftFeatures = leftIndices.map(i => features[i]);
  const leftTargets = leftIndices.map(i => targets[i]);
  const rightFeatures = rightIndices.map(i => features[i]);
  const rightTargets = rightIndices.map(i => targets[i]);

  return {
    type: 'split',
    feature,
    threshold,
    left: buildTree(leftFeatures, leftTargets, featureNames, maxDepth, minSamples, depth + 1, isClassification),
    right: buildTree(rightFeatures, rightTargets, featureNames, maxDepth, minSamples, depth + 1, isClassification)
  };
}

function findBestSplit(features: number[][], targets: any[], isClassification: boolean): {
  feature: number;
  threshold: number;
  gain: number;
} {
  let bestGain = -Infinity;
  let bestFeature = 0;
  let bestThreshold = 0;

  const numFeatures = features[0]?.length || 0;

  for (let f = 0; f < numFeatures; f++) {
    const values = [...new Set(features.map(row => row[f]))].sort((a, b) => a - b);
    
    for (let i = 0; i < values.length - 1; i++) {
      const threshold = (values[i] + values[i + 1]) / 2;
      
      const leftTargets: any[] = [];
      const rightTargets: any[] = [];
      
      features.forEach((row, idx) => {
        if (row[f] <= threshold) {
          leftTargets.push(targets[idx]);
        } else {
          rightTargets.push(targets[idx]);
        }
      });

      const gain = calculateGain(targets, leftTargets, rightTargets, isClassification);
      
      if (gain > bestGain) {
        bestGain = gain;
        bestFeature = f;
        bestThreshold = threshold;
      }
    }
  }

  return { feature: bestFeature, threshold: bestThreshold, gain: bestGain };
}

function calculateGain(parent: any[], left: any[], right: any[], isClassification: boolean): number {
  if (left.length === 0 || right.length === 0) return -Infinity;

  if (isClassification) {
    const parentEntropy = entropy(parent);
    const leftEntropy = entropy(left);
    const rightEntropy = entropy(right);
    
    const weightedChildEntropy = 
      (left.length * leftEntropy + right.length * rightEntropy) / parent.length;
    
    return parentEntropy - weightedChildEntropy;
  } else {
    const parentVar = variance(parent.map(Number));
    const leftVar = variance(left.map(Number));
    const rightVar = variance(right.map(Number));
    
    const weightedChildVar = 
      (left.length * leftVar + right.length * rightVar) / parent.length;
    
    return parentVar - weightedChildVar;
  }
}

function entropy(values: any[]): number {
  const counts = new Map<any, number>();
  values.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
  
  return Array.from(counts.values()).reduce((e, count) => {
    const p = count / values.length;
    return e - p * Math.log2(p);
  }, 0);
}

function variance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
}

function getMajorityOrMean(targets: any[], isClassification: boolean): any {
  if (isClassification) {
    const counts = new Map<any, number>();
    targets.forEach(t => counts.set(t, (counts.get(t) || 0) + 1));
    let maxCount = 0;
    let majority = targets[0];
    counts.forEach((count, val) => {
      if (count > maxCount) {
        maxCount = count;
        majority = val;
      }
    });
    return majority;
  } else {
    const nums = targets.map(Number).filter(n => !isNaN(n));
    return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
  }
}

function predictTree(row: number[], node: TreeNode, featureNames: string[]): any {
  if (node.type === 'leaf') {
    return node.value;
  }
  
  if (row[node.feature!] <= node.threshold!) {
    return predictTree(row, node.left!, featureNames);
  } else {
    return predictTree(row, node.right!, featureNames);
  }
}

function countNodes(node: TreeNode): number {
  if (node.type === 'leaf') return 1;
  return 1 + countNodes(node.left!) + countNodes(node.right!);
}

// Auto-select appropriate model based on target
export function autoTrainBaseline(
  data: DataRow[],
  featureColumns: string[],
  targetColumn: string
): { model: BaselineModel; log: CleaningLog } {
  const targets = data.map(r => r[targetColumn]).filter(t => t !== null && t !== undefined);
  const uniqueTargets = new Set(targets);

  let model: BaselineModel;
  let modelType: string;

  // Determine if classification or regression
  if (uniqueTargets.size <= 10 || targets.every(t => typeof t === 'string')) {
    if (uniqueTargets.size === 2) {
      model = trainLogisticRegression(data, featureColumns, targetColumn);
      modelType = 'Logistic Regression (Binary Classification)';
    } else {
      model = trainDecisionTree(data, featureColumns, targetColumn);
      modelType = 'Decision Tree (Multi-class Classification)';
    }
  } else {
    // Regression
    try {
      model = trainLinearRegression(data, featureColumns, targetColumn);
      modelType = 'Linear Regression';
    } catch {
      model = trainDecisionTree(data, featureColumns, targetColumn);
      modelType = 'Decision Tree (Regression)';
    }
  }

  return {
    model,
    log: {
      operation: 'Baseline Model Training',
      details: `Trained ${modelType} with ${featureColumns.length} features`,
      rowsAffected: data.length,
      timestamp: new Date(),
      category: 'model'
    }
  };
}
