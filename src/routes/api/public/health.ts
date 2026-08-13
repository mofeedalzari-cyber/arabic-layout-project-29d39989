import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(
          { status: "ok" },
          {
            status: 200,
            headers: {
              "cache-control": "no-store",
            },
          },
        ),
      HEAD: async () =>
        new Response(null, {
          status: 200,
          headers: {
            "cache-control": "no-store",
          },
        }),
    },
  },
});