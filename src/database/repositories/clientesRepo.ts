import { db } from '../drizzle/client';
import { clientes } from '../drizzle/schema';
import { eq, like, sql } from 'drizzle-orm';

export type Cliente = typeof clientes.$inferSelect;

export type ClienteConBalance = {
  id: number;
  nombre: string;
  balance: number;
};

export const clientesRepo = {
  getAll: (busqueda?: string): Promise<Cliente[]> => {
    if (busqueda?.trim()) {
      return db
        .select()
        .from(clientes)
        .where(like(clientes.nombre, `%${busqueda.trim()}%`))
        .orderBy(clientes.nombre);
    }
    return db.select().from(clientes).orderBy(clientes.nombre);
  },

  getById: (id: number): Promise<Cliente | null> =>
    db
      .select()
      .from(clientes)
      .where(eq(clientes.id, id))
      .then((r) => r[0] ?? null),

  crear: (nombre: string): Promise<number> =>
    db
      .insert(clientes)
      .values({ nombre: nombre.trim(), dirty: 1, updatedAt: sql`(datetime('now'))` as unknown as string })
      .returning({ id: clientes.id })
      .then((r) => r[0].id),

  setDeudaInicial: (id: number, monto: number): Promise<void> =>
    db
      .update(clientes)
      .set({ deudaInicial: Math.max(0, monto) })
      .where(eq(clientes.id, id))
      .then(() => undefined),

  addSaldoAFavor: (id: number, monto: number): Promise<void> =>
    db
      .update(clientes)
      .set({ saldoAFavor: sql`COALESCE(${clientes.saldoAFavor}, 0) + ${Math.max(0, monto)}` as unknown as number })
      .where(eq(clientes.id, id))
      .then(() => undefined),

  // Query agregada — resuelve el N+1 de getClientesConDeuda
  getConBalance: async (): Promise<ClienteConBalance[]> => {
    const rows = db.all(sql`
      SELECT
        c.id,
        c.nombre,
        (
          COALESCE(c.deuda_inicial, 0)
          + COALESCE(vf.total_fiado, 0)
          - COALESCE(cb.total_cobrado, 0)
          - COALESCE(c.saldo_a_favor, 0)
        ) AS balance
      FROM clientes c
      LEFT JOIN (
        SELECT cliente_id, SUM(total) AS total_fiado
        FROM ventas
        WHERE COALESCE(estado, 'cobrado') = 'fiado'
        GROUP BY cliente_id
      ) vf ON vf.cliente_id = c.id
      LEFT JOIN (
        SELECT cliente_id, SUM(monto) AS total_cobrado
        FROM cobros
        GROUP BY cliente_id
      ) cb ON cb.cliente_id = c.id
      HAVING balance != 0
      ORDER BY c.nombre
    `);
    return rows as ClienteConBalance[];
  },

  getBalanceById: async (id: number): Promise<number> => {
    const rows = db.all(sql`
      SELECT
        (
          COALESCE(c.deuda_inicial, 0)
          + COALESCE(vf.total_fiado, 0)
          - COALESCE(cb.total_cobrado, 0)
          - COALESCE(c.saldo_a_favor, 0)
        ) AS balance,
        COALESCE(c.deuda_inicial, 0) AS deuda_inicial,
        COALESCE(c.saldo_a_favor, 0) AS saldo_a_favor
      FROM clientes c
      LEFT JOIN (
        SELECT cliente_id, SUM(total) AS total_fiado
        FROM ventas
        WHERE COALESCE(estado, 'cobrado') = 'fiado' AND cliente_id = ${id}
        GROUP BY cliente_id
      ) vf ON vf.cliente_id = c.id
      LEFT JOIN (
        SELECT cliente_id, SUM(monto) AS total_cobrado
        FROM cobros
        WHERE cliente_id = ${id}
        GROUP BY cliente_id
      ) cb ON cb.cliente_id = c.id
      WHERE c.id = ${id}
    `);
    const row = rows[0] as { balance: number } | undefined;
    return row?.balance ?? 0;
  },

  getSaldoDetalle: async (id: number): Promise<{ deuda_inicial: number; saldo_a_favor: number; balance: number }> => {
    const rows = db.all(sql`
      SELECT
        COALESCE(c.deuda_inicial, 0) AS deuda_inicial,
        COALESCE(c.saldo_a_favor, 0) AS saldo_a_favor,
        (
          COALESCE(c.deuda_inicial, 0)
          + COALESCE(vf.total_fiado, 0)
          - COALESCE(cb.total_cobrado, 0)
          - COALESCE(c.saldo_a_favor, 0)
        ) AS balance
      FROM clientes c
      LEFT JOIN (
        SELECT cliente_id, SUM(total) AS total_fiado
        FROM ventas
        WHERE COALESCE(estado, 'cobrado') = 'fiado' AND cliente_id = ${id}
        GROUP BY cliente_id
      ) vf ON vf.cliente_id = c.id
      LEFT JOIN (
        SELECT cliente_id, SUM(monto) AS total_cobrado
        FROM cobros
        WHERE cliente_id = ${id}
        GROUP BY cliente_id
      ) cb ON cb.cliente_id = c.id
      WHERE c.id = ${id}
    `);
    const row = rows[0] as { deuda_inicial: number; saldo_a_favor: number; balance: number } | undefined;
    return row ?? { deuda_inicial: 0, saldo_a_favor: 0, balance: 0 };
  },

  getDirty: (): Promise<Cliente[]> =>
    db.select().from(clientes).where(eq(clientes.dirty, 1)),

  marcarSynced: (id: number, remoteId: string): Promise<void> =>
    db
      .update(clientes)
      .set({ dirty: 0, remoteId, updatedAt: sql`(datetime('now'))` as unknown as string })
      .where(eq(clientes.id, id))
      .then(() => undefined),

  getRemoteId: (id: number): Promise<string | null> =>
    db
      .select({ remoteId: clientes.remoteId })
      .from(clientes)
      .where(eq(clientes.id, id))
      .then((r) => {
        const v = r[0]?.remoteId?.trim();
        return v && v.length > 0 ? v : null;
      }),
};
