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

  // 💾 قاعدة بيانات محلية مخفية (IndexedDB): يفتح التطبيق أول مرة بالإنترنت،
  // ثم تُخزَّن كل بيانات الاستعلامات على الجهاز ويعمل التطبيق منها،
  // مع مزامنة تلقائية خفية عند توفر الاتصال.
  if (typeof window !== "undefined") {
    void (async () => {
      try {
        const [{ persistQueryClient }, { createAsyncStoragePersister }, { localDB, LOCAL_CACHE_KEY, serializeCache, deserializeCache }, { initAutoSync }] =
          await Promise.all([
            import("@tanstack/react-query-persist-client"),
            import("@tanstack/query-async-storage-persister"),
            import("./lib/local-db"),
            import("./lib/auto-sync"),
          ]);
        const persister = createAsyncStoragePersister({
          storage: localDB,
          key: LOCAL_CACHE_KEY,
          throttleTime: 1000,
          serialize: serializeCache,
          deserialize: deserializeCache,
        });
        await persistQueryClient({
          queryClient,
          persister,
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 أيام
          dehydrateOptions: {
            shouldDehydrateQuery: (q) => q.state.status === "success",
          },
        });
        initAutoSync(queryClient);
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
