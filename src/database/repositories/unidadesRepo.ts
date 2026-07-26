import { db } from '../drizzle/client';
import { unidadesMedida } from '../drizzle/schema';
import { eq, sql } from 'drizzle-orm';

export type UnidadMedida = typeof unidadesMedida.$inferSelect;

export const unidadesRepo = {
  getAll: (): Promise<UnidadMedida[]> =>
    db
      .select()
      .from(unidadesMedida)
      .where(eq(unidadesMedida.pendingDelete, 0))
      .orderBy(unidadesMedida.unidades, unidadesMedida.nombre),

  crear: (nombre: string, unidades: number): Promise<number> => {
    const n = nombre.trim();
    const u = Math.floor(unidades);
    if (!n) throw new Error('Nombre requerido');
    if (!Number.isFinite(u) || u <= 0) throw new Error('Unidades inválidas');
    return db
      .insert(unidadesMedida)
      .values({ nombre: n, unidades: u, dirty: 1, updatedAt: sql`(datetime('now'))` as unknown as string })
      .returning({ id: unidadesMedida.id })
      .then((r) => r[0].id);
  },

  actualizar: (id: number, nombre: string, unidades: number): Promise<void> => {
    const n = nombre.trim();
    const u = Math.floor(unidades);
    if (!n) throw new Error('Nombre requerido');
    if (!Number.isFinite(u) || u <= 0) throw new Error('Unidades inválidas');
    return db
      .update(unidadesMedida)
      .set({ nombre: n, unidades: u, dirty: 1, updatedAt: sql`(datetime('now'))` as unknown as string })
      .where(eq(unidadesMedida.id, id))
      .then(() => undefined);
  },

  /** Borrado local: no se elimina la fila hasta que el servidor confirme el borrado (permite sincronizarlo). */
  eliminar: (id: number): Promise<void> =>
    db
      .update(unidadesMedida)
      .set({ pendingDelete: 1, dirty: 1, updatedAt: sql`(datetime('now'))` as unknown as string })
      .where(eq(unidadesMedida.id, id))
      .then(() => undefined),

  /** Borra la fila de verdad; solo usar tras confirmar el borrado con el servidor. */
  purgarLocal: (id: number): Promise<void> =>
    db
      .delete(unidadesMedida)
      .where(eq(unidadesMedida.id, id))
      .then(() => undefined),

  getDirty: (): Promise<UnidadMedida[]> =>
    db.select().from(unidadesMedida).where(eq(unidadesMedida.dirty, 1)),

  marcarSynced: (id: number, remoteId: string): Promise<void> =>
    db
      .update(unidadesMedida)
      .set({ dirty: 0, remoteId, updatedAt: sql`(datetime('now'))` as unknown as string })
      .where(eq(unidadesMedida.id, id))
      .then(() => undefined),
};
