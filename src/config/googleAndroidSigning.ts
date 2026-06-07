/**
 * Huellas que usa Gradle para esta app (comprueba con `npm run android:signing-report`).
 * Deben estar en Google Cloud → credencial OAuth Android (mismo Client ID que en .env).
 * Los valores reales viven en .env.local (no se commitea).
 */
export const GOOGLE_CLOUD_ANDROID_DEBUG_SHA1 =
  process.env.EXPO_PUBLIC_SHA1_DEBUG ?? '';

export const GOOGLE_CLOUD_ANDROID_RELEASE_SHA1 =
  process.env.EXPO_PUBLIC_SHA1_RELEASE ?? '';

export const ANDROID_PACKAGE_FOR_GOOGLE = 'com.stynger.Yapa';
