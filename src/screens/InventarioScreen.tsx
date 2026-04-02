import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Plus, Pencil, Ruler, Trash2, X } from 'lucide-react-native';
import {
  getProductos,
  crearProducto,
  actualizarProducto,
  eliminarProducto,
  getUnidadesMedida,
  type UnidadMedida,
  type Producto,
} from '../database/db';
import { useTheme } from '../context/ThemeContext';
import type { ColorPalette } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type FormMode = 'crear' | 'editar';

export default function InventarioScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [unidadesMedida, setUnidadesMedida] = useState<UnidadMedida[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [mode, setMode] = useState<FormMode>('crear');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [nombre, setNombre] = useState('');
  const [precioVenta, setPrecioVenta] = useState('');
  const [precioCosto, setPrecioCosto] = useState('');
  const [stock, setStock] = useState('');
  const [unidadStockId, setUnidadStockId] = useState<number | null>(null);
  const [unidadPickerVisible, setUnidadPickerVisible] = useState(false);

  const unidadStock = useMemo(() => {
    if (unidadStockId == null) return null;
    return unidadesMedida.find((u) => u.id === unidadStockId) ?? null;
  }, [unidadesMedida, unidadStockId]);

  const getFactor = () => unidadStock?.unidades ?? 1;

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [list, uoms] = await Promise.all([getProductos(), getUnidadesMedida()]);
      setProductos(list);
      setUnidadesMedida(uoms);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (unidadesMedida.length === 0) return;
    if (unidadStockId != null) return;
    const unidadBase = unidadesMedida.find((u) => u.unidades === 1) ?? unidadesMedida[0];
    setUnidadStockId(unidadBase.id);
  }, [unidadesMedida, unidadStockId]);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );

  const abrirCrear = () => {
    setMode('crear');
    setEditingId(null);
    setNombre('');
    setPrecioVenta('');
    setPrecioCosto('');
    setStock('');
    setModalVisible(true);
  };

  const abrirEditar = (p: Producto) => {
    setMode('editar');
    setEditingId(p.id);
    setNombre(p.nombre);
    setPrecioVenta(String(p.precio_venta));
    const factor = getFactor();
    setPrecioCosto(String(p.precio_costo * factor)); // costo por unidad seleccionada
    setStock(String(p.stock / factor)); // stock en unidades seleccionadas
    setModalVisible(true);
  };

  const onCambiarUnidad = (newId: number) => {
    if (newId === unidadStockId) return;
    const oldFactor = getFactor();
    const newUnidad = unidadesMedida.find((u) => u.id === newId);
    const newFactor = newUnidad?.unidades ?? 1;

    // Si el usuario ya tiene valores escritos, los convertimos a la nueva unidad.
    const st = parseFloat(stock.replace(',', '.'));
    const pc = parseFloat(precioCosto.replace(',', '.'));
    if (Number.isFinite(st) && Number.isFinite(pc) && oldFactor > 0 && newFactor > 0) {
      const stockBase = st * oldFactor;
      const costoBasePorUnidad = pc / oldFactor;
      setStock(String(stockBase / newFactor));
      setPrecioCosto(String(costoBasePorUnidad * newFactor));
    }

    setUnidadStockId(newId);
    setUnidadPickerVisible(false);
  };

  const guardar = async () => {
    const nombreTrim = nombre.trim();
    const pv = parseFloat(precioVenta.replace(',', '.')); // PVP unitario (por unidad base)
    const pcPorUnidadSeleccionada = parseFloat(precioCosto.replace(',', '.')); // costo por docena/unidad seleccionada
    const stPorUnidadSeleccionada = parseFloat(stock.replace(',', '.')); // stock en "packs"
    const factor = getFactor();
    const pcUnitario = pcPorUnidadSeleccionada / factor;
    const stockBase = stPorUnidadSeleccionada * factor;

    if (!nombreTrim) return;
    if (!Number.isFinite(pv) || pv < 0) return;
    if (!Number.isFinite(pcPorUnidadSeleccionada) || pcPorUnidadSeleccionada < 0) return;
    if (!Number.isFinite(stPorUnidadSeleccionada) || stPorUnidadSeleccionada < 0) return;
    if (!Number.isFinite(pcUnitario) || pcUnitario < 0) return;
    if (!Number.isFinite(stockBase) || stockBase < 0) return;

    // El campo `productos.stock` es INTEGER. Validamos que el stockBase sea entero.
    const stockBaseRedondeado = Math.round(stockBase);
    const diff = Math.abs(stockBaseRedondeado - stockBase);
    if (diff > 1e-6) {
      Alert.alert(
        'Stock no divisible',
        `Con la unidad "${unidadStock?.nombre ?? 'Unidad'}", el stock debe dar un número entero de unidades base.`
      );
      return;
    }

    try {
      const stockEntero = stockBaseRedondeado;
      if (mode === 'crear') {
        await crearProducto(nombreTrim, pv, pcUnitario, stockEntero);
      } else if (editingId != null) {
        await actualizarProducto(editingId, nombreTrim, pv, pcUnitario, stockEntero);
      }
      setModalVisible(false);
      cargar();
    } catch (e) {
      console.error(e);
    }
  };

  const borrar = (p: Producto) => {
    Alert.alert(
      'Eliminar producto',
      `¿Eliminar "${p.nombre}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            await eliminarProducto(p.id);
            cargar();
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: Producto }) => (
    <View style={styles.card}>
      <View style={styles.cardBody}>
        <Text style={styles.cardNombre} numberOfLines={1}>
          {item.nombre}
        </Text>
        <Text style={styles.cardPrecio}>
          Venta: ${item.precio_venta.toFixed(2)} · Costo: ${item.precio_costo.toFixed(2)}
        </Text>
        <Text style={styles.cardStock}>Stock (unidades base): {item.stock}</Text>
      </View>
      <View style={styles.cardActions}>
        <TouchableOpacity onPress={() => abrirEditar(item)} style={styles.iconBtn}>
          <Pencil size={22} color={colors.verde} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => borrar(item)} style={styles.iconBtn}>
          <Trash2 size={22} color={colors.naranja} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.contenedor}>
      <View style={styles.header}>
        <Text style={styles.titulo}>Inventario</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.btnUnidades}
            onPress={() => navigation.navigate('UnidadesMedida')}
            activeOpacity={0.85}
          >
            <Ruler size={22} color={colors.verde} />
            <Text style={styles.btnUnidadesTexto}>Unidades</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnAgregar} onPress={abrirCrear}>
            <Plus size={24} color={colors.onPrimario} />
            <Text style={styles.btnAgregarTexto}>Agregar</Text>
          </TouchableOpacity>
        </View>
      </View>

      {cargando ? (
        <ActivityIndicator size="large" color={colors.verde} style={styles.loader} />
      ) : (
        <FlatList
          data={productos}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.lista}
          ListEmptyComponent={
            <Text style={styles.empty}>No hay productos. Toca Agregar para crear uno.</Text>
          }
        />
      )}

      <Modal visible={modalVisible} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitulo}>
                {mode === 'crear' ? 'Nuevo producto' : 'Editar producto'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={26} color={colors.texto} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Nombre</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: Café"
              placeholderTextColor={colors.textoSuave}
              value={nombre}
              onChangeText={setNombre}
            />

            <Text style={styles.label}>Precio de venta ($)</Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor={colors.textoSuave}
              value={precioVenta}
              onChangeText={setPrecioVenta}
              keyboardType="decimal-pad"
            />

            <Text style={styles.label}>Unidad de stock</Text>
            <TouchableOpacity
              style={styles.unidadPickerBtn}
              onPress={() => setUnidadPickerVisible(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.unidadPickerBtnText}>
                {unidadStock?.nombre ?? 'Unidad'}
              </Text>
              <Text style={styles.unidadPickerBtnSub}>
                {unidadStock ? `${unidadStock.unidades} unidades base` : ''}
              </Text>
            </TouchableOpacity>

            <Text style={styles.label}>
              Costo por {unidadStock?.nombre ?? 'unidad'} ($)
            </Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor={colors.textoSuave}
              value={precioCosto}
              onChangeText={setPrecioCosto}
              keyboardType="decimal-pad"
            />

            <Text style={styles.label}>Stock ({unidadStock?.nombre ?? 'unidad'})</Text>
            <TextInput
              style={styles.input}
              placeholder="0"
              placeholderTextColor={colors.textoSuave}
              value={stock}
              onChangeText={setStock}
              keyboardType="decimal-pad"
            />

            <TouchableOpacity style={styles.btnGuardar} onPress={guardar}>
              <Text style={styles.btnGuardarTexto}>
                {mode === 'crear' ? 'Crear producto' : 'Guardar cambios'}
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={unidadPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setUnidadPickerVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setUnidadPickerVisible(false)}>
          <Pressable style={styles.unitPickerContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.unitPickerHeader}>
              <Text style={styles.modalTitulo}>Unidad de stock</Text>
              <TouchableOpacity onPress={() => setUnidadPickerVisible(false)}>
                <X size={26} color={colors.texto} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={unidadesMedida}
              keyExtractor={(u) => String(u.id)}
              style={{ maxHeight: 240 }}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
              renderItem={({ item }) => {
                const selected = item.id === unidadStockId;
                return (
                  <TouchableOpacity
                    style={[
                      styles.unitPickerItem,
                      selected && { borderColor: colors.verde, borderWidth: 2 },
                    ]}
                    onPress={() => onCambiarUnidad(item.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.unitPickerItemNombre}>{item.nombre}</Text>
                    <Text style={styles.unitPickerItemSub}>
                      {item.unidades} unidades base
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />

            <TouchableOpacity
              style={styles.unitPickerGestionar}
              onPress={() => {
                setUnidadPickerVisible(false);
                navigation.navigate('UnidadesMedida');
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.unitPickerGestionarTexto, { color: colors.verde }]}>
                Gestionar unidades…
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: colors.fondo,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borde,
  },
  titulo: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.texto,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  btnUnidades: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.superficie,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borde,
  },
  btnUnidadesTexto: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.texto,
  },
  btnAgregar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.verde,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
  },
  btnAgregarTexto: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.fondo,
  },
  loader: { marginTop: 40 },
  lista: { padding: 20, paddingBottom: 100 },
  empty: {
    color: colors.textoSuave,
    fontSize: 16,
    textAlign: 'center',
    marginTop: 32,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.superficie,
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.borde,
  },
  cardBody: { flex: 1 },
  cardNombre: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.texto,
  },
  cardPrecio: {
    fontSize: 14,
    color: colors.textoSuave,
    marginTop: 4,
  },
  cardStock: {
    fontSize: 13,
    color: colors.textoSuave,
    marginTop: 2,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 12,
  },
  iconBtn: {
    padding: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: colors.superficie,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.borde,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitulo: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.texto,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textoSuave,
    marginBottom: 8,
    marginTop: 12,
  },
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
  btnGuardar: {
    backgroundColor: colors.naranja,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 24,
    alignItems: 'center',
  },
  btnGuardarTexto: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.onPrimario,
  },
  unidadPickerBtn: {
    backgroundColor: colors.fondo,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.borde,
    marginTop: 8,
  },
  unidadPickerBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.texto,
  },
  unidadPickerBtnSub: {
    marginTop: 4,
    fontSize: 12,
    color: colors.textoSuave,
  },
  unitPickerContent: {
    backgroundColor: colors.superficie,
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.borde,
    maxHeight: '80%',
  },
  unitPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  unitPickerItem: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.borde,
    backgroundColor: colors.fondo,
    marginHorizontal: 2,
  },
  unitPickerItemNombre: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.texto,
  },
  unitPickerItemSub: {
    marginTop: 4,
    fontSize: 12,
    color: colors.textoSuave,
  },
  unitPickerGestionar: {
    marginTop: 16,
    paddingVertical: 10,
    alignItems: 'center',
  },
  unitPickerGestionarTexto: {
    fontSize: 15,
    fontWeight: '700',
  },
  });
}
