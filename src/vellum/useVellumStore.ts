import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "vellum_store";

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
  status: "draft" | "processing" | "ready";
  createdAt: string;
  lastEdited: string;
  thumbnail: string | null;
}

export interface VellumProfile {
  name: string;
  email: string;
  brokerage: string;
  phone: string;
  website: string;
}

interface StoreData {
  profile: VellumProfile;
  projects: VellumProject[];
}

const DEFAULT_STORE: StoreData = {
  profile: { name: "", email: "", brokerage: "", phone: "", website: "" },
  projects: [],
};

// Transient UI flag (not persisted): signals the photo editor to open the
// native file picker on mount, set when an upload action navigates to /photo.
let pendingUploadOpen = false;

let listeners: (() => void)[] = [];
const notify = () => listeners.forEach((fn) => fn());

const readStore = (): StoreData => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_STORE, ...JSON.parse(raw) } : DEFAULT_STORE;
  } catch {
    return DEFAULT_STORE;
  }
};

const writeStore = (data: StoreData) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage quota exceeded — almost always a legacy oversized
    // thumbnail (a full-res dataURL). Strip ALL thumbnails and retry so the
    // app never crashes; small thumbnails are regenerated on next render.
    try {
      const slim: StoreData = {
        ...data,
        projects: data.projects.map((p) => ({ ...p, thumbnail: null })),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
    } catch {
      // Still failing — skip persistence this write rather than throw/blank.
      if (typeof console !== "undefined") {
        console.warn("[vellum] store persist skipped — storage full");
      }
    }
  }
  notify();
};

export const useVellumStore = () => {
  const [store, setStore] = useState(readStore);
  const [pendingUpload, setPendingUpload] = useState(pendingUploadOpen);

  useEffect(() => {
    const update = () => {
      setStore(readStore());
      setPendingUpload(pendingUploadOpen);
    };
    listeners.push(update);
    return () => {
      listeners = listeners.filter((fn) => fn !== update);
    };
  }, []);

  const setPendingUploadOpen = useCallback((value: boolean) => {
    pendingUploadOpen = value;
    notify();
  }, []);

  const updateProfile = useCallback((partial: Partial<VellumProfile>) => {
    const data = readStore();
    data.profile = { ...data.profile, ...partial };
    writeStore(data);
  }, []);

  const addProject = useCallback(
    (input: {
      address: string;
      city: string;
      propertyType: string;
      beds: number | null;
      baths: number | null;
    }): string => {
      const data = readStore();
      const id = `proj_${Date.now()}`;
      const project: VellumProject = {
        id,
        ...input,
        photoCount: 0,
        refinedCount: 0,
        hasVideo: false,
        status: "draft",
        createdAt: new Date().toISOString(),
        lastEdited: new Date().toISOString(),
        thumbnail: null,
      };
      data.projects.unshift(project);
      writeStore(data);
      return id;
    },
    [],
  );

  const updateProject = useCallback(
    (id: string, partial: Partial<VellumProject>) => {
      const data = readStore();
      data.projects = data.projects.map((p) =>
        p.id === id
          ? { ...p, ...partial, lastEdited: new Date().toISOString() }
          : p,
      );
      writeStore(data);
    },
    [],
  );

  const deleteProject = useCallback((id: string) => {
    const data = readStore();
    data.projects = data.projects.filter((p) => p.id !== id);
    writeStore(data);
  }, []);

  return {
    profile: store.profile,
    projects: store.projects,
    pendingUploadOpen: pendingUpload,
    setPendingUploadOpen,
    updateProfile,
    addProject,
    updateProject,
    deleteProject,
  };
};
