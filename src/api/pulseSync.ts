import * as Crypto from 'expo-crypto';
import { getPulseApiBase } from '../config/pulse';
import {
  PulseAuthError,
  normalizePulseAccessToken,
  pulseAuthorizedHeaders,
} from './pulseAuth';
import { ensureFreshAccessToken } from './pulseSession';
import { parseJsonBody } from './httpUtils';
import { productosRepo } from '../database/repositories/productosRepo';
import { clientesRepo } from '../database/repositories/clientesRepo';
import { unidadesRepo } from '../database/repositories/unidadesRepo';
import { ventasRepo } from '../database/repositories/ventasRepo';
import { cobrosRepo } from '../database/repositories/cobrosRepo';
import { setPulseAccountLinked } from '../storage/pulseLinkStorage';

export type PulseSyncSummary = {
  productos: number;
  clientes: number;
  unidades: number;
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

function sqliteDateToIso(s: string | null | undefined): string {
  if (!s?.trim()) return new Date().toISOString();
  const normalized = s.includes('T') ? s : s.replace(' ', 'T');
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
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
  jsonBody: unknown,
  idempotencyKey: string,
  isRetry = false
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
        'Idempotency-Key': idempotencyKey,
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

  if (res.status === 401 && !isRetry) {
    const fresh = await ensureFreshAccessToken();
    if (fresh && fresh !== accessToken) {
      return postSync(context, path, fresh, jsonBody, idempotencyKey, true);
    }
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
    if (r.status === 'deleted') {
      await productosRepo.purgarLocal(r.local_id);
      continue;
    }
    if (r.remote_id && ['created', 'updated', 'duplicate'].includes(r.status)) {
      await productosRepo.marcarSynced(r.local_id, r.remote_id);
    }
  }
}

async function applyClienteResults(results: SyncResultItem[]): Promise<void> {
  for (const r of results) {
    if (r.status === 'deleted') {
      await clientesRepo.purgarLocal(r.local_id);
      continue;
    }
    if (r.remote_id && ['created', 'updated', 'duplicate'].includes(r.status)) {
      await clientesRepo.marcarSynced(r.local_id, r.remote_id);
    }
  }
}

async function applyUnidadResults(results: SyncResultItem[]): Promise<void> {
  for (const r of results) {
    if (r.status === 'deleted') {
      await unidadesRepo.purgarLocal(r.local_id);
      continue;
    }
    if (r.remote_id && ['created', 'updated', 'duplicate'].includes(r.status)) {
      await unidadesRepo.marcarSynced(r.local_id, r.remote_id);
    }
  }
}

async function applyVentaResults(results: SyncResultItem[]): Promise<void> {
  for (const r of results) {
    if (r.remote_id && ['created', 'duplicate'].includes(r.status)) {
      await ventasRepo.marcarSynced(r.local_id, r.remote_id);
      await ventasRepo.marcarDetalleSynced(r.local_id);
    }
  }
}

async function applyCobroResults(results: SyncResultItem[]): Promise<void> {
  for (const r of results) {
    if (r.remote_id && ['created', 'duplicate'].includes(r.status)) {
      await cobrosRepo.marcarSynced(r.local_id, r.remote_id);
    }
  }
}

/**
 * Envía pendientes locales a Pulse en orden: productos → clientes → unidades → ventas → cobros.
 * Requiere JWT (sesión Pulse). El API usa JSON snake_case y enums como string (`Efectivo`, `fiado`, …).
 * Cada lote lleva una `Idempotency-Key` propia: un reintento de red del mismo lote nunca se procesa dos veces.
 */
export async function sincronizarPendientesConPulse(accessToken: string): Promise<PulseSyncSummary> {
  const summary: PulseSyncSummary = {
    productos: 0,
    clientes: 0,
    unidades: 0,
    ventas: 0,
    cobros: 0,
    cobrosOmitidosSinClienteRemoto: 0,
  };

  const prods = await productosRepo.getDirty();
  if (prods.length > 0) {
    const body = {
      items: prods.map((p) => ({
        local_id: p.id,
        nombre: p.nombre,
        precio_venta: p.precioVenta,
        precio_costo: p.precioCosto,
        precio_minimo: p.precioMinimo,
        stock: p.stock,
        client_updated_at: sqliteDateToIso(p.updatedAt),
        deleted: p.pendingDelete === 1,
      })),
    };
    const batch = await postSync('POST productos', '/productos', accessToken, body, Crypto.randomUUID());
    await applyProductoResults(batch.results);
    summary.productos = prods.length;
  }

  const clis = await clientesRepo.getDirty();
  if (clis.length > 0) {
    const body = {
      items: clis.map((c) => ({
        local_id: c.id,
        nombre: c.nombre,
        deuda_inicial: c.deudaInicial ?? 0,
        saldo_a_favor: c.saldoAFavor ?? 0,
        client_updated_at: sqliteDateToIso(c.updatedAt),
        deleted: c.pendingDelete === 1,
      })),
    };
    const batch = await postSync('POST clientes', '/clientes', accessToken, body, Crypto.randomUUID());
    await applyClienteResults(batch.results);
    summary.clientes = clis.length;
  }

  const unis = await unidadesRepo.getDirty();
  if (unis.length > 0) {
    const body = {
      items: unis.map((u) => ({
        local_id: u.id,
        nombre: u.nombre,
        unidades: u.unidades,
        client_updated_at: sqliteDateToIso(u.updatedAt),
        deleted: u.pendingDelete === 1,
      })),
    };
    const batch = await postSync('POST unidades', '/unidades', accessToken, body, Crypto.randomUUID());
    await applyUnidadResults(batch.results);
    summary.unidades = unis.length;
  }

  const ventasPendientes = await ventasRepo.getPendientesParaPush();
  if (ventasPendientes.length > 0) {
    const items = ventasPendientes.map((v) => {
      const estado = (v.estado ?? 'cobrado') as 'cobrado' | 'fiado';
      const base: Record<string, unknown> = {
        local_id: v.id,
        fecha: sqliteDateToIso(v.fecha),
        total: v.total,
        metodo_pago: v.metodoPago,
        estado,
        line_items: v.lineas.map((ln) => ({
          descripcion: ln.descripcion,
          cantidad: ln.cantidad,
          precio_unitario: ln.precioUnitario,
          subtotal: ln.subtotal,
          ...(ln.productoLocalId != null ? { producto_local_id: ln.productoLocalId } : {}),
          ...(ln.productoRemoteId ? { producto_remote_id: ln.productoRemoteId } : {}),
        })),
      };
      if (v.clienteId != null && v.clienteId > 0) {
        base.cliente_local_id = v.clienteId;
      }
      return base;
    });
    const batch = await postSync('POST ventas', '/ventas', accessToken, { items }, Crypto.randomUUID());
    await applyVentaResults(batch.results);
    summary.ventas = ventasPendientes.length;
  }

  const cobrosRaw = await cobrosRepo.getDirty();
  const cobrosItems: { local_id: number; cliente_id: string; monto: number; fecha: string }[] = [];
  for (const c of cobrosRaw) {
    const rid = await clientesRepo.getRemoteId(c.clienteId);
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
    const body = { items: cobrosItems };
    const batch = await postSync('POST cobros', '/cobros', accessToken, body, Crypto.randomUUID());
    await applyCobroResults(batch.results);
    summary.cobros = cobrosItems.length;
  }

  await setPulseAccountLinked();
  return summary;
}
