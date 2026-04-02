import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TabNavigator from './TabNavigator';
import UnidadesMedidaScreen from '../screens/UnidadesMedidaScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={TabNavigator} />
      <Stack.Screen
        name="UnidadesMedida"
        component={UnidadesMedidaScreen}
        options={{
          headerShown: true,
          title: 'Unidades de medida',
          headerBackTitle: 'Volver',
        }}
      />
    </Stack.Navigator>
  );
}
