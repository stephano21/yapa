import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_LINKED = 'yapa_pulse_account_linked';
const KEY_LINKED_AT = 'yapa_pulse_account_linked_at';

/**
 * Marca que esta instalación ya completó al menos una sincronización exitosa con Pulse.
 * Persistido para exigir sesión en siguientes aperturas y futuras descargas desde el API.
 */
export async function setPulseAccountLinked(): Promise<void> {
  await AsyncStorage.multiSet([
    [KEY_LINKED, '1'],
    [KEY_LINKED_AT, new Date().toISOString()],
  ]);
}

export async function isPulseAccountLinked(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(KEY_LINKED);
    return v === '1' || v === 'true';
  } catch {
    return false;
  }
}
