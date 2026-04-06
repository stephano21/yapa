import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { LogIn, UserPlus, LogOut } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth, PulseAuthError } from '../context/AuthContext';
import {
  registerPulseUser,
  resendPulseConfirmation,
} from '../api/pulseAuth';
import { getGoogleAuthEnv, isPulseApiConfigured } from '../config/pulse';
import { getGoogleAndroidOAuthRedirectUri } from '../utils/googleOAuthRedirect';
import type { ColorPalette } from '../theme';

WebBrowser.maybeCompleteAuthSession();

type ModoAuth = 'login' | 'registro';

function googleConfigOk(): boolean {
  const env = getGoogleAuthEnv();
  if (Platform.OS === 'android') return !!env.androidClientId;
  if (Platform.OS === 'ios') return !!env.iosClientId;
  return !!env.webClientId;
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
  const [busy, setBusy] = useState(false);
  const handledRef = useRef<string | null>(null);

  const androidRedirectUri =
    Platform.OS === 'android'
      ? getGoogleAndroidOAuthRedirectUri(env.androidClientId)
      : undefined;

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: env.webClientId,
    iosClientId: env.iosClientId,
    androidClientId: env.androidClientId,
    ...(androidRedirectUri ? { redirectUri: androidRedirectUri } : {}),
  });

  useEffect(() => {
    if (!__DEV__ || Platform.OS !== 'android') return;
    console.log('[Google OAuth] redirect_uri (debe coincidir con AndroidManifest):', androidRedirectUri ?? '(sin URI — revisa Client ID Android)');
  }, [androidRedirectUri]);

  useEffect(() => {
    if (response?.type === 'error') {
      console.warn('[Google OAuth] respuesta error', response.error, response.params);
    }
  }, [response]);

  useEffect(() => {
    if (response?.type !== 'success') return;
    const idToken = response.params.id_token;
    if (!idToken || typeof idToken !== 'string') return;
    if (handledRef.current === idToken) return;
    handledRef.current = idToken;
    setBusy(true);
    signInWithGoogleIdToken(idToken)
      .catch((e: unknown) => {
        const msg = e instanceof PulseAuthError ? e.message : 'No se pudo iniciar sesión con Google';
        Alert.alert('Google', msg);
      })
      .finally(() => setBusy(false));
  }, [response, signInWithGoogleIdToken]);

  return (
    <Pressable
      style={({ pressed }) => [
        googleStaticStyles.googleBtn,
        {
          backgroundColor: colors.superficie,
          borderColor: colors.borde,
          opacity: pressed || !request || busy ? 0.7 : 1,
        },
      ]}
      disabled={!request || busy}
      onPress={() => {
        void promptAsync();
      }}
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
          <Text style={[styles.googleHint, { color: colors.textoSuave }]}>
            Si Google muestra «solicitud no válida»: (1) Cliente OAuth tipo Android con package{' '}
            <Text style={{ fontWeight: '700' }}>com.stynger.Yapa</Text> y el SHA-1 del keystore con
            el que firmas el APK (debug distinto de release). (2){' '}
            <Text style={{ fontWeight: '700' }}>EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID</Text> debe ser
            ese cliente Android. (3) En <Text style={{ fontWeight: '700' }}>AndroidManifest</Text> el{' '}
            <Text style={{ fontWeight: '700' }}>scheme</Text> debe ser{' '}
            com.googleusercontent.apps.{'{tu_id}'} — al cambiar el Client ID, actualiza el manifest o
            vuelve a generar android. (4) Opcional: cliente Web en el mismo proyecto y{' '}
            EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID. En consola Metro verás [Google OAuth] redirect_uri.
          </Text>
        </View>
      ) : (
        <Text style={[styles.googleHint, { color: colors.textoSuave, marginTop: 8 }]}>
          Opcional: añade IDs de cliente Google en .env para mostrar el botón de Google.
        </Text>
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
