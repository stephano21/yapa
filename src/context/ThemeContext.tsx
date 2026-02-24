import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ThemeMode } from '../theme';
import { getColors, type ColorPalette } from '../theme';

const THEME_STORAGE_KEY = '@yapa_theme';

type ThemeContextValue = {
  theme: ThemeMode;
  colors: ColorPalette;
  isDark: boolean;
  setTheme: (mode: ThemeMode) => Promise<void>;
  toggleTheme: () => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>('dark');

  const colors = getColors(theme);

  const setTheme = useCallback(async (mode: ThemeMode) => {
    setThemeState(mode);
    await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
  }, []);

  const toggleTheme = useCallback(async () => {
    const next: ThemeMode = theme === 'dark' ? 'light' : 'dark';
    await setTheme(next);
  }, [theme, setTheme]);

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((saved) => {
        if (saved === 'light' || saved === 'dark') setThemeState(saved);
      })
      .catch(() => {});
  }, []);

  const value: ThemeContextValue = {
    theme,
    colors,
    isDark: theme === 'dark',
    setTheme,
    toggleTheme,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme debe usarse dentro de ThemeProvider');
  }
  return ctx;
}
