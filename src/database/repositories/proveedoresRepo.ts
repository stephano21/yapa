import { db } from '../drizzle/client';
import { proveedores } from '../drizzle/schema';
import { eq, sql } from 'drizzle-orm';

export type Proveedor = typeof proveedores.$inferSelect;

export type ProveedorConBalance = {
  id: number;
  nombre: string;
  telefono: string | null;
  notas: string | null;
  deuda_inicial: number;
  /** Lo que se le debe: deuda inicial + compras a crédito − pagos. Positivo = le debemos; negativo = pagamos de más. */
  balance: number;
};

const ahora = () => sql`(datetime('now'))` as unknown as string;

export const proveedoresRepo = {
  getById: (id: number): Promise<Proveedor | null> =>
    db
      .select()
      .from(proveedores)
      .where(eq(proveedores.id, id))
      .then((r) => r[0] ?? null),

  crear: (input: { nombre: string; telefono?: string; notas?: string; deudaInicial?: number }): Promise<number> => {
    const nombre = input.nombre.trim();
    if (!nombre) throw new Error('Nombre requerido');
    return db
      .insert(proveedores)
      .values({
        nombre,
        telefono: input.telefono?.trim() || null,
        notas: input.notas?.trim() || null,
        deudaInicial: Math.max(0, input.deudaInicial ?? 0),
        dirty: 1,
        updatedAt: ahora(),
      })
      .returning({ id: proveedores.id })
      .then((r) => r[0].id);
  },

  actualizar: (
    id: number,
    input: { nombre: string; telefono?: string; notas?: string; deudaInicial?: number }
  ): Promise<void> => {
    const nombre = input.nombre.trim();
    if (!nombre) throw new Error('Nombre requerido');
    return db
      .update(proveedores)
      .set({
        nombre,
        telefono: input.telefono?.trim() || null,
        notas: input.notas?.trim() || null,
        deudaInicial: Math.max(0, input.deudaInicial ?? 0),
        dirty: 1,
        updatedAt: ahora(),
      })
      .where(eq(proveedores.id, id))
      .then(() => undefined);
  },

  /** Borrado local: no se elimina la fila hasta que el servidor confirme el borrado (permite sincronizarlo). */
  eliminar: (id: number): Promise<void> =>
    db
      .update(proveedores)
      .set({ pendingDelete: 1, dirty: 1, updatedAt: ahora() })
      .where(eq(proveedores.id, id))
      .then(() => undefined),

  /** Borra la fila de verdad; solo usar tras confirmar el borrado con el servidor. */
  purgarLocal: (id: number): Promise<void> =>
    db
      .delete(proveedores)
      .where(eq(proveedores.id, id))
      .then(() => undefined),

  /** Todos los proveedores con lo que se les debe, en una sola query (sin N+1). */
  getConBalance: async (): Promise<ProveedorConBalance[]> => {
    const rows = await db.all(sql`
      SELECT
        p.id,
        p.nombre,
        p.telefono,
        p.notas,
        COALESCE(p.deuda_inicial, 0) AS deuda_inicial,
        (
          COALESCE(p.deuda_inicial, 0)
          + COALESCE(c.total_compras, 0)
          - COALESCE(g.total_pagos, 0)
        ) AS balance
      FROM proveedores p
      LEFT JOIN (
        SELECT proveedor_id, SUM(monto) AS total_compras
        FROM compras_proveedor
        GROUP BY proveedor_id
      ) c ON c.proveedor_id = p.id
      LEFT JOIN (
        SELECT proveedor_id, SUM(monto) AS total_pagos
        FROM pagos_proveedor
        GROUP BY proveedor_id
      ) g ON g.proveedor_id = p.id
      WHERE p.pending_delete = 0
      ORDER BY p.nombre COLLATE NOCASE
    `);
    return rows as ProveedorConBalance[];
  },

  getAllActivos: (): Promise<Proveedor[]> =>
    db
      .select()
      .from(proveedores)
      .where(eq(proveedores.pendingDelete, 0))
      .orderBy(proveedores.nombre),

  getDirty: (): Promise<Proveedor[]> => db.select().from(proveedores).where(eq(proveedores.dirty, 1)),

  marcarSynced: (id: number, remoteId: string): Promise<void> =>
    db
      .update(proveedores)
      .set({ dirty: 0, remoteId, updatedAt: ahora() })
      .where(eq(proveedores.id, id))
      .then(() => undefined),

  getRemoteId: (id: number): Promise<string | null> =>
    db
      .select({ remoteId: proveedores.remoteId })
      .from(proveedores)
      .where(eq(proveedores.id, id))
      .then((r) => {
        const v = r[0]?.remoteId?.trim();
        return v && v.length > 0 ? v : null;
      }),
};
