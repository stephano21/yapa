import { sqliteTable, integer, real, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const productos = sqliteTable('productos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nombre: text('nombre').notNull(),
  precioVenta: real('precio_venta').notNull(),
  precioCosto: real('precio_costo').notNull().default(0),
  precioMinimo: real('precio_minimo'),
  stock: integer('stock').notNull().default(0),
  remoteId: text('remote_id'),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  dirty: integer('dirty').notNull().default(1),
});

export const ventas = sqliteTable('ventas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fecha: text('fecha').notNull(),
  total: real('total').notNull(),
  metodoPago: text('metodo_pago').notNull(),
  estado: text('estado').default('cobrado'),
  clienteId: integer('cliente_id'),
  remoteId: text('remote_id'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  syncedAt: text('synced_at'),
  dirty: integer('dirty').notNull().default(1),
});

export const ventaDetalle = sqliteTable('venta_detalle', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ventaId: integer('venta_id').notNull(),
  productoId: integer('producto_id'),
  descripcion: text('descripcion').notNull(),
  cantidad: real('cantidad').notNull(),
  precioUnitario: real('precio_unitario').notNull(),
  subtotal: real('subtotal').notNull(),
  remoteId: text('remote_id'),
  syncedAt: text('synced_at'),
  dirty: integer('dirty').notNull().default(1),
});

export const clientes = sqliteTable('clientes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nombre: text('nombre').notNull(),
  deudaInicial: real('deuda_inicial').default(0),
  saldoAFavor: real('saldo_a_favor').default(0),
  remoteId: text('remote_id'),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  dirty: integer('dirty').notNull().default(0),
});

export const cobros = sqliteTable('cobros', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clienteId: integer('cliente_id').notNull(),
  monto: real('monto').notNull(),
  fecha: text('fecha').notNull(),
  remoteId: text('remote_id'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  syncedAt: text('synced_at'),
  dirty: integer('dirty').notNull().default(1),
});

export const unidadesMedida = sqliteTable('unidades_medida', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nombre: text('nombre').notNull(),
  unidades: integer('unidades').notNull().default(1),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  dirty: integer('dirty').notNull().default(0),
});
