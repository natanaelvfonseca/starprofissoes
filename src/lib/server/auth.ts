import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { QueryResultRow } from "pg";
import {
  canCreateUnits,
  canRegisterUsers,
  getAssignableRoles,
  isExecutiveRole,
  isMasterRole,
  type AuthSession,
  type UnitSummary,
  type UserRole,
} from "@/lib/auth-types";
import { canUseWhatsappSupervision } from "@/lib/server/whatsapp-supervision";
import { ensureRuntimeSchema, queryDb } from "@/lib/server/db";

const scrypt = promisify(scryptCallback);

export const SESSION_COOKIE_NAME = "star_session";
const SESSION_TTL_DAYS = 7;
const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60;
const LOGIN_LIMIT_WINDOW_MINUTES = 15;
const LOGIN_BLOCK_MINUTES = 15;
const LOGIN_PAIR_FAILURE_LIMIT = 5;
const LOGIN_EMAIL_FAILURE_LIMIT = 10;
const LOGIN_IP_FAILURE_LIMIT = 30;

type SessionRow = QueryResultRow & {
  session_id: string;
  user_id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar_url: string | null;
  active_unit_id: string | null;
};

type UserUnitRow = QueryResultRow & UnitSummary;

type LoginRateLimitRow = QueryResultRow & {
  pair_failures: string;
  email_failures: string;
  ip_failures: string;
  retry_at: string | null;
};

type LoginIdentifiers = {
  emailHash: string;
  ipHash: string;
};

type LoginRateLimitResult =
  | ({ allowed: true } & LoginIdentifiers)
  | ({ allowed: false; retryAfterSeconds: number } & LoginIdentifiers);

let userProfileSchemaPromise: Promise<void> | null = null;

export async function ensureUserProfileSchema() {
  if (!userProfileSchemaPromise) {
    userProfileSchemaPromise = ensureRuntimeSchema(
      "user-profile",
      `
        alter table app_users
        add column if not exists avatar_url text;

        do $$
        begin
          alter table app_users drop constraint if exists app_users_role_check;

          update app_users
          set role = 'DEV',
              updated_at = now()
          where role = 'MASTER';

          alter table app_users
          add constraint app_users_role_check
          check (role in ('DEV', 'CEO', 'CVO', 'DIRETOR', 'GERENTE', 'MARKETING', 'CONSULTOR'));

        end
        $$
      `,
    )
      .then(() => undefined)
      .catch((error) => {
        userProfileSchemaPromise = null;
        throw error;
      });
  }

  return userProfileSchemaPromise;
}

export function isValidRole(role: string): role is UserRole {
  return ["DEV", "CEO", "CVO", "DIRETOR", "GERENTE", "MARKETING", "CONSULTOR"].includes(role);
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const key = (await scrypt(password, salt, 64, {
    N: 16_384,
    r: 8,
    p: 1,
    maxmem: 32 * 1024 * 1024,
  })) as Buffer;

  return `scrypt$16384$8$1$${salt}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, nRaw, rRaw, pRaw, salt, keyRaw] = storedHash.split("$");

  if (algorithm !== "scrypt" || !nRaw || !rRaw || !pRaw || !salt || !keyRaw) {
    return false;
  }

  const expected = Buffer.from(keyRaw, "base64url");
  const actual = (await scrypt(password, salt, expected.length, {
    N: Number(nRaw),
    r: Number(rRaw),
    p: Number(pRaw),
    maxmem: 32 * 1024 * 1024,
  })) as Buffer;

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

function hashLoginIdentifier(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

export function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const forwardedIp = forwardedFor?.split(",")[0]?.trim();

  return (
    forwardedIp ||
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    "unknown"
  );
}

export function getLoginIdentifiers(email: string, request: Request): LoginIdentifiers {
  const ip = getClientIp(request);

  return {
    emailHash: hashLoginIdentifier(`email:${sanitizeEmail(email)}`),
    ipHash: hashLoginIdentifier(`ip:${ip}`),
  };
}

function toRetryAfterSeconds(retryAt: string | null) {
  if (!retryAt) {
    return LOGIN_BLOCK_MINUTES * 60;
  }

  const retryAtMs = new Date(retryAt).getTime();
  const seconds = Math.ceil((retryAtMs - Date.now()) / 1000);

  return Math.max(60, seconds);
}

export async function checkLoginRateLimit(
  email: string,
  request: Request,
): Promise<LoginRateLimitResult> {
  const identifiers = getLoginIdentifiers(email, request);
  const result = await queryDb<LoginRateLimitRow>(
    `
      select
        count(*) filter (where email_hash = $1 and ip_hash = $2)::text as pair_failures,
        count(*) filter (where email_hash = $1)::text as email_failures,
        count(*) filter (where ip_hash = $2)::text as ip_failures,
        (
          max(attempted_at) filter (
            where (email_hash = $1 and ip_hash = $2)
              or email_hash = $1
              or ip_hash = $2
          ) + make_interval(mins => $4::int)
        )::text as retry_at
      from app_login_attempts
      where successful = false
        and attempted_at > now() - make_interval(mins => $3::int)
        and (email_hash = $1 or ip_hash = $2)
    `,
    [identifiers.emailHash, identifiers.ipHash, LOGIN_LIMIT_WINDOW_MINUTES, LOGIN_BLOCK_MINUTES],
  );
  const row = result.rows[0];
  const pairFailures = Number(row?.pair_failures ?? 0);
  const emailFailures = Number(row?.email_failures ?? 0);
  const ipFailures = Number(row?.ip_failures ?? 0);
  const limited =
    pairFailures >= LOGIN_PAIR_FAILURE_LIMIT ||
    emailFailures >= LOGIN_EMAIL_FAILURE_LIMIT ||
    ipFailures >= LOGIN_IP_FAILURE_LIMIT;

  if (!limited) {
    return { allowed: true, ...identifiers };
  }

  return {
    allowed: false,
    retryAfterSeconds: toRetryAfterSeconds(row?.retry_at ?? null),
    ...identifiers,
  };
}

export async function recordLoginAttempt(identifiers: LoginIdentifiers, successful: boolean) {
  await queryDb(
    `
      insert into app_login_attempts (email_hash, ip_hash, successful)
      values ($1, $2, $3)
    `,
    [identifiers.emailHash, identifiers.ipHash, successful],
  );

  if (successful) {
    await queryDb(
      `
        delete from app_login_attempts
        where successful = false and email_hash = $1
      `,
      [identifiers.emailHash],
    );
  }

  await queryDb(
    `
      delete from app_login_attempts
      where attempted_at < now() - interval '24 hours'
    `,
  );
}

export function getCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());
  const prefix = `${name}=`;
  const match = cookies.find((cookie) => cookie.startsWith(prefix));

  if (!match) {
    return null;
  }

  return decodeURIComponent(match.slice(prefix.length));
}

export function createSessionCookie(token: string, expiresAt: Date) {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`,
    `Expires=${expiresAt.toUTCString()}`,
  ];

  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function clearSessionCookie() {
  return [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    process.env.NODE_ENV === "production" ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export async function getAccessibleUnits(userId: string, role: UserRole) {
  if (isMasterRole(role) || isExecutiveRole(role) || role === "MARKETING") {
    const result = await queryDb<UserUnitRow>(
      `
        select id, name, slug
        from app_units
        where status = 'active'
        order by name asc
      `,
    );

    return result.rows;
  }

  const result = await queryDb<UserUnitRow>(
    `
      select distinct u.id, u.name, u.slug
      from app_units u
      left join app_user_units uu on uu.unit_id = u.id and uu.user_id = $1
      left join app_users au on au.id = $1 and au.primary_unit_id = u.id
      where u.status = 'active'
        and (uu.user_id is not null or au.id is not null)
      order by u.name asc
    `,
    [userId],
  );

  return result.rows;
}

async function buildSession(
  row: SessionRow,
  units: Array<UnitSummary>,
  activeUnit: UnitSummary | null,
): Promise<AuthSession> {
  const session: AuthSession = {
    user: {
      id: row.user_id,
      email: row.email,
      name: row.name,
      role: row.role,
      avatarUrl: row.avatar_url ?? null,
    },
    units,
    activeUnit,
    canRegisterUsers: canRegisterUsers(row.role),
    canCreateUnits: canCreateUnits(row.role),
    features: { whatsappSupervision: false },
  };
  session.features.whatsappSupervision = await canUseWhatsappSupervision(session).catch(
    () => row.role === "DEV",
  );
  return session;
}

export async function getSessionFromRequest(request: Request): Promise<AuthSession | null> {
  const token = getCookie(request, SESSION_COOKIE_NAME);

  if (!token) {
    return null;
  }

  const tokenHash = hashSessionToken(token);
  await ensureUserProfileSchema();

  const result = await queryDb<SessionRow>(
    `
      select
        s.id as session_id,
        u.id as user_id,
        u.email,
        u.name,
        u.role,
        u.avatar_url,
        s.active_unit_id
      from app_sessions s
      inner join app_users u on u.id = s.user_id
      where s.token_hash = $1
        and s.revoked_at is null
        and s.expires_at > now()
        and u.status = 'active'
      limit 1
    `,
    [tokenHash],
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  const units = await getAccessibleUnits(row.user_id, row.role);
  const activeUnit = units.find((unit) => unit.id === row.active_unit_id) ?? units[0] ?? null;

  await queryDb(
    `
      update app_sessions
      set last_seen_at = now(), active_unit_id = $2
      where id = $1
    `,
    [row.session_id, activeUnit?.id ?? null],
  );

  return buildSession(row, units, activeUnit);
}

export async function createSessionForUser(
  userId: string,
  role: UserRole,
  preferredUnitId: string,
) {
  const units = await getAccessibleUnits(userId, role);
  const activeUnit = units.find((unit) => unit.id === preferredUnitId) ?? units[0] ?? null;

  if (!activeUnit) {
    throw new Error("User has no active unit access");
  }

  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await queryDb(
    `
      insert into app_sessions (user_id, token_hash, active_unit_id, expires_at)
      values ($1, $2, $3, $4)
    `,
    [userId, tokenHash, activeUnit.id, expiresAt],
  );

  return { token, expiresAt };
}

export async function revokeSessionFromRequest(request: Request) {
  const token = getCookie(request, SESSION_COOKIE_NAME);

  if (!token) {
    return;
  }

  await queryDb(
    `
      update app_sessions
      set revoked_at = now()
      where token_hash = $1 and revoked_at is null
    `,
    [hashSessionToken(token)],
  );
}

export function canAssignRole(actorRole: UserRole, requestedRole: UserRole) {
  return getAssignableRoles(actorRole).includes(requestedRole);
}

export function sanitizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function slugifyUnitName(name: string) {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || `unidade-${randomBytes(3).toString("hex")}`;
}
