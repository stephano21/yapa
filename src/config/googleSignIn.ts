import { Platform } from 'react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { getGoogleAuthEnv, getGoogleSignInConfigureClientId } from './pulse';

let configured = false;

/**
 * Configura Google Sign-In UNA sola vez al iniciar la app (idempotente).
 * Debe llamarse al arranque (App.tsx), no en el render de un componente.
 * No hace nada en web ni si no hay Client ID en .env.
 */
export function configureGoogleSignInOnce(): void {
  if (configured) return;
  if (Platform.OS === 'web') return;
  const clientId = getGoogleSignInConfigureClientId();
  if (!clientId) return;
  const env = getGoogleAuthEnv();
  GoogleSignin.configure({
    webClientId: clientId,
    ...(env.iosClientId?.trim() ? { iosClientId: env.iosClientId.trim() } : {}),
    offlineAccess: false,
  });
  configured = true;
  if (__DEV__) {
    console.log('[Google Sign-In] configure() (una vez) ←', clientId.slice(-30));
  }
}
