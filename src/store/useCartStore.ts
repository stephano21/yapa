import { create } from 'zustand';

export interface CartItem {
  id: number;
  nombre: string;
  precio: number;
  cantidad: number;
}

interface CartState {
  items: CartItem[];
  addProduct: (id: number, nombre: string, precio: number) => void;
  removeProduct: (id: number) => void;
  updateQuantity: (id: number, delta: number) => void;
  clearCart: () => void;
  getTotal: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],

  addProduct: (id, nombre, precio) => {
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

  removeProduct: (id) => {
    set((state) => ({
      items: state.items.filter((i) => i.id !== id),
    }));
  },

  updateQuantity: (id, delta) => {
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

  clearCart: () => set({ items: [] }),

  getTotal: () => {
    return get().items.reduce(
      (sum, item) => sum + item.precio * item.cantidad,
      0
    );
  },
}));
