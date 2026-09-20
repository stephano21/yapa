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
import { LogIn, UserPlus, LogOut, Mail, Lock, Store } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth, PulseAuthError } from '../context/AuthContext';
import {
  registerPulseUser,
  resendPulseConfirmation,
} from '../api/pulseAuth';
import {
  getGoogleSignInConfigureClientId,
  hasAnyGoogleClientIdConfigured,
  isPulseApiConfigured,
} from '../config/pulse';
import { isBiometricUnlockEnabled, setBiometricUnlockEnabled } from '../storage/biometricStorage';
import { isBiometricHardwareAvailable } from '../utils/biometrics';
import type { ColorPalette } from '../theme';

type ModoAuth = 'login' | 'registro';

/** Validación básica de formato de email (UX; el servidor valida de verdad). */
function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Sign-In nativo: al menos un Client ID configurado (Web, Android, iOS). */
function googleConfigOk(): boolean {
  if (Platform.OS === 'web') return false;
  return hasAnyGoogleClientIdConfigured();
}

const googleStaticStyles = StyleSheet.create({
  googleBtn: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  googleBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  googleBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
});

function GoogleSignInButton({ colors }: { colors: ColorPalette }) {
  const { signInWithGoogleIdToken } = useAuth();
  const configureClientId = getGoogleSignInConfigureClientId();
  const [busy, setBusy] = useState(false);

  // La configuración de Google Sign-In se hace una sola vez al iniciar la app
  // (App.tsx → configureGoogleSignInOnce), no aquí en el render.

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
          throw new Error('No se pudo completar el inicio de sesión con Google. Intenta de nuevo.');
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
        <>
          <View style={[googleStaticStyles.googleBadge, { backgroundColor: colors.fondo }]}>
            <Text style={[googleStaticStyles.googleBadgeText, { color: colors.texto }]}>G</Text>
          </View>
          <Text style={[googleStaticStyles.googleBtnText, { color: colors.texto }]}>
            Continuar con Google
          </Text>
        </>
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
  const [tenantName, setTenantName] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [ultimo403, setUltimo403] = useState(false);

  const apiOk = isPulseApiConfigured();

  const onLogin = useCallback(async () => {
    if (!email.trim() || !password) {
      Alert.alert('Iniciar sesión', 'Introduce correo y contraseña.');
      return;
    }
    if (!isValidEmail(email)) {
      Alert.alert('Iniciar sesión', 'El correo no tiene un formato válido.');
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
    if (!isValidEmail(email)) {
      Alert.alert('Registro', 'El correo no tiene un formato válido.');
      return;
    }
    if (!tenantName.trim()) {
      Alert.alert('Registro', 'Introduce el nombre de tu negocio.');
      return;
    }
    setEnviando(true);
    try {
      const res = await registerPulseUser(email.trim(), password, tenantName.trim());
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
  }, [email, password, tenantName]);

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
      <Text style={[styles.hintLocal, { color: colors.textoSuave, marginBottom: 16 }]}>
        Puedes usar la app sin cuenta. Al iniciar sesión solo guardamos el token para la API;{' '}
        <Text style={{ fontWeight: '600' }}>no borramos tus datos locales</Text>.
      </Text>

      <View style={[styles.segmented, { backgroundColor: colors.fondo, borderColor: colors.borde }]}>
        <Pressable
          style={[styles.segment, modo === 'login' && { backgroundColor: colors.superficie }]}
          onPress={() => setModo('login')}
        >
          <Text style={[styles.segmentText, { color: modo === 'login' ? colors.texto : colors.textoSuave }]}>
            Entrar
          </Text>
        </Pressable>
        <Pressable
          style={[styles.segment, modo === 'registro' && { backgroundColor: colors.superficie }]}
          onPress={() => setModo('registro')}
        >
          <Text
            style={[styles.segmentText, { color: modo === 'registro' ? colors.texto : colors.textoSuave }]}
          >
            Registro
          </Text>
        </Pressable>
      </View>

      {modo === 'registro' && (
        <View style={[styles.inputRow, { borderColor: colors.borde, backgroundColor: colors.fondo }]}>
          <Store size={18} color={colors.textoSuave} />
          <TextInput
            style={[styles.inputField, { color: colors.texto }]}
            placeholder="Nombre de tu negocio"
            placeholderTextColor={colors.textoSuave}
            autoCapitalize="words"
            value={tenantName}
            onChangeText={setTenantName}
          />
        </View>
      )}
      <View style={[styles.inputRow, { borderColor: colors.borde, backgroundColor: colors.fondo }]}>
        <Mail size={18} color={colors.textoSuave} />
        <TextInput
          style={[styles.inputField, { color: colors.texto }]}
          placeholder="Correo"
          placeholderTextColor={colors.textoSuave}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
        />
      </View>
      <View style={[styles.inputRow, { borderColor: colors.borde, backgroundColor: colors.fondo }]}>
        <Lock size={18} color={colors.textoSuave} />
        <TextInput
          style={[styles.inputField, { color: colors.texto }]}
          placeholder="Contraseña"
          placeholderTextColor={colors.textoSuave}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
      </View>

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

      {googleConfigOk() && (
        <View style={styles.googleWrap}>
          <View style={styles.dividerRow}>
            <View style={[styles.divider, { backgroundColor: colors.borde }]} />
            <Text style={[styles.dividerText, { color: colors.textoSuave }]}>o</Text>
            <View style={[styles.divider, { backgroundColor: colors.borde }]} />
          </View>
          <GoogleSignInButton colors={colors} />
        </View>
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
    segmented: {
      flexDirection: 'row',
      borderRadius: 12,
      borderWidth: 1,
      padding: 4,
      marginBottom: 16,
    },
    segment: {
      flex: 1,
      paddingVertical: 9,
      borderRadius: 9,
      alignItems: 'center',
    },
    segmentText: {
      fontSize: 14,
      fontWeight: '600',
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      marginBottom: 10,
    },
    inputField: {
      flex: 1,
      paddingVertical: 12,
      fontSize: 15,
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
  });
}
