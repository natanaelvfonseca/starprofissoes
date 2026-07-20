import { createFileRoute } from "@tanstack/react-router";
import type { QueryResultRow } from "pg";
import type { AuthUser, UserRole } from "@/lib/auth-types";
import {
  getSessionFromRequest,
  hashPassword,
  sanitizeEmail,
  verifyPassword,
} from "@/lib/server/auth";
import { queryDb } from "@/lib/server/db";

const MAX_AVATAR_DATA_URL_LENGTH = 1_600_000;
const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ProfileUserRow = QueryResultRow & {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  password_hash: string;
  avatar_url: string | null;
};

function isUniqueError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

function parseAvatarUrl(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (typeof value !== "string") {
    return null;
  }

  const avatarUrl = value.trim();

  if (!avatarUrl) {
    return "";
  }

  if (!avatarUrl.startsWith("data:image/") || avatarUrl.length > MAX_AVATAR_DATA_URL_LENGTH) {
    return null;
  }

  return avatarUrl;
}

function mapUser(row: ProfileUserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    avatarUrl: row.avatar_url ?? null,
  };
}

export const Route = createFileRoute("/api/profile")({
  server: {
    handlers: {
      PATCH: async ({ request }) => {
        const session = await getSessionFromRequest(request);

        if (!session) {
          return Response.json({ ok: false, error: "Não autenticado." }, { status: 401 });
        }

        const body = await request.json().catch(() => null);
        const name = typeof body?.name === "string" ? body.name.trim() : "";
        const email = typeof body?.email === "string" ? sanitizeEmail(body.email) : "";
        const currentPassword =
          typeof body?.currentPassword === "string" ? body.currentPassword : "";
        const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
        const avatarUrl = parseAvatarUrl(body?.avatarUrl);

        if (!name || name.length > 140 || !email || !EMAIL_PATTERN.test(email)) {
          return Response.json(
            { ok: false, error: "Informe nome e email válidos." },
            { status: 400 },
          );
        }

        if (avatarUrl === null) {
          return Response.json({ ok: false, error: "Imagem de perfil invalida." }, { status: 400 });
        }

        if (newPassword && newPassword.length < MIN_PASSWORD_LENGTH) {
          return Response.json(
            { ok: false, error: "A nova senha deve ter pelo menos 8 caracteres." },
            { status: 400 },
          );
        }

        if (newPassword && !currentPassword) {
          return Response.json({ ok: false, error: "Informe a senha atual." }, { status: 400 });
        }

        const userResult = await queryDb<ProfileUserRow>(
          `
            select id, email, name, role, password_hash, avatar_url
            from app_users
            where id = $1 and status = 'active'
            limit 1
          `,
          [session.user.id],
        );
        const user = userResult.rows[0];

        if (!user) {
          return Response.json({ ok: false, error: "Usuário não encontrado." }, { status: 404 });
        }

        let nextPasswordHash: string | null = null;

        if (newPassword) {
          const validCurrentPassword = await verifyPassword(currentPassword, user.password_hash);

          if (!validCurrentPassword) {
            return Response.json({ ok: false, error: "Senha atual incorreta." }, { status: 403 });
          }

          nextPasswordHash = await hashPassword(newPassword);
        }

        try {
          const updated = await queryDb<ProfileUserRow>(
            `
              update app_users
              set
                name = $2,
                email = $3,
                avatar_url = nullif($4, ''),
                password_hash = coalesce($5, password_hash),
                updated_at = now()
              where id = $1
              returning id, email, name, role, password_hash, avatar_url
            `,
            [session.user.id, name, email, avatarUrl, nextPasswordHash],
          );

          return Response.json(
            { user: mapUser(updated.rows[0]) },
            { headers: { "Cache-Control": "no-store" } },
          );
        } catch (error) {
          if (isUniqueError(error)) {
            return Response.json({ ok: false, error: "Email já cadastrado." }, { status: 409 });
          }

          throw error;
        }
      },
    },
  },
});
