import { getPulseApiBase } from '../config/pulse';
import { parseJsonBody as parseJsonBodyUtil, decodeJwtPayload as decodeJwtPayloadUtil } from './httpUtils';

export type ProblemDetails = {
  title?: string;
  detail?: string;
  status?: number;
  type?: string;
};

export class PulseAuthError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly problem?: ProblemDetails
  ) {
    super(message);
    this.name = 'PulseAuthError';
  }
}

export type LoginSuccess = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

export type RegisterSuccess = {
  message: string;
};

function authUrl(path: string): string {
  const base = getPulseApiBase();
  if (!base) {
    throw new PulseAuthError('Configura EXPO_PUBLIC_PULSE_API_URL en .env', 0);
  }
  return `${base}/v1/auth${path}`;
}

async function pulseAuthFetch(
  context: string,
  url: string,
  init: RequestInit
): Promise<Response> {
  if (__DEV__) {
    console.log(`[PulseAuth] ${context}`, url);
  }
  try {
    return await fetch(url, init);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[PulseAuth] Red / fetch falló (${context}):`, msg);
    throw new PulseAuthError(`Sin conexión o red: ${msg}`, 0);
  }
}

const parseJsonBody = parseJsonBodyUtil;

function problemFromBody(body: unknown): ProblemDetails | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const o = body as Record<string, unknown>;
  if (typeof o.title === 'string' || typeof o.detail === 'string') {
    return {
      title: typeof o.title === 'string' ? o.title : undefined,
      detail: typeof o.detail === 'string' ? o.detail : undefined,
      status: typeof o.status === 'number' ? o.status : undefined,
      type: typeof o.type === 'string' ? o.type : undefined,
    };
  }
  return undefined;
}

/** Quita espacios y un posible prefijo `Bearer ` duplicado (algunos backends lo incluyen en el valor). */
export function normalizePulseAccessToken(token: string): string {
  let t = token.trim();
  if (/^bearer\s+/i.test(t)) {
    t = t.replace(/^bearer\s+/i, '').trim();
  }
  return t;
}

function extractAccessTokenFromLoginBody(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  const keys = ['access_token', 'accessToken', 'AccessToken', 'token', 'Token'] as const;
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v;
  }
  const data = o.data;
  if (data && typeof data === 'object') {
    return extractAccessTokenFromLoginBody(data);
  }
  return null;
}

function parseLoginSuccessBody(body: unknown): LoginSuccess {
  const raw = extractAccessTokenFromLoginBody(body);
  if (!raw) {
    throw new PulseAuthError(
      'El servidor no devolvió access_token (revisa el JSON de login: access_token / accessToken).',
      500
    );
  }
  const access_token = normalizePulseAccessToken(raw);
  if (access_token.length < 8) {
    throw new PulseAuthError('Token de acceso inválido o vacío.', 500);
  }
  const o = body as Record<string, unknown>;
  const token_type =
    (typeof o.token_type === 'string' && o.token_type.trim()) ||
    (typeof o.tokenType === 'string' && o.tokenType.trim()) ||
    'Bearer';
  let expires_in = 3600;
  if (typeof o.expires_in === 'number' && Number.isFinite(o.expires_in)) {
    expires_in = o.expires_in;
  } else if (typeof o.expiresIn === 'number' && Number.isFinite(o.expiresIn)) {
    expires_in = o.expiresIn;
  }
  return { access_token, token_type, expires_in };
}

async function handleAuthResponse<T>(res: Response, context: string): Promise<T> {
  const body = await parseJsonBody(res);
  if (res.ok) {
    if (__DEV__) {
      console.log(`[PulseAuth] OK ${context}`, res.status);
    }
    return body as T;
  }
  const problem = problemFromBody(body);
  const msg =
    problem?.detail ||
    problem?.title ||
    (typeof body === 'object' &&
      body &&
      'message' in body &&
      typeof (body as { message?: string }).message === 'string' &&
      (body as { message: string }).message) ||
    res.statusText ||
    'Error de autenticación';
  console.warn(`[PulseAuth] Error ${context}`, {
    status: res.status,
    url: res.url || '(respuesta sin url)',
    problem,
    body,
  });
  throw new PulseAuthError(String(msg), res.status, problem);
}

export async function registerPulseUser(
  email: string,
  password: string
): Promise<RegisterSuccess> {
  const res = await pulseAuthFetch(
    'POST /v1/auth/register',
    authUrl('/register'),
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    }
  );
  return handleAuthResponse<RegisterSuccess>(res, 'register');
}

export async function loginPulseUser(
  email: string,
  password: string
): Promise<LoginSuccess> {
  const res = await pulseAuthFetch(
    'POST /v1/auth/login',
    authUrl('/login'),
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    }
  );
  const body = await parseJsonBody(res);
  if (!res.ok) {
    const problem = problemFromBody(body);
    const msg =
      problem?.detail ||
      problem?.title ||
      (typeof body === 'object' &&
        body &&
        'message' in body &&
        typeof (body as { message?: string }).message === 'string' &&
        (body as { message: string }).message) ||
      res.statusText ||
      'Error de autenticación';
    console.warn(`[PulseAuth] Error login`, {
      status: res.status,
      url: res.url || '(respuesta sin url)',
      problem,
      body,
    });
    throw new PulseAuthError(String(msg), res.status, problem);
  }
  if (__DEV__) {
    console.log(`[PulseAuth] OK login`, res.status);
  }
  return parseLoginSuccessBody(body);
}

export async function loginPulseWithGoogleIdToken(
  idToken: string
): Promise<LoginSuccess> {
  const res = await pulseAuthFetch(
    'POST /v1/auth/google',
    authUrl('/google'),
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id_token: idToken }),
    }
  );
  const body = await parseJsonBody(res);
  if (!res.ok) {
    const problem = problemFromBody(body);
    const msg =
      problem?.detail ||
      problem?.title ||
      (typeof body === 'object' &&
        body &&
        'message' in body &&
        typeof (body as { message?: string }).message === 'string' &&
        (body as { message: string }).message) ||
      res.statusText ||
      'Error de autenticación';
    console.warn(`[PulseAuth] Error google`, {
      status: res.status,
      url: res.url || '(respuesta sin url)',
      problem,
      body,
    });
    throw new PulseAuthError(String(msg), res.status, problem);
  }
  if (__DEV__) {
    console.log(`[PulseAuth] OK google`, res.status);
  }
  return parseLoginSuccessBody(body);
}

/** Cabeceras para endpoints protegidos (`/v1/sync/...`, etc.) */
export function pulseAuthorizedHeaders(accessToken: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  const t =
    typeof accessToken === 'string' && accessToken.trim()
      ? normalizePulseAccessToken(accessToken)
      : '';
  if (t) {
    headers.Authorization = `Bearer ${t}`;
  }
  return headers;
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  return decodeJwtPayloadUtil<Record<string, unknown>>(normalizePulseAccessToken(token));
}

export function isJwtExpired(token: string, skewSeconds = 30): boolean {
  const payload = decodeJwtPayload(token);
  const exp = payload && typeof payload.exp === 'number' ? payload.exp : null;
  if (exp == null) return false;
  const nowSec = Date.now() / 1000;
  return nowSec >= exp - skewSeconds;
}

export async function resendPulseConfirmation(email: string): Promise<RegisterSuccess> {
  const res = await pulseAuthFetch(
    'POST /v1/auth/resend-confirmation',
    authUrl('/resend-confirmation'),
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    }
  );
  return handleAuthResponse<RegisterSuccess>(res, 'resend-confirmation');
}
