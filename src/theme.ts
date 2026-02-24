export type ThemeMode = 'light' | 'dark';

export type ColorPalette = {
  fondo: string;
  superficie: string;
  verde: string;
  verdeOscuro: string;
  naranja: string;
  naranjaOscuro: string;
  texto: string;
  textoSuave: string;
  borde: string;
  blanco: string;
  primario: string;
  /** Texto/icono sobre botones verde o naranja (siempre contrasta) */
  onPrimario: string;
};

export const LIGHT_COLORS: ColorPalette = {
  fondo: '#f0f2f0',
  superficie: '#ffffff',
  verde: '#7a9b6e',
  verdeOscuro: '#6b8c5f',
  naranja: '#FF7043',
  naranjaOscuro: '#e85a30',
  texto: '#1a1a1a',
  textoSuave: '#5c5c5c',
  borde: '#d0d4d0',
  blanco: '#ffffff',
  primario: '#7a9b6e',
  onPrimario: '#1a1a1a',
};

export const DARK_COLORS: ColorPalette = {
  fondo: '#333333',
  superficie: '#404040',
  verde: '#A8C69F',
  verdeOscuro: '#8ab87a',
  naranja: '#FF7043',
  naranjaOscuro: '#e85a30',
  texto: '#f5f5f5',
  textoSuave: '#b0b0b0',
  borde: '#505050',
  blanco: '#ffffff',
  primario: '#A8C69F',
  onPrimario: '#1a1a1a',
};

/** Paleta por defecto (oscuro). Úsala solo si no tienes ThemeProvider. */
export const COLORS = DARK_COLORS;

export function getColors(mode: ThemeMode): ColorPalette {
  return mode === 'light' ? LIGHT_COLORS : DARK_COLORS;
}
