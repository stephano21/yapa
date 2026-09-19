import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Store } from 'lucide-react-native';
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
          <View style={[styles.badge, { backgroundColor: colors.verde }]}>
            <Store size={30} color={colors.onPrimario} />
          </View>
          <Text style={styles.titulo}>Bienvenido a Yapa</Text>
          <Text style={styles.subtitulo}>
            Inicia sesión con tu cuenta para continuar. Si aún no tienes una, puedes crearla desde
            aquí mismo.
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
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: 20,
      paddingVertical: 32,
    },
    header: {
      alignItems: 'center',
      marginBottom: 28,
    },
    badge: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    titulo: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.texto,
      textAlign: 'center',
    },
    subtitulo: {
      fontSize: 15,
      color: colors.textoSuave,
      marginTop: 8,
      lineHeight: 22,
      textAlign: 'center',
      paddingHorizontal: 8,
    },
    loader: {
      marginTop: 24,
    },
  });
}
