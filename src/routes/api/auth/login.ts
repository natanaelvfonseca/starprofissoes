import { createFileRoute } from "@tanstack/react-router";
import type { QueryResultRow } from "pg";
import type { UserRole } from "@/lib/auth-types";
import {
  checkLoginRateLimit,
  createSessionCookie,
  createSessionForUser,
  ensureUserProfileSchema,
  recordLoginAttempt,
  sanitizeEmail,
  verifyPassword,
} from "@/lib/server/auth";
import { queryDb } from "@/lib/server/db";

type LoginUserRow = QueryResultRow & {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  primary_unit_id: string;
  password_hash: string;
};

const DUMMY_PASSWORD_HASH =
  "scrypt$16384$8$1$dummy-login-salt-v1$0V-rw-sbACKEr8MRybXv9g9hf7us9-LPk9c9SqoZsSxSG66ACUbUZvXtT126M06FYxn8KWCXf7BDyMJrnEndUg";

export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json().catch(() => null);
        const email = typeof body?.email === "string" ? sanitizeEmail(body.email) : "";
        const password = typeof body?.password === "string" ? body.password : "";

        if (!email || !password) {
          return Response.json({ ok: false, error: "Informe email e senha." }, { status: 400 });
        }

        const rateLimit = await checkLoginRateLimit(email, request);

        if (!rateLimit.allowed) {
          return Response.json(
            {
              ok: false,
              error: "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.",
            },
            {
              status: 429,
              headers: {
                "Retry-After": String(rateLimit.retryAfterSeconds),
              },
            },
          );
        }

        await ensureUserProfileSchema();

        const result = await queryDb<LoginUserRow>(
          `
            select id, email, name, role, primary_unit_id, password_hash
            from app_users
            where lower(email) = lower($1) and status = 'active'
            limit 1
          `,
          [email],
        );
        const user = result.rows[0];
        const passwordHash = user?.password_hash ?? DUMMY_PASSWORD_HASH;
        const validPassword = await verifyPassword(password, passwordHash);

        if (!user || !validPassword) {
          await recordLoginAttempt(rateLimit, false);

          return Response.json({ ok: false, error: "Credenciais invalidas." }, { status: 401 });
        }

        await recordLoginAttempt(rateLimit, true);

        const { token, expiresAt } = await createSessionForUser(
          user.id,
          user.role,
          user.primary_unit_id,
        );

        return Response.json(
          { ok: true },
          {
            headers: {
              "Set-Cookie": createSessionCookie(token, expiresAt),
            },
          },
        );
      },
    },
  },
});
