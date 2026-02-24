import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Plus, Pencil, Trash2, X } from 'lucide-react-native';
import {
  getProductos,
  crearProducto,
  actualizarProducto,
  eliminarProducto,
  type Producto,
} from '../database/db';
import { useTheme } from '../context/ThemeContext';
import type { ColorPalette } from '../theme';

type FormMode = 'crear' | 'editar';

export default function InventarioScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [mode, setMode] = useState<FormMode>('crear');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [nombre, setNombre] = useState('');
  const [precioVenta, setPrecioVenta] = useState('');
  const [precioCosto, setPrecioCosto] = useState('');
  const [stock, setStock] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const list = await getProductos();
      setProductos(list);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

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
    setPrecioCosto(String(p.precio_costo));
    setStock(String(p.stock));
    setModalVisible(true);
  };

  const guardar = async () => {
    const nombreTrim = nombre.trim();
    const pv = parseFloat(precioVenta.replace(',', '.'));
    const pc = parseFloat(precioCosto.replace(',', '.'));
    const st = parseInt(stock, 10);

    if (!nombreTrim) return;
    if (!Number.isFinite(pv) || pv < 0) return;
    if (!Number.isFinite(pc) || pc < 0) return;
    if (!Number.isFinite(st) || st < 0) return;

    try {
      if (mode === 'crear') {
        await crearProducto(nombreTrim, pv, pc, st);
      } else if (editingId != null) {
        await actualizarProducto(editingId, nombreTrim, pv, pc, st);
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
        <Text style={styles.cardStock}>Stock: {item.stock}</Text>
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
        <TouchableOpacity style={styles.btnAgregar} onPress={abrirCrear}>
          <Plus size={24} color={colors.onPrimario} />
          <Text style={styles.btnAgregarTexto}>Agregar</Text>
        </TouchableOpacity>
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

            <Text style={styles.label}>Precio de costo ($)</Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor={colors.textoSuave}
              value={precioCosto}
              onChangeText={setPrecioCosto}
              keyboardType="decimal-pad"
            />

            <Text style={styles.label}>Stock</Text>
            <TextInput
              style={styles.input}
              placeholder="0"
              placeholderTextColor={colors.textoSuave}
              value={stock}
              onChangeText={setStock}
              keyboardType="number-pad"
            />

            <TouchableOpacity style={styles.btnGuardar} onPress={guardar}>
              <Text style={styles.btnGuardarTexto}>
                {mode === 'crear' ? 'Crear producto' : 'Guardar cambios'}
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
  });
}
