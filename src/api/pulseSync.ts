import { getPulseApiBase } from '../config/pulse';
import {
  PulseAuthError,
  normalizePulseAccessToken,
  pulseAuthorizedHeaders,
} from './pulseAuth';
import {
  getProductosParaPushPulse,
  getClientesParaPushPulse,
  getVentasConDetalleParaPushPulse,
  getCobrosPendientesSync,
  getClienteRemoteId,
  marcarProductoSincronizado,
  marcarClienteSincronizado,
  marcarVentaSincronizada,
  marcarCobroSincronizado,
  marcarLineasVentaSincronizadas,
} from '../database/sync';
import { setPulseAccountLinked } from '../storage/pulseLinkStorage';

export type PulseSyncEntidad = 'productos' | 'clientes' | 'ventas' | 'cobros';

export type PulseSyncError = {
  entidad: PulseSyncEntidad;
  mensaje: string;
};

export type PulseSyncSummary = {
  productos: number;
  clientes: number;
  ventas: number;
  cobros: number;
  cobrosOmitidosSinClienteRemoto: number;
  /** Entidades que fallaron por red/servidor (no 401). El resto sí se envió. */
  errores: PulseSyncError[];
};

/**
 * Clave de idempotencia estable por registro. El servidor debe deduplicar
 * reintentos con la misma `mutation_id` (guardarla 24–72 h). Ver docs/backend.md §5.3.
 * - productos/clientes: incluyen la versión (`client_updated_at`) para que una
 *   edición legítima genere una clave nueva (= update), y un reintento del mismo
 *   estado reutilice la clave (= dedupe).
 * - ventas/cobros: append-only en el dispositivo, basta entidad + local_id.
 */
function mutationId(entidad: string, localId: number, version?: string): string {
  const v = version?.trim();
  return v ? `${entidad}:${localId}:${v}` : `${entidad}:${localId}`;
}

/** Lanza si el error es de autenticación (401/403): toda la tanda debe abortar. */
function isAuthError(e: unknown): boolean {
  return e instanceof PulseAuthError && (e.status === 401 || e.status === 403);
}

/**
 * Ejecuta el push de una entidad de forma aislada: un fallo de red/servidor
 * (no-auth) se registra en `summary.errores` y permite continuar con el resto.
 * Un 401/403 se propaga para abortar (la sesión es inválida o expiró).
 */
async function pushEntidad(
  entidad: PulseSyncEntidad,
  summary: PulseSyncSummary,
  fn: () => Promise<void>
): Promise<void> {
  try {
    await fn();
  } catch (e) {
    if (isAuthError(e)) throw e;
    summary.errores.push({
      entidad,
      mensaje: e instanceof Error ? e.message : String(e),
    });
    if (__DEV__) console.warn(`[PulseSync] entidad ${entidad} falló (continúa el resto):`, e);
  }
}

type SyncResultItem = {
  local_id: number;
  remote_id: string;
  status: string;
};

type SyncBatchResponseBody = {
  results: SyncResultItem[];
};

function syncUrl(path: string): string {
  const base = getPulseApiBase();
  if (!base) {
    throw new PulseAuthError('Configura EXPO_PUBLIC_PULSE_API_URL en .env', 0);
  }
  return `${base}/v1/sync${path}`;
}

function sqliteDateToIso(s: string): string {
  if (!s?.trim()) return new Date().toISOString();
  const normalized = s.includes('T') ? s : s.replace(' ', 'T');
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

async function parseJsonBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function messageFromSyncErrorBody(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>;
    if (typeof o.error === 'string' && o.error.trim()) return o.error;
    if (typeof o.detail === 'string' && o.detail.trim()) return o.detail;
    if (typeof o.title === 'string' && o.title.trim()) return o.title;
    if (typeof o.message === 'string' && o.message.trim()) return o.message;
  }
  return fallback;
}

function isSyncBatchBody(body: unknown): body is SyncBatchResponseBody {
  if (!body || typeof body !== 'object') return false;
  const r = (body as { results?: unknown }).results;
  return Array.isArray(r);
}

/** Solo dev + `EXPO_PUBLIC_PULSE_DEBUG_SHOW_TOKEN=1` en .env (reinicia Metro). No uses en producción. */
function pulseDebugShowToken(): boolean {
  if (!__DEV__) return false;
  const v = process.env.EXPO_PUBLIC_PULSE_DEBUG_SHOW_TOKEN?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

async function postSync(
  context: string,
  path: string,
  accessToken: string,
  jsonBody: unknown
): Promise<SyncBatchResponseBody> {
  const url = syncUrl(path);
  const payload = JSON.stringify(jsonBody);
  if (__DEV__) {
    console.log(`[PulseSync] ${context}`, url);
    console.log(
      `[PulseSync] cuerpo (${context}, ${payload.length} bytes):\n`,
      JSON.stringify(jsonBody, null, 2)
    );
    const tok = accessToken?.trim() ?? '';
    const normalized = tok ? normalizePulseAccessToken(tok) : '';
    if (pulseDebugShowToken() && normalized) {
      console.warn(
        '[PulseSync] JWT completo (EXPO_PUBLIC_PULSE_DEBUG_SHOW_TOKEN): copia solo en entorno seguro; quita la variable después.'
      );
      console.log('[PulseSync] Bearer', normalized);
    } else {
      console.log(
        `[PulseSync] Authorization: Bearer <oculto> (${tok.length} caracteres). Para ver el JWT: EXPO_PUBLIC_PULSE_DEBUG_SHOW_TOKEN=1 en .env y reinicia Metro.`
      );
    }
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        ...pulseAuthorizedHeaders(accessToken),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: payload,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new PulseAuthError(`Sin conexión o red: ${msg}`, 0);
  }

  const body = await parseJsonBody(res);
  if (res.ok && isSyncBatchBody(body)) {
    return body;
  }

  let msg = messageFromSyncErrorBody(body, res.statusText || 'Error de sincronización');
  if (res.status === 401) {
    msg += ' Si la sesión parece correcta, cierra sesión en la app y vuelve a iniciar; si sigue igual, el servidor debe validar el mismo JWT en /v1/auth y /v1/sync.';
  }
  if (__DEV__) {
    console.warn(`[PulseSync] Error ${context}`, { status: res.status, body });
  }
  throw new PulseAuthError(msg, res.status);
}

async function applyProductoResults(results: SyncResultItem[]): Promise<void> {
  for (const r of results) {
    if (r.remote_id && ['created', 'updated', 'duplicate'].includes(r.status)) {
      await marcarProductoSincronizado(r.local_id, r.remote_id);
    }
  }
}

async function applyClienteResults(results: SyncResultItem[]): Promise<void> {
  for (const r of results) {
    if (r.remote_id && ['created', 'updated', 'duplicate'].includes(r.status)) {
      await marcarClienteSincronizado(r.local_id, r.remote_id);
    }
  }
}

async function applyVentaResults(results: SyncResultItem[]): Promise<void> {
  for (const r of results) {
    if (r.remote_id && ['created', 'duplicate'].includes(r.status)) {
      await marcarVentaSincronizada(r.local_id, r.remote_id);
      await marcarLineasVentaSincronizadas(r.local_id);
    }
  }
}

async function applyCobroResults(results: SyncResultItem[]): Promise<void> {
  for (const r of results) {
    if (r.remote_id && ['created', 'duplicate'].includes(r.status)) {
      await marcarCobroSincronizado(r.local_id, r.remote_id);
    }
  }
}

/**
 * Envía pendientes locales a Pulse en orden: productos → clientes → ventas → cobros.
 * Requiere JWT (sesión Pulse). El API usa JSON snake_case y enums como string (`Efectivo`, `fiado`, …).
 */
export async function sincronizarPendientesConPulse(accessToken: string): Promise<PulseSyncSummary> {
  const summary: PulseSyncSummary = {
    productos: 0,
    clientes: 0,
    ventas: 0,
    cobros: 0,
    cobrosOmitidosSinClienteRemoto: 0,
    errores: [],
  };

  await pushEntidad('productos', summary, async () => {
    const prods = await getProductosParaPushPulse();
    if (prods.length === 0) return;
    const body = {
      items: prods.map((p) => {
        const clientUpdatedAt = sqliteDateToIso(p.updated_at);
        return {
          local_id: p.id,
          mutation_id: mutationId('producto', p.id, clientUpdatedAt),
          nombre: p.nombre,
          precio_venta: p.precio_venta,
          precio_costo: p.precio_costo,
          precio_minimo: p.precio_minimo,
          stock: p.stock,
          client_updated_at: clientUpdatedAt,
        };
      }),
    };
    const batch = await postSync('POST productos', '/productos', accessToken, body);
    await applyProductoResults(batch.results);
    summary.productos = body.items.length;
  });

  await pushEntidad('clientes', summary, async () => {
    const clis = await getClientesParaPushPulse();
    if (clis.length === 0) return;
    const body = {
      items: clis.map((c) => {
        const clientUpdatedAt = sqliteDateToIso(c.updated_at);
        return {
          local_id: c.id,
          mutation_id: mutationId('cliente', c.id, clientUpdatedAt),
          nombre: c.nombre,
          deuda_inicial: c.deuda_inicial,
          saldo_a_favor: c.saldo_a_favor,
          client_updated_at: clientUpdatedAt,
        };
      }),
    };
    const batch = await postSync('POST clientes', '/clientes', accessToken, body);
    await applyClienteResults(batch.results);
    summary.clientes = body.items.length;
  });

  await pushEntidad('ventas', summary, async () => {
    const ventas = await getVentasConDetalleParaPushPulse();
    if (ventas.length === 0) return;
    const items = ventas.map((v) => {
      const estado = (v.estado ?? 'cobrado') as 'cobrado' | 'fiado';
      const base: Record<string, unknown> = {
        local_id: v.id,
        mutation_id: mutationId('venta', v.id),
        fecha: sqliteDateToIso(v.fecha),
        total: v.total,
        metodo_pago: v.metodo_pago,
        estado,
        line_items: v.lineas.map((ln) => {
          const linea: Record<string, unknown> = {
            descripcion: ln.descripcion,
            cantidad: ln.cantidad,
            precio_unitario: ln.precio_unitario,
            subtotal: ln.subtotal,
          };
          if (ln.producto_local_id != null) linea.producto_local_id = ln.producto_local_id;
          if (ln.producto_remote_id) linea.producto_remote_id = ln.producto_remote_id;
          return linea;
        }),
      };
      if (v.cliente_id != null && v.cliente_id > 0) {
        base.cliente_local_id = v.cliente_id;
      }
      return base;
    });
    const batch = await postSync('POST ventas', '/ventas', accessToken, { items });
    await applyVentaResults(batch.results);
    summary.ventas = items.length;
  });

  await pushEntidad('cobros', summary, async () => {
    const cobrosRaw = await getCobrosPendientesSync();
    const cobrosItems: {
      local_id: number;
      mutation_id: string;
      cliente_id: string;
      monto: number;
      fecha: string;
    }[] = [];
    for (const c of cobrosRaw) {
      const rid = await getClienteRemoteId(c.cliente_id);
      if (!rid) {
        // Sin remote_id del cliente aún: el cobro NO se marca sincronizado,
        // reintenta en la próxima tanda una vez que el cliente tenga remote_id.
        summary.cobrosOmitidosSinClienteRemoto += 1;
        continue;
      }
      cobrosItems.push({
        local_id: c.id,
        mutation_id: mutationId('cobro', c.id),
        cliente_id: rid,
        monto: c.monto,
        fecha: sqliteDateToIso(c.fecha),
      });
    }
    if (cobrosItems.length === 0) return;
    const batch = await postSync('POST cobros', '/cobros', accessToken, { items: cobrosItems });
    await applyCobroResults(batch.results);
    summary.cobros = cobrosItems.length;
  });

  // Enlazamos la cuenta solo si la sesión fue válida (llegamos aquí sin 401/403).
  await setPulseAccountLinked();
  return summary;
}
