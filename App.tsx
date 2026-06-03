import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getDatabase } from './src/database/db';
import { configureGoogleSignInOnce } from './src/config/googleSignIn';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { AuthProvider } from './src/context/AuthContext';
import RootNavigator from './src/navigation/RootNavigator';

function AppContent() {
  const [listo, setListo] = useState(false);
  const { colors, isDark } = useTheme();

  useEffect(() => {
    configureGoogleSignInOnce();
    getDatabase()
      .then(() => setListo(true))
      .catch((e) => {
        console.error('Error al iniciar DB:', e);
        setListo(true);
      });
  }, []);

  if (!listo) {
    return (
      <View style={[styles.splash, { backgroundColor: colors.fondo }]}>
        <ActivityIndicator size="large" color={colors.verde} />
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </View>
    );
  }

  return (
    <>
      <RootNavigator />
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <NavigationContainer>
            <AppContent />
          </NavigationContainer>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
