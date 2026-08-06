// Robust PDF text extraction that works in the browser and inside Android WebView.
// Uses the legacy pdf.js build (wider WebView support) and falls back to a
// main-thread "fake worker" when a real Web Worker cannot be created.

let pdfjsPromise: Promise<any> | null = null;

async function loadPdfjs(): Promise<any> {
  if (pdfjsPromise) return pdfjsPromise;
  pdfjsPromise = (async () => {
    const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
    // 1) Preferred: real module worker from a bundled URL.
    try {
      const workerMod: any = await import(
        "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"
      );
      pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;
    } catch {
      /* handled by fallback below */
    }
    // 2) Fallback: expose the worker message handler globally so pdf.js can
    //    run everything on the main thread instead of crashing.
    try {
      const w: any = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs");
      if (w?.WorkerMessageHandler) {
        (globalThis as any).pdfjsWorker = w;
      }
    } catch {
      /* ignore */
    }
    return pdfjs;
  })();
  return pdfjsPromise;
}

/** Extracts all text from a PDF file. Never throws for worker issues. */
export async function extractPdfText(file: File, maxPages = 200): Promise<string> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());

  const openDoc = (opts: Record<string, unknown>) =>
    pdfjs.getDocument({
      data,
      isEvalSupported: false,
      useSystemFonts: false,
      disableFontFace: true,
      ...opts,
    }).promise;

  let pdf: any;
  try {
    pdf = await openDoc({});
  } catch {
    // Retry forcing the main-thread worker path.
    pdfjs.GlobalWorkerOptions.workerSrc = "";
    pdf = await openDoc({ worker: null });
  }

  const pages = Math.min(pdf.numPages ?? 0, maxPages);
  let allText = "";
  for (let i = 1; i <= pages; i++) {
    try {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      allText += content.items.map((it: any) => it.str ?? "").join(" ") + "\n";
      page.cleanup?.();
    } catch {
      /* skip unreadable page */
    }
  }
  try {
    await pdf.cleanup?.();
    await pdf.destroy?.();
  } catch {
    /* ignore */
  }
  return allText;
}

/** Turns raw PDF text into card lines, either "user" or "user|pass". */
export function pdfTextToCardLines(allText: string, mode: "user_only" | "user_pass"): string {
  const tokens = allText.match(/\d{3,20}/g) ?? [];
  const usernames: string[] = [];
  const passwords: string[] = [];
  for (const t of tokens) {
    if (t.length >= 8) usernames.push(t);
    else passwords.push(t);
  }

  const seen = new Set<string>();
  const uniqueUsers = usernames.filter((u) => (seen.has(u) ? false : (seen.add(u), true)));

  if (mode === "user_only") return uniqueUsers.join("\n");

  const inlineRe = /(\d{8,20})\D{1,20}?(\d{3,7})(?!\d)/g;
  const inlinePairs = new Map<string, string>();
  let m: RegExpExecArray | null;
  while ((m = inlineRe.exec(allText)) !== null) {
    if (!inlinePairs.has(m[1])) inlinePairs.set(m[1], m[2]);
  }
  if (inlinePairs.size >= Math.floor(uniqueUsers.length * 0.6)) {
    return uniqueUsers.map((u) => (inlinePairs.has(u) ? `${u}|${inlinePairs.get(u)}` : u)).join("\n");
  }
  if (passwords.length >= uniqueUsers.length) {
    return uniqueUsers.map((u, i) => `${u}|${passwords[i]}`).join("\n");
  }
  return uniqueUsers.join("\n");
}
