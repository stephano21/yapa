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

export type PulseSyncSummary = {
  productos: number;
  clientes: number;
  ventas: number;
  cobros: number;
  cobrosOmitidosSinClienteRemoto: number;
};

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
  };

  const prods = await getProductosParaPushPulse();
  if (prods.length > 0) {
    const body = {
      items: prods.map((p) => ({
        local_id: p.id,
        nombre: p.nombre,
        precio_venta: p.precio_venta,
        precio_costo: p.precio_costo,
        precio_minimo: p.precio_minimo,
        stock: p.stock,
        client_updated_at: sqliteDateToIso(p.updated_at),
      })),
    };
    const batch = await postSync('POST productos', '/productos', accessToken, body);
    await applyProductoResults(batch.results);
    summary.productos = prods.length;
  }

  const clis = await getClientesParaPushPulse();
  if (clis.length > 0) {
    const body = {
      items: clis.map((c) => ({
        local_id: c.id,
        nombre: c.nombre,
        deuda_inicial: c.deuda_inicial,
        saldo_a_favor: c.saldo_a_favor,
        client_updated_at: sqliteDateToIso(c.updated_at),
      })),
    };
    const batch = await postSync('POST clientes', '/clientes', accessToken, body);
    await applyClienteResults(batch.results);
    summary.clientes = clis.length;
  }

  const ventas = await getVentasConDetalleParaPushPulse();
  if (ventas.length > 0) {
    const items = ventas.map((v) => {
      const estado = (v.estado ?? 'cobrado') as 'cobrado' | 'fiado';
      const base: Record<string, unknown> = {
        local_id: v.id,
        fecha: sqliteDateToIso(v.fecha),
        total: v.total,
        metodo_pago: v.metodo_pago,
        estado,
        line_items: v.lineas.map((ln) => ({
          descripcion: ln.descripcion,
          cantidad: ln.cantidad,
          precio_unitario: ln.precio_unitario,
          subtotal: ln.subtotal,
        })),
      };
      if (v.cliente_id != null && v.cliente_id > 0) {
        base.cliente_local_id = v.cliente_id;
      }
      return base;
    });
    const batch = await postSync('POST ventas', '/ventas', accessToken, { items });
    await applyVentaResults(batch.results);
    summary.ventas = ventas.length;
  }

  const cobrosRaw = await getCobrosPendientesSync();
  const cobrosItems: { local_id: number; cliente_id: string; monto: number; fecha: string }[] = [];
  for (const c of cobrosRaw) {
    const rid = await getClienteRemoteId(c.cliente_id);
    if (!rid) {
      summary.cobrosOmitidosSinClienteRemoto += 1;
      continue;
    }
    cobrosItems.push({
      local_id: c.id,
      cliente_id: rid,
      monto: c.monto,
      fecha: sqliteDateToIso(c.fecha),
    });
  }

  if (cobrosItems.length > 0) {
    const body = {
      items: cobrosItems.map((c) => ({
        local_id: c.local_id,
        cliente_id: c.cliente_id,
        monto: c.monto,
        fecha: c.fecha,
      })),
    };
    const batch = await postSync('POST cobros', '/cobros', accessToken, body);
    await applyCobroResults(batch.results);
    summary.cobros = cobrosItems.length;
  }

  await setPulseAccountLinked();
  return summary;
}
