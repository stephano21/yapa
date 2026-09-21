import { db } from '../drizzle/client';
import { comprasProveedor } from '../drizzle/schema';
import { desc, eq, sql } from 'drizzle-orm';
import { getFechaHoraLocalParaDb } from '../../utils/dateLocal';

export type CompraProveedor = typeof comprasProveedor.$inferSelect;

export const comprasProveedorRepo = {
  /** Compra a crédito: aumenta lo que se le debe al proveedor. No mueve caja hasta que se pague. */
  registrar: (proveedorId: number, monto: number, nota?: string): Promise<number> => {
    if (!Number.isFinite(monto) || monto <= 0) throw new Error('Monto inválido');
    return db
      .insert(comprasProveedor)
      .values({
        proveedorId,
        monto,
        fecha: getFechaHoraLocalParaDb(),
        nota: nota?.trim() || null,
        dirty: 1,
        createdAt: sql`(datetime('now'))` as unknown as string,
      })
      .returning({ id: comprasProveedor.id })
      .then((r) => r[0].id);
  },

  getPorProveedor: (proveedorId: number): Promise<CompraProveedor[]> =>
    db
      .select()
      .from(comprasProveedor)
      .where(eq(comprasProveedor.proveedorId, proveedorId))
      .orderBy(desc(comprasProveedor.fecha), desc(comprasProveedor.id)),

  getDirty: (): Promise<CompraProveedor[]> =>
    db.select().from(comprasProveedor).where(eq(comprasProveedor.dirty, 1)),

  marcarSynced: (id: number, remoteId: string): Promise<void> =>
    db
      .update(comprasProveedor)
      .set({ dirty: 0, remoteId, syncedAt: sql`(datetime('now'))` as unknown as string })
      .where(eq(comprasProveedor.id, id))
      .then(() => undefined),
};
