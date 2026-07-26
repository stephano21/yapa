import { useEffect } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { runSyncCycle } from './SyncOrchestrator';

/**
 * Dispara un ciclo de sync (push + pull) en segundo plano cuando hay sesión Pulse:
 * al montar (apertura de la app), al recuperar conectividad, y al volver la app a primer plano.
 * Nunca surge un error al usuario — el botón manual en SyncScreen sigue siendo el único que avisa.
 */
export function useAutoSync(accessToken: string | null): void {
  useEffect(() => {
    if (!accessToken) return;

    void runSyncCycle(accessToken, { silent: true });

    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        void runSyncCycle(accessToken, { silent: true });
      }
    });

    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void runSyncCycle(accessToken, { silent: true });
      }
    });

    return () => {
      unsubscribeNetInfo();
      appStateSub.remove();
    };
  }, [accessToken]);
}
