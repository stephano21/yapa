import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TabNavigator from './TabNavigator';
import UnidadesMedidaScreen from '../screens/UnidadesMedidaScreen';
import LoginScreen from '../screens/LoginScreen';
import type { RootStackParamList } from './types';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { isPulseAccountLinked } from '../storage/pulseLinkStorage';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { ready, accessToken } = useAuth();
  const { colors } = useTheme();
  const [pulseLinked, setPulseLinked] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    isPulseAccountLinked()
      .then((v) => {
        if (!cancelled) setPulseLinked(v);
      })
      .catch(() => {
        if (!cancelled) setPulseLinked(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cargandoGate = !ready || pulseLinked === null;
  const requiereLogin = pulseLinked === true && !accessToken;

  if (cargandoGate) {
    return (
      <View style={[styles.splash, { backgroundColor: colors.fondo }]}>
        <ActivityIndicator size="large" color={colors.verde} />
      </View>
    );
  }

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
