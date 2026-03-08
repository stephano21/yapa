import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

const DB_NAME = 'yapa_pos.db';

let dbInstance: SQLiteDatabase | null = null;

export type MetodoPago = 'Efectivo' | 'Transferencia' | 'Tarjeta';

export interface Producto {
  id: number;
  nombre: string;
  precio_venta: number;
  precio_costo: number;
  stock: number;
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
      stock INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS ventas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL,
      total REAL NOT NULL,
      metodo_pago TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS venta_detalle (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venta_id INTEGER NOT NULL,
      descripcion TEXT NOT NULL,
      cantidad REAL NOT NULL,
      precio_unitario REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (venta_id) REFERENCES ventas(id)
    );

    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cobros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL,
      monto REAL NOT NULL,
      fecha TEXT NOT NULL,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id)
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

  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM productos'
  );
  if (row && row.count === 0) {
    await db.runAsync(
      'INSERT INTO productos (nombre, precio_venta, precio_costo, stock) VALUES (?, ?, ?, ?)',
      ['Café', 2.5, 1.2, 50]
    );
    await db.runAsync(
      'INSERT INTO productos (nombre, precio_venta, precio_costo, stock) VALUES (?, ?, ?, ?)',
      ['Pan', 1.2, 0.5, 30]
    );
    await db.runAsync(
      'INSERT INTO productos (nombre, precio_venta, precio_costo, stock) VALUES (?, ?, ?, ?)',
      ['Agua', 1.0, 0.3, 100]
    );
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
      'SELECT id, nombre, precio_venta, precio_costo, stock FROM productos WHERE nombre LIKE ? ORDER BY nombre',
      [`%${busqueda.trim()}%`]
    );
  }
  return db.getAllAsync<Producto>(
    'SELECT id, nombre, precio_venta, precio_costo, stock FROM productos ORDER BY nombre'
  );
}

export async function getProductoById(id: number): Promise<Producto | null> {
  const db = await getDatabase();
  return db.getFirstAsync<Producto>(
    'SELECT id, nombre, precio_venta, precio_costo, stock FROM productos WHERE id = ?',
    [id]
  );
}

export async function crearProducto(
  nombre: string,
  precio_venta: number,
  precio_costo: number,
  stock: number
): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    'INSERT INTO productos (nombre, precio_venta, precio_costo, stock) VALUES (?, ?, ?, ?)',
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
    'UPDATE productos SET nombre = ?, precio_venta = ?, precio_costo = ?, stock = ? WHERE id = ?',
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
};

/** Registra una venta con su detalle (para comprobante). Si es fiado, pasar clienteId. */
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
  const result = await db.runAsync('INSERT INTO clientes (nombre) VALUES (?)', [nombre.trim()]);
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
    'INSERT INTO cobros (cliente_id, monto, fecha) VALUES (?, ?, ?)',
    [clienteId, monto, fecha]
  );
  return result.lastInsertRowId;
}
