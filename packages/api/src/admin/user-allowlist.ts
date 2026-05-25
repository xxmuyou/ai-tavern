import { getConfiguredAdminEmails, requireAdminUser } from "../auth/guards";
import { jsonResponse, readJson } from "../http";
import { normalizeEmail } from "../identity";

type AllowlistRow = {
  email: string;
  note: string | null;
  created_at: number;
  created_by: string | null;
  created_by_email: string | null;
};

type AllowlistCreateRequest = {
  email?: string;
  note?: string | null;
};

export async function handleAdminAllowlistRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  if (pathname === "/admin/admin-allowlist") {
    try {
      if (request.method === "GET") return handleList(request, env);
      if (request.method === "POST") return handleCreate(request, env);
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    } catch (err) {
      if (err instanceof Response) return err;
      throw err;
    }
  }

  const deleteMatch = pathname.match(/^\/admin\/admin-allowlist\/([^/]+)$/);
  if (deleteMatch) {
    try {
      if (request.method !== "DELETE") {
        return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
      }
      return handleDelete(request, env, decodeURIComponent(deleteMatch[1]!));
    } catch (err) {
      if (err instanceof Response) return err;
      throw err;
    }
  }

  return null;
}

async function handleList(request: Request, env: Env): Promise<Response> {
  await requireAdminUser(env, request);

  const result = await env.DB.prepare(
    `SELECT a.email, a.note, a.created_at, a.created_by, u.email AS created_by_email
     FROM admin_user_allowlist a
     LEFT JOIN users u ON u.id = a.created_by
     ORDER BY a.created_at DESC, a.email ASC`,
  ).all<AllowlistRow>();

  const builtInEmails = getConfiguredAdminEmails(env);
  const builtIn = [...builtInEmails].map((email) => ({
    email,
    note: "Built-in admin",
    created_at: null,
    created_by: null,
    created_by_email: null,
    source: "builtin" as const,
  }));

  const rows = (result.results ?? [])
    .filter((row) => !builtInEmails.has(row.email))
    .map((row) => ({
      email: row.email,
      note: row.note,
      created_at: new Date(row.created_at).toISOString(),
      created_by: row.created_by,
      created_by_email: row.created_by_email,
      source: "custom" as const,
    }));

  return jsonResponse({ emails: [...builtIn, ...rows] });
}

async function handleCreate(request: Request, env: Env): Promise<Response> {
  const admin = await requireAdminUser(env, request);
  const body = await readJson<AllowlistCreateRequest>(request);
  const email = normalizeEmail(body.email);
  if (!email) {
    return jsonResponse({ error: "email_required" }, { status: 400 });
  }
  if (getConfiguredAdminEmails(env).has(email)) {
    return jsonResponse({
      email,
      note: "Built-in admin",
      created_at: null,
      created_by: null,
      created_by_email: null,
      source: "builtin",
    });
  }

  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO admin_user_allowlist (email, note, created_at, created_by)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET note = excluded.note`,
  )
    .bind(email, note, now, admin.id)
    .run();

  return jsonResponse({
    email,
    note,
    created_at: new Date(now).toISOString(),
    created_by: admin.id,
    created_by_email: admin.email,
    source: "custom",
  }, { status: 201 });
}

async function handleDelete(request: Request, env: Env, rawEmail: string): Promise<Response> {
  await requireAdminUser(env, request);
  const email = normalizeEmail(rawEmail);
  if (!email) {
    return jsonResponse({ error: "email_required" }, { status: 400 });
  }
  if (getConfiguredAdminEmails(env).has(email)) {
    return jsonResponse({ error: "builtin_email_cannot_be_removed" }, { status: 400 });
  }

  await env.DB.prepare("DELETE FROM admin_user_allowlist WHERE email = ?").bind(email).run();
  return jsonResponse({ ok: true });
}
