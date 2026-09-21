import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { X, ImagePlus, Trash2 } from 'lucide-react-native';
import { pagosProveedorRepo, type MetodoPagoProveedor } from '../database/repositories/pagosProveedorRepo';
import { useTheme } from '../context/ThemeContext';
import type { ColorPalette } from '../theme';

type Props = {
  visible: boolean;
  proveedor: { id: number; nombre: string; balance: number } | null;
  onCerrar: () => void;
  onGuardado: () => void;
};

const METODOS: MetodoPagoProveedor[] = ['Efectivo', 'Transferencia'];

/**
 * Registra un pago a un proveedor. Si el método es Transferencia se puede adjuntar la foto del
 * comprobante (captura del banco); queda guardada en el teléfono y se sube a Pulse en el próximo sync.
 */
export default function PagoProveedorModal({ visible, proveedor, onCerrar, onGuardado }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [monto, setMonto] = useState('');
  const [metodo, setMetodo] = useState<MetodoPagoProveedor>('Efectivo');
  const [nota, setNota] = useState('');
  const [comprobanteUri, setComprobanteUri] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!visible || !proveedor) return;
    setMonto(proveedor.balance > 0 ? proveedor.balance.toFixed(2) : '');
    setMetodo('Efectivo');
    setNota('');
    setComprobanteUri(null);
    setGuardando(false);
  }, [visible, proveedor]);

  const elegirComprobante = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permiso necesario', 'Yapa necesita acceso a tus fotos para adjuntar el comprobante.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.7,
    });
    if (result.canceled || result.assets.length === 0) return;
    setComprobanteUri(result.assets[0].uri);
  };

  const guardar = async (montoNum: number) => {
    if (!proveedor) return;
    setGuardando(true);
    try {
      await pagosProveedorRepo.registrar({
        proveedorId: proveedor.id,
        monto: montoNum,
        metodoPago: metodo,
        nota,
        comprobanteUri,
      });
      onGuardado();
    } catch (e) {
      console.warn('[PagoProveedorModal] guardar', e);
      Alert.alert('Pago', 'No se pudo registrar el pago. Intenta de nuevo.');
      setGuardando(false);
    }
  };

  const onPressGuardar = () => {
    const montoNum = parseFloat(monto.replace(',', '.'));
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      Alert.alert('Pago', 'Ingresa un monto mayor a cero.');
      return;
    }
    if (metodo === 'Transferencia' && !comprobanteUri) {
      Alert.alert('Sin comprobante', 'No adjuntaste la foto del comprobante de la transferencia.', [
        { text: 'Adjuntar', onPress: () => void elegirComprobante() },
        { text: 'Registrar igual', onPress: () => void guardar(montoNum) },
      ]);
      return;
    }
    void guardar(montoNum);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <Pressable style={styles.overlay} onPress={onCerrar}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.content} onPress={(e) => e.stopPropagation()}>
            <View style={styles.header}>
              <Text style={styles.titulo}>Pagar a proveedor</Text>
              <TouchableOpacity onPress={onCerrar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <X size={24} color={colors.texto} />
              </TouchableOpacity>
            </View>
            {proveedor && (
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={styles.proveedor}>{proveedor.nombre}</Text>
                <Text style={styles.deuda}>
                  {proveedor.balance > 0
                    ? `Le debes: $${proveedor.balance.toFixed(2)}`
                    : proveedor.balance < 0
                      ? `Pagaste de más: $${Math.abs(proveedor.balance).toFixed(2)}`
                      : 'Sin deuda pendiente'}
                </Text>

                <Text style={styles.label}>Monto ($)</Text>
                <TextInput
                  style={styles.input}
                  value={monto}
                  onChangeText={setMonto}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.textoSuave}
                />

                <Text style={styles.label}>Método de pago</Text>
                <View style={styles.metodos}>
                  {METODOS.map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.chip, metodo === m && styles.chipActivo]}
                      onPress={() => setMetodo(m)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.chipTexto, metodo === m && styles.chipTextoActivo]}>{m}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {metodo === 'Transferencia' && (
                  <View style={styles.comprobanteWrap}>
                    <Text style={styles.label}>Comprobante de la transferencia</Text>
                    {comprobanteUri ? (
                      <View style={styles.previewRow}>
                        <Image source={{ uri: comprobanteUri }} style={styles.preview} resizeMode="cover" />
                        <TouchableOpacity style={styles.btnQuitar} onPress={() => setComprobanteUri(null)}>
                          <Trash2 size={18} color={colors.naranja} />
                          <Text style={styles.btnQuitarTexto}>Quitar foto</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity style={styles.btnAdjuntar} onPress={elegirComprobante} activeOpacity={0.8}>
                        <ImagePlus size={22} color={colors.verde} />
                        <Text style={styles.btnAdjuntarTexto}>Adjuntar foto del comprobante</Text>
                      </TouchableOpacity>
                    )}
                    <Text style={styles.hint}>
                      Se guarda con el pago y se sube a tu cuenta cuando haya conexión.
                    </Text>
                  </View>
                )}

                <Text style={styles.label}>Nota (opcional)</Text>
                <TextInput
                  style={styles.input}
                  value={nota}
                  onChangeText={setNota}
                  placeholder="Ej: factura 001-234"
                  placeholderTextColor={colors.textoSuave}
                />

                <TouchableOpacity
                  style={[styles.btnGuardar, guardando && styles.btnDisabled]}
                  onPress={onPressGuardar}
                  disabled={guardando}
                  activeOpacity={0.85}
                >
                  <Text style={styles.btnGuardarTexto}>{guardando ? 'Guardando…' : 'Registrar pago'}</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      padding: 24,
    },
    content: {
      backgroundColor: colors.superficie,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.borde,
      maxHeight: '90%',
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    titulo: { fontSize: 18, fontWeight: '700', color: colors.texto },
    proveedor: { fontSize: 16, fontWeight: '600', color: colors.texto },
    deuda: { fontSize: 14, color: colors.textoSuave, marginTop: 2, marginBottom: 8 },
    label: { fontSize: 14, fontWeight: '600', color: colors.textoSuave, marginTop: 12, marginBottom: 8 },
    input: {
      backgroundColor: colors.fondo,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 17,
      color: colors.texto,
      borderWidth: 1,
      borderColor: colors.borde,
    },
    metodos: { flexDirection: 'row', gap: 10 },
    chip: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.borde,
      alignItems: 'center',
      backgroundColor: colors.fondo,
    },
    chipActivo: { backgroundColor: colors.verde, borderColor: colors.verde },
    chipTexto: { fontSize: 15, fontWeight: '600', color: colors.texto },
    chipTextoActivo: { color: colors.onPrimario },
    comprobanteWrap: { marginTop: 4 },
    btnAdjuntar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingVertical: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.verde,
    },
    btnAdjuntarTexto: { fontSize: 15, fontWeight: '600', color: colors.verde },
    previewRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    preview: { width: 96, height: 96, borderRadius: 12, backgroundColor: colors.fondo },
    btnQuitar: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    btnQuitarTexto: { fontSize: 14, fontWeight: '600', color: colors.naranja },
    hint: { fontSize: 12, color: colors.textoSuave, marginTop: 8 },
    btnGuardar: {
      backgroundColor: colors.verde,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 20,
    },
    btnDisabled: { opacity: 0.65 },
    btnGuardarTexto: { fontSize: 16, fontWeight: '700', color: colors.onPrimario },
  });
}
