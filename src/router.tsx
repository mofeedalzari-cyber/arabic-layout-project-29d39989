import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // ⚡ إعادة المحاولة مع Exponential Backoff (1s, 2s, 4s حتى 30s)
        retry: (failureCount, error: any) => {
          const status = error?.status ?? error?.response?.status;
          // لا نعيد المحاولة عند أخطاء العميل 4xx (ما عدا 408/429)
          if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
            return false;
          }
          return failureCount < 3;
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
        staleTime: 30_000,
        gcTime: 24 * 60 * 60 * 1000, // 24h — يسمح بقراءة الكاش المحفوظ محلياً
        refetchOnWindowFocus: false,
        networkMode: "offlineFirst",
      },
      mutations: {
        retry: (failureCount, error: any) => {
          const status = error?.status ?? error?.response?.status;
          if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
            return false;
          }
          return failureCount < 2;
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
        networkMode: "offlineFirst",
      },
    },
  });

  // 💾 تخزين محلي للبيانات الأساسية (packages, cards, networks) — يعمل بالمتصفح فقط
  if (typeof window !== "undefined") {
    void (async () => {
      try {
        const [{ persistQueryClient }, { createSyncStoragePersister }] = await Promise.all([
          import("@tanstack/react-query-persist-client"),
          import("@tanstack/query-sync-storage-persister"),
        ]);
        const persister = createSyncStoragePersister({
          storage: window.localStorage,
          key: "app.query-cache.v1",
          throttleTime: 1500,
        });
        persistQueryClient({
          queryClient,
          persister,
          maxAge: 24 * 60 * 60 * 1000, // 24h
          dehydrateOptions: {
            shouldDehydrateQuery: (q) => {
              // خزّن فقط البيانات الأساسية (لا نخزّن بيانات حسّاسة/شخصية)
              const key = String(q.queryKey[0] ?? "");
              return ["packages", "cards-available", "networks", "network"].includes(key);
            },
          },
        });
      } catch {
        // ignore persistence errors — app still works
      }
    })();
  }

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
