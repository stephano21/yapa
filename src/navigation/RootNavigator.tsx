import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TabNavigator from './TabNavigator';
import UnidadesMedidaScreen from '../screens/UnidadesMedidaScreen';
import LoginScreen from '../screens/LoginScreen';
import type { RootStackParamList } from './types';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { ready, accessToken, isPulseLinked } = useAuth();
  const { colors } = useTheme();

  if (!ready) {
    return (
      <View style={[styles.splash, { backgroundColor: colors.fondo }]}>
        <ActivityIndicator size="large" color={colors.verde} />
      </View>
    );
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
