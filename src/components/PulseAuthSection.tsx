import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  Switch,
} from 'react-native';
import {
  GoogleSignin,
  statusCodes,
  isErrorWithCode,
  isCancelledResponse,
} from '@react-native-google-signin/google-signin';
import { LogIn, UserPlus, LogOut } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth, PulseAuthError } from '../context/AuthContext';
import {
  registerPulseUser,
  resendPulseConfirmation,
} from '../api/pulseAuth';
import {
  getGoogleAuthEnv,
  getGoogleSignInConfigureClientId,
  hasAnyGoogleClientIdConfigured,
  isPulseApiConfigured,
} from '../config/pulse';
import { isBiometricUnlockEnabled, setBiometricUnlockEnabled } from '../storage/biometricStorage';
import { isBiometricHardwareAvailable } from '../utils/biometrics';
import {
  ANDROID_PACKAGE_FOR_GOOGLE,
  GOOGLE_CLOUD_ANDROID_DEBUG_SHA1,
  GOOGLE_CLOUD_ANDROID_RELEASE_SHA1,
} from '../config/googleAndroidSigning';
import type { ColorPalette } from '../theme';

type ModoAuth = 'login' | 'registro';

/** Sign-In nativo: al menos un Client ID en .env (Web, Android, iOS o EXPO_PUBLIC_GOOGLE_CLIENT_ID). */
function googleConfigOk(): boolean {
  if (Platform.OS === 'web') return false;
  return hasAnyGoogleClientIdConfigured();
}

function GoogleNativeChecklist({ colors }: { colors: ColorPalette }) {
  if (!__DEV__ || Platform.OS === 'web') return null;
  const env = getGoogleAuthEnv();
  const webPreview =
    env.webClientId && env.webClientId.length > 36
      ? `…${env.webClientId.slice(-40)}`
      : env.webClientId || '(falta EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID)';
  const androidPreview =
    env.androidClientId && env.androidClientId.length > 36
      ? `…${env.androidClientId.slice(-40)}`
      : env.androidClientId || '(recomendado: EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID)';
  return (
    <View
      style={{
        marginTop: 10,
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.borde,
        backgroundColor: colors.fondo,
      }}
    >
      <Text style={{ fontWeight: '700', color: colors.texto, marginBottom: 8, fontSize: 13 }}>
        Google Sign-In nativo (Play Services / cuenta Google del sistema)
      </Text>
      <Text style={{ fontSize: 12, color: colors.textoSuave, lineHeight: 18 }}>
        Ideal: <Text style={{ fontWeight: '700' }}>EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID</Text> (cliente tipo{' '}
        <Text style={{ fontWeight: '700' }}>Aplicación web</Text>; suele coincidir con la validación del
        API). Si solo tienes cliente Android en .env, el botón igual aparece; si no hay{' '}
        <Text style={{ fontWeight: '700' }}>id_token</Text>, añade el cliente Web.{'\n'}
        <Text style={{ fontWeight: '600', color: colors.texto }} selectable>
          {webPreview}
        </Text>
        {'\n\n'}
        En el mismo proyecto, credencial <Text style={{ fontWeight: '700' }}>Android</Text> con package{' '}
        <Text style={{ fontWeight: '700' }} selectable>
          {ANDROID_PACKAGE_FOR_GOOGLE}
        </Text>{' '}
        y <Text style={{ fontWeight: '700' }}>ambos SHA-1</Text> (debug + release):{'\n'}
        <Text style={{ fontWeight: '600' }} selectable>
          {GOOGLE_CLOUD_ANDROID_DEBUG_SHA1}
        </Text>
        {'\n'}
        <Text style={{ fontWeight: '600' }} selectable>
          {GOOGLE_CLOUD_ANDROID_RELEASE_SHA1}
        </Text>
        {'\n'}
        Cliente Android en .env:{' '}
        <Text style={{ fontWeight: '600', color: colors.texto }} selectable>
          {androidPreview}
        </Text>
        {'\n\n'}
        Tras cambiar .env: <Text style={{ fontWeight: '700' }}>npx expo prebuild -p android</Text> y{' '}
        <Text style={{ fontWeight: '700' }}>npx expo run:android</Text>. Consentimiento: si el app está
        en pruebas, tu correo como <Text style={{ fontWeight: '700' }}>usuario de prueba</Text>.
      </Text>
    </View>
  );
}

const googleStaticStyles = StyleSheet.create({
  googleBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
});

function GoogleSignInButton({ colors }: { colors: ColorPalette }) {
  const { signInWithGoogleIdToken } = useAuth();
  const env = getGoogleAuthEnv();
  const configureClientId = getGoogleSignInConfigureClientId();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web' || !configureClientId) return;
    GoogleSignin.configure({
      webClientId: configureClientId,
      ...(env.iosClientId?.trim() ? { iosClientId: env.iosClientId.trim() } : {}),
      offlineAccess: false,
    });
    if (__DEV__) {
      console.log('[Google Sign-In nativo] configure(webClientId) ←', configureClientId.slice(-30));
    }
  }, [configureClientId, env.iosClientId]);

  const onPress = () => {
    void (async () => {
      if (Platform.OS === 'web') {
        Alert.alert('Google', 'El inicio con Google nativo solo está disponible en la app Android/iOS.');
        return;
      }
      if (!configureClientId) {
        Alert.alert('Google', 'Define al menos un Client ID de Google en .env (Android, Web o GOOGLE_CLIENT_ID).');
        return;
      }
      setBusy(true);
      try {
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
        const signInResult = await GoogleSignin.signIn();
        if (isCancelledResponse(signInResult)) {
          return;
        }
        let idToken = signInResult.data.idToken;
        if (!idToken) {
          const tokens = await GoogleSignin.getTokens();
          idToken = tokens.idToken;
        }
        if (!idToken) {
          throw new Error(
            'Sin id_token. Crea un cliente tipo Web en Google Cloud y define EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (el Android solo en .env no siempre basta). Revisa SHA-1 y package.'
          );
        }
        const emailHint = signInResult.data.user.email;
        await signInWithGoogleIdToken(idToken, emailHint);
      } catch (e: unknown) {
        if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) {
          return;
        }
        if (__DEV__) {
          console.warn('[Google Sign-In nativo]', e);
        }
        const msg = e instanceof Error ? e.message : 'Error al iniciar sesión con Google';
        Alert.alert('Google', msg);
      } finally {
        setBusy(false);
      }
    })();
  };

  const disabled = busy || Platform.OS === 'web' || !configureClientId;

  return (
    <Pressable
      style={({ pressed }) => [
        googleStaticStyles.googleBtn,
        {
          backgroundColor: colors.superficie,
          borderColor: colors.borde,
          opacity: pressed || disabled ? 0.7 : 1,
        },
      ]}
      disabled={disabled}
      onPress={onPress}
    >
      {busy ? (
        <ActivityIndicator color={colors.texto} />
      ) : (
        <Text style={[googleStaticStyles.googleBtnText, { color: colors.texto }]}>
          Continuar con Google
        </Text>
      )}
    </Pressable>
  );
}

function BiometricToggleRow({ colors }: { colors: ColorPalette }) {
  const [disponible, setDisponible] = useState(false);
  const [activo, setActivo] = useState(false);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([isBiometricHardwareAvailable(), isBiometricUnlockEnabled()]).then(([disp, on]) => {
      if (!cancelled) {
        setDisponible(disp);
        setActivo(on);
        setCargando(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (cargando || !disponible) return null;

  const onToggle = (v: boolean) => {
    setActivo(v);
    void setBiometricUnlockEnabled(v);
  };

  return (
    <View style={[bioStyles.row, { borderColor: colors.borde }]}>
      <Text style={[bioStyles.label, { color: colors.texto }]}>Desbloqueo biométrico</Text>
      <Switch value={activo} onValueChange={onToggle} />
    </View>
  );
}

const bioStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
});

export default function PulseAuthSection() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { ready, accessToken, userEmail, signInWithPassword, signOut } = useAuth();

  const [modo, setModo] = useState<ModoAuth>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [ultimo403, setUltimo403] = useState(false);

  const apiOk = isPulseApiConfigured();

  const onLogin = useCallback(async () => {
    if (!email.trim() || !password) {
      Alert.alert('Iniciar sesión', 'Introduce correo y contraseña.');
      return;
    }
    setEnviando(true);
    setUltimo403(false);
    try {
      await signInWithPassword(email.trim(), password);
      setPassword('');
    } catch (e) {
      if (e instanceof PulseAuthError) {
        if (e.status === 403) {
          setUltimo403(true);
        }
        Alert.alert('Iniciar sesión', e.message);
      } else {
        Alert.alert('Iniciar sesión', 'Error inesperado');
      }
    } finally {
      setEnviando(false);
    }
  }, [email, password, signInWithPassword]);

  const onRegister = useCallback(async () => {
    if (!email.trim() || !password) {
      Alert.alert('Registro', 'Introduce correo y contraseña.');
      return;
    }
    setEnviando(true);
    try {
      const res = await registerPulseUser(email.trim(), password);
      Alert.alert('Registro', res.message);
      setModo('login');
    } catch (e) {
      console.warn('[PulseAuthSection] registro', e);
      if (e instanceof PulseAuthError) {
        Alert.alert('Registro', e.message);
      } else {
        Alert.alert('Registro', 'Error inesperado');
      }
    } finally {
      setEnviando(false);
    }
  }, [email, password]);

  const onResend = useCallback(async () => {
    if (!email.trim()) {
      Alert.alert('Reenviar', 'Introduce el correo con el que te registraste.');
      return;
    }
    setEnviando(true);
    try {
      const res = await resendPulseConfirmation(email.trim());
      Alert.alert('Correo', res.message);
      setUltimo403(false);
    } catch (e) {
      if (e instanceof PulseAuthError) {
        Alert.alert('Reenviar', e.message);
      } else {
        Alert.alert('Reenviar', 'Error inesperado');
      }
    } finally {
      setEnviando(false);
    }
  }, [email]);

  if (!ready) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={colors.verde} />
      </View>
    );
  }

  if (!apiOk) {
    return (
      <View style={[styles.card, { borderColor: colors.borde }]}>
        <Text style={[styles.cardTitle, { color: colors.texto }]}>Cuenta en el servidor</Text>
        <Text style={[styles.aviso, { color: colors.textoSuave }]}>
          Define{' '}
          <Text style={{ fontWeight: '600' }}>EXPO_PUBLIC_PULSE_API_URL</Text> en tu archivo .env
          (URL base de la API, sin barra final) y reinicia Expo para poder iniciar sesión.
        </Text>
      </View>
    );
  }

  if (accessToken) {
    return (
      <View style={[styles.card, { borderColor: colors.borde }]}>
        <View style={styles.sesionRow}>
          <LogIn size={22} color={colors.verde} />
          <View style={styles.sesionTexto}>
            <Text style={[styles.cardTitle, { color: colors.texto }]}>Sesión iniciada</Text>
            {userEmail ? (
              <Text style={[styles.emailText, { color: colors.textoSuave }]}>{userEmail}</Text>
            ) : (
              <Text style={[styles.emailText, { color: colors.textoSuave }]}>
                Token guardado de forma segura en el dispositivo
              </Text>
            )}
          </View>
        </View>
        <Text style={[styles.hintLocal, { color: colors.textoSuave }]}>
          Tus productos, ventas y cobros en este teléfono no se borran al cerrar sesión ni al
          iniciarla: siguen en la base local.
        </Text>
        <BiometricToggleRow colors={colors} />
        <Pressable
          style={({ pressed }) => [
            styles.btnSecondary,
            { borderColor: colors.borde, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={() => {
            void signOut();
          }}
        >
          <LogOut size={18} color={colors.texto} />
          <Text style={[styles.btnSecondaryText, { color: colors.texto }]}>Cerrar sesión</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.card, { borderColor: colors.borde }]}>
      <Text style={[styles.cardTitle, { color: colors.texto }]}>Cuenta Pulse</Text>
      <Text style={[styles.hintLocal, { color: colors.textoSuave, marginBottom: 12 }]}>
        Puedes usar la app sin cuenta. Al iniciar sesión solo guardamos el token para la API;{' '}
        <Text style={{ fontWeight: '600' }}>no borramos tus datos locales</Text>.
      </Text>

      <View style={styles.tabs}>
        <Pressable
          style={[
            styles.tab,
            modo === 'login' && { ...styles.tabActiva, borderBottomColor: colors.verde },
          ]}
          onPress={() => setModo('login')}
        >
          <Text style={[styles.tabText, { color: modo === 'login' ? colors.texto : colors.textoSuave }]}>
            Entrar
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.tab,
            modo === 'registro' && { ...styles.tabActiva, borderBottomColor: colors.verde },
          ]}
          onPress={() => setModo('registro')}
        >
          <Text
            style={[styles.tabText, { color: modo === 'registro' ? colors.texto : colors.textoSuave }]}
          >
            Registro
          </Text>
        </Pressable>
      </View>

      <TextInput
        style={[styles.input, { color: colors.texto, borderColor: colors.borde, backgroundColor: colors.superficie }]}
        placeholder="Correo"
        placeholderTextColor={colors.textoSuave}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={[styles.input, { color: colors.texto, borderColor: colors.borde, backgroundColor: colors.superficie }]}
        placeholder="Contraseña"
        placeholderTextColor={colors.textoSuave}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {modo === 'login' ? (
        <Pressable
          style={({ pressed }) => [
            styles.btnPrimary,
            { backgroundColor: colors.verde, opacity: pressed || enviando ? 0.85 : 1 },
          ]}
          disabled={enviando}
          onPress={() => void onLogin()}
        >
          {enviando ? (
            <ActivityIndicator color={colors.onPrimario} />
          ) : (
            <>
              <LogIn size={18} color={colors.onPrimario} />
              <Text style={[styles.btnPrimaryText, { color: colors.onPrimario }]}>Iniciar sesión</Text>
            </>
          )}
        </Pressable>
      ) : (
        <Pressable
          style={({ pressed }) => [
            styles.btnPrimary,
            { backgroundColor: colors.verde, opacity: pressed || enviando ? 0.85 : 1 },
          ]}
          disabled={enviando}
          onPress={() => void onRegister()}
        >
          {enviando ? (
            <ActivityIndicator color={colors.onPrimario} />
          ) : (
            <>
              <UserPlus size={18} color={colors.onPrimario} />
              <Text style={[styles.btnPrimaryText, { color: colors.onPrimario }]}>Crear cuenta</Text>
            </>
          )}
        </Pressable>
      )}

      {modo === 'login' && ultimo403 && (
        <Pressable style={styles.linkBtn} onPress={() => void onResend()} disabled={enviando}>
          <Text style={[styles.linkText, { color: colors.verde }]}>Reenviar correo de confirmación</Text>
        </Pressable>
      )}

      {googleConfigOk() ? (
        <View style={styles.googleWrap}>
          <View style={styles.dividerRow}>
            <View style={[styles.divider, { backgroundColor: colors.borde }]} />
            <Text style={[styles.dividerText, { color: colors.textoSuave }]}>o</Text>
            <View style={[styles.divider, { backgroundColor: colors.borde }]} />
          </View>
          <GoogleSignInButton colors={colors} />
          <GoogleNativeChecklist colors={colors} />
          {__DEV__ ? (
            <Text style={[styles.googleHint, { color: colors.textoSuave, marginTop: 8 }]}>
              No usa navegador: SDK nativo. Tras cambiar variables Google en .env,{' '}
              <Text style={{ fontWeight: '700' }}>npx expo prebuild</Text> y{' '}
              <Text style={{ fontWeight: '700' }}>npx expo run:android</Text>.
            </Text>
          ) : null}
        </View>
      ) : (
        __DEV__ ? (
          <Text style={[styles.googleHint, { color: colors.textoSuave, marginTop: 8 }]}>
            En móvil: define <Text style={{ fontWeight: '700' }}>EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID</Text>,{' '}
            <Text style={{ fontWeight: '700' }}>EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID</Text> o{' '}
            <Text style={{ fontWeight: '700' }}>EXPO_PUBLIC_GOOGLE_CLIENT_ID</Text> y reinicia Metro (
            <Text style={{ fontWeight: '700' }}>npx expo start -c</Text>).
          </Text>
        ) : null
      )}
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.superficie,
      borderRadius: 16,
      padding: 16,
      marginBottom: 20,
      borderWidth: 1,
    },
    cardTitle: {
      fontSize: 17,
      fontWeight: '700',
      marginBottom: 6,
    },
    aviso: {
      fontSize: 14,
      lineHeight: 20,
    },
    hintLocal: {
      fontSize: 13,
      lineHeight: 19,
    },
    sesionRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      marginBottom: 10,
    },
    sesionTexto: {
      flex: 1,
    },
    emailText: {
      fontSize: 14,
      marginTop: 2,
    },
    tabs: {
      flexDirection: 'row',
      marginBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.borde,
    },
    tab: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
    },
    tabActiva: {
      borderBottomWidth: 2,
      marginBottom: -1,
    },
    tabText: {
      fontSize: 15,
      fontWeight: '600',
    },
    input: {
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      marginBottom: 10,
    },
    btnPrimary: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      borderRadius: 12,
      marginTop: 4,
    },
    btnPrimaryText: {
      fontSize: 16,
      fontWeight: '600',
    },
    btnSecondary: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 14,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
    },
    btnSecondaryText: {
      fontSize: 15,
      fontWeight: '600',
    },
    linkBtn: {
      marginTop: 12,
      alignSelf: 'center',
    },
    linkText: {
      fontSize: 14,
      fontWeight: '600',
    },
    googleWrap: {
      marginTop: 16,
    },
    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    divider: {
      flex: 1,
      height: 1,
    },
    dividerText: {
      paddingHorizontal: 12,
      fontSize: 13,
    },
    googleHint: {
      fontSize: 11,
      lineHeight: 16,
      marginTop: 8,
    },
  });
}
