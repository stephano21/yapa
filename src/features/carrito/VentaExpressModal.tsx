import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import type { ColorPalette } from '../../theme';

type Props = {
  visible: boolean;
  onCerrar: () => void;
  onConfirmar: (monto: number) => void;
};

export default function VentaExpressModal({ visible, onCerrar, onConfirmar }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [monto, setMonto] = useState('');

  const handleConfirmar = () => {
    const valor = parseFloat(monto.replace(',', '.'));
    if (!Number.isFinite(valor) || valor <= 0) return;
    onConfirmar(valor);
    setMonto('');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <Pressable style={styles.overlay} onPress={onCerrar}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.titulo}>Venta rápida</Text>
          <Text style={styles.subtitulo}>Ingresa el monto a cobrar</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: 1.50"
            placeholderTextColor={colors.textoSuave}
            value={monto}
            onChangeText={setMonto}
            keyboardType="decimal-pad"
          />
          <TouchableOpacity style={styles.btn} onPress={handleConfirmar} activeOpacity={0.85}>
            <Text style={styles.btnTexto}>Añadir al carrito</Text>
          </TouchableOpacity>
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
