import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { ShoppingCart, Zap, X, Plus, Minus, Sun, Moon } from 'lucide-react-native';
import { getProductos, registrarVentaConDetalle, type Producto } from '../database/db';
import { useYapaStore } from '../store/useYapaStore';
import type { MetodoPago } from '../database/db';
import { useTheme } from '../context/ThemeContext';
import type { ColorPalette } from '../theme';
import ComprobanteModal from '../components/ComprobanteModal';
import type { ComprobanteVenta } from '../database/db';

const METODOS: { metodo: MetodoPago; emoji: string; label: string }[] = [
  { metodo: 'Efectivo', emoji: '💵', label: 'Efectivo' },
  { metodo: 'Transferencia', emoji: '📱', label: 'Transferencia' },
  { metodo: 'Tarjeta', emoji: '💳', label: 'Tarjeta' },
];

export default function HomeScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [productos, setProductos] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [montoExpress, setMontoExpress] = useState('');
  const [showVentaExpress, setShowVentaExpress] = useState(false);
  const [comprobanteActual, setComprobanteActual] = useState<ComprobanteVenta | null>(null);
  const [showComprobante, setShowComprobante] = useState(false);

  const {
    cajaAbierta,
    items,
    carritoVisible,
    metodoPagoSeleccionado,
    addProducto,
    removeProducto,
    updateCantidad,
    getTotal,
    addVentaExpress,
    setMetodoPago,
    abrirCarrito,
    cerrarCarrito,
    clearCart,
    toggleCaja,
  } = useYapaStore();

  const total = getTotal();
  const totalUnidades = items.reduce((s, i) => s + i.cantidad, 0);

  const cargarProductos = useCallback(async () => {
    setCargando(true);
    try {
      const list = await getProductos(busqueda);
      setProductos(list);
    } finally {
      setCargando(false);
    }
  }, [busqueda]);

  useEffect(() => {
    cargarProductos();
  }, [cargarProductos]);

  const handleFinalizarVenta = async () => {
    if (items.length === 0 || !metodoPagoSeleccionado) return;
    const detalle = items.map((it) => ({
      nombre: it.nombre,
      cantidad: it.cantidad,
      precio: it.precio,
    }));
    const comprobante = await registrarVentaConDetalle(
      total,
      metodoPagoSeleccionado,
      detalle
    );
    clearCart();
    setComprobanteActual(comprobante);
    setShowComprobante(true);
  };

  const handleVentaExpress = () => {
    const monto = parseFloat(montoExpress.replace(',', '.'));
    if (!Number.isFinite(monto) || monto <= 0) return;
    addVentaExpress(monto);
    setMontoExpress('');
    setShowVentaExpress(false);
    abrirCarrito();
  };

  const renderProducto = ({ item }: { item: Producto }) => (
    <TouchableOpacity
      style={styles.productoCard}
      onPress={() => addProducto(item.id, item.nombre, item.precio_venta)}
      activeOpacity={0.7}
    >
      <Text style={styles.productoNombre} numberOfLines={1}>
        {item.nombre}
      </Text>
      <Text style={styles.productoPrecio}>
        ${item.precio_venta.toFixed(2)} · stock {item.stock}
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
          style={[styles.cajaBadge, !cajaAbierta && styles.cajaCerrada]}
          onPress={toggleCaja}
          activeOpacity={0.8}
        >
          <View style={[styles.cajaPunto, cajaAbierta && styles.cajaPuntoOn]} />
          <Text style={styles.cajaTexto}>
            {cajaAbierta ? 'Caja abierta' : 'Caja cerrada'}
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
        onPress={abrirCarrito}
        activeOpacity={0.9}
      >
        <ShoppingCart size={28} color={colors.onPrimario} />
        <Text style={styles.carritoFabTexto}>Ver carrito</Text>
        {totalUnidades > 0 && (
          <View style={styles.carritoFabBadge}>
            <Text style={styles.carritoFabBadgeText}>{totalUnidades}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Modal Venta Express */}
      <Modal
        visible={showVentaExpress}
        transparent
        animationType="fade"
        onRequestClose={() => setShowVentaExpress(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowVentaExpress(false)}
        >
          <Pressable style={styles.modalVentaExpress} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitulo}>Venta rápida</Text>
            <Text style={styles.modalSubtitulo}>Ingresa el monto a cobrar</Text>
            <TextInput
              style={styles.inputMonto}
              placeholder="Ej: 1.50"
              placeholderTextColor={colors.textoSuave}
              value={montoExpress}
              onChangeText={setMontoExpress}
              keyboardType="decimal-pad"
            />
            <TouchableOpacity
              style={styles.modalBtnConfirmar}
              onPress={handleVentaExpress}
              activeOpacity={0.85}
            >
              <Text style={styles.modalBtnTexto}>Añadir al carrito</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal / Drawer Carrito */}
      <Modal
        visible={carritoVisible}
        transparent
        animationType="slide"
        onRequestClose={cerrarCarrito}
      >
        <View style={styles.carritoOverlay}>
          <Pressable style={styles.carritoBackdrop} onPress={cerrarCarrito} />
          <View style={styles.carritoDrawer}>
            <View style={styles.carritoHandle} />
            <View style={styles.carritoHeader}>
              <Text style={styles.carritoTitle}>Carrito</Text>
              <TouchableOpacity onPress={cerrarCarrito} hitSlop={12}>
                <X size={28} color={colors.texto} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.carritoLista}
              contentContainerStyle={styles.carritoListaContent}
              showsVerticalScrollIndicator={false}
            >
              {items.length === 0 ? (
                <Text style={styles.carritoEmpty}>Carrito vacío</Text>
              ) : (
                items.map((item) => (
                  <View key={item.id} style={styles.carritoItem}>
                    <View style={styles.carritoItemInfo}>
                      <Text style={styles.carritoItemNombre} numberOfLines={1}>
                        {item.nombre}
                      </Text>
                      <Text style={styles.carritoItemPrecio}>
                        ${(item.precio * item.cantidad).toFixed(2)}
                      </Text>
                    </View>
                    <View style={styles.carritoItemCantidad}>
                      <TouchableOpacity
                        onPress={() => updateCantidad(item.id, -1)}
                        style={styles.cantidadBtn}
                      >
                        <Minus size={20} color={colors.texto} />
                      </TouchableOpacity>
                      <Text style={styles.cantidadNum}>{item.cantidad}</Text>
                      <TouchableOpacity
                        onPress={() => updateCantidad(item.id, 1)}
                        style={styles.cantidadBtn}
                      >
                        <Plus size={20} color={colors.texto} />
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      onPress={() => removeProducto(item.id)}
                      hitSlop={8}
                      style={styles.carritoItemEliminar}
                    >
                      <X size={18} color={colors.textoSuave} />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>

            <View style={styles.carritoFooter}>
              <View style={styles.carritoTotalRow}>
                <Text style={styles.carritoTotalLabel}>Total</Text>
                <Text style={styles.carritoTotalValor}>${total.toFixed(2)}</Text>
              </View>

              <Text style={styles.metodoLabel}>Método de pago</Text>
              <View style={styles.metodosRow}>
                {METODOS.map(({ metodo, emoji, label }) => (
                  <TouchableOpacity
                    key={metodo}
                    style={[
                      styles.metodoBtn,
                      metodoPagoSeleccionado === metodo && styles.metodoBtnActivo,
                    ]}
                    onPress={() => setMetodoPago(metodo)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.metodoEmoji}>{emoji}</Text>
                    <Text
                      style={[
                        styles.metodoTexto,
                        metodoPagoSeleccionado === metodo && styles.metodoTextoActivo,
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[
                  styles.btnFinalizar,
                  (items.length === 0 || !metodoPagoSeleccionado) &&
                    styles.btnFinalizarDisabled,
                ]}
                onPress={handleFinalizarVenta}
                disabled={items.length === 0 || !metodoPagoSeleccionado}
                activeOpacity={0.85}
              >
                <Text style={styles.btnFinalizarTexto}>Finalizar venta</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
  contenedor: {
    flex: 1,
    backgroundColor: colors.fondo,
  },
  header: {
    paddingTop: 48,
    paddingBottom: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.borde,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    width: '100%',
  },
  themeToggle: {
    position: 'absolute',
    right: 0,
    padding: 8,
  },
  logo: {
    width: 160,
    height: 56,
  },
  cajaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.verde,
    gap: 8,
  },
  cajaCerrada: {
    backgroundColor: colors.textoSuave,
  },
  cajaPunto: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  cajaPuntoOn: {
    backgroundColor: colors.fondo,
  },
  cajaTexto: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.onPrimario,
  },
  ventaExpressBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 14,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: colors.naranja,
  },
  ventaExpressTexto: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.onPrimario,
  },
  buscadorWrap: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  buscador: {
    backgroundColor: colors.superficie,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 17,
    color: colors.texto,
    borderWidth: 1,
    borderColor: colors.borde,
  },
  listaWrap: {
    flex: 1,
    paddingHorizontal: 20,
  },
  loader: { marginTop: 40 },
  lista: { paddingBottom: 100 },
  productoCard: {
    backgroundColor: colors.superficie,
    borderRadius: 14,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.borde,
  },
  productoNombre: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.texto,
  },
  productoPrecio: {
    fontSize: 15,
    color: colors.textoSuave,
    marginTop: 4,
  },
  empty: {
    color: colors.textoSuave,
    fontSize: 16,
    textAlign: 'center',
    marginTop: 32,
  },
  carritoFab: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.verde,
    paddingVertical: 18,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  carritoFabTexto: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.onPrimario,
  },
  carritoFabBadge: {
    backgroundColor: colors.fondo,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  carritoFabBadgeText: {
    color: colors.verde,
    fontWeight: '700',
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalVentaExpress: {
    backgroundColor: colors.superficie,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.borde,
  },
  modalTitulo: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.texto,
    textAlign: 'center',
  },
  modalSubtitulo: {
    fontSize: 14,
    color: colors.textoSuave,
    textAlign: 'center',
    marginTop: 8,
  },
  inputMonto: {
    backgroundColor: colors.fondo,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 24,
    color: colors.texto,
    marginTop: 20,
    textAlign: 'center',
  },
  modalBtnConfirmar: {
    backgroundColor: colors.naranja,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 20,
    alignItems: 'center',
  },
  modalBtnTexto: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.onPrimario,
  },
  carritoOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  carritoBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  carritoDrawer: {
    backgroundColor: colors.superficie,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingBottom: 34,
  },
  carritoHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borde,
    alignSelf: 'center',
    marginTop: 12,
  },
  carritoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  carritoTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.texto,
  },
  carritoLista: {
    maxHeight: 280,
  },
  carritoListaContent: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  carritoEmpty: {
    color: colors.textoSuave,
    fontSize: 16,
    textAlign: 'center',
    paddingVertical: 32,
  },
  carritoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.fondo,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.borde,
  },
  carritoItemInfo: {
    flex: 1,
  },
  carritoItemNombre: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.texto,
  },
  carritoItemPrecio: {
    fontSize: 14,
    color: colors.textoSuave,
    marginTop: 2,
  },
  carritoItemCantidad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cantidadBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.superficie,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cantidadNum: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.texto,
    minWidth: 24,
    textAlign: 'center',
  },
  carritoItemEliminar: {
    padding: 8,
    marginLeft: 4,
  },
  carritoFooter: {
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.borde,
  },
  carritoTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  carritoTotalLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textoSuave,
  },
  carritoTotalValor: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.verde,
  },
  metodoLabel: {
    fontSize: 14,
    color: colors.textoSuave,
    marginBottom: 10,
  },
  metodosRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  metodoBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: colors.fondo,
    borderWidth: 2,
    borderColor: colors.borde,
  },
  metodoBtnActivo: {
    borderColor: colors.verde,
    backgroundColor: 'rgba(168, 198, 159, 0.2)',
  },
  metodoEmoji: {
    fontSize: 22,
    marginBottom: 4,
  },
  metodoTexto: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textoSuave,
  },
  metodoTextoActivo: {
    color: colors.verde,
  },
  btnFinalizar: {
    backgroundColor: colors.naranja,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  btnFinalizarDisabled: {
    backgroundColor: colors.borde,
    opacity: 0.7,
  },
  btnFinalizarTexto: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.onPrimario,
  },
  });
}
