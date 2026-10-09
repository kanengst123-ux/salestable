// IndexedDB and LocalStorage persistent cache utility for instant startup and offline resilience
const DB_NAME = 'wingsang_sales_cache_db';
const STORE_NAME = 'app_cache';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase | null> | null = null;

const getDB = (): Promise<IDBDatabase | null> => {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = window.indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          console.warn('IndexedDB open error:', req.error);
          resolve(null);
        };
      } catch (err) {
        console.warn('IndexedDB initialization exception:', err);
        resolve(null);
      }
    });
  }
  return dbPromise;
};

export const getCachedItem = async <T>(key: string): Promise<T | null> => {
  try {
    const db = await getDB();
    if (db) {
      return new Promise<T | null>((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(key);
          req.onsuccess = () => resolve((req.result as T) ?? null);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
    }
  } catch (err) {
    console.warn('Error reading from IndexedDB:', err);
  }

  // Fallback to localStorage
  try {
    const raw = localStorage.getItem(`ws_cache_${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const setCachedItem = async <T>(key: string, value: T): Promise<void> => {
  try {
    const db = await getDB();
    if (db) {
      await new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          store.put(value, key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
      return;
    }
  } catch (err) {
    console.warn('Error saving to IndexedDB:', err);
  }

  // Fallback to localStorage for moderately sized items
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length < 1500000) {
      localStorage.setItem(`ws_cache_${key}`, serialized);
    }
  } catch (e) {
    console.warn('Could not cache to localStorage:', e);
  }
};
