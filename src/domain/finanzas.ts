export const MARGEN_MINIMO_GLOBAL = 0.1;

export type ProductoParaMargen = {
  precioVenta: number;
  precioCosto: number;
  precioMinimo?: number | null;
};

export function calcularPrecioMinimo(producto: ProductoParaMargen): number {
  if (producto.precioMinimo != null) return producto.precioMinimo;
  const base = producto.precioCosto;
  const minimo = base * (1 + MARGEN_MINIMO_GLOBAL);
  if (!Number.isFinite(minimo) || minimo <= 0) return producto.precioVenta;
  return minimo;
}

export type VentaFiada = { id: number; total: number };

export type BalanceInputs = {
  deudaInicial: number;
  saldoAFavor: number;
  totalCobros: number;
  ventasFiadas: VentaFiada[];
};

/**
 * Distribuye los pagos FIFO sobre ventas fiadas.
 * Retorna un Map<ventaId, montoPendiente>.
 */
export function calcularPendientePorVenta(inputs: BalanceInputs): Map<number, number> {
  let remaining = inputs.totalCobros + inputs.saldoAFavor;
  remaining -= Math.min(remaining, inputs.deudaInicial);

  const map = new Map<number, number>();
  for (const v of inputs.ventasFiadas) {
    const paid = Math.min(remaining, v.total);
    map.set(v.id, v.total - paid);
    remaining -= paid;
  }
  return map;
}

export function calcularBalance(
  inputs: Omit<BalanceInputs, 'ventasFiadas'> & { totalVentasFiadas: number }
): number {
  return (
    inputs.deudaInicial +
    inputs.totalVentasFiadas -
    inputs.totalCobros -
    inputs.saldoAFavor
  );
}

export function calcularGananciaEstimada(
  totalVentas: number,
  productosLista: ProductoParaMargen[]
): number {
  if (productosLista.length === 0) return totalVentas;
  const margenPromedio =
    productosLista.reduce(
      (s, p) =>
        s + (p.precioVenta - p.precioCosto) / Math.max(p.precioVenta, 0.01),
      0
    ) / productosLista.length;
  return totalVentas * margenPromedio;
}
