import * as SecureStore from 'expo-secure-store';
import {
  loginPulseUser,
  loginPulseWithGoogleIdToken,
  refreshPulseSession,
  logoutPulseSession,
  normalizePulseAccessToken,
  isJwtExpired,
  PulseAuthError,
  type LoginSuccess,
} from './pulseAuth';
import { decodeJwtEmail, decodeJwtTenantId } from './httpUtils';
import { hasAnyLocalData, resetLocalDatabase } from '../database/resetLocalDatabase';

const KEY_ACCESS = 'yapa_pulse_access_token';
const KEY_REFRESH = 'yapa_pulse_refresh_token';
const KEY_EMAIL = 'yapa_pulse_user_email';
/** Tenant de la última sesión persistida en este dispositivo (sobrevive al logout, a propósito). */
const KEY_TENANT = 'yapa_pulse_last_tenant_id';

export type PulseSession = {
  accessToken: string | null;
  refreshToken: string | null;
  userEmail: string | null;
};

/**
 * Capa de sesión Pulse independiente de React: lee/escribe SecureStore directamente.
 * `AuthContext` la envuelve para exponerla como estado reactivo; `pulseSync`/`pulseCatalogPull`
 * la usan directo (no son componentes) para el reintento único ante un 401.
 */
export async function readStoredSession(): Promise<PulseSession> {
  const [accessRaw, refreshToken, userEmail] = await Promise.all([
    SecureStore.getItemAsync(KEY_ACCESS),
    SecureStore.getItemAsync(KEY_REFRESH),
    SecureStore.getItemAsync(KEY_EMAIL),
  ]);
  const accessToken = accessRaw ? normalizePulseAccessToken(accessRaw) : null;
  return { accessToken, refreshToken, userEmail };
}

/**
 * Si el tenant de esta sesión no es el mismo que quedó guardado de la última vez en este
 * dispositivo, la base local (un solo negocio por instalación, sin columna tenant_id) todavía
 * tiene datos del negocio anterior: hay que vaciarla antes de que la app los muestre.
 */
async function resetLocalDataIfTenantChanged(accessToken: string): Promise<void> {
  const tenantId = decodeJwtTenantId(accessToken);
  if (!tenantId) return;
  try {
    const previousTenantId = await SecureStore.getItemAsync(KEY_TENANT);
    if (previousTenantId) {
      if (previousTenantId !== tenantId) {
        await resetLocalDatabase();
      }
    } else if (await hasAnyLocalData()) {
      // Instalación con caché de antes de este fix (o de un tenant que nunca quedó registrado):
      // más seguro vaciar que arriesgarnos a mostrar datos de otro negocio.
      await resetLocalDatabase();
    }
  } catch (e) {
    // No dejamos que un problema leyendo/vaciando la base local (p. ej. corre antes de que las
    // migraciones terminen) rompa el login — en el peor caso, el próximo login lo vuelve a intentar.
    if (__DEV__) console.warn('[pulseSession] resetLocalDataIfTenantChanged falló:', e);
  }
  await SecureStore.setItemAsync(KEY_TENANT, tenantId);
}

export async function persistPulseSession(session: LoginSuccess, email: string | null): Promise<PulseSession> {
  const accessToken = normalizePulseAccessToken(session.access_token);
  const refreshToken = session.refresh_token.trim();
  await resetLocalDataIfTenantChanged(accessToken);
  await SecureStore.setItemAsync(KEY_ACCESS, accessToken);
  await SecureStore.setItemAsync(KEY_REFRESH, refreshToken);
  if (email) {
    await SecureStore.setItemAsync(KEY_EMAIL, email);
  } else {
    await SecureStore.deleteItemAsync(KEY_EMAIL);
  }
  return { accessToken, refreshToken, userEmail: email };
}

export async function clearPulseSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEY_ACCESS).catch(() => {}),
    SecureStore.deleteItemAsync(KEY_REFRESH).catch(() => {}),
    SecureStore.deleteItemAsync(KEY_EMAIL).catch(() => {}),
  ]);
}

async function signInAndPersist(login: () => Promise<LoginSuccess>, emailHint?: string | null): Promise<PulseSession> {
  const session = await login();
  const email = emailHint ?? decodeJwtEmail(session.access_token) ?? null;
  return persistPulseSession(session, email);
}

export const signInWithPasswordSession = (email: string, password: string): Promise<PulseSession> =>
  signInAndPersist(() => loginPulseUser(email, password), email);

export const signInWithGoogleSession = (idToken: string, emailHint?: string | null): Promise<PulseSession> =>
  signInAndPersist(() => loginPulseWithGoogleIdToken(idToken), emailHint ?? decodeJwtEmail(idToken) ?? null);

/**
 * Devuelve un access_token vigente, refrescando si hace falta y es posible.
 * - Vigente: se devuelve tal cual (sin red).
 * - Expirado + hay refresh_token: intenta `POST /v1/auth/refresh`.
 *   - Éxito: persiste el par nuevo y lo devuelve.
 *   - Falla por red (status 0): devuelve el access_token viejo igual — la app debe seguir
 *     funcionando offline; quien lo use fallará por su cuenta si de verdad necesitaba red.
 *   - Falla por 401 (revocado/expirado/reusado): limpia la sesión y devuelve `null`.
 * - Expirado y sin refresh_token: limpia la sesión y devuelve `null`.
 */
export async function ensureFreshAccessToken(): Promise<string | null> {
  const current = await readStoredSession();
  if (current.accessToken && !isJwtExpired(current.accessToken)) {
    return current.accessToken;
  }
  if (!current.refreshToken) {
    if (current.accessToken) await clearPulseSession();
    return null;
  }
  try {
    const session = await refreshPulseSession(current.refreshToken);
    const persisted = await persistPulseSession(session, current.userEmail);
    return persisted.accessToken;
  } catch (e) {
    if (e instanceof PulseAuthError && e.status === 0) {
      return current.accessToken;
    }
    await clearPulseSession();
    return null;
  }
}

export async function signOutSession(): Promise<void> {
  const current = await readStoredSession();
  if (current.refreshToken) {
    try {
      await logoutPulseSession(current.refreshToken);
    } catch {
      // best-effort: el logout local no debe depender de la red
    }
  }
  await clearPulseSession();
}
