import * as SecureStore from 'expo-secure-store';

const KEY_BIOMETRIC_ENABLED = 'yapa_pulse_biometric_enabled';

export async function isBiometricUnlockEnabled(): Promise<boolean> {
  try {
    const v = await SecureStore.getItemAsync(KEY_BIOMETRIC_ENABLED);
    return v === '1';
  } catch {
    return false;
  }
}

export async function setBiometricUnlockEnabled(enabled: boolean): Promise<void> {
  if (enabled) {
    await SecureStore.setItemAsync(KEY_BIOMETRIC_ENABLED, '1');
  } else {
    await SecureStore.deleteItemAsync(KEY_BIOMETRIC_ENABLED).catch(() => {});
  }
}
