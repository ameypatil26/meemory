/**
 * storage.ts — IndexedDB persistence + chrome.storage.local settings for MEEMORY.
 *
 * Database: "meemory" / object store "capsules" (keyPath "id").
 * Indexes: name, created_at, platform, quality, search_text, content_hash.
 */

/** Quality tier of a stored capsule. */
export type CapsuleQuality = 'logic' | 'gemini' | 'low';

/** A single stored memory capsule. */
export interface Capsule {
  /** SHA-256 derived unique id. */
  id: string;
  /** Human-friendly slug derived from the topic. */
  name: string;
  /** Markdown capsule injected into future chats. */
  capsule: string;
  /** Extraction quality tier. */
  quality: CapsuleQuality;
  /** Source AI platform (chatgpt, claude, gemini, ...). */
  platform: string;
  /** Rough token estimate (chars / 4). */
  token_estimate: number;
  /** Epoch ms of creation. */
  created_at: number;
  /** First ~1500 chars of the raw conversation. */
  raw_excerpt: string;
  /** Decay/boost score, 0..1. */
  confidence: number;
  /** Times this capsule was pasted. */
  access_count: number;
  /** Lowercased haystack for search. */
  search_text: string;
  /** SHA-256 of normalized capsule content (dedup). */
  content_hash: string;
}

/** User settings persisted in chrome.storage.local. */
export interface MeemorySettings {
  /** Gemini API key for the optional extraction fallback. Empty = disabled. */
  geminiKey: string;
  /** When true, Paste fills the chat input automatically (never sends). */
  autoPaste: boolean;
  /** When true, the floating "Load Memory" button is shown on chat pages. */
  showFloatingButton: boolean;
}

/** Input shape accepted by {@link saveCapsule} (server fills defaults). */
export type CapsuleInput = Omit<Capsule, 'id' | 'created_at' | 'confidence' | 'access_count'> &
  Partial<Pick<Capsule, 'id' | 'created_at' | 'confidence' | 'access_count'>>;

const DB_NAME = 'meemory';
const DB_VERSION = 1;
const STORE = 'capsules';
const SETTINGS_KEY = 'meemory_settings';

/** Default settings used when nothing is stored yet. */
export const DEFAULT_SETTINGS: MeemorySettings = {
  geminiKey: '',
  autoPaste: false,
  showFloatingButton: true,
};

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Opens (or creates) the IndexedDB database. Safe to call repeatedly.
 * @returns {Promise<IDBDatabase>} the open database handle.
 */
export async function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('name', 'name', { unique: false });
        store.createIndex('created_at', 'created_at', { unique: false });
        store.createIndex('platform', 'platform', { unique: false });
        store.createIndex('quality', 'quality', { unique: false });
        store.createIndex('search_text', 'search_text', { unique: false });
        store.createIndex('content_hash', 'content_hash', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/**
 * Runs a transaction against the capsules store.
 * @param mode - "readonly" or "readwrite".
 * @param fn - callback receiving the object store.
 * @returns {Promise<T>} the callback result.
 */
async function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const result = fn(store);
    t.oncomplete = () => resolve(result instanceof IDBRequest ? (result.result as T) : (undefined as T));
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

/**
 * Persists a capsule. If `id` already exists it overwrites the record.
 * @param capsule - capsule data (id/created_at/confidence/access_count optional).
 * @returns {Promise<Capsule>} the stored capsule with defaults applied.
 */
export async function saveCapsule(capsule: CapsuleInput): Promise<Capsule> {
  const record: Capsule = {
    confidence: 1.0,
    access_count: 0,
    created_at: Date.now(),
    ...capsule,
    id: capsule.id ?? capsule.content_hash,
  };
  await tx('readwrite', (s) => s.put(record));
  return record;
}

/**
 * Returns all capsules sorted by boosted confidence (desc), then recency.
 * @returns {Promise<Capsule[]>} all stored capsules.
 */
export async function listCapsules(): Promise<Capsule[]> {
  const all = await tx<Capsule[]>('readonly', (s) => s.getAll() as IDBRequest<Capsule[]>);
  return (all ?? []).sort((a, b) => score(b) - score(a) || b.created_at - a.created_at);
}

/**
 * Computes the display/access score: confidence * (1 + 0.05 * access_count).
 * @param c - capsule.
 * @returns {number} boosted score.
 */
export function score(c: Pick<Capsule, 'confidence' | 'access_count'>): number {
  return c.confidence * (1 + 0.05 * c.access_count);
}

/**
 * Fetches a single capsule by id.
 * @param id - capsule id.
 * @returns {Promise<Capsule | undefined>} the capsule or undefined.
 */
export async function getCapsule(id: string): Promise<Capsule | undefined> {
  return tx<Capsule | undefined>('readonly', (s) => s.get(id) as IDBRequest<Capsule | undefined>);
}

/**
 * Deletes a capsule by id.
 * @param id - capsule id.
 * @returns {Promise<void>}
 */
export async function deleteCapsule(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id));
}

/**
 * Records an access: increments access_count and bumps confidence by 0.05 (cap 1.0).
 * @param id - capsule id.
 * @returns {Promise<Capsule | undefined>} the updated capsule.
 */
export async function updateAccess(id: string): Promise<Capsule | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    const store = t.objectStore(STORE);
    let updated: Capsule | undefined;
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const c = getReq.result as Capsule | undefined;
      if (!c) return;
      c.access_count += 1;
      c.confidence = Math.min(1.0, c.confidence + 0.05);
      updated = c;
      store.put(c);
    };
    t.oncomplete = () => resolve(updated);
    t.onerror = () => reject(t.error);
  });
}

/**
 * Finds a capsule with the same content hash created within the last 24h.
 * Used for dedup-before-insert.
 * @param contentHash - SHA-256 hex of the normalized capsule content.
 * @param windowMs - dedup window (default 24h).
 * @returns {Promise<Capsule | undefined>} matching capsule if any.
 */
export async function findDuplicate(
  contentHash: string,
  windowMs = 24 * 60 * 60 * 1000,
): Promise<Capsule | undefined> {
  const all = await listCapsules();
  const cutoff = Date.now() - windowMs;
  return all.find((c) => c.content_hash === contentHash && c.created_at >= cutoff);
}

/**
 * Returns every capsule (unsorted) for export.
 * @returns {Promise<Capsule[]>}
 */
export async function exportAll(): Promise<Capsule[]> {
  return tx<Capsule[]>('readonly', (s) => s.getAll() as IDBRequest<Capsule[]>);
}

/**
 * Bulk-imports capsules. Existing ids are overwritten; missing ids get one.
 * @param capsules - capsules to import.
 * @returns {Promise<number>} number of capsules stored.
 */
export async function importCapsules(capsules: CapsuleInput[]): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    const store = t.objectStore(STORE);
    for (const c of capsules) {
      store.put({
        confidence: 1.0,
        access_count: 0,
        created_at: Date.now(),
        ...c,
        id: c.id ?? c.content_hash,
      } satisfies Capsule);
    }
    t.oncomplete = () => resolve(capsules.length);
    t.onerror = () => reject(t.error);
  });
}

/**
 * Loads settings from chrome.storage.local, merging defaults.
 * @returns {Promise<MeemorySettings>}
 */
export async function getSettings(): Promise<MeemorySettings> {
  const res = await chrome.storage.local.get(SETTINGS_KEY);
  const stored = (res[SETTINGS_KEY] ?? {}) as Partial<MeemorySettings>;
  return { ...DEFAULT_SETTINGS, ...stored };
}

/**
 * Persists settings to chrome.storage.local.
 * @param settings - full or partial settings object.
 * @returns {Promise<void>}
 */
export async function setSettings(settings: Partial<MeemorySettings>): Promise<void> {
  const current = await getSettings();
  await chrome.storage.local.set({ [SETTINGS_KEY]: { ...current, ...settings } });
}
