import { getPulseApiBase } from '../config/pulse';
import { PulseAuthError, normalizePulseAccessToken } from './pulseAuth';
import { ensureFreshAccessToken } from './pulseSession';
import { parseJsonBody } from './httpUtils';

export type Me = {
  id: string;
  email: string;
  profile_picture_url: string | null;
  tenant_id: string | null;
  tenant_name: string | null;
  tenant_logo_url: string | null;
};

function profileUrl(path: string): string {
  const base = getPulseApiBase();
  if (!base) {
    throw new PulseAuthError('Configura EXPO_PUBLIC_PULSE_API_URL en .env', 0);
  }
  return `${base}/v1/profile${path}`;
}

function messageFromBody(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>;
    if (typeof o.detail === 'string' && o.detail.trim()) return o.detail;
    if (typeof o.title === 'string' && o.title.trim()) return o.title;
  }
  return fallback;
}

export async function getMe(accessToken: string, isRetry = false): Promise<Me> {
  let res: Response;
  try {
    res = await fetch(profileUrl('/me'), {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${normalizePulseAccessToken(accessToken)}`,
      },
    });
  } catch (e) {
    throw new PulseAuthError(`Sin conexión o red: ${e instanceof Error ? e.message : String(e)}`, 0);
  }

  const body = await parseJsonBody(res);
  if (res.ok) return body as Me;

  if (res.status === 401 && !isRetry) {
    const fresh = await ensureFreshAccessToken();
    if (fresh && fresh !== accessToken) return getMe(fresh, true);
  }

  throw new PulseAuthError(messageFromBody(body, res.statusText || 'No se pudo cargar el perfil'), res.status);
}

/** Subí la foto primero con uploadFile() (pulseFiles.ts) y pasá acá el id que devuelve. */
export async function setProfilePhoto(
  accessToken: string,
  fileId: string,
  isRetry = false
): Promise<{ profile_picture_url: string }> {
  let res: Response;
  try {
    res = await fetch(profileUrl('/photo'), {
      method: 'PUT',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${normalizePulseAccessToken(accessToken)}`,
      },
      body: JSON.stringify({ file_id: fileId }),
    });
  } catch (e) {
    throw new PulseAuthError(`Sin conexión o red: ${e instanceof Error ? e.message : String(e)}`, 0);
  }

  const body = await parseJsonBody(res);
  if (res.ok) return body as { profile_picture_url: string };

  if (res.status === 401 && !isRetry) {
    const fresh = await ensureFreshAccessToken();
    if (fresh && fresh !== accessToken) return setProfilePhoto(fresh, fileId, true);
  }

  throw new PulseAuthError(messageFromBody(body, res.statusText || 'Error al actualizar la foto'), res.status);
}
