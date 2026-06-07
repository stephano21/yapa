import { db } from '../drizzle/client';
import { cobros } from '../drizzle/schema';
import { eq, sql } from 'drizzle-orm';
import { getFechaHoraLocalParaDb } from '../../utils/dateLocal';

export type Cobro = typeof cobros.$inferSelect;

export const cobrosRepo = {
  registrar: (clienteId: number, monto: number): Promise<number> =>
    db
      .insert(cobros)
      .values({
        clienteId,
        monto,
        fecha: getFechaHoraLocalParaDb(),
        dirty: 1,
        createdAt: sql`(datetime('now'))` as unknown as string,
      })
      .returning({ id: cobros.id })
      .then((r) => r[0].id),

  getPorCliente: (clienteId: number): Promise<Cobro[]> =>
    db.select().from(cobros).where(eq(cobros.clienteId, clienteId)),

  getTotalPorCliente: async (clienteId: number): Promise<number> => {
    const r = db.all(sql`SELECT COALESCE(SUM(monto), 0) as total FROM cobros WHERE cliente_id = ${clienteId}`);
    return (r[0] as { total: number })?.total ?? 0;
  },

  getDirty: (): Promise<Cobro[]> =>
    db.select().from(cobros).where(eq(cobros.dirty, 1)),

  marcarSynced: (id: number, remoteId: string): Promise<void> =>
    db
      .update(cobros)
      .set({ dirty: 0, remoteId, syncedAt: sql`(datetime('now'))` as unknown as string })
      .where(eq(cobros.id, id))
      .then(() => undefined),
};
