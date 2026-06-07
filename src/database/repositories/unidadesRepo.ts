import { db } from '../drizzle/client';
import { unidadesMedida } from '../drizzle/schema';
import { eq, sql } from 'drizzle-orm';

export type UnidadMedida = typeof unidadesMedida.$inferSelect;

export const unidadesRepo = {
  getAll: (): Promise<UnidadMedida[]> =>
    db
      .select()
      .from(unidadesMedida)
      .orderBy(unidadesMedida.unidades, unidadesMedida.nombre),

  crear: (nombre: string, unidades: number): Promise<number> => {
    const n = nombre.trim();
    const u = Math.floor(unidades);
    if (!n) throw new Error('Nombre requerido');
    if (!Number.isFinite(u) || u <= 0) throw new Error('Unidades inválidas');
    return db
      .insert(unidadesMedida)
      .values({ nombre: n, unidades: u, dirty: 0, updatedAt: sql`(datetime('now'))` as unknown as string })
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
};
