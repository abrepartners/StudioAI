import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'vellum_store';

export interface VellumProject {
  id: string;
  address: string;
  city: string;
  propertyType: string;
  beds: number | null;
  baths: number | null;
  photoCount: number;
  refinedCount: number;
  hasVideo: boolean;
  status: 'draft' | 'processing' | 'ready';
  createdAt: string;
  lastEdited: string;
  thumbnail: string | null;
}

export interface VellumProfile {
  name: string;
  email: string;
  brokerage: string;
}

interface StoreData {
  profile: VellumProfile;
  projects: VellumProject[];
}

const DEFAULT_STORE: StoreData = {
  profile: { name: '', email: '', brokerage: '' },
  projects: [],
};

let listeners: (() => void)[] = [];
const notify = () => listeners.forEach(fn => fn());

const readStore = (): StoreData => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_STORE, ...JSON.parse(raw) } : DEFAULT_STORE;
  } catch { return DEFAULT_STORE; }
};

const writeStore = (data: StoreData) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  notify();
};

export const useVellumStore = () => {
  const [store, setStore] = useState(readStore);

  useEffect(() => {
    const update = () => setStore(readStore());
    listeners.push(update);
    return () => { listeners = listeners.filter(fn => fn !== update); };
  }, []);

  const updateProfile = useCallback((partial: Partial<VellumProfile>) => {
    const data = readStore();
    data.profile = { ...data.profile, ...partial };
    writeStore(data);
  }, []);

  const addProject = useCallback((input: { address: string; city: string; propertyType: string; beds: number | null; baths: number | null }): string => {
    const data = readStore();
    const id = `proj_${Date.now()}`;
    const project: VellumProject = {
      id,
      ...input,
      photoCount: 0,
      refinedCount: 0,
      hasVideo: false,
      status: 'draft',
      createdAt: new Date().toISOString(),
      lastEdited: new Date().toISOString(),
      thumbnail: null,
    };
    data.projects.unshift(project);
    writeStore(data);
    return id;
  }, []);

  const updateProject = useCallback((id: string, partial: Partial<VellumProject>) => {
    const data = readStore();
    data.projects = data.projects.map(p =>
      p.id === id ? { ...p, ...partial, lastEdited: new Date().toISOString() } : p
    );
    writeStore(data);
  }, []);

  const deleteProject = useCallback((id: string) => {
    const data = readStore();
    data.projects = data.projects.filter(p => p.id !== id);
    writeStore(data);
  }, []);

  return {
    profile: store.profile,
    projects: store.projects,
    updateProfile,
    addProject,
    updateProject,
    deleteProject,
  };
};
