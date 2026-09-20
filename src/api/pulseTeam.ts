import { getPulseApiBase } from '../config/pulse';
import { PulseAuthError, pulseAuthorizedHeaders } from './pulseAuth';
import { ensureFreshAccessToken } from './pulseSession';
import { parseJsonBody } from './httpUtils';

export type TeamUser = {
  id: string;
  email: string;
  email_confirmed: boolean;
  last_login_at: string | null;
  created_at: string;
};

export type Tenant = {
  id: string;
  name: string;
  created_at: string;
  user_count: number;
  notification_email: string | null;
  logo_url: string | null;
};

function teamUrl(path: string): string {
  const base = getPulseApiBase();
  if (!base) {
    throw new PulseAuthError('Configura EXPO_PUBLIC_PULSE_API_URL en .env', 0);
  }
  return `${base}/v1/team${path}`;
}

function messageFromBody(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>;
    if (typeof o.detail === 'string' && o.detail.trim()) return o.detail;
    if (typeof o.title === 'string' && o.title.trim()) return o.title;
  }
  return fallback;
}

async function teamFetch(
  context: string,
  path: string,
  accessToken: string,
  init: RequestInit,
  isRetry = false
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(teamUrl(path), {
      ...init,
      headers: { ...pulseAuthorizedHeaders(accessToken), ...init.headers },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new PulseAuthError(`Sin conexión o red: ${msg}`, 0);
  }

  if (res.status === 204) return null;
  const body = await parseJsonBody(res);
  if (res.ok) return body;

  if (res.status === 401 && !isRetry) {
    const fresh = await ensureFreshAccessToken();
    if (fresh && fresh !== accessToken) {
      return teamFetch(context, path, fresh, init, true);
    }
  }

  throw new PulseAuthError(messageFromBody(body, res.statusText || 'Error del equipo'), res.status);
}

export async function listTeamUsers(accessToken: string): Promise<TeamUser[]> {
  const body = await teamFetch('GET /v1/team/users', '/users', accessToken, { method: 'GET' });
  return Array.isArray(body) ? (body as TeamUser[]) : [];
}

export async function createTeamUser(
  accessToken: string,
  email: string,
  password: string
): Promise<TeamUser> {
  const body = await teamFetch('POST /v1/team/users', '/users', accessToken, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return body as TeamUser;
}

export async function getTenant(accessToken: string): Promise<Tenant> {
  const body = await teamFetch('GET /v1/team/tenant', '/tenant', accessToken, { method: 'GET' });
  return body as Tenant;
}

/** Subí el archivo primero con uploadFile() (pulseFiles.ts) y pasá acá el id que devuelve. */
export async function setTenantLogo(accessToken: string, fileId: string): Promise<Tenant> {
  const body = await teamFetch('PUT /v1/team/tenant/logo', '/tenant/logo', accessToken, {
    method: 'PUT',
    body: JSON.stringify({ file_id: fileId }),
  });
  return body as Tenant;
}
