import React, { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TabNavigator from './TabNavigator';
import UnidadesMedidaScreen from '../screens/UnidadesMedidaScreen';
import LoginScreen from '../screens/LoginScreen';
import BiometricGateScreen from '../screens/BiometricGateScreen';
import BiometricOptInScreen from '../screens/BiometricOptInScreen';
import type { RootStackParamList } from './types';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useAutoSync } from '../sync/useAutoSync';
import { isBiometricUnlockEnabled } from '../storage/biometricStorage';
import { isBiometricHardwareAvailable } from '../utils/biometrics';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { ready, accessToken, isPulseLinked, hasRefreshToken } = useAuth();
  const { colors } = useTheme();

  useAutoSync(accessToken);

  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [unlockGatePassed, setUnlockGatePassed] = useState(false);
  const [optInDone, setOptInDone] = useState(false);
  /** true si ya había sesión Pulse al terminar de hidratar (app recién abierta con sesión guardada). */
  const wasLoggedInAtStart = useRef<boolean | null>(null);

  useEffect(() => {
    if (ready && wasLoggedInAtStart.current === null) {
      wasLoggedInAtStart.current = !!accessToken;
    }
  }, [ready, accessToken]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    Promise.all([isBiometricUnlockEnabled(), isBiometricHardwareAvailable()]).then(([enabled, available]) => {
      if (!cancelled) {
        setBiometricEnabled(enabled);
        setBiometricAvailable(available);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [ready, accessToken]);

  if (!ready) {
    return (
      <View style={[styles.splash, { backgroundColor: colors.fondo }]}>
        <ActivityIndicator size="large" color={colors.verde} />
      </View>
    );
  }

  // Gate 1: la app se abrió con una sesión Pulse ya guardada y el desbloqueo biométrico está activo.
  const needsUnlockGate =
    biometricEnabled && hasRefreshToken && wasLoggedInAtStart.current === true && !unlockGatePassed;
  if (needsUnlockGate) {
    return (
      <BiometricGateScreen
        onUnlocked={() => setUnlockGatePassed(true)}
        onFallbackToLogin={() => setUnlockGatePassed(true)}
      />
    );
  }

  // Gate 2: el usuario acaba de iniciar sesión en esta apertura de la app — se le ofrece biometría.
  const justSignedIn = wasLoggedInAtStart.current === false && !!accessToken;
  if (justSignedIn && biometricAvailable && !biometricEnabled && !optInDone) {
    return <BiometricOptInScreen onDone={() => setOptInDone(true)} />;
  }

  const requiereLogin = isPulseLinked && !accessToken;

  return (
    <Stack.Navigator
      key={requiereLogin ? 'auth' : 'app'}
      screenOptions={{ headerShown: false }}
      initialRouteName={requiereLogin ? 'Login' : 'Main'}
    >
      {requiereLogin ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : (
        <>
          <Stack.Screen name="Main" component={TabNavigator} />
          <Stack.Screen name="UnidadesMedida" component={UnidadesMedidaScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
