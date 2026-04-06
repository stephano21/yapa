import Constants from 'expo-constants';

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Quita rutas que suelen pegarse por error (p. ej. /v1/health) para que
 * auth quede en `{base}/v1/auth/...` y no `{base}/v1/health/v1/auth/...`.
 */
function normalizePulseApiBase(raw: string): string {
  let u = trimSlash(raw.trim());
  if (!u) return '';
  const suffixes = ['/v1/health', '/health', '/v1'];
  for (const s of suffixes) {
    if (u.endsWith(s)) {
      u = trimSlash(u.slice(0, -s.length));
    }
  }
  return u;
}

/** Base URL de la API Pulse (sin barra final). Ej: https://tu-api.com o http://10.0.2.2:8080 */
export function getPulseApiBase(): string {
  const fromEnv = process.env.EXPO_PUBLIC_PULSE_API_URL;
  const extra = Constants.expoConfig?.extra as { pulseApiUrl?: string } | undefined;
  const fromExtra = extra?.pulseApiUrl;
  const raw = (fromEnv ?? fromExtra ?? '').trim();
  return raw ? normalizePulseApiBase(raw) : '';
}

export function isPulseApiConfigured(): boolean {
  return getPulseApiBase().length > 0;
}

export function getGoogleAuthEnv(): {
  webClientId?: string;
  iosClientId?: string;
  androidClientId?: string;
} {
  const shared = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID?.trim() || undefined;
  return {
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() || shared,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() || shared,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim() || shared,
  };
}
