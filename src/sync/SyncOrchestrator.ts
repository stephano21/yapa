import { sincronizarPendientesConPulse, type PulseSyncSummary } from '../api/pulseSync';
import { pullCatalogoDeSpulse, type PullSummary } from '../api/pulseCatalogPull';

let inFlight = false;

export type RunSyncCycleOptions = {
  /** true: swallow y loguea errores (ciclo automático en segundo plano). false: relanza (botón manual). */
  silent?: boolean;
};

export type SyncCycleResult = {
  push: PulseSyncSummary;
  pull: PullSummary;
};

/**
 * Un ciclo completo de sincronización: push de pendientes + pull de catálogo.
 * Protegido contra ejecuciones solapadas (p. ej. reconexión de red y apertura de la app casi a la vez):
 * si ya hay un ciclo en curso, devuelve `null` en vez de arrancar uno nuevo.
 */
export async function runSyncCycle(
  accessToken: string,
  opts?: RunSyncCycleOptions
): Promise<SyncCycleResult | null> {
  if (inFlight) return null;
  inFlight = true;
  try {
    const push = await sincronizarPendientesConPulse(accessToken);
    const pull = await pullCatalogoDeSpulse(accessToken);
    return { push, pull };
  } catch (e) {
    if (!opts?.silent) throw e;
    if (__DEV__) {
      console.warn('[SyncOrchestrator] sync en segundo plano falló (se reintentará en el próximo disparador)', e);
    }
    return null;
  } finally {
    inFlight = false;
  }
}
