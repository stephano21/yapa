import { create } from 'zustand';
import type { MetodoPago } from '../database/db';

export interface CartItem {
  id: number;
  nombre: string;
  precio: number;
  cantidad: number;
}

interface YapaState {
  cajaAbierta: boolean;
  items: CartItem[];
  metodoPagoSeleccionado: MetodoPago | null;
  carritoVisible: boolean;

  abrirCaja: () => void;
  cerrarCaja: () => void;
  toggleCaja: () => void;

  addProducto: (id: number, nombre: string, precio: number) => void;
  removeProducto: (id: number) => void;
  updateCantidad: (id: number, delta: number) => void;
  updatePrecio: (id: number, precio: number) => void;
  clearCart: () => void;
  getTotal: () => number;

  addVentaExpress: (monto: number) => void;

  setMetodoPago: (metodo: MetodoPago | null) => void;
  abrirCarrito: () => void;
  cerrarCarrito: () => void;
  toggleCarrito: () => void;
}

export const useYapaStore = create<YapaState>((set, get) => ({
  cajaAbierta: true,
  items: [],
  metodoPagoSeleccionado: 'Efectivo',
  carritoVisible: false,

  abrirCaja: () => set({ cajaAbierta: true }),
  cerrarCaja: () => set({ cajaAbierta: false }),
  toggleCaja: () => set((s) => ({ cajaAbierta: !s.cajaAbierta })),

  addProducto: (id, nombre, precio) => {
    set((state) => {
      const existing = state.items.find((i) => i.id === id);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.id === id ? { ...i, cantidad: i.cantidad + 1 } : i
          ),
        };
      }
      return {
        items: [...state.items, { id, nombre, precio, cantidad: 1 }],
      };
    });
  },

  removeProducto: (id) => {
    set((state) => ({
      items: state.items.filter((i) => i.id !== id),
    }));
  },

  updateCantidad: (id, delta) => {
    set((state) => {
      const item = state.items.find((i) => i.id === id);
      if (!item) return state;
      const newQty = item.cantidad + delta;
      if (newQty <= 0) {
        return { items: state.items.filter((i) => i.id !== id) };
      }
      return {
        items: state.items.map((i) =>
          i.id === id ? { ...i, cantidad: newQty } : i
        ),
      };
    });
  },

  updatePrecio: (id, precio) => {
    if (precio <= 0 || !Number.isFinite(precio)) return;
    set((state) => ({
      items: state.items.map((i) =>
        i.id === id ? { ...i, precio } : i
      ),
    }));
  },

  clearCart: () =>
    set({ items: [], metodoPagoSeleccionado: 'Efectivo', carritoVisible: false }),

  getTotal: () => {
    return get().items.reduce(
      (sum, item) => sum + item.precio * item.cantidad,
      0
    );
  },

  addVentaExpress: (monto) => {
    if (monto <= 0) return;
    const id = -Date.now();
    set((state) => ({
      items: [
        ...state.items,
        { id, nombre: 'Venta rápida', precio: monto, cantidad: 1 },
      ],
    }));
  },

  setMetodoPago: (metodo) => set({ metodoPagoSeleccionado: metodo }),
  abrirCarrito: () => set({ carritoVisible: true }),
  cerrarCarrito: () => set({ carritoVisible: false }),
  toggleCarrito: () => set((s) => ({ carritoVisible: !s.carritoVisible })),
}));
