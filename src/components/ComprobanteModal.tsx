import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Share,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { X, Share2, Image as ImageIcon } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import type { ComprobanteVenta } from '../database/db';
import type { ColorPalette } from '../theme';

function formatFecha(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('es-EC', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function generarTextoComprobante(c: ComprobanteVenta): string {
  const lineas: string[] = [
    '——— YAPA ———',
    'COMPROBANTE DE VENTA',
    `Nº ${String(c.id).padStart(6, '0')}`,
    `Fecha: ${formatFecha(c.fecha)}`,
    `Método de pago: ${c.metodo_pago}`,
    '',
    'Descripción          Cant.   P.Unit    Subtotal',
    '----------------------------------------------',
  ];
  c.items.forEach((it) => {
    const desc = it.descripcion.slice(0, 18).padEnd(18);
    const cant = String(it.cantidad).padStart(5);
    const pu = it.precio_unitario.toFixed(2).padStart(8);
    const sub = it.subtotal.toFixed(2).padStart(10);
    lineas.push(`${desc} ${cant} ${pu} ${sub}`);
  });
  lineas.push('----------------------------------------------');
  lineas.push(`TOTAL: $${c.total.toFixed(2)}`);
  lineas.push('');
  lineas.push('Gracias por su compra');
  return lineas.join('\n');
}

type Props = {
  visible: boolean;
  comprobante: ComprobanteVenta | null;
  onCerrar: () => void;
};

export default function ComprobanteModal({ visible, comprobante, onCerrar }: Props) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const captureRefView = useRef<View>(null);
  const [capturando, setCapturando] = useState(false);

  const compartir = async () => {
    if (!comprobante) return;
    const texto = generarTextoComprobante(comprobante);
    try {
      await Share.share({
        message: texto,
        title: `Comprobante Yapa #${comprobante.id}`,
      });
    } catch (e) {
      console.error(e);
    }
  };

  const guardarComoImagen = async () => {
    if (!captureRefView.current || !comprobante) return;
    setCapturando(true);
    try {
      const uri = await captureRef(captureRefView, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      const fileUri = uri.startsWith('file://') ? uri : `file://${uri}`;
      const disponible = await Sharing.isAvailableAsync();
      if (!disponible) {
        Alert.alert(
          'No disponible',
          'Compartir no está disponible en este dispositivo.'
        );
        return;
      }
      await Sharing.shareAsync(fileUri, {
        mimeType: 'image/png',
        dialogTitle: `Comprobante Yapa #${String(comprobante.id).padStart(6, '0')}`,
      });
    } catch (e) {
      console.error(e);
      Alert.alert(
        'Error',
        'No se pudo generar o compartir la imagen. Intenta de nuevo.'
      );
    } finally {
      setCapturando(false);
    }
  };

  if (!comprobante) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCerrar}
    >
      <View style={styles.overlay}>
        <View style={styles.paper}>
          <View style={styles.header}>
            <Text style={styles.title}>Comprobante</Text>
            <TouchableOpacity onPress={onCerrar} hitSlop={12}>
              <X size={26} color={colors.texto} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            <View
              ref={captureRefView}
              collapsable={false}
              style={styles.captureArea}
            >
            <Image
              source={require('../../assets/logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.subtitle}>COMPROBANTE DE VENTA</Text>
            <Text style={styles.numero}>Nº {String(comprobante.id).padStart(6, '0')}</Text>
            <Text style={styles.fecha}>{formatFecha(comprobante.fecha)}</Text>
            <Text style={styles.metodo}>Método de pago: {comprobante.metodo_pago}</Text>

            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.th, styles.colDesc]}>Descripción</Text>
                <Text style={[styles.th, styles.colCant]}>Cant.</Text>
                <Text style={[styles.th, styles.colPu]}>P.Unit</Text>
                <Text style={[styles.th, styles.colSub]}>Subtotal</Text>
              </View>
              {comprobante.items.length === 0 ? (
                <View style={styles.tableEmpty}>
                  <Text style={styles.tableEmptyText}>Sin detalle guardado</Text>
                </View>
              ) : (
                comprobante.items.map((it, idx) => (
                  <View key={idx} style={styles.tableRow}>
                    <Text style={[styles.td, styles.colDesc]} numberOfLines={1}>
                      {it.descripcion}
                    </Text>
                    <Text style={[styles.td, styles.colCant]}>{it.cantidad}</Text>
                    <Text style={[styles.td, styles.colPu]}>
                      ${it.precio_unitario.toFixed(2)}
                    </Text>
                    <Text style={[styles.td, styles.colSub]}>
                      ${it.subtotal.toFixed(2)}
                    </Text>
                  </View>
                ))
              )}
            </View>

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>TOTAL</Text>
              <Text style={styles.totalValor}>${comprobante.total.toFixed(2)}</Text>
            </View>

            <Text style={styles.thanks}>Gracias por su compra</Text>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.btnImagen, capturando && styles.btnDisabled]}
              onPress={guardarComoImagen}
              disabled={capturando}
            >
              {capturando ? (
                <ActivityIndicator size="small" color={colors.onPrimario} />
              ) : (
                <ImageIcon size={20} color={colors.onPrimario} />
              )}
              <Text style={styles.btnImagenTexto}>
                {capturando ? 'Generando…' : 'Imagen'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnCompartir} onPress={compartir}>
              <Share2 size={20} color={colors.onPrimario} />
              <Text style={styles.btnCompartirTexto}>Texto</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnCerrar} onPress={onCerrar}>
              <Text style={styles.btnCerrarTexto}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      padding: 20,
    },
    paper: {
      backgroundColor: colors.superficie,
      borderRadius: 16,
      maxHeight: '90%',
      borderWidth: 1,
      borderColor: colors.borde,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.borde,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.texto,
    },
    body: {
      maxHeight: 420,
    },
    bodyContent: {
      padding: 20,
      paddingBottom: 16,
    },
    captureArea: {
      padding: 0,
    },
    logo: {
      width: 120,
      height: 42,
      alignSelf: 'center',
      marginBottom: 12,
    },
    subtitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textoSuave,
      textAlign: 'center',
      letterSpacing: 1,
      marginBottom: 8,
    },
    numero: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.texto,
      textAlign: 'center',
      marginBottom: 4,
    },
    fecha: {
      fontSize: 13,
      color: colors.textoSuave,
      textAlign: 'center',
      marginBottom: 4,
    },
    metodo: {
      fontSize: 13,
      color: colors.textoSuave,
      textAlign: 'center',
      marginBottom: 16,
    },
    table: {
      borderWidth: 1,
      borderColor: colors.borde,
      borderRadius: 8,
      marginBottom: 16,
    },
    tableHeader: {
      flexDirection: 'row',
      backgroundColor: colors.fondo,
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.borde,
    },
    tableRow: {
      flexDirection: 'row',
      paddingVertical: 8,
      paddingHorizontal: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.borde,
    },
    tableEmpty: {
      paddingVertical: 16,
      alignItems: 'center',
    },
    tableEmptyText: {
      fontSize: 13,
      color: colors.textoSuave,
      fontStyle: 'italic',
    },
    th: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textoSuave,
    },
    td: {
      fontSize: 13,
      color: colors.texto,
    },
    colDesc: { flex: 2 },
    colCant: { flex: 0.5, textAlign: 'right' },
    colPu: { flex: 1, textAlign: 'right' },
    colSub: { flex: 1, textAlign: 'right' },
    totalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 8,
      backgroundColor: colors.fondo,
      borderRadius: 8,
      marginBottom: 16,
    },
    totalLabel: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.texto,
    },
    totalValor: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.verde,
    },
    thanks: {
      fontSize: 14,
      color: colors.textoSuave,
      textAlign: 'center',
      fontStyle: 'italic',
    },
    footer: {
      flexDirection: 'row',
      gap: 8,
      padding: 16,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.borde,
    },
    btnImagen: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.verde,
      paddingVertical: 12,
      borderRadius: 12,
    },
    btnImagenTexto: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.onPrimario,
    },
    btnDisabled: {
      opacity: 0.7,
    },
    btnCompartir: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.verde,
      paddingVertical: 12,
      borderRadius: 12,
    },
    btnCompartirTexto: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.onPrimario,
    },
    btnCerrar: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.borde,
      paddingVertical: 14,
      borderRadius: 12,
    },
    btnCerrarTexto: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.texto,
    },
  });
}
