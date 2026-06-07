import { useYapaStore } from '../../store/useYapaStore';

export function useCart() {
  const store = useYapaStore();
  return {
    items: store.items,
    total: store.getTotal(),
    totalUnidades: store.items.reduce((s, i) => s + i.cantidad, 0),
    metodoPago: store.metodoPagoSeleccionado,
    carritoVisible: store.carritoVisible,
    cajaAbierta: store.cajaAbierta,
    addProducto: store.addProducto,
    removeProducto: store.removeProducto,
    updateCantidad: store.updateCantidad,
    updatePrecio: store.updatePrecio,
    clearCart: store.clearCart,
    addVentaExpress: store.addVentaExpress,
    setMetodoPago: store.setMetodoPago,
    abrirCarrito: store.abrirCarrito,
    cerrarCarrito: store.cerrarCarrito,
    toggleCaja: store.toggleCaja,
  };
}
