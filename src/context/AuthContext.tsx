import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { PulseAuthError, type LoginSuccess } from '../api/pulseAuth';
import { decodeJwtEmail } from '../api/httpUtils';
import {
  readStoredSession,
  persistPulseSession,
  signInWithPasswordSession,
  signInWithGoogleSession,
  signOutSession,
  ensureFreshAccessToken as ensureFreshAccessTokenSession,
} from '../api/pulseSession';
import {
  isPulseAccountLinked,
  setPulseAccountLinked,
} from '../storage/pulseLinkStorage';

type AuthContextValue = {
  /** Listo tras hidratar la sesión Pulse + pulseLinkStorage */
  ready: boolean;
  accessToken: string | null;
  /** true si hay un refresh_token guardado (sesión "recordada" en este dispositivo) */
  hasRefreshToken: boolean;
  /** Correo mostrado (login manual o email del id_token de Google) */
  userEmail: string | null;
  /** true si el usuario ya vinculó su cuenta Pulse en este dispositivo */
  isPulseLinked: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signInWithGoogleIdToken: (idToken: string, emailHint?: string) => Promise<void>;
  signOut: () => Promise<void>;
  applySession: (session: LoginSuccess, emailHint?: string | null) => Promise<void>;
  setLinked: (v: boolean) => Promise<void>;
  /** Devuelve un access_token vigente (refresca si hace falta) y refleja el resultado en el estado. */
  ensureFreshAccessToken: () => Promise<string | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [hasRefreshToken, setHasRefreshToken] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isPulseLinked, setIsPulseLinked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await ensureFreshAccessTokenSession();
        const [session, linked] = await Promise.all([readStoredSession(), isPulseAccountLinked()]);
        if (!cancelled) {
          setAccessToken(token);
          setUserEmail(session.userEmail);
          setHasRefreshToken(!!session.refreshToken);
          setIsPulseLinked(linked);
        }
      } catch {
        if (!cancelled) {
          setAccessToken(null);
          setUserEmail(null);
          setHasRefreshToken(false);
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

  const applySession = useCallback(async (session: LoginSuccess, emailHint?: string | null) => {
    const email = emailHint ?? decodeJwtEmail(session.access_token) ?? null;
    const persisted = await persistPulseSession(session, email);
    setAccessToken(persisted.accessToken);
    setUserEmail(persisted.userEmail);
    setHasRefreshToken(!!persisted.refreshToken);
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const persisted = await signInWithPasswordSession(email.trim(), password);
    setAccessToken(persisted.accessToken);
    setUserEmail(persisted.userEmail);
    setHasRefreshToken(!!persisted.refreshToken);
  }, []);

  const signInWithGoogleIdToken = useCallback(async (idToken: string, emailHint?: string) => {
    const persisted = await signInWithGoogleSession(idToken, emailHint ?? null);
    setAccessToken(persisted.accessToken);
    setUserEmail(persisted.userEmail);
    setHasRefreshToken(!!persisted.refreshToken);
  }, []);

  const signOut = useCallback(async () => {
    await signOutSession();
    setAccessToken(null);
    setUserEmail(null);
    setHasRefreshToken(false);
  }, []);

  const setLinked = useCallback(async (v: boolean) => {
    if (v) await setPulseAccountLinked();
    setIsPulseLinked(v);
  }, []);

  const ensureFreshAccessToken = useCallback(async () => {
    const token = await ensureFreshAccessTokenSession();
    const session = await readStoredSession();
    setAccessToken(token);
    setUserEmail(session.userEmail);
    setHasRefreshToken(!!session.refreshToken);
    return token;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      accessToken,
      hasRefreshToken,
      userEmail,
      isPulseLinked,
      signInWithPassword,
      signInWithGoogleIdToken,
      signOut,
      applySession,
      setLinked,
      ensureFreshAccessToken,
    }),
    [
      ready,
      accessToken,
      hasRefreshToken,
      userEmail,
      isPulseLinked,
      signInWithPassword,
      signInWithGoogleIdToken,
      signOut,
      applySession,
      setLinked,
      ensureFreshAccessToken,
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
