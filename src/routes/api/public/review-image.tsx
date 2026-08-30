import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/review-image")({
  server: {
    handlers: {
      GET: async () => {
        return new Response("Not found", { status: 404 });
      },
    },
  },
});
