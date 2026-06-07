import { db } from '../drizzle/client';
import { productos } from '../drizzle/schema';
import { eq, like, sql } from 'drizzle-orm';

export type Producto = typeof productos.$inferSelect;
export type NuevoProducto = Pick<Producto, 'nombre' | 'precioVenta' | 'precioCosto' | 'stock'>;

export const productosRepo = {
  getAll: (busqueda?: string): Promise<Producto[]> => {
    if (busqueda?.trim()) {
      return db
        .select()
        .from(productos)
        .where(like(productos.nombre, `%${busqueda.trim()}%`))
        .orderBy(productos.nombre);
    }
    return db.select().from(productos).orderBy(productos.nombre);
  },

  getById: (id: number): Promise<Producto | null> =>
    db
      .select()
      .from(productos)
      .where(eq(productos.id, id))
      .then((r) => r[0] ?? null),

  crear: (data: NuevoProducto): Promise<number> =>
    db
      .insert(productos)
      .values({ ...data, dirty: 1, updatedAt: sql`(datetime('now'))` as unknown as string })
      .returning({ id: productos.id })
      .then((r) => r[0].id),

  actualizar: (id: number, data: Partial<NuevoProducto>): Promise<void> =>
    db
      .update(productos)
      .set({ ...data, dirty: 1, updatedAt: sql`(datetime('now'))` as unknown as string })
      .where(eq(productos.id, id))
      .then(() => undefined),

  eliminar: (id: number): Promise<void> =>
    db
      .delete(productos)
      .where(eq(productos.id, id))
      .then(() => undefined),

  descontarStock: (id: number, cantidad: number): Promise<void> =>
    db
      .update(productos)
      .set({ stock: sql`MAX(0, COALESCE(${productos.stock}, 0) - ${cantidad})` as unknown as number })
      .where(eq(productos.id, id))
      .then(() => undefined),

  getDirty: (): Promise<Producto[]> =>
    db.select().from(productos).where(eq(productos.dirty, 1)),

  marcarSynced: (id: number, remoteId: string): Promise<void> =>
    db
      .update(productos)
      .set({ dirty: 0, remoteId, updatedAt: sql`(datetime('now'))` as unknown as string })
      .where(eq(productos.id, id))
      .then(() => undefined),
};
