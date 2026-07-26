import { sql, eq } from 'drizzle-orm';
import { getPulseApiBase } from '../config/pulse';
import { PulseAuthError, pulseAuthorizedHeaders } from './pulseAuth';
import { ensureFreshAccessToken } from './pulseSession';
import { parseJsonBody } from './httpUtils';
import { db } from '../database/drizzle/client';
import { productos, clientes, ventas, ventaDetalle, cobros, unidadesMedida } from '../database/drizzle/schema';
import { syncStateRepo } from '../database/repositories/syncStateRepo';

export type PullSummary = {
  productos: number;
  clientes: number;
  unidades: number;
  ventas: number;
  cobros: number;
};

type PagedResponse<T> = { items: T[]; next_cursor: string | null };

type PulledProducto = {
  id: string;
  local_id: number | null;
  nombre: string;
  precio_venta: number;
  precio_costo: number;
  precio_minimo: number | null;
  stock: number;
  updated_at: string;
};

type PulledCliente = {
  id: string;
  local_id: number | null;
  nombre: string;
  deuda_inicial: number;
  saldo_a_favor: number;
  updated_at: string;
};

type PulledUnidad = {
  id: string;
  local_id: number | null;
  nombre: string;
  unidades: number;
  updated_at: string;
};

type PulledVentaLinea = {
  id: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  producto_id: string | null;
};

type PulledVenta = {
  id: string;
  local_id: number | null;
  fecha: string;
  total: number;
  metodo_pago: string;
  estado: string;
  cliente_id: string | null;
  created_at: string;
  lineas: PulledVentaLinea[];
};

type PulledCobro = {
  id: string;
  local_id: number | null;
  cliente_id: string;
  monto: number;
  fecha: string;
  created_at: string;
};

function pullUrl(resource: string, params: Record<string, string>): string {
  const base = getPulseApiBase();
  if (!base) {
    throw new PulseAuthError('Configura EXPO_PUBLIC_PULSE_API_URL en .env', 0);
  }
  const qs = new URLSearchParams(params).toString();
  return `${base}/v1/${resource}${qs ? `?${qs}` : ''}`;
}

async function getPage<T>(
  resource: string,
  accessToken: string,
  sinceParamName: 'updated_since' | 'created_since',
  since: string | null,
  cursor: string | null,
  isRetry = false
): Promise<{ page: PagedResponse<T>; tokenUsed: string }> {
  const params: Record<string, string> = { limit: '200' };
  if (cursor) {
    params.cursor = cursor;
  } else if (since) {
    params[sinceParamName] = since;
  }

  const url = pullUrl(resource, params);
  if (__DEV__) console.log(`[PulseCatalogPull] GET ${resource}`, url);

  let res: Response;
  try {
    res = await fetch(url, { method: 'GET', headers: pulseAuthorizedHeaders(accessToken) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new PulseAuthError(`Sin conexión o red: ${msg}`, 0);
  }

  if (res.status === 401 && !isRetry) {
    const fresh = await ensureFreshAccessToken();
    if (fresh && fresh !== accessToken) {
      return getPage<T>(resource, fresh, sinceParamName, since, cursor, true);
    }
  }

  const body = await parseJsonBody(res);
  if (!res.ok || !body || typeof body !== 'object' || !Array.isArray((body as { items?: unknown }).items)) {
    const msg =
      (body && typeof body === 'object' && typeof (body as { detail?: string }).detail === 'string'
        ? (body as { detail: string }).detail
        : res.statusText) || 'Error al descargar catálogo';
    throw new PulseAuthError(msg, res.status);
  }
  return { page: body as PagedResponse<T>, tokenUsed: accessToken };
}

/** Recorre todas las páginas de un recurso, aplicando `upsert` a cada item y persistiendo el punto de retomo. */
async function pullResource<T>(
  resource: string,
  accessToken: string,
  sinceParamName: 'updated_since' | 'created_since',
  extractTimestamp: (item: T) => string,
  upsert: (item: T) => Promise<void>
): Promise<number> {
  const state = await syncStateRepo.get(resource);
  let cursor = state.lastCursor;
  const since = cursor ? null : state.lastPulledAt;
  let maxTimestamp: string | null = state.lastPulledAt;
  let count = 0;
  let token = accessToken;

  for (;;) {
    const { page, tokenUsed } = await getPage<T>(resource, token, sinceParamName, since, cursor);
    token = tokenUsed;
    for (const item of page.items) {
      await upsert(item);
      count += 1;
      const ts = extractTimestamp(item);
      if (!maxTimestamp || ts > maxTimestamp) maxTimestamp = ts;
    }

    if (page.next_cursor) {
      cursor = page.next_cursor;
      await syncStateRepo.setCursor(resource, cursor);
      continue;
    }

    if (maxTimestamp) await syncStateRepo.setLastPulledAt(resource, maxTimestamp);
    else await syncStateRepo.setCursor(resource, null);
    break;
  }

  return count;
}

async function findProductoLocalIdByRemote(remoteId: string): Promise<number | null> {
  const row = await db
    .select({ id: productos.id })
    .from(productos)
    .where(eq(productos.remoteId, remoteId))
    .then((r) => r[0] ?? null);
  return row?.id ?? null;
}

async function findClienteLocalIdByRemote(remoteId: string): Promise<number | null> {
  const row = await db
    .select({ id: clientes.id })
    .from(clientes)
    .where(eq(clientes.remoteId, remoteId))
    .then((r) => r[0] ?? null);
  return row?.id ?? null;
}

async function upsertProducto(item: PulledProducto): Promise<void> {
  const existing = await db.select().from(productos).where(eq(productos.remoteId, item.id)).then((r) => r[0] ?? null);
  if (existing) {
    if (existing.dirty === 1 || existing.pendingDelete === 1) return; // local-dirty-wins: se resuelve en el próximo push
    await db
      .update(productos)
      .set({
        nombre: item.nombre,
        precioVenta: item.precio_venta,
        precioCosto: item.precio_costo,
        precioMinimo: item.precio_minimo,
        stock: item.stock,
        updatedAt: item.updated_at,
        dirty: 0,
        pendingDelete: 0,
      })
      .where(eq(productos.id, existing.id));
    return;
  }
  await db.insert(productos).values({
    nombre: item.nombre,
    precioVenta: item.precio_venta,
    precioCosto: item.precio_costo,
    precioMinimo: item.precio_minimo,
    stock: item.stock,
    remoteId: item.id,
    updatedAt: item.updated_at,
    dirty: 0,
    pendingDelete: 0,
  });
}

async function upsertCliente(item: PulledCliente): Promise<void> {
  const existing = await db.select().from(clientes).where(eq(clientes.remoteId, item.id)).then((r) => r[0] ?? null);
  if (existing) {
    if (existing.dirty === 1 || existing.pendingDelete === 1) return;
    await db
      .update(clientes)
      .set({
        nombre: item.nombre,
        deudaInicial: item.deuda_inicial,
        saldoAFavor: item.saldo_a_favor,
        updatedAt: item.updated_at,
        dirty: 0,
        pendingDelete: 0,
      })
      .where(eq(clientes.id, existing.id));
    return;
  }
  await db.insert(clientes).values({
    nombre: item.nombre,
    deudaInicial: item.deuda_inicial,
    saldoAFavor: item.saldo_a_favor,
    remoteId: item.id,
    updatedAt: item.updated_at,
    dirty: 0,
    pendingDelete: 0,
  });
}

async function upsertUnidad(item: PulledUnidad): Promise<void> {
  const existing = await db
    .select()
    .from(unidadesMedida)
    .where(eq(unidadesMedida.remoteId, item.id))
    .then((r) => r[0] ?? null);
  if (existing) {
    if (existing.dirty === 1 || existing.pendingDelete === 1) return;
    await db
      .update(unidadesMedida)
      .set({
        nombre: item.nombre,
        unidades: item.unidades,
        updatedAt: item.updated_at,
        dirty: 0,
        pendingDelete: 0,
      })
      .where(eq(unidadesMedida.id, existing.id));
    return;
  }
  await db.insert(unidadesMedida).values({
    nombre: item.nombre,
    unidades: item.unidades,
    remoteId: item.id,
    updatedAt: item.updated_at,
    dirty: 0,
    pendingDelete: 0,
  });
}

async function upsertVenta(item: PulledVenta): Promise<void> {
  const existing = await db.select().from(ventas).where(eq(ventas.remoteId, item.id)).then((r) => r[0] ?? null);
  if (existing) return; // una venta ya conocida nunca se re-edita desde un pull

  const clienteLocalId = item.cliente_id ? await findClienteLocalIdByRemote(item.cliente_id) : null;

  const [{ ventaId }] = await db
    .insert(ventas)
    .values({
      fecha: item.fecha,
      total: item.total,
      metodoPago: item.metodo_pago,
      estado: item.estado,
      clienteId: clienteLocalId,
      remoteId: item.id,
      createdAt: item.created_at,
      syncedAt: sql`(datetime('now'))` as unknown as string,
      dirty: 0,
    })
    .returning({ ventaId: ventas.id });

  for (const ln of item.lineas) {
    const productoLocalId = ln.producto_id ? await findProductoLocalIdByRemote(ln.producto_id) : null;
    await db.insert(ventaDetalle).values({
      ventaId,
      productoId: productoLocalId,
      descripcion: ln.descripcion,
      cantidad: ln.cantidad,
      precioUnitario: ln.precio_unitario,
      subtotal: ln.subtotal,
      remoteId: ln.id,
      syncedAt: sql`(datetime('now'))` as unknown as string,
      dirty: 0,
    });
  }
}

async function upsertCobro(item: PulledCobro): Promise<void> {
  const existing = await db.select().from(cobros).where(eq(cobros.remoteId, item.id)).then((r) => r[0] ?? null);
  if (existing) return;

  const clienteLocalId = await findClienteLocalIdByRemote(item.cliente_id);
  if (clienteLocalId == null) return; // el cliente aún no llegó por su propio pull; se reintenta en el próximo ciclo

  await db.insert(cobros).values({
    clienteId: clienteLocalId,
    monto: item.monto,
    fecha: item.fecha,
    remoteId: item.id,
    createdAt: item.created_at,
    syncedAt: sql`(datetime('now'))` as unknown as string,
    dirty: 0,
  });
}

/**
 * Descarga de Pulse lo nuevo desde el último pull (productos → clientes → unidades → ventas → cobros)
 * y lo fusiona en la base local. Regla de conflicto: si una fila local está `dirty`/`pending_delete`,
 * el pull la deja intacta (se resuelve sola en el próximo push).
 */
export async function pullCatalogoDeSpulse(accessToken: string): Promise<PullSummary> {
  const productosCount = await pullResource<PulledProducto>(
    'productos',
    accessToken,
    'updated_since',
    (i) => i.updated_at,
    upsertProducto
  );
  const clientesCount = await pullResource<PulledCliente>(
    'clientes',
    accessToken,
    'updated_since',
    (i) => i.updated_at,
    upsertCliente
  );
  const unidadesCount = await pullResource<PulledUnidad>(
    'unidades',
    accessToken,
    'updated_since',
    (i) => i.updated_at,
    upsertUnidad
  );
  const ventasCount = await pullResource<PulledVenta>(
    'ventas',
    accessToken,
    'created_since',
    (i) => i.created_at,
    upsertVenta
  );
  const cobrosCount = await pullResource<PulledCobro>(
    'cobros',
    accessToken,
    'created_since',
    (i) => i.created_at,
    upsertCobro
  );

  return {
    productos: productosCount,
    clientes: clientesCount,
    unidades: unidadesCount,
    ventas: ventasCount,
    cobros: cobrosCount,
  };
}
