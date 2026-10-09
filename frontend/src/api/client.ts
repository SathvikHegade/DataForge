const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'https://dataforge-a1fh.onrender.com/api/v1').replace(/\/+$/, '');

export interface ApiError {
  message: string;
  status?: number;
}

export interface AuthUser {
  id: string;
  email: string;
  full_name?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

export interface RegisterRequest {
  email: string;
  password: string;
  full_name?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

function getErrorMessage(detail: unknown): string | undefined {
  if (typeof detail === 'string') {
    return detail;
  }

  if (Array.isArray(detail)) {
    const messages = detail.map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && 'msg' in item) {
        return String(item.msg);
      }
      return null;
    }).filter(Boolean);
    if (messages.length > 0) return messages.join('. ');
  }

  if (detail && typeof detail === 'object' && 'message' in detail) {
    return String(detail.message);
  }

  return undefined;
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('dataforge_token');
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${API_BASE}${cleanEndpoint}`;

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 204) {
    return null as any;
  }

  // Check content type
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/octet-stream') || 
      contentType.includes('text/csv') || 
      contentType.includes('application/vnd.openxmlformats')) {
    const blob = await response.blob();
    return blob as any;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = getErrorMessage(data?.detail) || getErrorMessage(data?.message) || `Request failed with status ${response.status}`;
    const err: ApiError = { message: errorMsg, status: response.status };
    throw err;
  }

  return data as T;
}

export function buildJobsEndpoint(datasetId?: string, limit?: number): string {
  const params = new URLSearchParams();
  if (datasetId) {
    params.set('dataset_id', datasetId);
  }
  if (limit !== undefined) {
    params.set('limit', String(limit));
  }
  const query = params.toString();
  return `/jobs/${query ? `?${query}` : ''}`;
}

export function buildVisualizationMetadataEndpoint(datasetId: string, versionId?: string): string {
  const params = new URLSearchParams();
  if (versionId) {
    params.set('version_id', versionId);
  }
  const query = params.toString();
  return `/datasets/${encodeURIComponent(datasetId)}/visualizations/metadata${query ? `?${query}` : ''}`;
}

export const api = {
  // Auth
  register: (body: RegisterRequest) => apiRequest<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: LoginRequest) => apiRequest<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  getMe: () => apiRequest<AuthUser>('/auth/me'),
  logout: () => apiRequest<{ message: string }>('/auth/logout', { method: 'POST' }),

  // Datasets
  getDatasets: (params?: string) => apiRequest(`/datasets/${params ? `?${params}` : ''}`),
  getDataset: (id: string) => apiRequest(`/datasets/${id}`),
  deleteDataset: (id: string) => apiRequest(`/datasets/${id}`, { method: 'DELETE' }),
  getPreview: (id: string, versionId?: string, page = 1, pageSize = 50) =>
    apiRequest(`/datasets/${id}/preview?page=${page}&page_size=${pageSize}${versionId ? `&version_id=${versionId}` : ''}`),

  // Upload with FormData
  uploadDataset: (formData: FormData) =>
    apiRequest('/datasets/upload', { method: 'POST', body: formData }),

  // External Imports (Kaggle & Hugging Face)
  importKaggleDataset: (body: { url: string; name?: string; description?: string }) =>
    apiRequest('/datasets/kaggle', { method: 'POST', body: JSON.stringify(body) }),

  getHuggingFaceSplits: (url: string) =>
    apiRequest<{ repository: string; splits: string[]; default_split: string; suggested_name?: string }>('/datasets/huggingface/splits', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),

  importHuggingFaceDataset: (body: { url: string; split?: string; name?: string; description?: string }) =>
    apiRequest('/datasets/huggingface', { method: 'POST', body: JSON.stringify(body) }),

  // Profiling
  getProfile: (datasetId: string, versionId?: string) =>
    apiRequest(`/datasets/${datasetId}/profile${versionId ? `?version_id=${versionId}` : ''}`),
  generateProfile: (datasetId: string, versionId?: string) =>
    apiRequest(`/datasets/${datasetId}/profile${versionId ? `?version_id=${versionId}` : ''}`, { method: 'POST' }),

  // Schemas
  getSchemas: (datasetId?: string) => apiRequest(`/schemas/${datasetId ? `?dataset_id=${datasetId}` : ''}`),
  getSchema: (id: string) => apiRequest(`/schemas/${id}`),
  createSchema: (body: any) => apiRequest('/schemas/', { method: 'POST', body: JSON.stringify(body) }),
  deleteSchema: (id: string) => apiRequest(`/schemas/${id}`, { method: 'DELETE' }),
  compareSchema: (datasetId: string, versionId?: string, schemaId?: string, customColumns?: any) =>
    apiRequest(`/schemas/compare?dataset_id=${datasetId}${versionId ? `&version_id=${versionId}` : ''}${schemaId ? `&schema_id=${schemaId}` : ''}`, {
      method: 'POST',
      body: customColumns ? JSON.stringify(customColumns) : undefined,
    }),

  // Transformations
  getOperations: () => apiRequest('/transformations/operations'),
  previewTransformation: (body: any) =>
    apiRequest('/transformations/preview', { method: 'POST', body: JSON.stringify(body) }),
  executeTransformation: (body: any) =>
    apiRequest('/transformations/execute', { method: 'POST', body: JSON.stringify(body) }),
  getTransformationHistory: (datasetId: string) =>
    apiRequest(`/transformations/history/${datasetId}`),

  // Validation
  getValidationReport: (datasetId: string, versionId?: string) =>
    apiRequest(`/validation/${datasetId}/report${versionId ? `?version_id=${versionId}` : ''}`),
  runValidation: (datasetId: string, body: any = {}) =>
    apiRequest(`/validation/${datasetId}/validate`, { method: 'POST', body: JSON.stringify(body) }),

  // Versions
  getVersions: (datasetId: string) => apiRequest(`/datasets/${datasetId}/versions`),
  compareVersions: (datasetId: string, v1: string, v2: string) =>
    apiRequest(`/datasets/${datasetId}/versions/compare?source_version_id=${v1}&target_version_id=${v2}`, { method: 'POST' }),
  restoreVersion: (datasetId: string, targetVersionId: string) =>
    apiRequest(`/datasets/${datasetId}/versions/restore`, { method: 'POST', body: JSON.stringify({ target_version_id: targetVersionId }) }),
  branchVersion: (datasetId: string, sourceVersionId: string, branchName: string) =>
    apiRequest(`/datasets/${datasetId}/versions/branch`, { method: 'POST', body: JSON.stringify({ source_version_id: sourceVersionId, branch_name: branchName }) }),

  // ML Readiness
  getMLReadiness: (datasetId: string, versionId?: string, taskType = 'classification', targetColumn?: string) =>
    apiRequest(`/datasets/${datasetId}/readiness?task_type=${taskType}${versionId ? `&version_id=${versionId}` : ''}${targetColumn ? `&target_column=${targetColumn}` : ''}`),
  evaluateMLReadiness: (datasetId: string, body: any) =>
    apiRequest(`/datasets/${datasetId}/readiness`, { method: 'POST', body: JSON.stringify(body) }),

  // Jobs
  getJobs: (datasetId?: string, limit?: number) => apiRequest(buildJobsEndpoint(datasetId, limit)),
  getJob: (jobId: string) => apiRequest(`/jobs/${jobId}`),
  cancelJob: (jobId: string) => apiRequest(`/jobs/${jobId}/cancel`, { method: 'POST' }),

  // Data visualisation
  getVisualizationMetadata: (datasetId: string, versionId?: string) =>
    apiRequest(buildVisualizationMetadataEndpoint(datasetId, versionId)),
  createVisualization: (
    datasetId: string,
    body: {
      chart_type: string;
      columns?: string[];
      x_column?: string;
      y_column?: string;
      group_column?: string;
      aggregation?: string;
      value_column?: string;
      bins?: number;
      correlation_method?: string;
      sample_size?: number;
    },
    versionId?: string,
  ) => {
    const params = new URLSearchParams();
    if (versionId) {
      params.set('version_id', versionId);
    }
    const query = params.toString();
    return apiRequest(`/datasets/${encodeURIComponent(datasetId)}/visualizations/chart${query ? `?${query}` : ''}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  // Export
  exportDataset: async (datasetId: string, body: any) => {
    const token = localStorage.getItem('dataforge_token');
    const response = await fetch(`${API_BASE}/datasets/${datasetId}/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || 'Export failed');
    }
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    let filename = `dataset_${datasetId}.${body.format || 'csv'}`;
    const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
    if (filenameMatch && filenameMatch[1]) {
      filename = filenameMatch[1];
    }
    return { blob, filename };
  }
};
