import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { ShoppingCart, Zap, Sun, Moon } from 'lucide-react-native';
import { useDebounce } from 'use-debounce';
import { productosRepo, type Producto } from '../database/repositories/productosRepo';
import { clientesRepo } from '../database/repositories/clientesRepo';
import { ventasRepo, type ComprobanteVenta } from '../database/repositories/ventasRepo';
import { useCart } from '../features/carrito/useCart';
import { useTheme } from '../context/ThemeContext';
import type { ColorPalette } from '../theme';
import CartDrawer from '../features/carrito/CartDrawer';
import VentaExpressModal from '../features/carrito/VentaExpressModal';
import EditPrecioModal from '../features/carrito/EditPrecioModal';
import ComprobanteModal from '../components/ComprobanteModal';
import type { CartItem } from '../store/useYapaStore';

type Cliente = { id: number; nombre: string };

export default function HomeScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const cart = useCart();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [debouncedBusqueda] = useDebounce(busqueda, 300);
  const [cargando, setCargando] = useState(true);

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [esFiado, setEsFiado] = useState(false);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);

  const [showVentaExpress, setShowVentaExpress] = useState(false);
  const [itemEditandoPrecio, setItemEditandoPrecio] = useState<CartItem | null>(null);
  const [comprobanteActual, setComprobanteActual] = useState<ComprobanteVenta | null>(null);
  const [showComprobante, setShowComprobante] = useState(false);
  const [finalizando, setFinalizando] = useState(false);

  const cargarProductos = useCallback(async () => {
    setCargando(true);
    try {
      const list = await productosRepo.getAll(debouncedBusqueda);
      setProductos(list);
    } finally {
      setCargando(false);
    }
  }, [debouncedBusqueda]);

  const cargarClientes = useCallback(async () => {
    const list = await clientesRepo.getAll();
    setClientes(list.map((c) => ({ id: c.id, nombre: c.nombre })));
  }, []);

  useEffect(() => {
    cargarProductos();
  }, [cargarProductos]);

  useFocusEffect(
    useCallback(() => {
      cargarProductos();
    }, [cargarProductos])
  );

  useEffect(() => {
    if (cart.carritoVisible) cargarClientes();
  }, [cart.carritoVisible, cargarClientes]);

  const handleFinalizarVenta = async () => {
    if (!cart.metodoPago) return;
    setFinalizando(true);
    try {
      const result = await ventasRepo.registrarConDetalle(
        cart.total,
        cart.metodoPago,
        cart.items.map((it) => ({
          nombre: it.nombre,
          cantidad: it.cantidad,
          precio: it.precio,
          ...(it.id > 0 && { productoId: it.id }),
        })),
        esFiado && clienteSeleccionado
          ? { esFiado: true, clienteId: clienteSeleccionado.id }
          : undefined
      );
      cart.clearCart();
      setEsFiado(false);
      setClienteSeleccionado(null);
      setComprobanteActual(result);
      setShowComprobante(true);
      await cargarProductos();
    } catch {
      Alert.alert('Error', 'No se pudo registrar la venta. El carrito se conservó.');
    } finally {
      setFinalizando(false);
    }
  };

  const handleCrearCliente = async (nombre: string) => {
    const id = await clientesRepo.crear(nombre);
    const nuevo: Cliente = { id, nombre };
    setClientes((prev) => [...prev, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    setClienteSeleccionado(nuevo);
  };

  const handleVentaExpress = (monto: number) => {
    cart.addVentaExpress(monto);
    setShowVentaExpress(false);
    cart.abrirCarrito();
  };

  const handleGuardarPrecio = (itemId: number, precio: number) => {
    cart.updatePrecio(itemId, precio);
    setItemEditandoPrecio(null);
  };

  const renderProducto = ({ item }: { item: Producto }) => (
    <TouchableOpacity
      style={styles.productoCard}
      onPress={() => cart.addProducto(item.id, item.nombre, item.precioVenta)}
      activeOpacity={0.7}
    >
      <Text style={styles.productoNombre} numberOfLines={1}>
        {item.nombre}
      </Text>
      <Text style={styles.productoPrecio}>
        ${item.precioVenta.toFixed(2)} · stock {item.stock}
      </Text>
    </TouchableOpacity>
  );

  return (
    <KeyboardAvoidingView
      style={styles.contenedor}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Image
            source={require('../../assets/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <TouchableOpacity onPress={toggleTheme} style={styles.themeToggle} hitSlop={12}>
            {isDark ? (
              <Sun size={24} color={colors.textoSuave} />
            ) : (
              <Moon size={24} color={colors.textoSuave} />
            )}
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[styles.cajaBadge, !cart.cajaAbierta && styles.cajaCerrada]}
          onPress={cart.toggleCaja}
          activeOpacity={0.8}
        >
          <View style={[styles.cajaPunto, cart.cajaAbierta && styles.cajaPuntoOn]} />
          <Text style={styles.cajaTexto}>
            {cart.cajaAbierta ? 'Caja abierta' : 'Caja cerrada'}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.ventaExpressBtn}
        onPress={() => setShowVentaExpress(true)}
        activeOpacity={0.8}
      >
        <Zap size={22} color={colors.onPrimario} />
        <Text style={styles.ventaExpressTexto}>Venta rápida (monto manual)</Text>
      </TouchableOpacity>

      <View style={styles.buscadorWrap}>
        <TextInput
          style={styles.buscador}
          placeholder="Buscar producto..."
          placeholderTextColor={colors.textoSuave}
          value={busqueda}
          onChangeText={setBusqueda}
        />
      </View>

      <View style={styles.listaWrap}>
        {cargando ? (
          <ActivityIndicator size="large" color={colors.verde} style={styles.loader} />
        ) : (
          <FlatList
            data={productos}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderProducto}
            contentContainerStyle={styles.lista}
            ListEmptyComponent={
              <Text style={styles.empty}>No hay productos</Text>
            }
          />
        )}
      </View>

      <TouchableOpacity
        style={styles.carritoFab}
        onPress={cart.abrirCarrito}
        activeOpacity={0.9}
      >
        <ShoppingCart size={28} color={colors.onPrimario} />
        <Text style={styles.carritoFabTexto}>Ver carrito</Text>
        {cart.totalUnidades > 0 && (
          <View style={styles.carritoFabBadge}>
            <Text style={styles.carritoFabBadgeText}>{cart.totalUnidades}</Text>
          </View>
        )}
      </TouchableOpacity>

      <VentaExpressModal
        visible={showVentaExpress}
        onCerrar={() => setShowVentaExpress(false)}
        onConfirmar={handleVentaExpress}
      />

      <CartDrawer
        visible={cart.carritoVisible}
        items={cart.items}
        total={cart.total}
        metodoPago={cart.metodoPago}
        esFiado={esFiado}
        clienteSeleccionado={clienteSeleccionado}
        clientes={clientes}
        finalizando={finalizando}
        onCerrar={cart.cerrarCarrito}
        onUpdateCantidad={cart.updateCantidad}
        onRemoveProducto={cart.removeProducto}
        onSetMetodoPago={cart.setMetodoPago}
        onToggleFiado={setEsFiado}
        onSeleccionarCliente={setClienteSeleccionado}
        onCrearCliente={handleCrearCliente}
        onEditarPrecio={(item) => setItemEditandoPrecio(item)}
        onFinalizar={handleFinalizarVenta}
      />

      <EditPrecioModal
        item={itemEditandoPrecio}
        productos={productos.map((p) => ({
          id: p.id,
          precioVenta: p.precioVenta,
          precioCosto: p.precioCosto,
          precioMinimo: p.precioMinimo,
        }))}
        onCerrar={() => setItemEditandoPrecio(null)}
        onGuardar={handleGuardarPrecio}
      />

      <ComprobanteModal
        visible={showComprobante}
        comprobante={comprobanteActual}
        onCerrar={() => {
          setShowComprobante(false);
          setComprobanteActual(null);
        }}
      />
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    contenedor: { flex: 1, backgroundColor: colors.fondo },
    header: {
      paddingTop: 48, paddingBottom: 12, paddingHorizontal: 20,
      alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.borde,
    },
    headerRow: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'center', position: 'relative', width: '100%',
    },
    themeToggle: { position: 'absolute', right: 0, padding: 8 },
    logo: { width: 160, height: 56 },
    cajaBadge: {
      flexDirection: 'row', alignItems: 'center', marginTop: 10,
      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
      backgroundColor: colors.verde, gap: 8,
    },
    cajaCerrada: { backgroundColor: colors.textoSuave },
    cajaPunto: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.3)' },
    cajaPuntoOn: { backgroundColor: colors.fondo },
    cajaTexto: { fontSize: 14, fontWeight: '600', color: colors.onPrimario },
    ventaExpressBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 8, marginHorizontal: 20, marginTop: 14, paddingVertical: 14,
      borderRadius: 14, backgroundColor: colors.naranja,
    },
    ventaExpressTexto: { fontSize: 16, fontWeight: '600', color: colors.onPrimario },
    buscadorWrap: { paddingHorizontal: 20, paddingVertical: 12 },
    buscador: {
      backgroundColor: colors.superficie, borderRadius: 14,
      paddingHorizontal: 18, paddingVertical: 16, fontSize: 17,
      color: colors.texto, borderWidth: 1, borderColor: colors.borde,
    },
    listaWrap: { flex: 1, paddingHorizontal: 20 },
    loader: { marginTop: 40 },
    lista: { paddingBottom: 100 },
    productoCard: {
      backgroundColor: colors.superficie, borderRadius: 14,
      padding: 20, marginBottom: 12, borderWidth: 1, borderColor: colors.borde,
    },
    productoNombre: { fontSize: 18, fontWeight: '600', color: colors.texto },
    productoPrecio: { fontSize: 15, color: colors.textoSuave, marginTop: 4 },
    empty: { color: colors.textoSuave, fontSize: 16, textAlign: 'center', marginTop: 32 },
    carritoFab: {
      position: 'absolute', bottom: 24, left: 20, right: 20,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 10, backgroundColor: colors.verde, paddingVertical: 18, borderRadius: 16,
      shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25, shadowRadius: 8, elevation: 8,
    },
    carritoFabTexto: { fontSize: 18, fontWeight: '700', color: colors.onPrimario },
    carritoFabBadge: {
      backgroundColor: colors.fondo, minWidth: 24, height: 24,
      borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
    },
    carritoFabBadgeText: { color: colors.verde, fontWeight: '700', fontSize: 13 },
  });
}
