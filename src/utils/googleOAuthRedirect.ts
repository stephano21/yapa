/**
 * Google OAuth en Android (Custom Tabs / navegador) espera un redirect con esquema
 * `com.googleusercontent.apps.{CLIENT_PREFIX}:/oauth2redirect/google`, donde CLIENT_PREFIX
 * es el ID sin el sufijo `.apps.googleusercontent.com`.
 *
 * Expo por defecto usa `{applicationId}:/oauthredirect`, que Google suele rechazar con
 * "Solicitud no válida" / error 400.
 *
 * @see https://developers.google.com/identity/protocols/oauth2/native-app
 */
export function getGoogleAndroidOAuthRedirectUri(androidClientId: string | undefined): string | undefined {
  const id = androidClientId?.trim();
  if (!id || !id.endsWith('.apps.googleusercontent.com')) return undefined;
  const prefix = id.replace(/\.apps\.googleusercontent\.com$/i, '');
  if (!prefix) return undefined;
  return `com.googleusercontent.apps.${prefix}:/oauth2redirect/google`;
}

/** Esquema para `<data android:scheme="..."/>` en AndroidManifest (sin ://). */
export function getGoogleAndroidOAuthIntentScheme(androidClientId: string | undefined): string | undefined {
  const uri = getGoogleAndroidOAuthRedirectUri(androidClientId);
  if (!uri) return undefined;
  const colon = uri.indexOf(':');
  if (colon <= 0) return undefined;
  return uri.slice(0, colon);
}
