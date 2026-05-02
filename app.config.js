/**
 * Amplía app.json: plugin de Google Sign-In nativo con iosUrlScheme derivado del
 * cliente Web (.env). Sin EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID el plugin no se añade
 * (Android sigue enlazando el módulo por autolinking).
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

module.exports = ({ config }) => {
  const web = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() || '';
  const prefix = web.endsWith('.apps.googleusercontent.com')
    ? web.replace(/\.apps\.googleusercontent\.com$/i, '')
    : '';
  const iosUrlScheme = prefix ? `com.googleusercontent.apps.${prefix}` : null;

  let plugins = [...(config.plugins || [])];
  plugins = plugins.filter((p) => {
    if (p === '@react-native-google-signin/google-signin') return false;
    return !(Array.isArray(p) && p[0] === '@react-native-google-signin/google-signin');
  });

  if (iosUrlScheme) {
    plugins.push(['@react-native-google-signin/google-signin', { iosUrlScheme }]);
  }

  return {
    ...config,
    plugins,
  };
};
