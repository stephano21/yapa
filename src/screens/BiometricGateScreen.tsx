import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import { Fingerprint } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

type Props = {
  /** Se llama tras un desbloqueo biométrico exitoso. */
  onUnlocked: () => void;
  /** El usuario eligió entrar con contraseña en vez de biometría: cierra la sesión "recordada" y muestra el login. */
  onFallbackToLogin: () => void;
};

/**
 * Gate que se muestra al abrir la app cuando ya hay una sesión Pulse guardada y el desbloqueo
 * biométrico está activado. Nunca bloquea el acceso a los datos locales: solo decide si la
 * sesión de Pulse se considera "retomada" para esta apertura de la app.
 */
export default function BiometricGateScreen({ onUnlocked, onFallbackToLogin }: Props) {
  const { colors } = useTheme();
  const { signOut, ensureFreshAccessToken } = useAuth();
  const [checking, setChecking] = useState(true);
  const [fallando, setFallando] = useState(false);

  const intentar = useCallback(async () => {
    setChecking(true);
    setFallando(false);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Desbloquea Yapa',
        cancelLabel: 'Usar contraseña',
        disableDeviceFallback: false,
      });
      if (result.success) {
        await ensureFreshAccessToken();
        onUnlocked();
        return;
      }
      setFallando(true);
    } catch {
      setFallando(true);
    } finally {
      setChecking(false);
    }
  }, [ensureFreshAccessToken, onUnlocked]);

  useEffect(() => {
    void intentar();
    // Solo al montar: un reintento manual se dispara desde el botón, no re-ejecutando este efecto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const usarContrasena = useCallback(() => {
    void (async () => {
      await signOut();
      onFallbackToLogin();
    })();
  }, [signOut, onFallbackToLogin]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.fondo }]}>
      <View style={styles.contenedor}>
        <Fingerprint size={56} color={colors.verde} />
        <Text style={[styles.titulo, { color: colors.texto }]}>Yapa está bloqueada</Text>
        <Text style={[styles.subtitulo, { color: colors.textoSuave }]}>
          {checking
            ? 'Confirma tu identidad para continuar.'
            : fallando
              ? 'No se pudo verificar tu identidad.'
              : 'Confirma tu identidad para continuar.'}
        </Text>

        {checking ? (
          <ActivityIndicator color={colors.verde} style={styles.loader} />
        ) : (
          <>
            {fallando && (
              <Pressable
                style={[styles.btnPrimary, { backgroundColor: colors.verde }]}
                onPress={() => void intentar()}
              >
                <Text style={[styles.btnPrimaryText, { color: colors.onPrimario }]}>Reintentar</Text>
              </Pressable>
            )}
            <Pressable style={styles.linkBtn} onPress={usarContrasena}>
              <Text style={[styles.linkText, { color: colors.verde }]}>Usar contraseña en su lugar</Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  contenedor: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  titulo: { fontSize: 20, fontWeight: '700', marginTop: 20 },
  subtitulo: { fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20 },
  loader: { marginTop: 24 },
  btnPrimary: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  btnPrimaryText: { fontSize: 15, fontWeight: '700' },
  linkBtn: { marginTop: 16, padding: 8 },
  linkText: { fontSize: 14, fontWeight: '600' },
});
