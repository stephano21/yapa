import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

const DB_NAME = 'yapa.db';

let dbInstance: SQLiteDatabase | null = null;

export interface Producto {
  id: number;
  nombre: string;
  precio: number;
  stock: number;
}

export interface Venta {
  id: number;
  total: number;
  fecha: string;
}

async function initDb(): Promise<SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);

  db.execAsync(`
    CREATE TABLE IF NOT EXISTS productos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      precio REAL NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS ventas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      total REAL NOT NULL,
      fecha TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `);

  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM productos'
  );
  if (row && row.count === 0) {
    await db.runAsync(
      'INSERT INTO productos (nombre, precio, stock) VALUES (?, ?, ?)',
      ['Café', 2.5, 50]
    );
    await db.runAsync(
      'INSERT INTO productos (nombre, precio, stock) VALUES (?, ?, ?)',
      ['Pan', 1.2, 30]
    );
    await db.runAsync(
      'INSERT INTO productos (nombre, precio, stock) VALUES (?, ?, ?)',
      ['Agua', 1.0, 100]
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
      'SELECT id, nombre, precio, stock FROM productos WHERE nombre LIKE ? ORDER BY nombre',
      [`%${busqueda.trim()}%`]
    );
  }
  return db.getAllAsync<Producto>(
    'SELECT id, nombre, precio, stock FROM productos ORDER BY nombre'
  );
}

export async function registrarVenta(total: number): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    'INSERT INTO ventas (total, fecha) VALUES (?, datetime("now", "localtime"))',
    [total]
  );
  return result.lastInsertRowId;
}
