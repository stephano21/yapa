import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LogIn } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import type { ColorPalette } from '../theme';
import PulseAuthSection from '../components/PulseAuthSection';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen() {
  const { colors } = useTheme();
  const { ready } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <LogIn size={28} color={colors.verde} />
          <Text style={styles.titulo}>Iniciar sesión</Text>
          <Text style={styles.subtitulo}>
            Tu cuenta ya está vinculada con Pulse. Inicia sesión para continuar y sincronizar con el
            servidor.
          </Text>
        </View>
        {!ready ? (
          <ActivityIndicator size="large" color={colors.verde} style={styles.loader} />
        ) : (
          <PulseAuthSection />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.fondo,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: 32,
    },
    header: {
      marginBottom: 20,
    },
    titulo: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.texto,
      marginTop: 12,
    },
    subtitulo: {
      fontSize: 15,
      color: colors.textoSuave,
      marginTop: 8,
      lineHeight: 22,
    },
    loader: {
      marginTop: 24,
    },
  });
}
