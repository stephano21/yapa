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

