import { db } from './drizzle/client';
import {
  productos,
  ventas,
  ventaDetalle,
  clientes,
  cobros,
  unidadesMedida,
  proveedores,
  comprasProveedor,
  pagosProveedor,
  syncState,
} from './drizzle/schema';
import { useYapaStore } from '../store/useYapaStore';

/** true si hay algo cacheado localmente (catálogo o clientes). Útil para detectar una base con
 * datos de antes de que existiera el rastreo de tenant por dispositivo. */
export async function hasAnyLocalData(): Promise<boolean> {
  const [p, c] = await Promise.all([
    db.select({ id: productos.id }).from(productos).limit(1),
    db.select({ id: clientes.id }).from(clientes).limit(1),
  ]);
  return p.length > 0 || c.length > 0;
}

/**
 * Vacía toda la base local (catálogo, ventas, clientes, proveedores, cursores de sync) y el
 * carrito en memoria. Las tablas locales no tienen columna tenant_id — se asumió un solo
 * negocio por dispositivo — así que sin esto, cambiar de cuenta en el mismo teléfono deja ver
 * (y hasta vender) productos/clientes del negocio anterior. Se llama al iniciar sesión con un
 * tenant distinto al de la última sesión guardada; cualquier cambio local sin sincronizar del
 * tenant anterior se pierde (no hay forma de reconciliarlo contra la cuenta nueva).
 */
export async function resetLocalDatabase(): Promise<void> {
  await db.delete(ventaDetalle);
  await db.delete(ventas);
  await db.delete(cobros);
  await db.delete(comprasProveedor);
  await db.delete(pagosProveedor);
  await db.delete(productos);
  await db.delete(clientes);
  await db.delete(unidadesMedida);
  await db.delete(proveedores);
  await db.delete(syncState);
  useYapaStore.getState().clearCart();
}
