import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_LINKED = 'yapa_pulse_account_linked';
const KEY_LINKED_AT = 'yapa_pulse_account_linked_at';

/**
 * Marca que esta instalación ya completó al menos una sincronización exitosa con Pulse.
 * Es un control de acceso (decide si se exige sesión), por eso vive en SecureStore
 * (cifrado a nivel OS) en lugar de AsyncStorage.
 */
export async function setPulseAccountLinked(): Promise<void> {
  await SecureStore.setItemAsync(KEY_LINKED, '1');
  await SecureStore.setItemAsync(KEY_LINKED_AT, new Date().toISOString());
}

export async function isPulseAccountLinked(): Promise<boolean> {
  try {
    const v = await SecureStore.getItemAsync(KEY_LINKED);
    if (v === '1' || v === 'true') return true;
    // Migración desde versiones previas que guardaban el flag en AsyncStorage.
    const legacy = await AsyncStorage.getItem(KEY_LINKED);
    if (legacy === '1' || legacy === 'true') {
      await SecureStore.setItemAsync(KEY_LINKED, '1');
      await AsyncStorage.removeItem(KEY_LINKED).catch(() => {});
      await AsyncStorage.removeItem(KEY_LINKED_AT).catch(() => {});
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
