import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getDatabase } from './src/database/db';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import TabNavigator from './src/navigation/TabNavigator';

function AppContent() {
  const [listo, setListo] = useState(false);
  const { colors, isDark } = useTheme();

  useEffect(() => {
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
      <TabNavigator />
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <NavigationContainer>
          <AppContent />
        </NavigationContainer>
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
