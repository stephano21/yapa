import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import {
  loginPulseUser,
  loginPulseWithGoogleIdToken,
  normalizePulseAccessToken,
  isJwtExpired,
  PulseAuthError,
  type LoginSuccess,
} from '../api/pulseAuth';
import { decodeJwtEmail } from '../api/httpUtils';
import {
  isPulseAccountLinked,
  setPulseAccountLinked,
} from '../storage/pulseLinkStorage';

const KEY_ACCESS = 'yapa_pulse_access_token';
const KEY_EMAIL = 'yapa_pulse_user_email';

type AuthContextValue = {
  /** Listo tras hidratar SecureStore + pulseLinkStorage */
  ready: boolean;
  accessToken: string | null;
  /** Correo mostrado (login manual o email del id_token de Google) */
  userEmail: string | null;
  /** true si el usuario ya vinculó su cuenta Pulse en este dispositivo */
  isPulseLinked: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signInWithGoogleIdToken: (idToken: string, emailHint?: string) => Promise<void>;
  signOut: () => Promise<void>;
  applySession: (session: LoginSuccess, emailHint?: string | null) => Promise<void>;
  setLinked: (v: boolean) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isPulseLinked, setIsPulseLinked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [token, email, linked] = await Promise.all([
          SecureStore.getItemAsync(KEY_ACCESS),
          SecureStore.getItemAsync(KEY_EMAIL),
          isPulseAccountLinked(),
        ]);
        const normalized = token ? normalizePulseAccessToken(token) : null;
        if (normalized && isJwtExpired(normalized)) {
          await SecureStore.deleteItemAsync(KEY_ACCESS).catch(() => {});
          await SecureStore.deleteItemAsync(KEY_EMAIL).catch(() => {});
          if (!cancelled) {
            setAccessToken(null);
            setUserEmail(null);
            setIsPulseLinked(linked);
          }
        } else if (!cancelled) {
          setAccessToken(normalized);
          setUserEmail(email);
          setIsPulseLinked(linked);
        }
      } catch {
        if (!cancelled) {
          setAccessToken(null);
          setUserEmail(null);
          setIsPulseLinked(false);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistSession = useCallback(async (token: string, email: string | null) => {
    const normalized = normalizePulseAccessToken(token);
    await SecureStore.setItemAsync(KEY_ACCESS, normalized);
    if (email) {
      await SecureStore.setItemAsync(KEY_EMAIL, email);
    } else {
      await SecureStore.deleteItemAsync(KEY_EMAIL);
    }
    setAccessToken(normalized);
    setUserEmail(email);
  }, []);

  const applySession = useCallback(
    async (session: LoginSuccess, emailHint?: string | null) => {
      const email = emailHint ?? decodeJwtEmail(session.access_token) ?? null;
      await persistSession(session.access_token, email);
    },
    [persistSession]
  );

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      const session = await loginPulseUser(email.trim(), password);
      await persistSession(session.access_token, email.trim());
    },
    [persistSession]
  );

  const signInWithGoogleIdToken = useCallback(
    async (idToken: string, emailHint?: string) => {
      const session = await loginPulseWithGoogleIdToken(idToken);
      const fromJwt = decodeJwtEmail(idToken);
      await persistSession(session.access_token, emailHint ?? fromJwt ?? null);
    },
    [persistSession]
  );

  const signOut = useCallback(async () => {
    try {
      await SecureStore.deleteItemAsync(KEY_ACCESS);
    } catch { /* ignore */ }
    try {
      await SecureStore.deleteItemAsync(KEY_EMAIL);
    } catch { /* ignore */ }
    setAccessToken(null);
    setUserEmail(null);
  }, []);

  const setLinked = useCallback(async (v: boolean) => {
    if (v) await setPulseAccountLinked();
    setIsPulseLinked(v);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      accessToken,
      userEmail,
      isPulseLinked,
      signInWithPassword,
      signInWithGoogleIdToken,
      signOut,
      applySession,
      setLinked,
    }),
    [
      ready,
      accessToken,
      userEmail,
      isPulseLinked,
      signInWithPassword,
      signInWithGoogleIdToken,
      signOut,
      applySession,
      setLinked,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return ctx;
}

export { PulseAuthError };
