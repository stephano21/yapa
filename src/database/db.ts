import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

const DB_NAME = 'yapa_pos.db';

let dbInstance: SQLiteDatabase | null = null;

export type MetodoPago = 'Efectivo' | 'Transferencia';

export interface Producto {
  id: number;
  nombre: string;
  precio_venta: number;
  precio_costo: number;
  stock: number;
  /** Precio mínimo opcional para este producto (por unidad). Si es null/undefined, se usa la regla global. */
  precio_minimo?: number | null;
}

/** Margen mínimo global sobre el costo (10% por defecto). */
export const MARGEN_MINIMO_GLOBAL = 0.1;

/** Calcula el precio mínimo permitido para un producto respetando margen mínimo. */
export function calcularPrecioMinimo(producto: Producto): number {
  if (producto.precio_minimo != null) {
    return producto.precio_minimo;
  }
  const base = producto.precio_costo;
  const minimo = base * (1 + MARGEN_MINIMO_GLOBAL);
  // Si por algún motivo el costo fuera 0, caemos al precio_venta actual.
  if (!Number.isFinite(minimo) || minimo <= 0) {
    return producto.precio_venta;
  }
  return minimo;
}

export type EstadoVenta = 'cobrado' | 'fiado';

export interface Venta {
  id: number;
  fecha: string;
  total: number;
  metodo_pago: MetodoPago;
  estado?: EstadoVenta;
  cliente_id?: number | null;
}

export interface Cliente {
  id: number;
  nombre: string;
}

export interface UnidadMedida {
  id: number;
  nombre: string;
  /** Factor de conversión a unidades base. Ej: "Docena" -> 12 unidades base. */
  unidades: number;
}

/** Línea del comprobante (detalle de venta) */
export interface VentaDetalleItem {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

/** Datos completos para mostrar un comprobante de venta */
export interface ComprobanteVenta {
  id: number;
  fecha: string;
  total: number;
  metodo_pago: MetodoPago;
  items: VentaDetalleItem[];
}

async function initDb(): Promise<SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS productos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      precio_venta REAL NOT NULL,
      precio_costo REAL NOT NULL DEFAULT 0,
      precio_minimo REAL,
      stock INTEGER NOT NULL DEFAULT 0,
      remote_id TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      dirty INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS ventas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL,
      total REAL NOT NULL,
      metodo_pago TEXT NOT NULL,
      estado TEXT DEFAULT 'cobrado',
      cliente_id INTEGER,
      remote_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      synced_at TEXT,
      dirty INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS venta_detalle (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venta_id INTEGER NOT NULL,
      descripcion TEXT NOT NULL,
      cantidad REAL NOT NULL,
      precio_unitario REAL NOT NULL,
      subtotal REAL NOT NULL,
      remote_id TEXT,
      synced_at TEXT,
      dirty INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (venta_id) REFERENCES ventas(id)
    );

    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      deuda_inicial REAL DEFAULT 0,
      saldo_a_favor REAL DEFAULT 0,
      remote_id TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      dirty INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS cobros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL,
      monto REAL NOT NULL,
      fecha TEXT NOT NULL,
      remote_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      synced_at TEXT,
      dirty INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    );

    CREATE TABLE IF NOT EXISTS unidades_medida (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      unidades INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      dirty INTEGER NOT NULL DEFAULT 0
    );
  `);

  try {
    await db.execAsync("ALTER TABLE ventas ADD COLUMN estado TEXT DEFAULT 'cobrado'");
  } catch (_) {}
  try {
    await db.execAsync('ALTER TABLE ventas ADD COLUMN cliente_id INTEGER');
  } catch (_) {}
  try {
    await db.execAsync('ALTER TABLE clientes ADD COLUMN deuda_inicial REAL DEFAULT 0');
  } catch (_) {}
  try {
    await db.execAsync('ALTER TABLE clientes ADD COLUMN saldo_a_favor REAL DEFAULT 0');
  } catch (_) {}
  try {
    await db.execAsync('ALTER TABLE productos ADD COLUMN precio_minimo REAL');
  } catch (_) {}
  try {
    await db.execAsync('ALTER TABLE productos ADD COLUMN remote_id TEXT');
  } catch (_) {}
  try {
    await db.execAsync(
      "ALTER TABLE productos ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))"
    );
  } catch (_) {}
  try {
    await db.execAsync(
      'ALTER TABLE productos ADD COLUMN dirty INTEGER NOT NULL DEFAULT 0'
    );
  } catch (_) {}
  try {
    await db.execAsync('ALTER TABLE ventas ADD COLUMN remote_id TEXT');
  } catch (_) {}
  try {
    await db.execAsync(
      "ALTER TABLE ventas ADD COLUMN created_at TEXT NOT NULL DEFAULT (datetime('now'))"
    );
  } catch (_) {}
  try {
    await db.execAsync('ALTER TABLE ventas ADD COLUMN synced_at TEXT');
  } catch (_) {}
  try {
    await db.execAsync(
      'ALTER TABLE ventas ADD COLUMN dirty INTEGER NOT NULL DEFAULT 1'
    );
  } catch (_) {}
  try {
    await db.execAsync('ALTER TABLE venta_detalle ADD COLUMN remote_id TEXT');
  } catch (_) {}
  try {
    await db.execAsync('ALTER TABLE venta_detalle ADD COLUMN synced_at TEXT');
  } catch (_) {}
  try {
    await db.execAsync(
      'ALTER TABLE venta_detalle ADD COLUMN dirty INTEGER NOT NULL DEFAULT 1'
    );
  } catch (_) {}
  try {
    await db.execAsync('ALTER TABLE clientes ADD COLUMN remote_id TEXT');
  } catch (_) {}
  try {
    await db.execAsync(
      "ALTER TABLE clientes ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))"
    );
  } catch (_) {}
  try {
    await db.execAsync(
      'ALTER TABLE clientes ADD COLUMN dirty INTEGER NOT NULL DEFAULT 0'
    );
  } catch (_) {}
  try {
    await db.execAsync('ALTER TABLE cobros ADD COLUMN remote_id TEXT');
  } catch (_) {}
  try {
    await db.execAsync(
      "ALTER TABLE cobros ADD COLUMN created_at TEXT NOT NULL DEFAULT (datetime('now'))"
    );
  } catch (_) {}
  try {
    await db.execAsync('ALTER TABLE cobros ADD COLUMN synced_at TEXT');
  } catch (_) {}
  try {
    await db.execAsync(
      'ALTER TABLE cobros ADD COLUMN dirty INTEGER NOT NULL DEFAULT 1'
    );
  } catch (_) {}

  // Marcar como pendientes de sync los que no tienen remote_id (cuando exista la columna).
  // Si algo falla, marcamos todos los registros como pendientes para que se vean en la pantalla de sincronización.
  const marcarPendientes = async (tabla: string) => {
    try {
      await db.execAsync(`UPDATE ${tabla} SET dirty = 1 WHERE remote_id IS NULL`);
    } catch (_) {
      try {
        await db.execAsync(`UPDATE ${tabla} SET dirty = 1`);
      } catch (_) {}
    }
  };
  await marcarPendientes('productos');
  await marcarPendientes('clientes');
  await marcarPendientes('ventas');
  await marcarPendientes('cobros');

  // Seeds iniciales para que el catálogo exista desde el inicio.
  // - Unidad = 1
  // - Docena = 12
  try {
    const row = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM unidades_medida'
    );
    const count = row?.count ?? 0;
    if (count === 0) {
      await db.runAsync(
        `INSERT INTO unidades_medida (nombre, unidades, dirty, updated_at)
         VALUES (?, ?, 0, datetime('now'))`,
        ['Unidad', 1]
      );
      await db.runAsync(
        `INSERT INTO unidades_medida (nombre, unidades, dirty, updated_at)
         VALUES (?, ?, 0, datetime('now'))`,
        ['Docena', 12]
      );
    }
  } catch (_) {
    // Si falla el seed, igual la app puede funcionar sin catálogo.
  }

  return db;
}

export async function getDatabase(): Promise<SQLiteDatabase> {
  if (dbInstance) return dbInstance;
  dbInstance = await initDb();
  return dbInstance;
}

export async function getProductos(busqueda?: string): Promise<Producto[]> {
  const db = await getDatabase();
  if (busqueda?.trim()) {
    return db.getAllAsync<Producto>(
      'SELECT id, nombre, precio_venta, precio_costo, precio_minimo, stock FROM productos WHERE nombre LIKE ? ORDER BY nombre',
      [`%${busqueda.trim()}%`]
    );
  }
  return db.getAllAsync<Producto>(
    'SELECT id, nombre, precio_venta, precio_costo, precio_minimo, stock FROM productos ORDER BY nombre'
  );
}

export async function getProductoById(id: number): Promise<Producto | null> {
  const db = await getDatabase();
  return db.getFirstAsync<Producto>(
    'SELECT id, nombre, precio_venta, precio_costo, stock FROM productos WHERE id = ?',
    [id]
  );
}

export async function getUnidadesMedida(): Promise<UnidadMedida[]> {
  const db = await getDatabase();
  return db.getAllAsync<UnidadMedida>(
    'SELECT id, nombre, unidades FROM unidades_medida ORDER BY unidades ASC, nombre ASC'
  );
}

export async function crearUnidadMedida(nombre: string, unidades: number): Promise<number> {
  const db = await getDatabase();
  const n = nombre.trim();
  const u = Math.floor(unidades);
  if (!n) return Promise.reject(new Error('Nombre requerido'));
  if (!Number.isFinite(u) || u <= 0) {
    return Promise.reject(new Error('Unidades inválidas'));
  }
  const result = await db.runAsync(
    `INSERT INTO unidades_medida (nombre, unidades, dirty, updated_at)
     VALUES (?, ?, 0, datetime('now'))`,
    [n, u]
  );
  return result.lastInsertRowId;
}

export async function crearProducto(
  nombre: string,
  precio_venta: number,
  precio_costo: number,
  stock: number
): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    `INSERT INTO productos (nombre, precio_venta, precio_costo, stock, dirty, updated_at)
     VALUES (?, ?, ?, ?, 1, datetime('now'))`,
    [nombre, precio_venta, precio_costo, stock]
  );
  return result.lastInsertRowId;
}

export async function actualizarProducto(
  id: number,
  nombre: string,
  precio_venta: number,
  precio_costo: number,
  stock: number
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE productos SET nombre = ?, precio_venta = ?, precio_costo = ?, stock = ?,
      dirty = 1, updated_at = datetime('now') WHERE id = ?`,
    [nombre, precio_venta, precio_costo, stock, id]
  );
}

export async function eliminarProducto(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM productos WHERE id = ?', [id]);
}

export type ItemVentaInput = {
  nombre: string;
  cantidad: number;
  precio: number;
  /** Id del producto para descontar stock; omitir en ventas rápidas (monto manual). */
  producto_id?: number;
};

/** Registra una venta con su detalle (para comprobante). Si es fiado, pasar clienteId. Descuenta stock de productos. */
export async function registrarVentaConDetalle(
  total: number,
  metodo_pago: MetodoPago,
  items: ItemVentaInput[],
  opciones?: { esFiado?: boolean; clienteId?: number }
): Promise<ComprobanteVenta> {
  const db = await getDatabase();
  const fecha = new Date().toISOString();
  const estado = opciones?.esFiado ? 'fiado' : 'cobrado';
  const clienteId = opciones?.esFiado && opciones?.clienteId != null ? opciones.clienteId : null;

  const result = await db.runAsync(
    `INSERT INTO ventas (fecha, total, metodo_pago, estado, cliente_id) VALUES (?, ?, ?, ?, ?)`,
    [fecha, total, metodo_pago, estado, clienteId]
  );
  const ventaId = result.lastInsertRowId;

  for (const it of items) {
    const subtotal = it.precio * it.cantidad;
    await db.runAsync(
      `INSERT INTO venta_detalle (venta_id, descripcion, cantidad, precio_unitario, subtotal)
       VALUES (?, ?, ?, ?, ?)`,
      [ventaId, it.nombre, it.cantidad, it.precio, subtotal]
    );
    if (it.producto_id != null && it.producto_id > 0) {
      await db.runAsync(
        'UPDATE productos SET stock = MAX(0, COALESCE(stock, 0) - ?) WHERE id = ?',
        [it.cantidad, it.producto_id]
      );
    }
  }

  const detalleItems: VentaDetalleItem[] = items.map((it) => ({
    descripcion: it.nombre,
    cantidad: it.cantidad,
    precio_unitario: it.precio,
    subtotal: it.precio * it.cantidad,
  }));

  return {
    id: ventaId,
    fecha,
    total,
    metodo_pago,
    items: detalleItems,
  };
}

/** Obtiene una venta con su detalle para mostrar el comprobante. */
export async function getComprobantePorId(ventaId: number): Promise<ComprobanteVenta | null> {
  const db = await getDatabase();
  const venta = await db.getFirstAsync<Venta>(
    'SELECT id, fecha, total, metodo_pago FROM ventas WHERE id = ?',
    [ventaId]
  );
  if (!venta) return null;

  const filas = await db.getAllAsync<VentaDetalleItem>(
    'SELECT descripcion, cantidad, precio_unitario, subtotal FROM venta_detalle WHERE venta_id = ? ORDER BY id',
    [ventaId]
  );

  return {
    id: venta.id,
    fecha: venta.fecha,
    total: venta.total,
    metodo_pago: venta.metodo_pago as MetodoPago,
    items: filas,
  };
}

export async function getVentasHoy(): Promise<
  { total: number; metodo_pago: string; estado: string }[]
> {
  const db = await getDatabase();
  const hoy = new Date().toISOString().slice(0, 10);
  return db.getAllAsync<{ total: number; metodo_pago: string; estado: string }>(
    'SELECT total, metodo_pago, COALESCE(estado, "cobrado") as estado FROM ventas WHERE date(fecha) = ? ORDER BY fecha',
    [hoy]
  );
}

/** Lista ventas del día con id y fecha para abrir comprobantes. */
export async function getVentasDelDiaConId(): Promise<
  { id: number; fecha: string; total: number; metodo_pago: string }[]
> {
  const db = await getDatabase();
  const hoy = new Date().toISOString().slice(0, 10);
  return db.getAllAsync<{ id: number; fecha: string; total: number; metodo_pago: string }>(
    'SELECT id, fecha, total, metodo_pago FROM ventas WHERE date(fecha) = ? ORDER BY fecha DESC',
    [hoy]
  );
}

export async function getResumenHoy(): Promise<{
  totalVentas: number;
  totalCobrado: number;
  totalFiado: number;
  porMetodo: Record<string, number>;
  cantidadVentas: number;
}> {
  const ventas = await getVentasHoy();
  const totalVentas = ventas.reduce((s, v) => s + v.total, 0);
  const totalCobrado = ventas.filter((v) => (v.estado ?? 'cobrado') === 'cobrado').reduce((s, v) => s + v.total, 0);
  const totalFiado = ventas.filter((v) => v.estado === 'fiado').reduce((s, v) => s + v.total, 0);
  const porMetodo: Record<string, number> = {};
  ventas.forEach((v) => {
    porMetodo[v.metodo_pago] = (porMetodo[v.metodo_pago] ?? 0) + v.total;
  });
  return {
    totalVentas,
    totalCobrado,
    totalFiado,
    porMetodo,
    cantidadVentas: ventas.length,
  };
}

export async function getGananciaEstimadaHoy(): Promise<number> {
  return getGananciaEstimadaPorFecha(new Date().toISOString().slice(0, 10));
}

export async function getGananciaEstimadaPorFecha(fecha: string): Promise<number> {
  const db = await getDatabase();
  const ventas = await db.getAllAsync<{ total: number }>(
    'SELECT total FROM ventas WHERE date(fecha) = ?',
    [fecha]
  );
  const totalVentas = ventas.reduce((s, v) => s + v.total, 0);
  const productos = await db.getAllAsync<Producto>(
    'SELECT id, nombre, precio_venta, precio_costo, stock FROM productos'
  );
  if (productos.length === 0) return totalVentas;
  const margenPromedio =
    productos.reduce(
      (s, p) => s + (p.precio_venta - p.precio_costo) / Math.max(p.precio_venta, 0.01),
      0
    ) / productos.length;
  return totalVentas * margenPromedio;
}

/** Resumen para una fecha (YYYY-MM-DD). */
export async function getResumenPorFecha(fecha: string): Promise<{
  totalVentas: number;
  totalCobrado: number;
  totalFiado: number;
  porMetodo: Record<string, number>;
  cantidadVentas: number;
}> {
  const db = await getDatabase();
  const ventas = await db.getAllAsync<{ total: number; metodo_pago: string; estado: string }>(
    'SELECT total, metodo_pago, COALESCE(estado, "cobrado") as estado FROM ventas WHERE date(fecha) = ? ORDER BY fecha',
    [fecha]
  );
  const totalVentas = ventas.reduce((s, v) => s + v.total, 0);
  const totalCobrado = ventas.filter((v) => (v.estado ?? 'cobrado') === 'cobrado').reduce((s, v) => s + v.total, 0);
  const totalFiado = ventas.filter((v) => v.estado === 'fiado').reduce((s, v) => s + v.total, 0);
  const porMetodo: Record<string, number> = {};
  ventas.forEach((v) => {
    porMetodo[v.metodo_pago] = (porMetodo[v.metodo_pago] ?? 0) + v.total;
  });
  return {
    totalVentas,
    totalCobrado,
    totalFiado,
    porMetodo,
    cantidadVentas: ventas.length,
  };
}

/** Ventas de una fecha con id para abrir comprobantes. */
export async function getVentasDelDiaConIdPorFecha(fecha: string): Promise<
  { id: number; fecha: string; total: number; metodo_pago: string }[]
> {
  const db = await getDatabase();
  return db.getAllAsync<{ id: number; fecha: string; total: number; metodo_pago: string }>(
    'SELECT id, fecha, total, metodo_pago FROM ventas WHERE date(fecha) = ? ORDER BY fecha DESC',
    [fecha]
  );
}

/** Últimos N días que tienen al menos una venta. */
export async function getDiasConVentas(limite: number): Promise<
  { fecha: string; totalVentas: number; cantidadVentas: number }[]
> {
  const db = await getDatabase();
  const filas = await db.getAllAsync<{ fecha: string; total: number }>(
    `SELECT date(fecha) as fecha, total FROM ventas ORDER BY fecha DESC`
  );
  const porDia: Record<string, { total: number; count: number }> = {};
  filas.forEach((r) => {
    const d = r.fecha.slice(0, 10);
    if (!porDia[d]) porDia[d] = { total: 0, count: 0 };
    porDia[d].total += r.total;
    porDia[d].count += 1;
  });
  const hoy = new Date().toISOString().slice(0, 10);
  const dias = Object.entries(porDia)
    .filter(([f]) => f !== hoy)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, limite)
    .map(([fecha, d]) => ({
      fecha,
      totalVentas: d.total,
      cantidadVentas: d.count,
    }));
  return dias;
}

// ——— Clientes y cuentas por cobrar ———

export async function getClientes(busqueda?: string): Promise<Cliente[]> {
  const db = await getDatabase();
  if (busqueda?.trim()) {
    return db.getAllAsync<Cliente>(
      'SELECT id, nombre FROM clientes WHERE nombre LIKE ? ORDER BY nombre',
      [`%${busqueda.trim()}%`]
    );
  }
  return db.getAllAsync<Cliente>('SELECT id, nombre FROM clientes ORDER BY nombre');
}

export async function crearCliente(nombre: string): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    `INSERT INTO clientes (nombre, dirty, updated_at) VALUES (?, 1, datetime('now'))`,
    [nombre.trim()]
  );
  return result.lastInsertRowId;
}

/** Balance de la cuenta: deuda_inicial + ventas fiadas - cobros - saldo_a_favor. Positivo = debe, negativo = saldo a favor. */
export async function getDeudaCliente(clienteId: number): Promise<number> {
  const db = await getDatabase();
  const cliente = await db.getFirstAsync<{ deuda_inicial: number; saldo_a_favor: number }>(
    'SELECT COALESCE(deuda_inicial, 0) as deuda_inicial, COALESCE(saldo_a_favor, 0) as saldo_a_favor FROM clientes WHERE id = ?',
    [clienteId]
  );
  const ventas = await db.getFirstAsync<{ total: number }>(
    'SELECT COALESCE(SUM(total), 0) as total FROM ventas WHERE cliente_id = ? AND COALESCE(estado, "cobrado") = "fiado"',
    [clienteId]
  );
  const cobros = await db.getFirstAsync<{ total: number }>(
    'SELECT COALESCE(SUM(monto), 0) as total FROM cobros WHERE cliente_id = ?',
    [clienteId]
  );
  const deudaInicial = cliente?.deuda_inicial ?? 0;
  const saldoAFavor = cliente?.saldo_a_favor ?? 0;
  return deudaInicial + (ventas?.total ?? 0) - (cobros?.total ?? 0) - saldoAFavor;
}

/** Detalle de saldo para mostrar en modal: deuda inicial, saldo a favor y balance. */
export async function getSaldoCliente(clienteId: number): Promise<{
  deuda_inicial: number;
  saldo_a_favor: number;
  balance: number;
}> {
  const db = await getDatabase();
  const cliente = await db.getFirstAsync<{ deuda_inicial: number; saldo_a_favor: number }>(
    'SELECT COALESCE(deuda_inicial, 0) as deuda_inicial, COALESCE(saldo_a_favor, 0) as saldo_a_favor FROM clientes WHERE id = ?',
    [clienteId]
  );
  const ventas = await db.getFirstAsync<{ total: number }>(
    'SELECT COALESCE(SUM(total), 0) as total FROM ventas WHERE cliente_id = ? AND COALESCE(estado, "cobrado") = "fiado"',
    [clienteId]
  );
  const cobros = await db.getFirstAsync<{ total: number }>(
    'SELECT COALESCE(SUM(monto), 0) as total FROM cobros WHERE cliente_id = ?',
    [clienteId]
  );
  const deudaInicial = cliente?.deuda_inicial ?? 0;
  const saldoAFavor = cliente?.saldo_a_favor ?? 0;
  const balance = deudaInicial + (ventas?.total ?? 0) - (cobros?.total ?? 0) - saldoAFavor;
  return { deuda_inicial: deudaInicial, saldo_a_favor: saldoAFavor, balance };
}

/** Fija la deuda inicial (cuenta previa al app). */
export async function setDeudaInicial(clienteId: number, monto: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE clientes SET deuda_inicial = ? WHERE id = ?', [Math.max(0, monto), clienteId]);
}

/** Suma monto al saldo a favor del cliente (abono para futuras compras). */
export async function addSaldoAFavor(clienteId: number, monto: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE clientes SET saldo_a_favor = COALESCE(saldo_a_favor, 0) + ? WHERE id = ?',
    [Math.max(0, monto), clienteId]
  );
}

/** Ventas fiadas de un cliente (para detalle por fecha/hora). */
export async function getVentasFiadasPorCliente(clienteId: number): Promise<
  { id: number; fecha: string; total: number }[]
> {
  const db = await getDatabase();
  return db.getAllAsync<{ id: number; fecha: string; total: number }>(
    `SELECT id, fecha, total FROM ventas 
     WHERE cliente_id = ? AND COALESCE(estado, 'cobrado') = 'fiado' 
     ORDER BY fecha DESC`,
    [clienteId]
  );
}

/** Clientes con movimiento en cuenta: deuda > 0 (debe) o balance < 0 (saldo a favor). */
export async function getClientesConDeuda(): Promise<{ id: number; nombre: string; deuda: number }[]> {
  const db = await getDatabase();
  const clientes = await db.getAllAsync<Cliente>('SELECT id, nombre FROM clientes ORDER BY nombre');
  const conMovimiento: { id: number; nombre: string; deuda: number }[] = [];
  for (const c of clientes) {
    const balance = await getDeudaCliente(c.id);
    if (balance !== 0) conMovimiento.push({ id: c.id, nombre: c.nombre, deuda: balance });
  }
  return conMovimiento;
}

export async function registrarCobro(clienteId: number, monto: number): Promise<number> {
  const db = await getDatabase();
  const fecha = new Date().toISOString();
  const result = await db.runAsync(
    `INSERT INTO cobros (cliente_id, monto, fecha, dirty, created_at) VALUES (?, ?, ?, 1, datetime('now'))`,
    [clienteId, monto, fecha]
  );
  return result.lastInsertRowId;
}
