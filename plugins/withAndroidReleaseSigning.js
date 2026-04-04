/**
 * Parchea android/app/build.gradle: signingConfigs.release lee MYAPP_UPLOAD_* desde local.properties.
 * Si hay keystore de upload, release usa esa firma; si no, release reutiliza credenciales debug (build local sin env).
 */
const { withAppBuildGradle } = require('@expo/config-plugins');

const MARK_BEGIN = '// [withAndroidReleaseSigning:begin]';
const MARK_END = '// [withAndroidReleaseSigning:end]';

const INJECT_BLOCK = `
${MARK_BEGIN}
def yapaLocalProps = new Properties()
def yapaLocalPropsFile = rootProject.file("local.properties")
if (yapaLocalPropsFile.exists()) {
    yapaLocalPropsFile.withInputStream { yapaLocalProps.load(it) }
}
def yapaHasUploadKeystore = yapaLocalProps.getProperty("MYAPP_UPLOAD_STORE_FILE") != null
${MARK_END}
`;

function stripPersistentSigning(contents) {
  return contents
    .replace(/\n\/\/ \[withPersistentAndroidSigning\][\s\S]*?apply from:.*?\n/g, '\n')
    .replace(/\n\/\/ \[withAndroidReleaseSigning:begin\][\s\S]*?\/\/ \[withAndroidReleaseSigning:end\]\n/g, '\n');
}

function ensureInjectAfterProjectRoot(contents) {
  if (contents.includes(MARK_BEGIN)) {
    return contents;
  }
  const anchor =
    'def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()';
  if (!contents.includes(anchor)) {
    return `${INJECT_BLOCK}\n${contents}`;
  }
  return contents.replace(anchor, `${anchor}\n${INJECT_BLOCK}`);
}

function patchSigning(contents) {
  const oldSigning = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }`;

  const newSigning = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            if (yapaHasUploadKeystore) {
                storeFile file(yapaLocalProps.getProperty("MYAPP_UPLOAD_STORE_FILE"))
                storePassword yapaLocalProps.getProperty("MYAPP_UPLOAD_STORE_PASSWORD")
                keyAlias yapaLocalProps.getProperty("MYAPP_UPLOAD_KEY_ALIAS")
                keyPassword yapaLocalProps.getProperty("MYAPP_UPLOAD_KEY_PASSWORD")
            } else {
                storeFile file('debug.keystore')
                storePassword 'android'
                keyAlias 'androiddebugkey'
                keyPassword 'android'
            }
        }
    }`;

  if (!contents.includes(oldSigning)) {
    return contents;
  }
  return contents.replace(oldSigning, newSigning);
}

function patchReleaseBuildType(contents) {
  if (contents.includes('signingConfig signingConfigs.release')) {
    return contents;
  }
  return contents.replace(
    `            signingConfig signingConfigs.debug
            def enableShrinkResources`,
    `            signingConfig signingConfigs.release
            def enableShrinkResources`
  );
}

module.exports = function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      return cfg;
    }

    let contents = cfg.modResults.contents;
    contents = stripPersistentSigning(contents);
    contents = ensureInjectAfterProjectRoot(contents);
    contents = patchSigning(contents);
    contents = patchReleaseBuildType(contents);
    cfg.modResults.contents = contents;
    return cfg;
  });
};
