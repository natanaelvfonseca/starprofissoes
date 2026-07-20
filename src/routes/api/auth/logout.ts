import { createFileRoute } from "@tanstack/react-router";
import { clearSessionCookie, revokeSessionFromRequest } from "@/lib/server/auth";

export const Route = createFileRoute("/api/auth/logout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await revokeSessionFromRequest(request);

        return Response.json(
          { ok: true },
          {
            headers: {
              "Set-Cookie": clearSessionCookie(),
            },
          },
        );
      },
    },
  },
});
