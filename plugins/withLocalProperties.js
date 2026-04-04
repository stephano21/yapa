/**
 * Regenera android/local.properties en cada prebuild.
 * - sdk.dir desde ANDROID_HOME / ANDROID_SDK_ROOT, o conserva el sdk.dir existente.
 * - Si están las 4 variables de entorno de keystore, escribe MYAPP_UPLOAD_* para Gradle.
 *
 * ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_ALIAS,
 * ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_PASSWORD
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withLocalProperties(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      try {
        require('dotenv').config({ path: path.join(projectRoot, '.env') });
      } catch (_) {
        /* dotenv opcional */
      }
      const androidDir = path.join(projectRoot, 'android');
      const localPropertiesPath = path.join(androidDir, 'local.properties');

      let sdkDir = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';
      let existing = '';
      if (fs.existsSync(localPropertiesPath)) {
        existing = fs.readFileSync(localPropertiesPath, 'utf8');
      }
      if (!sdkDir) {
        const m = existing.match(/^sdk\.dir\s*=\s*(.+)$/m);
        if (m) sdkDir = m[1].trim();
      }

      const kPath = process.env.ANDROID_KEYSTORE_PATH;
      const kAlias = process.env.ANDROID_KEYSTORE_ALIAS;
      const kStorePass = process.env.ANDROID_KEYSTORE_PASSWORD;
      const kKeyPass = process.env.ANDROID_KEY_PASSWORD;
      const hasAllKeystoreEnv = !!(kPath && kAlias && kStorePass && kKeyPass);

      const lines = [];
      if (sdkDir) {
        lines.push(`sdk.dir=${sdkDir.replace(/\\/g, '/')}`);
      }

      if (hasAllKeystoreEnv) {
        lines.push(`MYAPP_UPLOAD_STORE_FILE=${kPath.replace(/\\/g, '/')}`);
        lines.push(`MYAPP_UPLOAD_KEY_ALIAS=${kAlias}`);
        lines.push(`MYAPP_UPLOAD_STORE_PASSWORD=${kStorePass}`);
        lines.push(`MYAPP_UPLOAD_KEY_PASSWORD=${kKeyPass}`);
      }

      if (lines.length > 0) {
        fs.mkdirSync(androidDir, { recursive: true });
        fs.writeFileSync(localPropertiesPath, `${lines.join('\n')}\n`, 'utf8');
      }

      return cfg;
    },
  ]);
};
