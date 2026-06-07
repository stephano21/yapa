import { useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Pressable,
} from 'react-native';
import { X, Plus, Minus } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import type { ColorPalette } from '../../theme';
import type { CartItem } from '../../store/useYapaStore';
import type { MetodoPago } from '../../database/db';

type Cliente = { id: number; nombre: string };

type Props = {
  visible: boolean;
  items: CartItem[];
  total: number;
  metodoPago: MetodoPago | null;
  esFiado: boolean;
  clienteSeleccionado: Cliente | null;
  clientes: Cliente[];
  finalizando: boolean;
  onCerrar: () => void;
  onUpdateCantidad: (id: number, delta: number) => void;
  onRemoveProducto: (id: number) => void;
  onSetMetodoPago: (m: MetodoPago) => void;
  onToggleFiado: (v: boolean) => void;
  onSeleccionarCliente: (c: Cliente | null) => void;
  onCrearCliente: (nombre: string) => Promise<void>;
  onEditarPrecio: (item: CartItem) => void;
  onFinalizar: () => Promise<void>;
};

const METODOS: { metodo: MetodoPago; emoji: string; label: string }[] = [
  { metodo: 'Efectivo', emoji: '💵', label: 'Efectivo' },
  { metodo: 'Transferencia', emoji: '📱', label: 'Transferencia' },
];

export default function CartDrawer({
  visible,
  items,
  total,
  metodoPago,
  esFiado,
  clienteSeleccionado,
  clientes,
  finalizando,
  onCerrar,
  onUpdateCantidad,
  onRemoveProducto,
  onSetMetodoPago,
  onToggleFiado,
  onSeleccionarCliente,
  onCrearCliente,
  onEditarPrecio,
  onFinalizar,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [mostrarAgregar, setMostrarAgregar] = useState(false);

  const handleCrearCliente = async () => {
    const nombre = nuevoNombre.trim();
    if (!nombre) return;
    await onCrearCliente(nombre);
    setNuevoNombre('');
    setMostrarAgregar(false);
  };

  const puedeFinalizarVenta =
    items.length > 0 &&
    !!metodoPago &&
    (!esFiado || !!clienteSeleccionado);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCerrar}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onCerrar} />
        <View style={styles.drawer}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.titulo}>Carrito</Text>
            <TouchableOpacity onPress={onCerrar} hitSlop={12}>
              <X size={28} color={colors.texto} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.lista}
            contentContainerStyle={styles.listaContent}
            showsVerticalScrollIndicator={false}
          >
            {items.length === 0 ? (
              <Text style={styles.empty}>Carrito vacío</Text>
            ) : (
              items.map((item) => (
                <View key={item.id} style={styles.item}>
                  <View style={styles.itemInfo}>
                    <TouchableOpacity onPress={() => onEditarPrecio(item)}>
                      <Text style={styles.itemNombre} numberOfLines={1}>
                        {item.nombre}
                      </Text>
                      <Text style={styles.itemPrecio}>
                        ${item.precio.toFixed(2)} x {item.cantidad} = $
                        {(item.precio * item.cantidad).toFixed(2)}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.itemCantidad}>
                    <TouchableOpacity onPress={() => onUpdateCantidad(item.id, -1)} style={styles.cantidadBtn}>
                      <Minus size={20} color={colors.texto} />
                    </TouchableOpacity>
                    <Text style={styles.cantidadNum}>{item.cantidad}</Text>
                    <TouchableOpacity onPress={() => onUpdateCantidad(item.id, 1)} style={styles.cantidadBtn}>
                      <Plus size={20} color={colors.texto} />
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity onPress={() => onRemoveProducto(item.id)} hitSlop={8} style={styles.itemEliminar}>
                    <X size={18} color={colors.textoSuave} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>

          <View style={styles.footer}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValor}>${total.toFixed(2)}</Text>
            </View>

            <Text style={styles.label}>Método de pago</Text>
            <View style={styles.metodosRow}>
              {METODOS.map(({ metodo, emoji, label }) => (
                <TouchableOpacity
                  key={metodo}
                  style={[styles.metodoBtn, metodoPago === metodo && styles.metodoBtnActivo]}
                  onPress={() => onSetMetodoPago(metodo)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.metodoEmoji}>{emoji}</Text>
                  <Text style={[styles.metodoTexto, metodoPago === metodo && styles.metodoTextoActivo]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>¿Cobrar ahora o dejar fiado?</Text>
            <View style={styles.filaCobrarFiado}>
              <TouchableOpacity
                style={[styles.btnCobrarFiado, !esFiado && styles.btnCobrarFiadoActivo]}
                onPress={() => { onToggleFiado(false); onSeleccionarCliente(null); }}
              >
                <Text style={[styles.btnCobrarFiadoTexto, !esFiado && styles.btnCobrarFiadoTextoActivo]}>
                  Cobrar ahora
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnCobrarFiado, esFiado && styles.btnCobrarFiadoActivo]}
                onPress={() => onToggleFiado(true)}
              >
                <Text style={[styles.btnCobrarFiadoTexto, esFiado && styles.btnCobrarFiadoTextoActivo]}>
                  Dejar fiado
                </Text>
              </TouchableOpacity>
            </View>

            {esFiado && (
              <View style={styles.clienteSection}>
                <Text style={styles.label}>Cliente</Text>
                {!mostrarAgregar ? (
                  <>
                    <ScrollView style={styles.clientesList} nestedScrollEnabled>
                      {clientes.map((c) => (
                        <TouchableOpacity
                          key={c.id}
                          style={[styles.clienteChip, clienteSeleccionado?.id === c.id && styles.clienteChipActivo]}
                          onPress={() => onSeleccionarCliente(c)}
                        >
                          <Text style={[styles.clienteChipTexto, clienteSeleccionado?.id === c.id && styles.clienteChipTextoActivo]} numberOfLines={1}>
                            {c.nombre}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                    <TouchableOpacity style={styles.btnAgregarCliente} onPress={() => setMostrarAgregar(true)}>
                      <Text style={styles.btnAgregarClienteTexto}>+ Agregar cliente</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <View style={styles.agregarClienteRow}>
                    <TextInput
                      style={styles.agregarClienteInput}
                      placeholder="Nombre del cliente"
                      placeholderTextColor={colors.textoSuave}
                      value={nuevoNombre}
                      onChangeText={setNuevoNombre}
                      autoFocus
                    />
                    <TouchableOpacity style={styles.btnGuardarCliente} onPress={handleCrearCliente}>
                      <Text style={styles.btnGuardarClienteTexto}>Guardar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { setMostrarAgregar(false); setNuevoNombre(''); }}>
                      <X size={22} color={colors.textoSuave} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            <TouchableOpacity
              style={[styles.btnFinalizar, (!puedeFinalizarVenta || finalizando) && styles.btnFinalizarDisabled]}
              onPress={onFinalizar}
              disabled={!puedeFinalizarVenta || finalizando}
              activeOpacity={0.85}
            >
              <Text style={styles.btnFinalizarTexto}>
                {finalizando ? 'Registrando...' : esFiado ? 'Dejar fiado' : 'Finalizar venta'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
    drawer: {
      backgroundColor: colors.superficie,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: '85%',
      paddingBottom: 34,
    },
    handle: {
      width: 40, height: 4, borderRadius: 2,
      backgroundColor: colors.borde, alignSelf: 'center', marginTop: 12,
    },
    header: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
    },
    titulo: { fontSize: 22, fontWeight: '700', color: colors.texto },
    lista: { maxHeight: 280 },
    listaContent: { paddingHorizontal: 20, paddingBottom: 16 },
    empty: { color: colors.textoSuave, fontSize: 16, textAlign: 'center', paddingVertical: 32 },
    item: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.fondo, borderRadius: 12, padding: 14,
      marginBottom: 10, borderWidth: 1, borderColor: colors.borde,
    },
    itemInfo: { flex: 1 },
    itemNombre: { fontSize: 16, fontWeight: '600', color: colors.texto },
    itemPrecio: { fontSize: 14, color: colors.textoSuave, marginTop: 2 },
    itemCantidad: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cantidadBtn: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: colors.superficie, alignItems: 'center', justifyContent: 'center',
    },
    cantidadNum: { fontSize: 16, fontWeight: '600', color: colors.texto, minWidth: 24, textAlign: 'center' },
    itemEliminar: { padding: 8, marginLeft: 4 },
    footer: { paddingHorizontal: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.borde },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    totalLabel: { fontSize: 18, fontWeight: '600', color: colors.textoSuave },
    totalValor: { fontSize: 24, fontWeight: '700', color: colors.verde },
    label: { fontSize: 14, color: colors.textoSuave, marginBottom: 10 },
    metodosRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    metodoBtn: {
      flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 14,
      backgroundColor: colors.fondo, borderWidth: 2, borderColor: colors.borde,
    },
    metodoBtnActivo: { borderColor: colors.verde, backgroundColor: 'rgba(168, 198, 159, 0.2)' },
    metodoEmoji: { fontSize: 22, marginBottom: 4 },
    metodoTexto: { fontSize: 12, fontWeight: '600', color: colors.textoSuave },
    metodoTextoActivo: { color: colors.verde },
    filaCobrarFiado: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    btnCobrarFiado: {
      flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
      backgroundColor: colors.fondo, borderWidth: 2, borderColor: colors.borde,
    },
    btnCobrarFiadoActivo: { borderColor: colors.verde, backgroundColor: 'rgba(168, 198, 159, 0.2)' },
    btnCobrarFiadoTexto: { fontSize: 13, fontWeight: '600', color: colors.textoSuave },
    btnCobrarFiadoTextoActivo: { color: colors.verde },
    clienteSection: { marginBottom: 12 },
    clientesList: { maxHeight: 100, marginBottom: 8 },
    clienteChip: {
      paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10,
      backgroundColor: colors.fondo, borderWidth: 1, borderColor: colors.borde, marginBottom: 6,
    },
    clienteChipActivo: { borderColor: colors.verde, backgroundColor: 'rgba(168, 198, 159, 0.2)' },
    clienteChipTexto: { fontSize: 14, color: colors.texto },
    clienteChipTextoActivo: { color: colors.verde, fontWeight: '600' },
    btnAgregarCliente: { paddingVertical: 10, alignItems: 'center' },
    btnAgregarClienteTexto: { fontSize: 14, fontWeight: '600', color: colors.verde },
    agregarClienteRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    agregarClienteInput: {
      flex: 1, backgroundColor: colors.fondo, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
      color: colors.texto, borderWidth: 1, borderColor: colors.borde,
    },
    btnGuardarCliente: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.verde },
    btnGuardarClienteTexto: { fontSize: 14, fontWeight: '600', color: colors.onPrimario },
    btnFinalizar: { backgroundColor: colors.naranja, borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
    btnFinalizarDisabled: { backgroundColor: colors.borde, opacity: 0.7 },
    btnFinalizarTexto: { fontSize: 18, fontWeight: '700', color: colors.onPrimario },
  });
}
