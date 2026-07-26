import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Fingerprint } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { setBiometricUnlockEnabled } from '../storage/biometricStorage';

type Props = {
  onDone: () => void;
};

/** Se ofrece justo después de un login exitoso (correo o Google), solo si el dispositivo tiene biometría disponible. */
export default function BiometricOptInScreen({ onDone }: Props) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);

  const activar = useCallback(() => {
    void (async () => {
      setBusy(true);
      try {
        await setBiometricUnlockEnabled(true);
      } finally {
        setBusy(false);
        onDone();
      }
    })();
  }, [onDone]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.fondo }]}>
      <View style={styles.contenedor}>
        <Fingerprint size={56} color={colors.verde} />
        <Text style={[styles.titulo, { color: colors.texto }]}>¿Activar desbloqueo biométrico?</Text>
        <Text style={[styles.subtitulo, { color: colors.textoSuave }]}>
          La próxima vez que abras Yapa, podrás entrar con tu huella o Face ID en vez de escribir tu
          contraseña. Puedes cambiarlo cuando quieras desde la pantalla de Sincronización.
        </Text>

        <Pressable
          style={[styles.btnPrimary, { backgroundColor: colors.verde, opacity: busy ? 0.85 : 1 }]}
          disabled={busy}
          onPress={activar}
        >
          {busy ? (
            <ActivityIndicator color={colors.onPrimario} />
          ) : (
            <Text style={[styles.btnPrimaryText, { color: colors.onPrimario }]}>Activar</Text>
          )}
        </Pressable>
        <Pressable style={styles.linkBtn} disabled={busy} onPress={onDone}>
          <Text style={[styles.linkText, { color: colors.textoSuave }]}>Ahora no</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  contenedor: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  titulo: { fontSize: 20, fontWeight: '700', marginTop: 20, textAlign: 'center' },
  subtitulo: { fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20 },
  btnPrimary: {
    marginTop: 28,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 12,
    minWidth: 160,
    alignItems: 'center',
  },
  btnPrimaryText: { fontSize: 15, fontWeight: '700' },
  linkBtn: { marginTop: 14, padding: 8 },
  linkText: { fontSize: 14, fontWeight: '600' },
});
