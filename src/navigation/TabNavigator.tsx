import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from '../screens/HomeScreen';
import InventarioScreen from '../screens/InventarioScreen';
import BalanceScreen from '../screens/BalanceScreen';
import { useTheme } from '../context/ThemeContext';

const Tab = createBottomTabNavigator();

const ICONS: Record<string, { focused: keyof typeof Ionicons.glyphMap; unfocused: keyof typeof Ionicons.glyphMap }> = {
  Ventas: { focused: 'cart', unfocused: 'cart-outline' },
  Inventario: { focused: 'cube', unfocused: 'cube-outline' },
  Balance: { focused: 'wallet', unfocused: 'wallet-outline' },
};

export default function TabNavigator() {
  const { colors } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.superficie,
          borderTopColor: colors.borde,
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.verde,
        tabBarInactiveTintColor: colors.textoSuave,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
        tabBarIcon: ({ focused, color, size }) => {
          const names = ICONS[route.name];
          const iconName = names ? (focused ? names.focused : names.unfocused) : 'ellipse';
          return <Ionicons name={iconName} size={size ?? 24} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Ventas" component={HomeScreen} />
      <Tab.Screen name="Inventario" component={InventarioScreen} />
      <Tab.Screen name="Balance" component={BalanceScreen} />
    </Tab.Navigator>
  );
}
