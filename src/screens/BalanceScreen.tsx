import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Share,
  ScrollView,
} from 'react-native';
import { Share2, TrendingUp, DollarSign, FileText } from 'lucide-react-native';
import {
  getResumenHoy,
  getGananciaEstimadaHoy,
  getVentasDelDiaConId,
  getComprobantePorId,
} from '../database/db';
import { useTheme } from '../context/ThemeContext';
import type { ColorPalette } from '../theme';
import ComprobanteModal from '../components/ComprobanteModal';
import type { ComprobanteVenta } from '../database/db';

function formatHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-EC', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function BalanceScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [totalVentas, setTotalVentas] = useState(0);
  const [porMetodo, setPorMetodo] = useState<Record<string, number>>({});
  const [cantidadVentas, setCantidadVentas] = useState(0);
  const [gananciaEstimada, setGananciaEstimada] = useState(0);
  const [ventasDelDia, setVentasDelDia] = useState<
    { id: number; fecha: string; total: number; metodo_pago: string }[]
  >([]);
  const [cargando, setCargando] = useState(true);
  const [comprobanteSeleccionado, setComprobanteSeleccionado] =
    useState<ComprobanteVenta | null>(null);
  const [showComprobante, setShowComprobante] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [resumen, ganancia, ventas] = await Promise.all([
        getResumenHoy(),
        getGananciaEstimadaHoy(),
        getVentasDelDiaConId(),
      ]);
      setTotalVentas(resumen.totalVentas);
      setPorMetodo(resumen.porMetodo);
      setCantidadVentas(resumen.cantidadVentas);
      setGananciaEstimada(ganancia);
      setVentasDelDia(ventas);
    } finally {
      setCargando(false);
    }
  }, []);

  const abrirComprobante = useCallback(async (ventaId: number) => {
    const comp = await getComprobantePorId(ventaId);
    if (comp) {
      setComprobanteSeleccionado(comp);
      setShowComprobante(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );

  const generarMensajeCierre = (): string => {
    const partes = Object.entries(porMetodo)
      .filter(([, m]) => m > 0)
      .map(([metodo, m]) => `${metodo}: $${m.toFixed(2)}`);
    const detalle = partes.length > 0 ? ` (${partes.join(', ')})` : '';
    const frase =
      totalVentas > 0
        ? cantidadVentas >= 5
          ? '¡Ventas en alza! 📈'
          : '¡Buen día! 👍'
        : 'Sin ventas hoy.';
    return `Reporte Yapa de hoy: Total $${totalVentas.toFixed(2)}${detalle}. ${frase}`;
  };

  const compartirCierre = async () => {
    const mensaje = generarMensajeCierre();
    try {
      await Share.share({
        message: mensaje,
        title: 'Cierre del día - Yapa',
      });
    } catch (e) {
      console.error(e);
    }
  };

  if (cargando) {
    return (
      <View style={styles.contenedor}>
        <View style={styles.header}>
          <Text style={styles.titulo}>Balance del día</Text>
        </View>
        <ActivityIndicator size="large" color={colors.verde} style={styles.loader} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.contenedor}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.titulo}>Balance del día</Text>
      </View>

      <View style={styles.cardPrincipal}>
        <View style={styles.cardPrincipalIcon}>
          <DollarSign size={32} color={colors.verde} />
        </View>
        <Text style={styles.pregunta}>¿Cuánto he vendido hoy?</Text>
        <Text style={styles.totalVentas}>${totalVentas.toFixed(2)}</Text>
        <Text style={styles.subtexto}>{cantidadVentas} ventas</Text>
      </View>

      <View style={styles.cardSecundario}>
        <View style={styles.cardSecundarioIcon}>
          <TrendingUp size={28} color={colors.naranja} />
        </View>
        <Text style={styles.cardSecundarioLabel}>Ganancia estimada</Text>
        <Text style={styles.cardSecundarioValor}>${gananciaEstimada.toFixed(2)}</Text>
      </View>

      {Object.keys(porMetodo).length > 0 && (
        <View style={styles.seccionMetodos}>
          <Text style={styles.seccionTitulo}>Por método de pago</Text>
          {Object.entries(porMetodo).map(([metodo, monto]) => (
            <View key={metodo} style={styles.filaMetodo}>
              <Text style={styles.filaMetodoNombre}>{metodo}</Text>
              <Text style={styles.filaMetodoMonto}>${monto.toFixed(2)}</Text>
            </View>
          ))}
        </View>
      )}

      {ventasDelDia.length > 0 && (
        <View style={styles.seccionComprobantes}>
          <Text style={styles.seccionTitulo}>Comprobantes del día</Text>
          {ventasDelDia.map((v) => (
            <TouchableOpacity
              key={v.id}
              style={styles.filaComprobante}
              onPress={() => abrirComprobante(v.id)}
              activeOpacity={0.7}
            >
              <FileText size={20} color={colors.verde} />
              <View style={styles.filaComprobanteInfo}>
                <Text style={styles.filaComprobanteNum}>Nº {String(v.id).padStart(6, '0')}</Text>
                <Text style={styles.filaComprobanteHora}>
                  {formatHora(v.fecha)} · ${v.total.toFixed(2)} · {v.metodo_pago}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <TouchableOpacity style={styles.btnCompartir} onPress={compartirCierre}>
        <Share2 size={22} color={colors.onPrimario} />
        <Text style={styles.btnCompartirTexto}>Compartir cierre</Text>
      </TouchableOpacity>

      <Text style={styles.hint}>
        Envía el resumen por WhatsApp al dueño del local o guárdalo para tu control.
      </Text>

      <ComprobanteModal
        visible={showComprobante}
        comprobante={comprobanteSeleccionado}
        onCerrar={() => {
          setShowComprobante(false);
          setComprobanteSeleccionado(null);
        }}
      />
    </ScrollView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: colors.fondo,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  header: {
    paddingTop: 48,
    paddingBottom: 20,
  },
  titulo: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.texto,
  },
  loader: { marginTop: 60 },
  cardPrincipal: {
    backgroundColor: colors.superficie,
    borderRadius: 20,
    padding: 28,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.borde,
    alignItems: 'center',
  },
  cardPrincipalIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(168, 198, 159, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  pregunta: {
    fontSize: 16,
    color: colors.textoSuave,
    marginBottom: 8,
  },
  totalVentas: {
    fontSize: 42,
    fontWeight: '700',
    color: colors.verde,
  },
  subtexto: {
    fontSize: 14,
    color: colors.textoSuave,
    marginTop: 8,
  },
  cardSecundario: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.superficie,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.borde,
    gap: 16,
  },
  cardSecundarioIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 112, 67, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardSecundarioLabel: {
    flex: 1,
    fontSize: 16,
    color: colors.textoSuave,
  },
  cardSecundarioValor: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.naranja,
  },
  seccionMetodos: {
    marginBottom: 24,
  },
  seccionTitulo: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textoSuave,
    marginBottom: 12,
  },
  filaMetodo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.superficie,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.borde,
  },
  filaMetodoNombre: {
    fontSize: 16,
    color: colors.texto,
  },
  filaMetodoMonto: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.verde,
  },
  seccionComprobantes: {
    marginBottom: 24,
  },
  filaComprobante: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.superficie,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.borde,
  },
  filaComprobanteInfo: {
    flex: 1,
  },
  filaComprobanteNum: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.texto,
  },
  filaComprobanteHora: {
    fontSize: 13,
    color: colors.textoSuave,
    marginTop: 2,
  },
  btnCompartir: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.verde,
    paddingVertical: 18,
    borderRadius: 16,
    marginBottom: 12,
  },
  btnCompartirTexto: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.onPrimario,
  },
  hint: {
    fontSize: 13,
    color: colors.textoSuave,
    textAlign: 'center',
    lineHeight: 20,
  },
  });
}
