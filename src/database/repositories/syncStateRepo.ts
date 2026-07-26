import { db } from '../drizzle/client';
import { syncState } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

export type SyncStateRow = {
  lastCursor: string | null;
  lastPulledAt: string | null;
};

/** Guarda el punto de retomo de cada recurso "pulleable" (productos/clientes/unidades/ventas/cobros). */
export const syncStateRepo = {
  get: async (resource: string): Promise<SyncStateRow> => {
    const row = await db
      .select()
      .from(syncState)
      .where(eq(syncState.resource, resource))
      .then((r) => r[0] ?? null);
    return { lastCursor: row?.lastCursor ?? null, lastPulledAt: row?.lastPulledAt ?? null };
  },

  /** Cursor de una página en curso (permite retomar un pull interrumpido a mitad de paginación). */
  setCursor: async (resource: string, cursor: string | null): Promise<void> => {
    await db
      .insert(syncState)
      .values({ resource, lastCursor: cursor })
      .onConflictDoUpdate({ target: syncState.resource, set: { lastCursor: cursor } });
  },

  /** Marca de agua incremental: se actualiza solo cuando un pull termina de recorrer todas las páginas. */
  setLastPulledAt: async (resource: string, lastPulledAt: string): Promise<void> => {
    await db
      .insert(syncState)
      .values({ resource, lastCursor: null, lastPulledAt })
      .onConflictDoUpdate({ target: syncState.resource, set: { lastCursor: null, lastPulledAt } });
  },
};
