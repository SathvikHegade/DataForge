import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/client';

export interface DatasetVersionBrief {
  id: string;
  version_number: number;
  branch_name: string;
  row_count: number;
  column_count: number;
  created_at: string;
  execution_status: string;
}

export interface Dataset {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  original_filename: string;
  format: string;
  file_size_bytes: number;
  current_version_id?: string;
  source?: string;
  source_url?: string;
  created_at: string;
  updated_at: string;
  current_version?: DatasetVersionBrief;
}

interface DatasetContextType {
  dataset: Dataset | null;
  selectedVersionId: string | null;
  versions: any[];
  isLoading: boolean;
  setDataset: (dataset: Dataset | null) => void;
  loadDataset: (datasetId: string) => Promise<void>;
  setSelectedVersionId: (versionId: string | null) => void;
  refreshDataset: () => Promise<void>;
  refreshVersions: () => Promise<void>;
}

const DatasetContext = createContext<DatasetContextType | undefined>(undefined);

export const DatasetProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const loadDataset = async (datasetId: string) => {
    setIsLoading(true);
    try {
      const data = await api.getDataset(datasetId);
      setDataset(data);
      setSelectedVersionId(data.current_version_id || null);

      const vList = await api.getVersions(datasetId);
      setVersions(vList);
    } catch (err) {
      console.error('Failed to load dataset:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshDataset = async () => {
    if (dataset) {
      const data = await api.getDataset(dataset.id);
      setDataset(data);
      const vList = await api.getVersions(dataset.id);
      setVersions(vList);
    }
  };

  const refreshVersions = async () => {
    if (dataset) {
      const vList = await api.getVersions(dataset.id);
      setVersions(vList);
    }
  };

  return (
    <DatasetContext.Provider
      value={{
        dataset,
        selectedVersionId,
        versions,
        isLoading,
        setDataset,
        loadDataset,
        setSelectedVersionId,
        refreshDataset,
        refreshVersions,
      }}
    >
      {children}
    </DatasetContext.Provider>
  );
};

export const useDataset = () => {
  const context = useContext(DatasetContext);
  if (!context) {
    throw new Error('useDataset must be used within a DatasetProvider');
  }
  return context;
};
