import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Cloud, Package, Users, ShoppingCart, Banknote, Ruler, Info } from 'lucide-react-native';
import { productosRepo, type Producto } from '../database/repositories/productosRepo';
import { clientesRepo, type Cliente } from '../database/repositories/clientesRepo';
import { unidadesRepo, type UnidadMedida } from '../database/repositories/unidadesRepo';
import { ventasRepo, type Venta } from '../database/repositories/ventasRepo';
import { cobrosRepo, type Cobro } from '../database/repositories/cobrosRepo';
import { useTheme } from '../context/ThemeContext';
import { useAuth, PulseAuthError } from '../context/AuthContext';
import type { ColorPalette } from '../theme';
import PulseAuthSection from '../components/PulseAuthSection';
import { runSyncCycle } from '../sync/SyncOrchestrator';

type ResumenPendientesSync = {
  productos: number;
  clientes: number;
  unidades: number;
  ventas: number;
  cobros: number;
};

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleString('es-EC', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SyncScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { accessToken } = useAuth();

  const [resumen, setResumen] = useState<ResumenPendientesSync | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [cobros, setCobros] = useState<Cobro[]>([]);
  const [clientesMap, setClientesMap] = useState<Record<number, string>>({});
  const [cargando, setCargando] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [prods, clis, unis, vtas, cobs, todosClientes] = await Promise.all([
        productosRepo.getDirty(),
        clientesRepo.getDirty(),
        unidadesRepo.getDirty(),
        ventasRepo.getDirty(),
        cobrosRepo.getDirty(),
        clientesRepo.getAll(),
      ]);
      setProductos(prods);
      setClientes(clis);
      setUnidades(unis);
      setVentas(vtas);
      setCobros(cobs);
      setResumen({
        productos: prods.length,
        clientes: clis.length,
        unidades: unis.length,
        ventas: vtas.length,
        cobros: cobs.length,
      });
      const map: Record<number, string> = {};
      todosClientes.forEach((c) => {
        map[c.id] = c.nombre;
      });
      setClientesMap(map);
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );

  const onSincronizarPulse = useCallback(() => {
    if (!accessToken) {
      Alert.alert('Sincronización', 'Inicia sesión con tu cuenta Pulse para poder enviar datos al servidor.');
      return;
    }
    void (async () => {
      setSincronizando(true);
      try {
        const result = await runSyncCycle(accessToken, { silent: false });
        if (!result) {
          Alert.alert('Sincronización', 'Ya hay una sincronización en curso, espera un momento.');
          return;
        }
        const { push: s, pull: p } = result;
        const partes: string[] = [];
        if (s.productos) partes.push(`${s.productos} producto(s)`);
        if (s.clientes) partes.push(`${s.clientes} cliente(s)`);
        if (s.unidades) partes.push(`${s.unidades} unidad(es) de medida`);
        if (s.ventas) partes.push(`${s.ventas} venta(s)`);
        if (s.cobros) partes.push(`${s.cobros} cobro(s)`);
        let mensaje =
          partes.length > 0
            ? `Enviado al servidor: ${partes.join(', ')}.`
            : 'No había registros pendientes de enviar.';
        if (s.cobrosOmitidosSinClienteRemoto > 0) {
          mensaje += `\n\n${s.cobrosOmitidosSinClienteRemoto} cobro(s) no se enviaron: el cliente aún no tiene id remoto (sincroniza clientes primero o revisa datos).`;
        }
        const recibidos = p.productos + p.clientes + p.unidades + p.ventas + p.cobros;
        if (recibidos > 0) {
          mensaje += `\n\nDescargado del servidor: ${recibidos} registro(s) nuevos o actualizados.`;
        }
        Alert.alert('Sincronización', mensaje);
        await cargar();
      } catch (e) {
        const msg =
          e instanceof PulseAuthError
            ? e.message
            : e instanceof Error
              ? e.message
              : 'Error inesperado';
        Alert.alert('Sincronización', msg);
      } finally {
        setSincronizando(false);
      }
    })();
  }, [accessToken, cargar]);

  if (cargando) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.contenedor}>
        <View style={styles.header}>
          <Text style={styles.titulo}>Sincronización</Text>
        </View>
        <ActivityIndicator size="large" color={colors.verde} style={styles.loader} />
        </View>
      </SafeAreaView>
    );
  }

  const totalPendientes =
    resumen != null
      ? resumen.productos + resumen.clientes + resumen.unidades + resumen.ventas + resumen.cobros
      : 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.contenedor}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
      <View style={styles.header}>
        <View style={styles.headerTituloRow}>
          <View style={styles.headerIcon}>
            <Cloud size={28} color={colors.verde} />
          </View>
          <Text style={styles.titulo}>Sincronización</Text>
        </View>
        <Text style={styles.subtitulo}>
          Tus datos de ventas e inventario viven en este dispositivo. Inicia sesión cuando quieras
          enlazar la cuenta Pulse para sincronizar con el servidor (el token no reemplaza tu base
          local).
        </Text>
      </View>

      <PulseAuthSection />

      <Pressable
        style={({ pressed }) => [
          styles.btnSync,
          {
            backgroundColor: accessToken ? colors.verde : colors.borde,
            opacity: pressed || sincronizando || !accessToken ? 0.75 : 1,
          },
        ]}
        onPress={onSincronizarPulse}
        disabled={!accessToken || sincronizando}
      >
        {sincronizando ? (
          <ActivityIndicator color={colors.onPrimario} />
        ) : (
          <Text style={[styles.btnSyncText, { color: accessToken ? colors.onPrimario : colors.textoSuave }]}>
            {accessToken ? 'Sincronizar con Pulse' : 'Inicia sesión para sincronizar'}
          </Text>
        )}
      </Pressable>

      <View style={styles.cardCuando}>
        <View style={styles.cardCuandoIcon}>
          <Info size={20} color={colors.verde} />
        </View>
        <View style={styles.cardCuandoTexto}>
          <Text style={styles.cardCuandoTitulo}>¿Cuándo se sincronizan?</Text>
          <Text style={styles.cardCuandoCuerpo}>
            Con sesión iniciada, pulsa «Sincronizar con Pulse» para enviar productos, clientes, ventas
            y cobros pendientes al API (orden recomendado por el servidor). Los datos siguen en el
            teléfono; el servidor guarda copia y te devuelve ids remotos.
          </Text>
        </View>
      </View>

      <View style={styles.cardResumen}>
        <Text style={styles.cardResumenLabel}>Total pendientes de sincronizar</Text>
        <Text style={styles.cardResumenValor}>{totalPendientes}</Text>
        <Text style={styles.cardResumenUnidad}>registros</Text>
      </View>

      {productos.length > 0 && (
        <View style={styles.bloque}>
          <View style={styles.bloqueTituloRow}>
            <Package size={18} color={colors.verde} />
            <Text style={styles.bloqueTitulo}>Productos ({productos.length})</Text>
          </View>
          <View style={styles.listaCard}>
            {productos.map((p, i) => (
              <View
                key={p.id}
                style={[styles.itemFila, i === productos.length - 1 && styles.itemFilaLast]}
              >
                <Text style={styles.itemNombre} numberOfLines={1}>{p.nombre}</Text>
                <Text style={styles.itemDetalle}>
                  ${p.precioVenta.toFixed(2)} · Stock: {p.stock}
                  {p.pendingDelete ? ' · Eliminado (pendiente de confirmar)' : ''}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {clientes.length > 0 && (
        <View style={styles.bloque}>
          <View style={styles.bloqueTituloRow}>
            <Users size={18} color={colors.verde} />
            <Text style={styles.bloqueTitulo}>Clientes ({clientes.length})</Text>
          </View>
          <View style={styles.listaCard}>
            {clientes.map((c, i) => (
              <View
                key={c.id}
                style={[styles.itemFila, i === clientes.length - 1 && styles.itemFilaLast]}
              >
                <Text style={styles.itemNombre} numberOfLines={1}>
                  {c.nombre}
                  {c.pendingDelete ? ' · Eliminado (pendiente de confirmar)' : ''}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {unidades.length > 0 && (
        <View style={styles.bloque}>
          <View style={styles.bloqueTituloRow}>
            <Ruler size={18} color={colors.verde} />
            <Text style={styles.bloqueTitulo}>Unidades de medida ({unidades.length})</Text>
          </View>
          <View style={styles.listaCard}>
            {unidades.map((u, i) => (
              <View
                key={u.id}
                style={[styles.itemFila, i === unidades.length - 1 && styles.itemFilaLast]}
              >
                <Text style={styles.itemNombre} numberOfLines={1}>
                  {u.nombre}
                  {u.pendingDelete ? ' · Eliminado (pendiente de confirmar)' : ''}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {ventas.length > 0 && (
        <View style={styles.bloque}>
          <View style={styles.bloqueTituloRow}>
            <ShoppingCart size={18} color={colors.verde} />
            <Text style={styles.bloqueTitulo}>Ventas ({ventas.length})</Text>
          </View>
          <View style={styles.listaCard}>
            {ventas.map((v, i) => (
              <View
                key={v.id}
                style={[styles.itemFila, i === ventas.length - 1 && styles.itemFilaLast]}
              >
                <Text style={styles.itemNombre}>${v.total.toFixed(2)} · {v.metodoPago}</Text>
                <Text style={styles.itemDetalle}>{formatFecha(v.fecha)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {cobros.length > 0 && (
        <View style={styles.bloque}>
          <View style={styles.bloqueTituloRow}>
            <Banknote size={18} color={colors.verde} />
            <Text style={styles.bloqueTitulo}>Cobros ({cobros.length})</Text>
          </View>
          <View style={styles.listaCard}>
            {cobros.map((c, i) => (
              <View
                key={c.id}
                style={[styles.itemFila, i === cobros.length - 1 && styles.itemFilaLast]}
              >
                <Text style={styles.itemNombre}>
                  ${c.monto.toFixed(2)} · {clientesMap[c.clienteId] ?? `Cliente #${c.clienteId}`}
                </Text>
                <Text style={styles.itemDetalle}>{formatFecha(c.fecha)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {totalPendientes === 0 && (
        <Text style={styles.mensajeCero}>
          No hay registros pendientes. Cuando agregues productos, ventas o cobros, aparecerán aquí
          para sincronizar con el servidor.
        </Text>
      )}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.fondo,
    },
    contenedor: {
      flex: 1,
      backgroundColor: colors.fondo,
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 40,
    },
    header: {
      marginBottom: 24,
    },
    headerTituloRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    headerIcon: {
      marginRight: 4,
    },
    titulo: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.texto,
    },
    subtitulo: {
      fontSize: 14,
      color: colors.textoSuave,
      marginTop: 8,
      lineHeight: 20,
    },
    loader: {
      marginTop: 48,
    },
    cardResumen: {
      backgroundColor: colors.superficie,
      borderRadius: 16,
      padding: 24,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: colors.borde,
      alignItems: 'center',
    },
    cardResumenLabel: {
      fontSize: 14,
      color: colors.textoSuave,
      marginBottom: 8,
    },
    cardResumenValor: {
      fontSize: 36,
      fontWeight: '700',
      color: colors.verde,
    },
    cardResumenUnidad: {
      fontSize: 14,
      color: colors.textoSuave,
      marginTop: 4,
    },
    cardCuando: {
      flexDirection: 'row',
      backgroundColor: 'rgba(122, 155, 110, 0.12)',
      borderRadius: 12,
      padding: 14,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: colors.borde,
      gap: 12,
    },
    cardCuandoIcon: {
      marginTop: 2,
    },
    cardCuandoTexto: {
      flex: 1,
    },
    cardCuandoTitulo: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.texto,
      marginBottom: 4,
    },
    cardCuandoCuerpo: {
      fontSize: 13,
      color: colors.textoSuave,
      lineHeight: 19,
    },
    bloque: {
      marginBottom: 20,
    },
    bloqueTituloRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 10,
    },
    bloqueTitulo: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.texto,
    },
    listaCard: {
      backgroundColor: colors.superficie,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.borde,
      overflow: 'hidden',
    },
    itemFila: {
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.borde,
    },
    itemNombre: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.texto,
    },
    itemDetalle: {
      fontSize: 13,
      color: colors.textoSuave,
      marginTop: 2,
    },
    itemFilaLast: {
      borderBottomWidth: 0,
    },
    mensajeCero: {
      fontSize: 14,
      color: colors.textoSuave,
      textAlign: 'center',
      marginTop: 24,
      paddingHorizontal: 16,
      lineHeight: 20,
    },
    btnSync: {
      marginBottom: 20,
      paddingVertical: 14,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 48,
    },
    btnSyncText: {
      fontSize: 16,
      fontWeight: '700',
    },
  });
}
