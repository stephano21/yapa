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

export interface Venta {
  id: number;
  fecha: string;
  total: number;
  metodo_pago: MetodoPago;
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
  `);

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

/** Registra una venta con su detalle (para comprobante). Devuelve el comprobante generado. */
export async function registrarVentaConDetalle(
  total: number,
  metodo_pago: MetodoPago,
  items: ItemVentaInput[]
): Promise<ComprobanteVenta> {
  const db = await getDatabase();
  const fecha = new Date().toISOString();

  const result = await db.runAsync(
    'INSERT INTO ventas (fecha, total, metodo_pago) VALUES (?, ?, ?)',
    [fecha, total, metodo_pago]
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
  { total: number; metodo_pago: string }[]
> {
  const db = await getDatabase();
  const hoy = new Date().toISOString().slice(0, 10);
  return db.getAllAsync<{ total: number; metodo_pago: string }>(
    'SELECT total, metodo_pago FROM ventas WHERE date(fecha) = ? ORDER BY fecha',
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
  porMetodo: Record<string, number>;
  cantidadVentas: number;
}> {
  const ventas = await getVentasHoy();
  const totalVentas = ventas.reduce((s, v) => s + v.total, 0);
  const porMetodo: Record<string, number> = {};
  ventas.forEach((v) => {
    porMetodo[v.metodo_pago] = (porMetodo[v.metodo_pago] ?? 0) + v.total;
  });
  return {
    totalVentas,
    porMetodo,
    cantidadVentas: ventas.length,
  };
}

export async function getGananciaEstimadaHoy(): Promise<number> {
  const db = await getDatabase();
  const hoy = new Date().toISOString().slice(0, 10);
  const ventas = await db.getAllAsync<{ total: number }>(
    'SELECT total FROM ventas WHERE date(fecha) = ?',
    [hoy]
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
