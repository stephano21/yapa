import * as LocalAuthentication from 'expo-local-authentication';

/** true si el dispositivo tiene sensor biométrico y al menos una huella/rostro ya enrolado. */
export async function isBiometricHardwareAvailable(): Promise<boolean> {
  try {
    const [hasHardware, isEnrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    return hasHardware && isEnrolled;
  } catch {
    return false;
  }
}
