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
  PulseAuthError,
  type LoginSuccess,
} from '../api/pulseAuth';

const KEY_ACCESS = 'yapa_pulse_access_token';
const KEY_EMAIL = 'yapa_pulse_user_email';

type AuthContextValue = {
  /** Listo tras hidratar SecureStore */
  ready: boolean;
  accessToken: string | null;
  /** Correo mostrado (login manual o email del id_token de Google si se pudo leer) */
  userEmail: string | null;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signInWithGoogleIdToken: (idToken: string, emailHint?: string) => Promise<void>;
  signOut: () => Promise<void>;
  applySession: (session: LoginSuccess, emailHint?: string | null) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function decodeJwtEmail(idToken: string): string | undefined {
  try {
    const part = idToken.split('.')[1];
    if (!part) return undefined;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (b64.length % 4)) % 4;
    const padded = b64 + '='.repeat(padLen);
    const atobGlobal = globalThis.atob as ((d: string) => string) | undefined;
    if (!atobGlobal) return undefined;
    const binary = atobGlobal(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const o = JSON.parse(json) as { email?: string };
    return typeof o.email === 'string' ? o.email : undefined;
  } catch {
    return undefined;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [token, email] = await Promise.all([
          SecureStore.getItemAsync(KEY_ACCESS),
          SecureStore.getItemAsync(KEY_EMAIL),
        ]);
        if (!cancelled) {
          setAccessToken(token);
          setUserEmail(email);
        }
      } catch {
        if (!cancelled) {
          setAccessToken(null);
          setUserEmail(null);
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
    await SecureStore.setItemAsync(KEY_ACCESS, token);
    if (email) {
      await SecureStore.setItemAsync(KEY_EMAIL, email);
    } else {
      await SecureStore.deleteItemAsync(KEY_EMAIL);
    }
    setAccessToken(token);
    setUserEmail(email);
  }, []);

  const applySession = useCallback(
    async (session: LoginSuccess, emailHint?: string | null) => {
      const email =
        emailHint ??
        decodeJwtEmail(session.access_token) ??
        null;
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
    } catch {
      /* ignore */
    }
    try {
      await SecureStore.deleteItemAsync(KEY_EMAIL);
    } catch {
      /* ignore */
    }
    setAccessToken(null);
    setUserEmail(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      accessToken,
      userEmail,
      signInWithPassword,
      signInWithGoogleIdToken,
      signOut,
      applySession,
    }),
    [
      ready,
      accessToken,
      userEmail,
      signInWithPassword,
      signInWithGoogleIdToken,
      signOut,
      applySession,
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
