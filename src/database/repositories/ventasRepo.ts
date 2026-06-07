import { db } from '../drizzle/client';
import { ventas, ventaDetalle, productos } from '../drizzle/schema';
import { eq, sql, and } from 'drizzle-orm';
import { getFechaHoraLocalParaDb, getFechaLocalYYYYMMDD } from '../../utils/dateLocal';

export type Venta = typeof ventas.$inferSelect;
export type VentaDetalleRow = typeof ventaDetalle.$inferSelect;

export type ItemVentaInput = {
  nombre: string;
  cantidad: number;
  precio: number;
  productoId?: number;
};

export type ComprobanteVenta = {
  id: number;
  fecha: string;
  total: number;
  metodoPago: string;
  items: {
    descripcion: string;
    cantidad: number;
    precio_unitario: number;
    subtotal: number;
  }[];
};

export type ResumenVentas = {
  totalVentas: number;
  totalCobrado: number;
  porMetodo: Record<string, number>;
  cantidadVentas: number;
};

export const ventasRepo = {
  registrarConDetalle: (
    total: number,
    metodoPago: string,
    items: ItemVentaInput[],
    opciones?: { esFiado?: boolean; clienteId?: number }
  ): Promise<ComprobanteVenta> => {
    return db.transaction(async (tx) => {
      const fecha = getFechaHoraLocalParaDb();
      const estado = opciones?.esFiado ? 'fiado' : 'cobrado';
      const clienteId =
        opciones?.esFiado && opciones?.clienteId != null ? opciones.clienteId : null;

      const [{ ventaId }] = await tx
        .insert(ventas)
        .values({ fecha, total, metodoPago, estado, clienteId })
        .returning({ ventaId: ventas.id });

      for (const it of items) {
        const subtotal = it.precio * it.cantidad;
        const productoId =
          it.productoId != null && it.productoId > 0 ? it.productoId : null;

        await tx.insert(ventaDetalle).values({
          ventaId,
          productoId,
          descripcion: it.nombre,
          cantidad: it.cantidad,
          precioUnitario: it.precio,
          subtotal,
        });

        if (productoId) {
          await tx
            .update(productos)
            .set({
              stock: sql`MAX(0, COALESCE(${productos.stock}, 0) - ${it.cantidad})` as unknown as number,
            })
            .where(eq(productos.id, productoId));
        }
      }

      return {
        id: ventaId,
        fecha,
        total,
        metodoPago,
        items: items.map((it) => ({
          descripcion: it.nombre,
          cantidad: it.cantidad,
          precio_unitario: it.precio,
          subtotal: it.precio * it.cantidad,
        })),
      };
    });
  },

  getHoy: (): Promise<{ total: number; metodoPago: string; estado: string | null }[]> => {
    const hoy = getFechaLocalYYYYMMDD();
    return db
      .select({
        total: ventas.total,
        metodoPago: ventas.metodoPago,
        estado: ventas.estado,
      })
      .from(ventas)
      .where(sql`date(${ventas.fecha}) = ${hoy}`);
  },

  getDelDiaConId: async (
    fecha?: string
  ): Promise<{ id: number; fecha: string; total: number; metodo_pago: string }[]> => {
    const dia = fecha ?? getFechaLocalYYYYMMDD();
    const rows = db.all(sql`
      SELECT id, fecha, total, metodo_pago
      FROM ventas
      WHERE date(fecha) = ${dia}
      ORDER BY fecha DESC
    `);
    return rows as { id: number; fecha: string; total: number; metodo_pago: string }[];
  },

  getFiadasPorCliente: (
    clienteId: number
  ): Promise<{ id: number; fecha: string; total: number }[]> =>
    db
      .select({ id: ventas.id, fecha: ventas.fecha, total: ventas.total })
      .from(ventas)
      .where(
        and(
          eq(ventas.clienteId, clienteId),
          sql`COALESCE(${ventas.estado}, 'cobrado') = 'fiado'`
        )
      )
      .orderBy(sql`${ventas.fecha} DESC`),

  getComprobantePorId: async (ventaId: number): Promise<ComprobanteVenta | null> => {
    const venta = await db
      .select()
      .from(ventas)
      .where(eq(ventas.id, ventaId))
      .then((r) => r[0] ?? null);
    if (!venta) return null;

    const items = await db
      .all(sql`
        SELECT descripcion, cantidad, precio_unitario, subtotal
        FROM venta_detalle
        WHERE venta_id = ${ventaId}
        ORDER BY id
      `) as { descripcion: string; cantidad: number; precio_unitario: number; subtotal: number }[];

    return {
      id: venta.id,
      fecha: venta.fecha,
      total: venta.total,
      metodoPago: venta.metodoPago,
      items,
    };
  },

  getResumenPorFecha: async (
    fecha: string
  ): Promise<ResumenVentas & { totalFiadoPendiente: number }> => {
    const rows = await db
      .all(sql`
        SELECT total, metodo_pago, COALESCE(estado, 'cobrado') as estado
        FROM ventas
        WHERE date(fecha) = ${fecha}
      `) as { total: number; metodo_pago: string; estado: string }[];

    const totalVentas = rows.reduce((s, v) => s + v.total, 0);
    const totalCobrado = rows
      .filter((v) => v.estado === 'cobrado')
      .reduce((s, v) => s + v.total, 0);
    const porMetodo: Record<string, number> = {};
    rows.forEach((v) => {
      porMetodo[v.metodo_pago] = (porMetodo[v.metodo_pago] ?? 0) + v.total;
    });

    return {
      totalVentas,
      totalCobrado,
      porMetodo,
      cantidadVentas: rows.length,
      totalFiadoPendiente: totalVentas - totalCobrado,
    };
  },

  getDiasConVentas: async (
    limite: number
  ): Promise<{ fecha: string; totalVentas: number; cantidadVentas: number }[]> => {
    const hoy = getFechaLocalYYYYMMDD();
    const rows = await db.all(sql`
      SELECT date(fecha) as fecha, SUM(total) as total, COUNT(*) as count
      FROM ventas
      WHERE date(fecha) != ${hoy}
      GROUP BY date(fecha)
      ORDER BY fecha DESC
      LIMIT ${limite}
    `) as { fecha: string; total: number; count: number }[];

    return rows.map((r) => ({
      fecha: r.fecha,
      totalVentas: r.total,
      cantidadVentas: r.count,
    }));
  },

  getDirty: (): Promise<Venta[]> => db.select().from(ventas).where(eq(ventas.dirty, 1)),

  getDirtyDetalle: (ventaId: number): Promise<VentaDetalleRow[]> =>
    db
      .select()
      .from(ventaDetalle)
      .where(eq(ventaDetalle.ventaId, ventaId)),

  marcarSynced: (id: number, remoteId: string): Promise<void> =>
    db
      .update(ventas)
      .set({ dirty: 0, remoteId, syncedAt: sql`(datetime('now'))` as unknown as string })
      .where(eq(ventas.id, id))
      .then(() => undefined),

  marcarDetalleSynced: (ventaId: number): Promise<void> =>
    db
      .update(ventaDetalle)
      .set({ dirty: 0, syncedAt: sql`(datetime('now'))` as unknown as string })
      .where(eq(ventaDetalle.ventaId, ventaId))
      .then(() => undefined),
};
