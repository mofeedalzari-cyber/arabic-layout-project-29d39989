// Offline operation queue with automatic sync on reconnect.
// Stores pending operations in localStorage and replays them via registered handlers.
//
// Usage:
//   registerOfflineHandler("sale.create", async (payload) => { ... });
//   await enqueueOrRun("sale.create", payload, () => doItNow(payload));
//
// The helper runs the operation immediately when online, otherwise queues it.

import { addBreadcrumb, captureError } from "./sentry";

const STORAGE_KEY = "app.offline_queue.v1";

export type QueuedOp = {
  id: string;
  type: string;
  payload: unknown;
  createdAt: number;
  attempts: number;
};

type Handler = (payload: unknown) => Promise<void>;
const handlers = new Map<string, Handler>();

function readQueue(): QueuedOp[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QueuedOp[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(q: QueuedOp[]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(q));
  } catch (err) {
    captureError(err, { source: "offline-queue.writeQueue" });
  }
  notifyListeners();
}

const listeners = new Set<(size: number) => void>();
function notifyListeners() {
  const size = readQueue().length;
  listeners.forEach((fn) => {
    try { fn(size); } catch {}
  });
}

export function subscribeQueueSize(fn: (size: number) => void): () => void {
  listeners.add(fn);
  fn(readQueue().length);
  return () => listeners.delete(fn);
}

export function registerOfflineHandler(type: string, handler: Handler) {
  handlers.set(type, handler);
}

export function enqueue(type: string, payload: unknown) {
  const q = readQueue();
  q.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    payload,
    createdAt: Date.now(),
    attempts: 0,
  });
  writeQueue(q);
  addBreadcrumb("offline-queue: enqueued", { type, size: q.length });
}

/**
 * Runs the operation immediately if online, otherwise queues it for later sync.
 * Returns true if executed inline, false if queued.
 */
export async function enqueueOrRun(
  type: string,
  payload: unknown,
  run: () => Promise<void>,
): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    enqueue(type, payload);
    return false;
  }
  try {
    await run();
    return true;
  } catch (err) {
    // Network-shaped error → queue for retry
    if (isNetworkError(err)) {
      enqueue(type, payload);
      return false;
    }
    throw err;
  }
}

function isNetworkError(err: unknown): boolean {
  if (!err) return false;
  const msg = String((err as any)?.message ?? err).toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("fetch failed") ||
    msg.includes("load failed")
  );
}

let flushing = false;
export async function flushQueue(): Promise<{ ok: number; failed: number; skipped: number }> {
  if (flushing) return { ok: 0, failed: 0, skipped: 0 };
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { ok: 0, failed: 0, skipped: 0 };
  }
  flushing = true;
  let ok = 0, failed = 0, skipped = 0;
  try {
    const q = readQueue();
    const remaining: QueuedOp[] = [];
    for (const op of q) {
      const handler = handlers.get(op.type);
      if (!handler) { remaining.push(op); skipped++; continue; }
      try {
        await handler(op.payload);
        ok++;
        addBreadcrumb("offline-queue: synced", { type: op.type, id: op.id });
      } catch (err) {
        op.attempts++;
        failed++;
        captureError(err, { source: "offline-queue.flush", type: op.type, attempts: op.attempts });
        // Drop after too many attempts to avoid infinite loops
        if (op.attempts < 6) remaining.push(op);
      }
    }
    writeQueue(remaining);
  } finally {
    flushing = false;
  }
  return { ok, failed, skipped };
}

export function initOfflineQueueAutoSync() {
  if (typeof window === "undefined") return;
  window.addEventListener("online", () => {
    void flushQueue();
  });
  // Try once at startup in case we came back online while closed.
  if (navigator.onLine) {
    setTimeout(() => { void flushQueue(); }, 1500);
  }
}
