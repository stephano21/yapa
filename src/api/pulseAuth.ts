import { getPulseApiBase } from '../config/pulse';

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

async function parseJsonBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

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
  return handleAuthResponse<LoginSuccess>(res, 'login');
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
  return handleAuthResponse<LoginSuccess>(res, 'google');
}

/** Cabeceras para endpoints protegidos (`/v1/sync/...`, etc.) */
export function pulseAuthorizedHeaders(accessToken: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return headers;
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
