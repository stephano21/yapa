import { getPulseApiBase } from '../config/pulse';
import { PulseAuthError, normalizePulseAccessToken } from './pulseAuth';
import { ensureFreshAccessToken } from './pulseSession';
import { parseJsonBody } from './httpUtils';

export type UploadedFile = {
  id: string;
  url: string;
};

function filesUrl(path: string): string {
  const base = getPulseApiBase();
  if (!base) {
    throw new PulseAuthError('Configura EXPO_PUBLIC_PULSE_API_URL en .env', 0);
  }
  return `${base}/v1/files${path}`;
}

function messageFromBody(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>;
    if (typeof o.detail === 'string' && o.detail.trim()) return o.detail;
    if (typeof o.title === 'string' && o.title.trim()) return o.title;
  }
  return fallback;
}

export function mimeTypeFromUri(uri: string): string {
  const ext = uri.split('?')[0].split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

/**
 * Endpoint genérico de subida: sube el archivo y devuelve su Id — recién con ese Id se asocia a
 * lo que corresponda (setTenantLogo, setProfilePhoto, etc.), en un segundo paso separado.
 */
export async function uploadFile(
  accessToken: string,
  fileUri: string,
  mimeType: string,
  isRetry = false
): Promise<UploadedFile> {
  const ext = mimeType.split('/')[1] ?? 'jpg';
  const formData = new FormData();
  formData.append('file', { uri: fileUri, name: `upload.${ext}`, type: mimeType } as unknown as Blob);

  let res: Response;
  try {
    res = await fetch(filesUrl(''), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${normalizePulseAccessToken(accessToken)}`,
      },
      body: formData,
    });
  } catch (e) {
    throw new PulseAuthError(`Sin conexión o red: ${e instanceof Error ? e.message : String(e)}`, 0);
  }

  const body = await parseJsonBody(res);
  if (res.ok) return body as UploadedFile;

  if (res.status === 401 && !isRetry) {
    const fresh = await ensureFreshAccessToken();
    if (fresh && fresh !== accessToken) return uploadFile(fresh, fileUri, mimeType, true);
  }

  throw new PulseAuthError(messageFromBody(body, res.statusText || 'Error al subir el archivo'), res.status);
}
