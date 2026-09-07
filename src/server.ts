import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

// --- Security headers (OWASP hardening) ---------------------------------
// Applied to every response. CSP is only attached to HTML documents so that
// static assets / API JSON responses are not affected.
const CSP = [
  "default-src 'self'",
  // Vite/TanStack inject inline bootstrap + JSON-LD scripts.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "connect-src 'self' https: wss:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Clickjacking protection (modern replacement for X-Frame-Options);
  // the Lovable editor preview needs to embed the app.
  "frame-ancestors 'self' https://*.lovable.app https://*.lovable.dev https://lovable.dev",
  "upgrade-insecure-requests",
].join("; ");

// Cross-origin requests are only echoed back for known-good origins.
const TRUSTED_ORIGIN_PATTERNS: RegExp[] = [
  /^https:\/\/([a-z0-9-]+\.)*lovable\.app$/i,
  /^https:\/\/([a-z0-9-]+\.)*lovable\.dev$/i,
  /^https:\/\/([a-z0-9-]+\.)*onrender\.com$/i,
  /^https?:\/\/localhost(:\d+)?$/i,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/i,
  // Capacitor / native WebView origins
  /^capacitor:\/\/localhost$/i,
  /^https:\/\/localhost$/i,
];

function isTrustedOrigin(origin: string): boolean {
  return TRUSTED_ORIGIN_PATTERNS.some((re) => re.test(origin));
}

function withSecurityHeaders(response: Response, request?: Request): Response {
  const headers = new Headers(response.headers);
  const isHtml = (headers.get("content-type") ?? "").includes("text/html");

  const origin = request?.headers.get("origin") ?? "";
  if (origin && isTrustedOrigin(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-credentials", "true");
    headers.set("vary", "Origin");
    headers.set("access-control-allow-methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    headers.set("access-control-allow-headers", "authorization, content-type, apikey, x-client-info");
  }

  if (isHtml && !headers.has("content-security-policy")) {
    headers.set("content-security-policy", CSP);
  }
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set(
    "permissions-policy",
    "geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=()",
  );
  headers.set("cross-origin-opener-policy", "same-origin");
  headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  headers.set("x-permitted-cross-domain-policies", "none");
  // Do not disclose server/runtime details.
  headers.delete("server");
  headers.delete("x-powered-by");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      if (request.method === "OPTIONS") {
        return withSecurityHeaders(new Response(null, { status: 204 }), request);
      }
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withSecurityHeaders(await normalizeCatastrophicSsrResponse(response), request);
    } catch (error) {
      console.error(error);
      return withSecurityHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
        request,
      );
    }
  },
};
