import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { addDatabaseChangeListener } from 'expo-sqlite';
import { hasPendingChanges, runSyncCycle } from './SyncOrchestrator';

/** Tablas cuyo cambio local puede dejar registros pendientes de enviar. */
const TABLAS_SINCRONIZABLES = new Set([
  'productos',
  'clientes',
  'unidades_medida',
  'ventas',
  'venta_detalle',
  'cobros',
  'proveedores',
  'compras_proveedor',
  'pagos_proveedor',
]);

/** Agrupa ráfagas de eventos (p. ej. una venta escribe varias filas) en un solo ciclo. */
const DEBOUNCE_MS = 2000;
/** Reintento/pull periódico mientras la app está abierta y con conexión. */
const INTERVALO_PERIODICO_MS = 5 * 60 * 1000;

/**
 * Sincroniza con Pulse en segundo plano cuando hay sesión y conexión, sin intervención del usuario:
 * - al abrir la app y al recuperar conectividad,
 * - al volver la app a primer plano,
 * - poco después de guardar cambios locales (venta, cobro, producto...) si hay conexión,
 * - cada 5 minutos como reintento/pull mientras la app está abierta.
 * Nunca muestra errores — el botón manual en SyncScreen sigue siendo el único que avisa.
 *
 * `getFreshToken` se llama en cada disparo para no usar un access_token vencido.
 */
export function useAutoSync(
  signedIn: boolean,
  getFreshToken: () => Promise<string | null>
): void {
  const getFreshTokenRef = useRef(getFreshToken);
  getFreshTokenRef.current = getFreshToken;

  useEffect(() => {
    if (!signedIn) return;

    let online = true;
    let running = false;
    let queued = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let forceNext = false;

    const ejecutar = async (force: boolean) => {
      if (!online) return;
      if (running) {
        // Llegó un disparador durante un ciclo: repetir al terminar para no perder cambios.
        queued = true;
        forceNext = forceNext || force;
        return;
      }
      running = true;
      try {
        // Cambios locales: solo vale la pena si hay algo pendiente (evita bucles con las
        // escrituras del propio sync, que dejan los registros en dirty = 0).
        if (!force && !(await hasPendingChanges())) return;
        const token = await getFreshTokenRef.current();
        if (!token) return;
        await runSyncCycle(token, { silent: true });
      } catch (e) {
        if (__DEV__) console.warn('[useAutoSync] disparo falló', e);
      } finally {
        running = false;
        if (queued) {
          queued = false;
          const f = forceNext;
          forceNext = false;
          programar(f);
        }
      }
    };

    const programar = (force: boolean) => {
      forceNext = forceNext || force;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const f = forceNext;
        forceNext = false;
        void ejecutar(f);
      }, DEBOUNCE_MS);
    };

    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      online = !!state.isConnected && state.isInternetReachable !== false;
      // El primer evento (estado inicial) también dispara: cubre la apertura de la app.
      if (online) programar(true);
    });

    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') programar(true);
    });

    const dbSub = addDatabaseChangeListener((event) => {
      if (TABLAS_SINCRONIZABLES.has(event.tableName)) programar(false);
    });

    const interval = setInterval(() => programar(true), INTERVALO_PERIODICO_MS);

    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(interval);
      unsubscribeNetInfo();
      appStateSub.remove();
      dbSub.remove();
    };
  }, [signedIn]);
}
