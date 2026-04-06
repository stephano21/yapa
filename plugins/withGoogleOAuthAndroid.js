/**
 * En cada `expo prebuild`, añade el intent-filter de retorno OAuth de Google en MainActivity.
 * Lee EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID o EXPO_PUBLIC_GOOGLE_CLIENT_ID desde .env (misma lógica que withLocalProperties).
 *
 * Esquema: com.googleusercontent.apps.{prefijo sin .apps.googleusercontent.com}
 * Ruta: /oauth2redirect (coincide con getGoogleAndroidOAuthRedirectUri en JS)
 *
 * Los intent-filter generados llevan data-expo-google-oauth="true" para poder quitarlos
 * en la siguiente ejecución y evitar duplicados.
 */
const path = require('path');
const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

const GENERATED_ATTR = 'data-expo-google-oauth';

function loadDotenv(projectRoot) {
  try {
    require('dotenv').config({ path: path.join(projectRoot, '.env') });
  } catch (_) {
    /* opcional */
  }
}

function oauthSchemeFromClientId(clientId) {
  const id = (clientId || '').trim();
  if (!id || !id.endsWith('.apps.googleusercontent.com')) return null;
  const prefix = id.replace(/\.apps\.googleusercontent\.com$/i, '');
  if (!prefix) return null;
  return `com.googleusercontent.apps.${prefix}`;
}

module.exports = function withGoogleOAuthAndroid(config) {
  return withAndroidManifest(config, async (cfg) => {
    const projectRoot = cfg.modRequest.projectRoot;
    loadDotenv(projectRoot);

    const clientId =
      process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim() ||
      process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID?.trim() ||
      '';

    const scheme = oauthSchemeFromClientId(clientId);
    const androidManifest = cfg.modResults;

    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(androidManifest);

    if (Array.isArray(mainActivity['intent-filter'])) {
      mainActivity['intent-filter'] = mainActivity['intent-filter'].filter(
        (f) => f.$?.[GENERATED_ATTR] !== 'true'
      );
    }

    if (!scheme) {
      return cfg;
    }

    const newFilter = {
      $: {
        [GENERATED_ATTR]: 'true',
      },
      action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
      category: [
        { $: { 'android:name': 'android.intent.category.DEFAULT' } },
        { $: { 'android:name': 'android.intent.category.BROWSABLE' } },
      ],
      data: [
        {
          $: {
            'android:scheme': scheme,
            'android:pathPrefix': '/oauth2redirect',
          },
        },
      ],
    };

    if (!mainActivity['intent-filter']) {
      mainActivity['intent-filter'] = [];
    }
    mainActivity['intent-filter'].push(newFilter);

    return cfg;
  });
};
