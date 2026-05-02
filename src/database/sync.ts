import type { SQLiteDatabase } from 'expo-sqlite';
import { getDatabase, type Producto, type Cliente } from './db';

export interface VentaPendiente {
  id: number;
  fecha: string;
  total: number;
  metodo_pago: string;
  estado: string | null;
  cliente_id: number | null;
}

export interface CobroPendiente {
  id: number;
  cliente_id: number;
  monto: number;
  fecha: string;
}

async function db(): Promise<SQLiteDatabase> {
  return getDatabase();
}

// ——— Productos ———

export async function getProductosPendientesSync(): Promise<Producto[]> {
  const database = await db();
  try {
    return await database.getAllAsync<Producto>(
      'SELECT id, nombre, precio_venta, precio_costo, precio_minimo, stock FROM productos WHERE dirty = 1'
    );
  } catch (_) {
    return database.getAllAsync<Producto>(
      'SELECT id, nombre, precio_venta, precio_costo, precio_minimo, stock FROM productos'
    );
  }
}

export async function marcarProductoSincronizado(
  id: number,
  remoteId: string
): Promise<void> {
  const database = await db();
  await database.runAsync(
    'UPDATE productos SET remote_id = ?, dirty = 0, updated_at = datetime("now") WHERE id = ?',
    [remoteId, id]
  );
}

// ——— Clientes ———

export async function getClientesPendientesSync(): Promise<Cliente[]> {
  const database = await db();
  try {
    return await database.getAllAsync<Cliente>(
      'SELECT id, nombre FROM clientes WHERE dirty = 1'
    );
  } catch (_) {
    return database.getAllAsync<Cliente>('SELECT id, nombre FROM clientes');
  }
}

export async function marcarClienteSincronizado(
  id: number,
  remoteId: string
): Promise<void> {
  const database = await db();
  await database.runAsync(
    'UPDATE clientes SET remote_id = ?, dirty = 0, updated_at = datetime("now") WHERE id = ?',
    [remoteId, id]
  );
}

// ——— Ventas y cobros ———

export async function getVentasPendientesSync(): Promise<VentaPendiente[]> {
  const database = await db();
  try {
    return await database.getAllAsync<VentaPendiente>(
      'SELECT id, fecha, total, metodo_pago, estado, cliente_id FROM ventas WHERE dirty = 1'
    );
  } catch (_) {
    return database.getAllAsync<VentaPendiente>(
      'SELECT id, fecha, total, metodo_pago, estado, cliente_id FROM ventas'
    );
  }
}

export async function marcarVentaSincronizada(
  id: number,
  remoteId: string
): Promise<void> {
  const database = await db();
  await database.runAsync(
    'UPDATE ventas SET remote_id = ?, dirty = 0, synced_at = datetime("now") WHERE id = ?',
    [remoteId, id]
  );
}

export async function getCobrosPendientesSync(): Promise<CobroPendiente[]> {
  const database = await db();
  try {
    return await database.getAllAsync<CobroPendiente>(
      'SELECT id, cliente_id, monto, fecha FROM cobros WHERE dirty = 1'
    );
  } catch (_) {
    return database.getAllAsync<CobroPendiente>(
      'SELECT id, cliente_id, monto, fecha FROM cobros'
    );
  }
}

export async function marcarCobroSincronizado(
  id: number,
  remoteId: string
): Promise<void> {
  const database = await db();
  await database.runAsync(
    'UPDATE cobros SET remote_id = ?, dirty = 0, synced_at = datetime("now") WHERE id = ?',
    [remoteId, id]
  );
}

/** Resumen de registros pendientes de sincronizar (para mostrar en UI). */
export interface ResumenPendientesSync {
  productos: number;
  clientes: number;
  ventas: number;
  cobros: number;
}

/** Producto con `updated_at` para `client_updated_at` en Pulse. */
export interface ProductoParaPushPulse {
  id: number;
  nombre: string;
  precio_venta: number;
  precio_costo: number;
  precio_minimo: number | null;
  stock: number;
  updated_at: string;
}

export async function getProductosParaPushPulse(): Promise<ProductoParaPushPulse[]> {
  const database = await db();
  try {
    return await database.getAllAsync<ProductoParaPushPulse>(
      `SELECT id, nombre, precio_venta, precio_costo, precio_minimo, stock,
              COALESCE(updated_at, datetime('now')) AS updated_at
       FROM productos WHERE dirty = 1 ORDER BY id`
    );
  } catch {
    return [];
  }
}

/** Clientes a enviar: dirty o sin `remote_id` pero referenciados por cobros/ventas fiado pendientes. */
export interface ClienteParaPushPulse {
  id: number;
  nombre: string;
  deuda_inicial: number;
  saldo_a_favor: number;
  updated_at: string;
}

export async function getClientesParaPushPulse(): Promise<ClienteParaPushPulse[]> {
  const database = await db();
  try {
    return await database.getAllAsync<ClienteParaPushPulse>(
      `SELECT id, nombre,
              COALESCE(deuda_inicial, 0) AS deuda_inicial,
              COALESCE(saldo_a_favor, 0) AS saldo_a_favor,
              COALESCE(updated_at, datetime('now')) AS updated_at
       FROM clientes
       WHERE dirty = 1
          OR (
            (remote_id IS NULL OR TRIM(remote_id) = '')
            AND (
              EXISTS (SELECT 1 FROM cobros b WHERE b.cliente_id = clientes.id AND b.dirty = 1)
              OR EXISTS (
                SELECT 1 FROM ventas v
                WHERE v.cliente_id = clientes.id
                  AND v.dirty = 1
                  AND COALESCE(v.estado, 'cobrado') = 'fiado'
              )
            )
          )
       ORDER BY id`
    );
  } catch {
    return [];
  }
}

export interface VentaDetalleLineaPush {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

export interface VentaConDetalleParaPush {
  id: number;
  fecha: string;
  total: number;
  metodo_pago: string;
  estado: string | null;
  cliente_id: number | null;
  lineas: VentaDetalleLineaPush[];
}

export async function getVentasConDetalleParaPushPulse(): Promise<VentaConDetalleParaPush[]> {
  const database = await db();
  let ventas: VentaPendiente[];
  try {
    ventas = await database.getAllAsync<VentaPendiente>(
      'SELECT id, fecha, total, metodo_pago, estado, cliente_id FROM ventas WHERE dirty = 1 ORDER BY id'
    );
  } catch {
    return [];
  }
  const out: VentaConDetalleParaPush[] = [];
  for (const v of ventas) {
    const lineas = await database.getAllAsync<VentaDetalleLineaPush>(
      'SELECT descripcion, cantidad, precio_unitario, subtotal FROM venta_detalle WHERE venta_id = ? ORDER BY id',
      [v.id]
    );
    out.push({
      id: v.id,
      fecha: v.fecha,
      total: v.total,
      metodo_pago: v.metodo_pago,
      estado: v.estado,
      cliente_id: v.cliente_id,
      lineas,
    });
  }
  return out;
}

export async function getClienteRemoteId(clienteSqliteId: number): Promise<string | null> {
  const database = await db();
  const row = await database.getFirstAsync<{ remote_id: string | null }>(
    'SELECT remote_id FROM clientes WHERE id = ?',
    [clienteSqliteId]
  );
  const r = row?.remote_id?.trim();
  return r && r.length > 0 ? r : null;
}

/** Tras sincronizar la cabecera de venta, limpia dirty del detalle local. */
export async function marcarLineasVentaSincronizadas(ventaId: number): Promise<void> {
  const database = await db();
  await database.runAsync(
    'UPDATE venta_detalle SET dirty = 0, synced_at = datetime("now") WHERE venta_id = ?',
    [ventaId]
  );
}

export async function getResumenPendientesSync(): Promise<ResumenPendientesSync> {
  const database = await db();
  const fallback = async (
    countQuery: string,
    totalQuery: string
  ): Promise<number> => {
    try {
      const row = await database.getFirstAsync<{ count: number }>(countQuery);
      return row?.count ?? 0;
    } catch (_) {
      try {
        const row = await database.getFirstAsync<{ count: number }>(totalQuery);
        return row?.count ?? 0;
      } catch (_) {
        return 0;
      }
    }
  };
  const [productos, clientes, ventas, cobros] = await Promise.all([
    fallback(
      'SELECT COUNT(*) as count FROM productos WHERE dirty = 1',
      'SELECT COUNT(*) as count FROM productos'
    ),
    fallback(
      'SELECT COUNT(*) as count FROM clientes WHERE dirty = 1',
      'SELECT COUNT(*) as count FROM clientes'
    ),
    fallback(
      'SELECT COUNT(*) as count FROM ventas WHERE dirty = 1',
      'SELECT COUNT(*) as count FROM ventas'
    ),
    fallback(
      'SELECT COUNT(*) as count FROM cobros WHERE dirty = 1',
      'SELECT COUNT(*) as count FROM cobros'
    ),
  ]);
  return { productos, clientes, ventas, cobros };
}

