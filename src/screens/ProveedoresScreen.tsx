import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ChevronLeft, Plus, Truck, X, Paperclip, Phone } from 'lucide-react-native';
import {
  proveedoresRepo,
  type ProveedorConBalance,
} from '../database/repositories/proveedoresRepo';
import { pagosProveedorRepo } from '../database/repositories/pagosProveedorRepo';
import { comprasProveedorRepo } from '../database/repositories/comprasProveedorRepo';
import PagoProveedorModal from '../components/PagoProveedorModal';
import { useTheme } from '../context/ThemeContext';
import type { ColorPalette } from '../theme';

type Movimiento = {
  clave: string;
  tipo: 'pago' | 'compra';
  fecha: string;
  monto: number;
  metodo: string | null;
  nota: string | null;
  /** Foto del comprobante: la local (aún sin subir) o la URL firmada del servidor. */
  imagen: string | null;
};

function formatFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-EC', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function textoBalance(balance: number): string {
  if (Math.abs(balance) < 0.005) return 'Sin deuda';
  return balance > 0 ? `Le debes $${balance.toFixed(2)}` : `A tu favor $${Math.abs(balance).toFixed(2)}`;
}

function parseMonto(v: string): number {
  return parseFloat(v.replace(',', '.'));
}

export default function ProveedoresScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation();

  const [proveedores, setProveedores] = useState<ProveedorConBalance[]>([]);
  const [cargando, setCargando] = useState(true);

  // Alta / edición
  const [showForm, setShowForm] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [notas, setNotas] = useState('');
  const [deudaInicial, setDeudaInicial] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Detalle
  const [detalle, setDetalle] = useState<ProveedorConBalance | null>(null);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [imagenGrande, setImagenGrande] = useState<string | null>(null);

  // Pago / compra
  const [pagoTarget, setPagoTarget] = useState<ProveedorConBalance | null>(null);
  const [compraTarget, setCompraTarget] = useState<ProveedorConBalance | null>(null);
  const [montoCompra, setMontoCompra] = useState('');
  const [notaCompra, setNotaCompra] = useState('');

  const totalDeuda = useMemo(
    () => proveedores.reduce((s, p) => s + (p.balance > 0 ? p.balance : 0), 0),
    [proveedores]
  );

  const cargar = useCallback(async () => {
    try {
      setProveedores(await proveedoresRepo.getConBalance());
    } catch (e) {
      console.warn('[ProveedoresScreen] cargar', e);
      Alert.alert('Proveedores', 'No se pudieron cargar los proveedores.');
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );

  const cargarDetalle = useCallback(async (proveedorId: number) => {
    setCargandoDetalle(true);
    try {
      const [pagos, compras, lista] = await Promise.all([
        pagosProveedorRepo.getPorProveedor(proveedorId),
        comprasProveedorRepo.getPorProveedor(proveedorId),
        proveedoresRepo.getConBalance(),
      ]);
      const movs: Movimiento[] = [
        ...pagos.map((p) => ({
          clave: `p${p.id}`,
          tipo: 'pago' as const,
          fecha: p.fecha,
          monto: p.monto,
          metodo: p.metodoPago,
          nota: p.nota,
          imagen: p.comprobanteUri ?? p.comprobanteUrl,
        })),
        ...compras.map((c) => ({
          clave: `c${c.id}`,
          tipo: 'compra' as const,
          fecha: c.fecha,
          monto: c.monto,
          metodo: null,
          nota: c.nota,
          imagen: null,
        })),
      ].sort((a, b) => b.fecha.localeCompare(a.fecha));
      setMovimientos(movs);
      setProveedores(lista);
      // Solo refresca el saldo si el detalle sigue abierto: no debe reabrirse solo tras cerrarlo (p. ej. al abrir el pago).
      setDetalle((cur) => (cur && cur.id === proveedorId ? (lista.find((p) => p.id === proveedorId) ?? cur) : cur));
    } finally {
      setCargandoDetalle(false);
    }
  }, []);

  const abrirDetalle = (p: ProveedorConBalance) => {
    setDetalle(p);
    setMovimientos([]);
    void cargarDetalle(p.id);
  };

  /** iOS no permite un Modal sobre otro: el detalle se cierra antes de abrir pago/compra/edición y se reabre al volver. */
  const volverAlDetalle = useCallback(async (proveedorId: number) => {
    const lista = await proveedoresRepo.getConBalance();
    setProveedores(lista);
    const p = lista.find((x) => x.id === proveedorId);
    if (p) {
      setDetalle(p);
      setMovimientos([]);
      void cargarDetalle(proveedorId);
    }
  }, [cargarDetalle]);

  const abrirPago = (p: ProveedorConBalance) => {
    setDetalle(null);
    setPagoTarget(p);
  };

  const abrirCompra = (p: ProveedorConBalance) => {
    setMontoCompra('');
    setNotaCompra('');
    setDetalle(null);
    setCompraTarget(p);
  };

  const cerrarPago = () => {
    const id = pagoTarget?.id;
    setPagoTarget(null);
    if (id != null) void volverAlDetalle(id);
  };

  const cerrarCompra = () => {
    const id = compraTarget?.id;
    setCompraTarget(null);
    if (id != null) void volverAlDetalle(id);
  };

  const abrirNuevo = () => {
    setEditandoId(null);
    setNombre('');
    setTelefono('');
    setNotas('');
    setDeudaInicial('');
    setShowForm(true);
  };

  const abrirEditar = (p: ProveedorConBalance) => {
    setEditandoId(p.id);
    setNombre(p.nombre);
    setTelefono(p.telefono ?? '');
    setNotas(p.notas ?? '');
    setDeudaInicial(p.deuda_inicial > 0 ? String(p.deuda_inicial) : '');
    setDetalle(null);
    setShowForm(true);
  };

  const guardarProveedor = async () => {
    const n = nombre.trim();
    if (!n) {
      Alert.alert('Proveedor', 'Ingresa el nombre del proveedor.');
      return;
    }
    const deuda = deudaInicial.trim() ? parseMonto(deudaInicial) : 0;
    if (!Number.isFinite(deuda) || deuda < 0) {
      Alert.alert('Proveedor', 'La deuda inicial debe ser un monto válido.');
      return;
    }
    setGuardando(true);
    try {
      const datos = { nombre: n, telefono, notas, deudaInicial: deuda };
      if (editandoId != null) await proveedoresRepo.actualizar(editandoId, datos);
      else await proveedoresRepo.crear(datos);
      setShowForm(false);
      await cargar();
    } catch (e) {
      console.warn('[ProveedoresScreen] guardarProveedor', e);
      Alert.alert('Proveedor', 'No se pudo guardar el proveedor.');
    } finally {
      setGuardando(false);
    }
  };

  const guardarCompra = async () => {
    if (!compraTarget) return;
    const monto = parseMonto(montoCompra);
    if (!Number.isFinite(monto) || monto <= 0) {
      Alert.alert('Compra a crédito', 'Ingresa un monto mayor a cero.');
      return;
    }
    const id = compraTarget.id;
    try {
      await comprasProveedorRepo.registrar(id, monto, notaCompra);
      setCompraTarget(null);
      setMontoCompra('');
      setNotaCompra('');
      await volverAlDetalle(id);
    } catch (e) {
      console.warn('[ProveedoresScreen] guardarCompra', e);
      Alert.alert('Compra a crédito', 'No se pudo registrar la compra.');
    }
  };

  const onPagoGuardado = async () => {
    const id = pagoTarget?.id;
    setPagoTarget(null);
    if (id != null) await volverAlDetalle(id);
    else await cargar();
  };

  const renderItem = ({ item }: { item: ProveedorConBalance }) => (
    <TouchableOpacity style={styles.fila} onPress={() => abrirDetalle(item)} activeOpacity={0.75}>
      <View style={styles.filaIcono}>
        <Truck size={20} color={colors.verde} />
      </View>
      <View style={styles.filaTexto}>
        <Text style={styles.filaNombre} numberOfLines={1}>
          {item.nombre}
        </Text>
        <Text style={[styles.filaSub, item.balance > 0.005 && styles.filaSubDeuda]}>
          {textoBalance(item.balance)}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.btnAtras}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.7}
        >
          <ChevronLeft size={28} color={colors.texto} />
        </TouchableOpacity>
        <Text style={styles.tituloPantalla} numberOfLines={1}>
          Proveedores
        </Text>
        <TouchableOpacity style={styles.btnNuevo} onPress={abrirNuevo} activeOpacity={0.85}>
          <Plus size={22} color={colors.onPrimario} />
          <Text style={styles.btnNuevoTexto}>Nuevo</Text>
        </TouchableOpacity>
      </View>

      {cargando ? (
        <ActivityIndicator size="large" color={colors.verde} style={styles.loader} />
      ) : (
        <FlatList
          data={proveedores}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={styles.listaContent}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListHeaderComponent={
            proveedores.length > 0 ? (
              <View style={styles.resumen}>
                <Text style={styles.resumenLabel}>Total que debes a proveedores</Text>
                <Text style={styles.resumenValor}>${totalDeuda.toFixed(2)}</Text>
              </View>
            ) : null
          }
          renderItem={renderItem}
          ListEmptyComponent={
            <Text style={styles.empty}>
              Aún no tienes proveedores. Agrega uno para registrar tus pagos y compras a crédito.
            </Text>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Alta / edición */}
      <Modal visible={showForm} transparent animationType="fade" onRequestClose={() => setShowForm(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowForm(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitulo}>{editandoId != null ? 'Editar proveedor' : 'Nuevo proveedor'}</Text>
                <TouchableOpacity onPress={() => setShowForm(false)}>
                  <X size={24} color={colors.texto} />
                </TouchableOpacity>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={styles.label}>Nombre</Text>
                <TextInput
                  style={styles.input}
                  value={nombre}
                  onChangeText={setNombre}
                  placeholder="Ej: Distribuidora Andina"
                  placeholderTextColor={colors.textoSuave}
                />
                <Text style={styles.label}>Teléfono (opcional)</Text>
                <TextInput
                  style={styles.input}
                  value={telefono}
                  onChangeText={setTelefono}
                  keyboardType="phone-pad"
                  placeholder="099 999 9999"
                  placeholderTextColor={colors.textoSuave}
                />
                <Text style={styles.label}>Deuda anterior a la app ($, opcional)</Text>
                <TextInput
                  style={styles.input}
                  value={deudaInicial}
                  onChangeText={setDeudaInicial}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.textoSuave}
                />
                <Text style={styles.label}>Notas (opcional)</Text>
                <TextInput
                  style={styles.input}
                  value={notas}
                  onChangeText={setNotas}
                  placeholder="Ej: entrega los martes"
                  placeholderTextColor={colors.textoSuave}
                />
                <TouchableOpacity
                  style={[styles.btnPrimario, guardando && styles.btnDisabled]}
                  onPress={guardarProveedor}
                  disabled={guardando}
                  activeOpacity={0.85}
                >
                  <Text style={styles.btnPrimarioTexto}>
                    {guardando ? 'Guardando…' : editandoId != null ? 'Guardar cambios' : 'Agregar proveedor'}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Detalle */}
      <Modal visible={detalle != null} transparent animationType="slide" onRequestClose={() => (imagenGrande ? setImagenGrande(null) : setDetalle(null))}>
        <Pressable style={styles.overlay} onPress={() => setDetalle(null)}>
          <Pressable style={[styles.modalContent, styles.modalDetalle]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitulo} numberOfLines={1}>
                {detalle?.nombre}
              </Text>
              <TouchableOpacity onPress={() => setDetalle(null)}>
                <X size={24} color={colors.texto} />
              </TouchableOpacity>
            </View>
            {detalle && (
              <>
                {detalle.telefono ? (
                  <View style={styles.telefonoRow}>
                    <Phone size={14} color={colors.textoSuave} />
                    <Text style={styles.telefonoTexto}>{detalle.telefono}</Text>
                  </View>
                ) : null}
                <Text style={[styles.detalleBalance, detalle.balance > 0.005 && styles.filaSubDeuda]}>
                  {textoBalance(detalle.balance)}
                </Text>
                <View style={styles.acciones}>
                  <TouchableOpacity style={styles.btnPrimarioMini} onPress={() => abrirPago(detalle)} activeOpacity={0.85}>
                    <Text style={styles.btnPrimarioTexto}>Registrar pago</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.btnSecundarioMini}
                    onPress={() => abrirCompra(detalle)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.btnSecundarioTexto}>Compra a crédito</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={() => abrirEditar(detalle)} style={styles.linkEditar}>
                  <Text style={styles.linkEditarTexto}>Editar datos del proveedor</Text>
                </TouchableOpacity>

                <Text style={styles.subtitulo}>Movimientos</Text>
                {cargandoDetalle && movimientos.length === 0 ? (
                  <ActivityIndicator size="small" color={colors.verde} style={styles.loader} />
                ) : movimientos.length === 0 ? (
                  <Text style={styles.empty}>Sin movimientos todavía.</Text>
                ) : (
                  <ScrollView style={styles.movLista} showsVerticalScrollIndicator={false}>
                    {movimientos.map((m) => (
                      <View key={m.clave} style={styles.movFila}>
                        <View style={styles.movInfo}>
                          <Text style={styles.movTitulo}>
                            {m.tipo === 'pago' ? `Pago · ${m.metodo}` : 'Compra a crédito'}
                          </Text>
                          <Text style={styles.movSub} numberOfLines={2}>
                            {formatFechaHora(m.fecha)}
                            {m.nota ? ` · ${m.nota}` : ''}
                          </Text>
                        </View>
                        {m.imagen ? (
                          <TouchableOpacity onPress={() => setImagenGrande(m.imagen)} style={styles.movAdjunto}>
                            <Paperclip size={14} color={colors.verde} />
                            <Image source={{ uri: m.imagen }} style={styles.movMiniatura} />
                          </TouchableOpacity>
                        ) : null}
                        <Text style={[styles.movMonto, m.tipo === 'pago' ? styles.movMontoPago : styles.movMontoCompra]}>
                          {m.tipo === 'pago' ? '−' : '+'}${m.monto.toFixed(2)}
                        </Text>
                      </View>
                    ))}
                  </ScrollView>
                )}
              </>
            )}
          </Pressable>
          {imagenGrande ? (
            <Pressable style={styles.visor} onPress={() => setImagenGrande(null)}>
              <Image source={{ uri: imagenGrande }} style={styles.visorImagen} resizeMode="contain" />
            </Pressable>
          ) : null}
        </Pressable>
      </Modal>

      {/* Compra a crédito */}
      <Modal visible={compraTarget != null} transparent animationType="fade" onRequestClose={cerrarCompra}>
        <Pressable style={styles.overlay} onPress={cerrarCompra}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitulo}>Compra a crédito</Text>
                <TouchableOpacity onPress={cerrarCompra}>
                  <X size={24} color={colors.texto} />
                </TouchableOpacity>
              </View>
              <Text style={styles.filaNombre}>{compraTarget?.nombre}</Text>
              <Text style={styles.hint}>
                Mercadería que te fía el proveedor. Aumenta lo que le debes, pero no resta de tus ventas hasta que la pagues.
              </Text>
              <Text style={styles.label}>Monto ($)</Text>
              <TextInput
                style={styles.input}
                value={montoCompra}
                onChangeText={setMontoCompra}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.textoSuave}
              />
              <Text style={styles.label}>Nota (opcional)</Text>
              <TextInput
                style={styles.input}
                value={notaCompra}
                onChangeText={setNotaCompra}
                placeholder="Ej: pedido de la semana"
                placeholderTextColor={colors.textoSuave}
              />
              <TouchableOpacity style={styles.btnPrimario} onPress={guardarCompra} activeOpacity={0.85}>
                <Text style={styles.btnPrimarioTexto}>Registrar compra</Text>
              </TouchableOpacity>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <PagoProveedorModal
        visible={pagoTarget != null}
        proveedor={pagoTarget ? { id: pagoTarget.id, nombre: pagoTarget.nombre, balance: pagoTarget.balance } : null}
        onCerrar={cerrarPago}
        onGuardado={() => void onPagoGuardado()}
      />

    </SafeAreaView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.fondo },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: 8,
      paddingRight: 20,
      paddingTop: 48,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.borde,
      gap: 8,
    },
    btnAtras: { paddingVertical: 4, paddingHorizontal: 8 },
    tituloPantalla: { flex: 1, fontSize: 24, fontWeight: '700', color: colors.texto },
    btnNuevo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.verde,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
    },
    btnNuevoTexto: { fontSize: 15, fontWeight: '700', color: colors.onPrimario },
    loader: { marginVertical: 40 },
    listaContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
    resumen: {
      backgroundColor: colors.superficie,
      borderRadius: 16,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.borde,
      marginBottom: 16,
    },
    resumenLabel: { fontSize: 14, color: colors.textoSuave },
    resumenValor: { fontSize: 28, fontWeight: '700', color: colors.naranja, marginTop: 4 },
    empty: { color: colors.textoSuave, fontSize: 15, textAlign: 'center', marginVertical: 24, lineHeight: 22 },
    fila: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.superficie,
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.borde,
    },
    filaIcono: { marginRight: 12 },
    filaTexto: { flex: 1 },
    filaNombre: { fontSize: 17, fontWeight: '600', color: colors.texto },
    filaSub: { marginTop: 4, fontSize: 13, color: colors.textoSuave },
    filaSubDeuda: { color: colors.naranja, fontWeight: '600' },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
    modalContent: {
      backgroundColor: colors.superficie,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.borde,
      maxHeight: '90%',
    },
    modalDetalle: { maxHeight: '85%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12 },
    modalTitulo: { flex: 1, fontSize: 18, fontWeight: '700', color: colors.texto },
    label: { fontSize: 14, fontWeight: '600', color: colors.textoSuave, marginTop: 12, marginBottom: 8 },
    input: {
      backgroundColor: colors.fondo,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: colors.texto,
      borderWidth: 1,
      borderColor: colors.borde,
    },
    hint: { fontSize: 13, color: colors.textoSuave, marginTop: 6, lineHeight: 18 },
    btnPrimario: {
      backgroundColor: colors.verde,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 20,
    },
    btnPrimarioTexto: { fontSize: 16, fontWeight: '700', color: colors.onPrimario },
    btnDisabled: { opacity: 0.65 },
    telefonoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    telefonoTexto: { fontSize: 14, color: colors.textoSuave },
    detalleBalance: { fontSize: 22, fontWeight: '700', color: colors.texto, marginBottom: 14 },
    acciones: { flexDirection: 'row', gap: 10 },
    btnPrimarioMini: {
      flex: 1,
      backgroundColor: colors.verde,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
    },
    btnSecundarioMini: {
      flex: 1,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.borde,
    },
    btnSecundarioTexto: { fontSize: 15, fontWeight: '600', color: colors.texto },
    linkEditar: { alignSelf: 'flex-start', paddingVertical: 10 },
    linkEditarTexto: { fontSize: 14, fontWeight: '600', color: colors.verde },
    subtitulo: { fontSize: 14, fontWeight: '700', color: colors.textoSuave, marginTop: 6, marginBottom: 8 },
    movLista: { maxHeight: 280 },
    movFila: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borde,
    },
    movInfo: { flex: 1 },
    movTitulo: { fontSize: 15, fontWeight: '600', color: colors.texto },
    movSub: { fontSize: 12, color: colors.textoSuave, marginTop: 2 },
    movAdjunto: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    movMiniatura: { width: 34, height: 34, borderRadius: 6, backgroundColor: colors.fondo },
    movMonto: { fontSize: 15, fontWeight: '700', minWidth: 68, textAlign: 'right' },
    movMontoPago: { color: colors.verde },
    movMontoCompra: { color: colors.naranja },
    visor: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.92)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    visorImagen: { width: '100%', height: '100%' },
  });
}
