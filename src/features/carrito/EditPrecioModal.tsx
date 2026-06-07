import { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import type { ColorPalette } from '../../theme';
import { calcularPrecioMinimo } from '../../domain/finanzas';
import type { CartItem } from '../../store/useYapaStore';

type ProductoMinimo = {
  id: number;
  precioVenta: number;
  precioCosto: number;
  precioMinimo?: number | null;
};

type Props = {
  item: CartItem | null;
  productos: ProductoMinimo[];
  onCerrar: () => void;
  onGuardar: (itemId: number, precio: number) => void;
};

export default function EditPrecioModal({ item, productos, onCerrar, onGuardar }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [precioTexto, setPrecioTexto] = useState(item ? String(item.precio) : '');

  const handleGuardar = () => {
    if (!item) return;
    const valor = parseFloat(precioTexto.replace(',', '.'));
    if (!Number.isFinite(valor) || valor <= 0) return;

    const producto = productos.find((p) => p.id === item.id);
    if (producto) {
      const minimo = calcularPrecioMinimo({
        precioVenta: producto.precioVenta,
        precioCosto: producto.precioCosto,
        precioMinimo: producto.precioMinimo,
      });
      if (valor < minimo) {
        Alert.alert(
          'Precio demasiado bajo',
          `El precio mínimo para este producto es $${minimo.toFixed(2)} para mantener una ganancia mínima.`
        );
        return;
      }
    }
    onGuardar(item.id, valor);
  };

  return (
    <Modal
      visible={!!item}
      transparent
      animationType="fade"
      onRequestClose={onCerrar}
    >
      <Pressable style={styles.overlay} onPress={onCerrar}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.titulo}>Editar precio</Text>
          {item && (
            <>
              <Text style={styles.subtitulo}>{item.nombre}</Text>
              <TextInput
                style={styles.input}
                placeholder="Nuevo precio unitario"
                placeholderTextColor={colors.textoSuave}
                value={precioTexto}
                onChangeText={setPrecioTexto}
                keyboardType="decimal-pad"
              />
              <TouchableOpacity style={styles.btn} onPress={handleGuardar} activeOpacity={0.85}>
                <Text style={styles.btnTexto}>Guardar precio</Text>
              </TouchableOpacity>
            </>
          )}
        </Pressable>
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
    card: {
      backgroundColor: colors.superficie,
      borderRadius: 20,
      padding: 24,
      borderWidth: 1,
      borderColor: colors.borde,
    },
    titulo: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.texto,
      textAlign: 'center',
    },
    subtitulo: {
      fontSize: 14,
      color: colors.textoSuave,
      textAlign: 'center',
      marginTop: 8,
    },
    input: {
      backgroundColor: colors.fondo,
      borderRadius: 12,
      paddingHorizontal: 18,
      paddingVertical: 16,
      fontSize: 24,
      color: colors.texto,
      marginTop: 20,
      textAlign: 'center',
    },
    btn: {
      backgroundColor: colors.naranja,
      borderRadius: 14,
      paddingVertical: 16,
      marginTop: 20,
      alignItems: 'center',
    },
    btnTexto: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.onPrimario,
    },
  });
}
