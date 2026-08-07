// قاعدة بيانات محلية مخفية (IndexedDB) لتخزين بيانات التطبيق على الجهاز.
// الهدف: يفتح التطبيق أول مرة بالإنترنت، ثم يعمل من الذاكرة المحلية،
// ويزامن تلقائياً وبشكل خفي عند توفر الاتصال.

import { createStore, get, set, del, clear } from "idb-keyval";

const DB_NAME = "__app_local_v1";
const STORE_NAME = "cache";

let store: ReturnType<typeof createStore> | null = null;

function getStore() {
  if (!store) store = createStore(DB_NAME, STORE_NAME);
  return store;
}

export const localDB = {
  async getItem(key: string): Promise<string | null> {
    try {
      const v = await get<string>(key, getStore());
      return v ?? null;
    } catch {
      // fallback: localStorage في حال منع IndexedDB
      try {
        return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
      } catch {
        return null;
      }
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      await set(key, value, getStore());
    } catch {
      try {
        localStorage?.setItem(key, value);
      } catch {
        /* ignore */
      }
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      await del(key, getStore());
    } catch {
      try {
        localStorage?.removeItem(key);
      } catch {
        /* ignore */
      }
    }
  },
};

/** يمسح كل البيانات المحلية (يُستخدم عند تسجيل الخروج). */
export async function clearLocalDB(): Promise<void> {
  try {
    await clear(getStore());
  } catch {
    /* ignore */
  }
  try {
    localStorage?.removeItem(LOCAL_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

export const LOCAL_CACHE_KEY = "app.local-cache.v2";

/** تحويل Map/Set إلى نص مع الحفاظ على نوعها. */
export function serializeCache(client: unknown): string {
  return JSON.stringify(client, (_k, v) => {
    if (v instanceof Map) return { __t: "Map", v: Array.from(v.entries()) };
    if (v instanceof Set) return { __t: "Set", v: Array.from(v.values()) };
    return v;
  });
}

/** استرجاع Map/Set من النص المخزَّن. */
export function deserializeCache(raw: string): any {
  return JSON.parse(raw, (_k, v) => {
    if (v && typeof v === "object" && Array.isArray((v as any).v)) {
      if ((v as any).__t === "Map") return new Map((v as any).v);
      if ((v as any).__t === "Set") return new Set((v as any).v);
    }
    return v;
  });
}
