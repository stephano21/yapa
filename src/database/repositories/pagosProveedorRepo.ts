import { db } from '../drizzle/client';
import { pagosProveedor } from '../drizzle/schema';
import { desc, eq, sql } from 'drizzle-orm';
import { getFechaHoraLocalParaDb } from '../../utils/dateLocal';

export type PagoProveedor = typeof pagosProveedor.$inferSelect;

export type MetodoPagoProveedor = 'Efectivo' | 'Transferencia';

export type PagoProveedorConNombre = {
  id: number;
  proveedor_id: number;
  proveedor_nombre: string | null;
  monto: number;
  metodo_pago: string;
  fecha: string;
  nota: string | null;
  comprobante_uri: string | null;
  comprobante_url: string | null;
};

export type ResumenPagosProveedor = {
  totalPagado: number;
  porMetodo: Record<string, number>;
  cantidad: number;
};

export const pagosProveedorRepo = {
  /**
   * Registra un pago al proveedor. Si es por transferencia puede llevar `comprobanteUri` (foto local);
   * se sube a Pulse en el próximo sync y recién ahí se obtiene su file id.
   */
  registrar: (input: {
    proveedorId: number;
    monto: number;
    metodoPago: MetodoPagoProveedor;
    nota?: string;
    comprobanteUri?: string | null;
  }): Promise<number> => {
    if (!Number.isFinite(input.monto) || input.monto <= 0) throw new Error('Monto inválido');
    return db
      .insert(pagosProveedor)
      .values({
        proveedorId: input.proveedorId,
        monto: input.monto,
        metodoPago: input.metodoPago,
        fecha: getFechaHoraLocalParaDb(),
        nota: input.nota?.trim() || null,
        // El comprobante solo tiene sentido en transferencias.
        comprobanteUri: input.metodoPago === 'Transferencia' ? (input.comprobanteUri ?? null) : null,
        dirty: 1,
        createdAt: sql`(datetime('now'))` as unknown as string,
      })
      .returning({ id: pagosProveedor.id })
      .then((r) => r[0].id);
  },

  getPorProveedor: (proveedorId: number): Promise<PagoProveedor[]> =>
    db
      .select()
      .from(pagosProveedor)
      .where(eq(pagosProveedor.proveedorId, proveedorId))
      .orderBy(desc(pagosProveedor.fecha), desc(pagosProveedor.id)),

  /** Pagos de un día civil local (YYYY-MM-DD), con el nombre del proveedor. */
  getDelDia: async (fecha: string): Promise<PagoProveedorConNombre[]> => {
    const rows = await db.all(sql`
      SELECT
        g.id,
        g.proveedor_id,
        p.nombre AS proveedor_nombre,
        g.monto,
        g.metodo_pago,
        g.fecha,
        g.nota,
        g.comprobante_uri,
        g.comprobante_url
      FROM pagos_proveedor g
      LEFT JOIN proveedores p ON p.id = g.proveedor_id
      WHERE date(g.fecha) = ${fecha}
      ORDER BY g.fecha DESC
    `);
    return rows as PagoProveedorConNombre[];
  },

  /** Lo pagado a proveedores en un día: es lo que se resta del total vendido para sacar el neto. */
  getResumenPorFecha: async (fecha: string): Promise<ResumenPagosProveedor> => {
    const rows = (await db.all(sql`
      SELECT monto, metodo_pago
      FROM pagos_proveedor
      WHERE date(fecha) = ${fecha}
    `)) as { monto: number; metodo_pago: string }[];

    const porMetodo: Record<string, number> = {};
    let totalPagado = 0;
    for (const r of rows) {
      totalPagado += r.monto;
      porMetodo[r.metodo_pago] = (porMetodo[r.metodo_pago] ?? 0) + r.monto;
    }
    return { totalPagado, porMetodo, cantidad: rows.length };
  },

  getDirty: (): Promise<PagoProveedor[]> =>
    db.select().from(pagosProveedor).where(eq(pagosProveedor.dirty, 1)),

  /** Guarda el id remoto de la foto una vez subida (así un reintento del push no la sube dos veces). */
  setComprobanteSubido: (id: number, fileId: string, url: string | null): Promise<void> =>
    db
      .update(pagosProveedor)
      .set({ comprobanteFileId: fileId, comprobanteUrl: url })
      .where(eq(pagosProveedor.id, id))
      .then(() => undefined),

  /** La foto local ya no existe (el sistema limpió el caché): se descarta para no bloquear el push. */
  descartarComprobanteLocal: (id: number): Promise<void> =>
    db
      .update(pagosProveedor)
      .set({ comprobanteUri: null })
      .where(eq(pagosProveedor.id, id))
      .then(() => undefined),

  marcarSynced: (id: number, remoteId: string): Promise<void> =>
    db
      .update(pagosProveedor)
      .set({ dirty: 0, remoteId, syncedAt: sql`(datetime('now'))` as unknown as string })
      .where(eq(pagosProveedor.id, id))
      .then(() => undefined),
};
