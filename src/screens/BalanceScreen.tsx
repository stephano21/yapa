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
  Modal,
  Pressable,
  TextInput,
} from 'react-native';
import { Share2, TrendingUp, DollarSign, FileText, UserPlus, X } from 'lucide-react-native';
import { ventasRepo } from '../database/repositories/ventasRepo';
import { clientesRepo } from '../database/repositories/clientesRepo';
import { cobrosRepo } from '../database/repositories/cobrosRepo';
import { productosRepo } from '../database/repositories/productosRepo';
import { calcularGananciaEstimada } from '../domain/finanzas';
import { useTheme } from '../context/ThemeContext';
import type { ColorPalette } from '../theme';
import ComprobanteModal from '../components/ComprobanteModal';
import type { ComprobanteVenta } from '../database/repositories/ventasRepo';
import { getFechaLocalYYYYMMDD } from '../utils/dateLocal';

function formatHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-EC', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatFechaDia(isoYYYYMMDD: string): string {
  return new Date(isoYYYYMMDD + 'T12:00:00').toLocaleDateString('es-EC', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function formatFechaCompleta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-EC', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatHoraCompleta(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-EC', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Agrupa comprobantes por fecha (YYYY-MM-DD). */
function agruparComprobantesPorFecha(
  comprobantes: ComprobanteVenta[]
): { fecha: string; comprobantes: ComprobanteVenta[] }[] {
  const porFecha: Record<string, ComprobanteVenta[]> = {};
  comprobantes.forEach((c) => {
    const dia = c.fecha.slice(0, 10);
    if (!porFecha[dia]) porFecha[dia] = [];
    porFecha[dia].push(c);
  });
  return Object.entries(porFecha)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([fecha, comprobantesDelDia]) => ({ fecha, comprobantes: comprobantesDelDia }));
}

type ResumenBalance = {
  totalVentas: number;
  totalCobrado: number;
  totalFiado: number;
  porMetodo: Record<string, number>;
  cantidadVentas: number;
  gananciaEstimada: number;
  ventasDelDia: { id: number; fecha: string; total: number; metodo_pago: string }[];
  diasAnteriores: { fecha: string; totalVentas: number; cantidadVentas: number }[];
  clientesConDeuda: { id: number; nombre: string; deuda: number }[];
};

export default function BalanceScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [resumen, setResumen] = useState<ResumenBalance | null>(null);
  const [cargando, setCargando] = useState(true);

  const [showCobroModal, setShowCobroModal] = useState(false);
  const [clienteParaCobro, setClienteParaCobro] = useState<{ id: number; nombre: string; deuda: number } | null>(null);
  const [montoCobro, setMontoCobro] = useState('');
  const [showDetalleCliente, setShowDetalleCliente] = useState(false);
  const [clienteDetalle, setClienteDetalle] = useState<{ id: number; nombre: string; deuda: number } | null>(null);
  const [comprobantesFiados, setComprobantesFiados] = useState<ComprobanteVenta[]>([]);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [saldoDetalle, setSaldoDetalle] = useState<{
    deuda_inicial: number;
    saldo_a_favor: number;
    balance: number;
  } | null>(null);
  const [showCargaPrevia, setShowCargaPrevia] = useState(false);
  const [montoCargaPrevia, setMontoCargaPrevia] = useState('');
  const [showAbonoFavor, setShowAbonoFavor] = useState(false);
  const [montoAbonoFavor, setMontoAbonoFavor] = useState('');
  const [comprobanteSeleccionado, setComprobanteSeleccionado] = useState<ComprobanteVenta | null>(null);
  const [showComprobante, setShowComprobante] = useState(false);
  const [fechaSeleccionada, setFechaSeleccionada] = useState<string | null>(null);

  const totalVentas = resumen?.totalVentas ?? 0;
  const totalCobrado = resumen?.totalCobrado ?? 0;
  const totalFiado = resumen?.totalFiado ?? 0;
  const porMetodo = resumen?.porMetodo ?? {};
  const cantidadVentas = resumen?.cantidadVentas ?? 0;
  const gananciaEstimada = resumen?.gananciaEstimada ?? 0;
  const ventasDelDia = resumen?.ventasDelDia ?? [];
  const diasAnteriores = resumen?.diasAnteriores ?? [];
  const clientesConDeuda = resumen?.clientesConDeuda ?? [];

  const esHoy = fechaSeleccionada === null;
  const fechaParaCargar = fechaSeleccionada ?? getFechaLocalYYYYMMDD();

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [resumenVentas, ventas, dias, deudas, todosProductos] = await Promise.all([
        ventasRepo.getResumenPorFecha(fechaParaCargar),
        ventasRepo.getDelDiaConId(esHoy ? undefined : fechaParaCargar),
        ventasRepo.getDiasConVentas(30),
        clientesRepo.getConBalance(),
        productosRepo.getAll(),
      ]);
      const gananciaEstimada = calcularGananciaEstimada(
        resumenVentas.totalVentas,
        todosProductos.map((p) => ({
          precioVenta: p.precioVenta,
          precioCosto: p.precioCosto,
          precioMinimo: p.precioMinimo,
        }))
      );
      setResumen({
        totalVentas: resumenVentas.totalVentas,
        totalCobrado: resumenVentas.totalCobrado,
        totalFiado: resumenVentas.totalFiadoPendiente,
        porMetodo: resumenVentas.porMetodo,
        cantidadVentas: resumenVentas.cantidadVentas,
        gananciaEstimada,
        ventasDelDia: ventas,
        diasAnteriores: dias,
        clientesConDeuda: deudas.map((d) => ({ id: d.id, nombre: d.nombre, deuda: d.balance })),
      });
    } finally {
      setCargando(false);
    }
  }, [esHoy, fechaParaCargar]);

  const abrirComprobante = useCallback(async (ventaId: number) => {
    const comp = await ventasRepo.getComprobantePorId(ventaId);
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

  const verDia = useCallback((fecha: string) => {
    setFechaSeleccionada(fecha);
  }, []);

  const verHoy = useCallback(() => {
    setFechaSeleccionada(null);
  }, []);

  const abrirDetalleCliente = useCallback(async (cliente: { id: number; nombre: string; deuda: number }) => {
    setClienteDetalle(cliente);
    setShowDetalleCliente(true);
    setCargandoDetalle(true);
    setComprobantesFiados([]);
    setSaldoDetalle(null);
    try {
      const [ventasFiadas, saldo] = await Promise.all([
        ventasRepo.getFiadasPorCliente(cliente.id),
        clientesRepo.getSaldoDetalle(cliente.id),
      ]);
      setSaldoDetalle(saldo);
      const comprobantes = await Promise.all(
        ventasFiadas.map((v) => ventasRepo.getComprobantePorId(v.id))
      );
      setComprobantesFiados(comprobantes.filter((c): c is ComprobanteVenta => c != null));
    } finally {
      setCargandoDetalle(false);
    }
  }, []);

  const abrirCobroDesdeDetalle = useCallback(() => {
    if (!clienteDetalle) return;
    setShowDetalleCliente(false);
    setClienteParaCobro(clienteDetalle);
    const sugerido = clienteDetalle.deuda > 0 ? clienteDetalle.deuda : 0;
    setMontoCobro(sugerido.toFixed(2));
    setShowCobroModal(true);
    setClienteDetalle(null);
    setComprobantesFiados([]);
    setSaldoDetalle(null);
  }, [clienteDetalle]);

  const guardarCargaPrevia = useCallback(async () => {
    if (!clienteDetalle) return;
    const monto = parseFloat(montoCargaPrevia.replace(',', '.'));
    if (!Number.isFinite(monto) || monto < 0) return;
    await clientesRepo.setDeudaInicial(clienteDetalle.id, monto);
    setShowCargaPrevia(false);
    setMontoCargaPrevia('');
    const saldo = await clientesRepo.getSaldoDetalle(clienteDetalle.id);
    setSaldoDetalle(saldo);
    setClienteDetalle((c) => (c ? { ...c, deuda: saldo.balance } : null));
    cargar();
  }, [clienteDetalle, montoCargaPrevia, cargar]);

  const guardarAbonoFavor = useCallback(async () => {
    if (!clienteDetalle) return;
    const monto = parseFloat(montoAbonoFavor.replace(',', '.'));
    if (!Number.isFinite(monto) || monto <= 0) return;
    await clientesRepo.addSaldoAFavor(clienteDetalle.id, monto);
    setShowAbonoFavor(false);
    setMontoAbonoFavor('');
    const saldo = await clientesRepo.getSaldoDetalle(clienteDetalle.id);
    setSaldoDetalle(saldo);
    setClienteDetalle((c) => (c ? { ...c, deuda: saldo.balance } : null));
    cargar();
  }, [clienteDetalle, montoAbonoFavor, cargar]);

  const abrirCobro = useCallback((cliente: { id: number; nombre: string; deuda: number }) => {
    setClienteParaCobro(cliente);
    setMontoCobro(cliente.deuda.toFixed(2));
    setShowCobroModal(true);
  }, []);

  const guardarCobro = useCallback(async () => {
    if (!clienteParaCobro) return;
    const monto = parseFloat(montoCobro.replace(',', '.'));
    if (!Number.isFinite(monto) || monto <= 0) return;
    await cobrosRepo.registrar(clienteParaCobro.id, monto);
    setShowCobroModal(false);
    setClienteParaCobro(null);
    setMontoCobro('');
    cargar();
  }, [clienteParaCobro, montoCobro, cargar]);

  useEffect(() => {
    cargar();
  }, [fechaSeleccionada, cargar]);

  const generarMensajeCierre = (): string => {
    const partes = Object.entries(porMetodo)
      .filter(([, m]) => m > 0)
      .map(([metodo, m]) => `${metodo}: $${m.toFixed(2)}`);
    const detalle = partes.length > 0 ? ` (${partes.join(', ')})` : '';
    const cobradoFiado =
      totalCobrado > 0 || totalFiado > 0
        ? ` ${[
            totalCobrado > 0 ? `Cobrado: $${totalCobrado.toFixed(2)}` : null,
            totalFiado > 0 ? `Fiado pendiente: $${totalFiado.toFixed(2)}` : null,
          ]
            .filter(Boolean)
            .join(', ')}.`
        : '';
    const frase =
      totalVentas > 0
        ? cantidadVentas >= 5
          ? '¡Ventas en alza! 📈'
          : '¡Buen día! 👍'
        : 'Sin ventas hoy.';
    return `Reporte Yapa de hoy: Total $${totalVentas.toFixed(2)}${detalle}.${cobradoFiado} ${frase}`;
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
        <View style={styles.headerRow}>
          <Text style={styles.titulo}>
            {esHoy ? 'Balance del día' : `Balance del ${formatFechaDia(fechaParaCargar)}`}
          </Text>
          {!esHoy && (
            <TouchableOpacity style={styles.btnVerHoy} onPress={verHoy}>
              <Text style={styles.btnVerHoyTexto}>Ver hoy</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.cardPrincipal}>
        <View style={styles.cardPrincipalIcon}>
          <DollarSign size={32} color={colors.verde} />
        </View>
        <Text style={styles.pregunta}>
          {esHoy ? '¿Cuánto he vendido hoy?' : `Total vendido`}
        </Text>
        <Text style={styles.totalVentas}>${totalVentas.toFixed(2)}</Text>
        <Text style={styles.subtexto}>{cantidadVentas} ventas</Text>
        {(totalCobrado > 0 || totalFiado > 0) && (
          <View style={styles.filaCobradoFiado}>
            <Text style={styles.filaCobradoFiadoTexto}>
              Cobrado: ${totalCobrado.toFixed(2)}
            </Text>
            {totalFiado > 0 && (
              <Text style={styles.filaFiadoTexto}>Fiado pendiente: ${totalFiado.toFixed(2)}</Text>
            )}
          </View>
        )}
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
          <Text style={styles.seccionTitulo}>
            {esHoy ? 'Comprobantes del día' : 'Comprobantes'}
          </Text>
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

      {esHoy && (
        <TouchableOpacity style={styles.btnCompartir} onPress={compartirCierre}>
          <Share2 size={22} color={colors.onPrimario} />
          <Text style={styles.btnCompartirTexto}>Compartir cierre</Text>
        </TouchableOpacity>
      )}

      {clientesConDeuda.length > 0 && (
        <View style={styles.seccionDeudas}>
          <Text style={styles.seccionTitulo}>Cuentas por cobrar</Text>
          {clientesConDeuda.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={styles.filaDeuda}
              onPress={() => abrirDetalleCliente(c)}
              activeOpacity={0.7}
            >
              <UserPlus size={20} color={colors.naranja} />
              <View style={styles.filaDeudaInfo}>
                <Text style={styles.filaDeudaNombre}>{c.nombre}</Text>
                <Text style={[styles.filaDeudaMonto, c.deuda < 0 && styles.filaDeudaSaldoFavor]}>
                  {c.deuda > 0 ? `Debe: $${c.deuda.toFixed(2)}` : `Saldo a favor: $${Math.abs(c.deuda).toFixed(2)}`}
                </Text>
              </View>
              <Text style={styles.filaDeudaCobrar}>Ver detalle</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {diasAnteriores.length > 0 && (
        <View style={styles.seccionHistorial}>
          <Text style={styles.seccionTitulo}>Días anteriores</Text>
          {diasAnteriores.map((d) => (
            <TouchableOpacity
              key={d.fecha}
              style={styles.filaDia}
              onPress={() => verDia(d.fecha)}
              activeOpacity={0.7}
            >
              <Text style={styles.filaDiaFecha}>{formatFechaDia(d.fecha)}</Text>
              <Text style={styles.filaDiaTotal}>${d.totalVentas.toFixed(2)}</Text>
              <Text style={styles.filaDiaCantidad}>({d.cantidadVentas} ventas)</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {esHoy && (
        <Text style={styles.hint}>
          Envía el resumen por WhatsApp al dueño del local o guárdalo para tu control.
        </Text>
      )}

      <ComprobanteModal
        visible={showComprobante}
        comprobante={comprobanteSeleccionado}
        onCerrar={() => {
          setShowComprobante(false);
          setComprobanteSeleccionado(null);
        }}
      />

      <Modal visible={showDetalleCliente} transparent animationType="slide">
        <Pressable style={styles.modalCobroOverlay} onPress={() => { setShowDetalleCliente(false); setClienteDetalle(null); setComprobantesFiados([]); setSaldoDetalle(null); }}>
          <Pressable style={styles.modalDetalleContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalCobroHeader}>
              <Text style={styles.modalCobroTitulo}>Detalle de cuenta</Text>
              <TouchableOpacity onPress={() => { setShowDetalleCliente(false); setClienteDetalle(null); setComprobantesFiados([]); setSaldoDetalle(null); }}>
                <X size={24} color={colors.texto} />
              </TouchableOpacity>
            </View>
            {clienteDetalle && (
              <>
                <Text style={styles.modalCobroCliente}>{clienteDetalle.nombre}</Text>
                {saldoDetalle && (
                  <>
                    {saldoDetalle.deuda_inicial > 0 && (
                      <Text style={styles.modalDetalleDeudaInicial}>Deuda inicial (antes del app): ${saldoDetalle.deuda_inicial.toFixed(2)}</Text>
                    )}
                    {saldoDetalle.saldo_a_favor > 0 && (
                      <Text style={styles.modalDetalleSaldoFavor}>Saldo a favor: ${saldoDetalle.saldo_a_favor.toFixed(2)}</Text>
                    )}
                  </>
                )}
                <Text style={styles.modalDetalleDeuda}>
                  {clienteDetalle.deuda > 0
                    ? `Deuda total: $${clienteDetalle.deuda.toFixed(2)}`
                    : clienteDetalle.deuda < 0
                      ? `Saldo a favor: $${Math.abs(clienteDetalle.deuda).toFixed(2)}`
                      : 'Al día'}
                </Text>
                <View style={styles.detalleAccionesCuenta}>
                  <TouchableOpacity style={styles.detalleBtnSecundario} onPress={() => { setMontoCargaPrevia(''); setShowCargaPrevia(true); }}>
                    <Text style={styles.detalleBtnSecundarioTexto}>Cargar cuenta previa</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.detalleBtnSecundario} onPress={() => { setMontoAbonoFavor(''); setShowAbonoFavor(true); }}>
                    <Text style={styles.detalleBtnSecundarioTexto}>Abonar a favor</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.modalDetalleSubtitulo}>Comprobantes fiados (detalle de facturas)</Text>
                {cargandoDetalle ? (
                  <ActivityIndicator size="small" color={colors.verde} style={styles.detalleLoader} />
                ) : (
                  <ScrollView style={styles.modalDetalleLista} showsVerticalScrollIndicator={false}>
                    {agruparComprobantesPorFecha(comprobantesFiados).map(({ fecha, comprobantes: compsDelDia }) => (
                      <View key={fecha} style={styles.detalleGrupoFecha}>
                        <Text style={styles.detalleFechaHeader}>{formatFechaCompleta(fecha + 'T12:00:00')}</Text>
                        {compsDelDia.map((comp) => (
                          <View key={comp.id} style={styles.detalleComprobante}>
                            <View style={styles.detalleComprobanteHeader}>
                              <Text style={styles.detalleHora}>{formatHoraCompleta(comp.fecha)}</Text>
                              <Text style={styles.detalleVentaId}>Nº {String(comp.id).padStart(6, '0')}</Text>
                              <Text style={styles.detalleMonto}>Total ${comp.total.toFixed(2)}</Text>
                            </View>
                            <View style={styles.detalleItemsWrap}>
                              {comp.items.map((it, idx) => (
                                <View key={idx} style={styles.detalleItemFila}>
                                  <Text style={styles.detalleItemDesc} numberOfLines={1}>{it.descripcion}</Text>
                                  <Text style={styles.detalleItemCant}>{it.cantidad}</Text>
                                  <Text style={styles.detalleItemPu}>${it.precio_unitario.toFixed(2)}</Text>
                                  <Text style={styles.detalleItemSub}>${it.subtotal.toFixed(2)}</Text>
                                </View>
                              ))}
                            </View>
                          </View>
                        ))}
                      </View>
                    ))}
                  </ScrollView>
                )}
                {clienteDetalle.deuda > 0 && (
                  <TouchableOpacity style={styles.modalCobroBtn} onPress={abrirCobroDesdeDetalle}>
                    <Text style={styles.modalCobroBtnTexto}>Registrar cobro</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showCargaPrevia} transparent animationType="fade">
        <Pressable style={styles.modalCobroOverlay} onPress={() => setShowCargaPrevia(false)}>
          <Pressable style={styles.modalCobroContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalCobroHeader}>
              <Text style={styles.modalCobroTitulo}>Cargar cuenta previa</Text>
              <TouchableOpacity onPress={() => setShowCargaPrevia(false)}>
                <X size={24} color={colors.texto} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalCobroHint}>Deuda que el cliente ya tenía antes de usar la app.</Text>
            <Text style={styles.modalCobroLabel}>Monto de deuda inicial ($)</Text>
            <TextInput
              style={styles.modalCobroInput}
              value={montoCargaPrevia}
              onChangeText={setMontoCargaPrevia}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textoSuave}
            />
            <TouchableOpacity style={styles.modalCobroBtn} onPress={guardarCargaPrevia}>
              <Text style={styles.modalCobroBtnTexto}>Guardar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showAbonoFavor} transparent animationType="fade">
        <Pressable style={styles.modalCobroOverlay} onPress={() => setShowAbonoFavor(false)}>
          <Pressable style={styles.modalCobroContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalCobroHeader}>
              <Text style={styles.modalCobroTitulo}>Abonar saldo a favor</Text>
              <TouchableOpacity onPress={() => setShowAbonoFavor(false)}>
                <X size={24} color={colors.texto} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalCobroHint}>El cliente deja dinero para futuras compras fiadas.</Text>
            <Text style={styles.modalCobroLabel}>Monto a abonar ($)</Text>
            <TextInput
              style={styles.modalCobroInput}
              value={montoAbonoFavor}
              onChangeText={setMontoAbonoFavor}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textoSuave}
            />
            <TouchableOpacity style={styles.modalCobroBtn} onPress={guardarAbonoFavor}>
              <Text style={styles.modalCobroBtnTexto}>Guardar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showCobroModal} transparent animationType="fade">
        <Pressable style={styles.modalCobroOverlay} onPress={() => setShowCobroModal(false)}>
          <Pressable style={styles.modalCobroContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalCobroHeader}>
              <Text style={styles.modalCobroTitulo}>Registrar cobro</Text>
              <TouchableOpacity onPress={() => setShowCobroModal(false)}>
                <X size={24} color={colors.texto} />
              </TouchableOpacity>
            </View>
            {clienteParaCobro && (
              <>
                <Text style={styles.modalCobroCliente}>{clienteParaCobro.nombre}</Text>
                <Text style={styles.modalCobroDeuda}>Deuda: ${clienteParaCobro.deuda.toFixed(2)}</Text>
                <Text style={styles.modalCobroLabel}>Monto a cobrar ($)</Text>
                <TextInput
                  style={styles.modalCobroInput}
                  value={montoCobro}
                  onChangeText={setMontoCobro}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.textoSuave}
                />
                <TouchableOpacity style={styles.modalCobroBtn} onPress={guardarCobro}>
                  <Text style={styles.modalCobroBtnTexto}>Registrar cobro</Text>
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  titulo: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.texto,
    flex: 1,
  },
  btnVerHoy: {
    backgroundColor: colors.verde,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  btnVerHoyTexto: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.onPrimario,
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
  filaCobradoFiado: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 12,
    flexWrap: 'wrap',
  },
  filaCobradoFiadoTexto: {
    fontSize: 14,
    color: colors.textoSuave,
  },
  filaFiadoTexto: {
    fontSize: 14,
    color: colors.naranja,
    fontWeight: '600',
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
  seccionDeudas: {
    marginBottom: 24,
  },
  filaDeuda: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.superficie,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.borde,
  },
  filaDeudaInfo: {
    flex: 1,
  },
  filaDeudaNombre: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.texto,
  },
  filaDeudaMonto: {
    fontSize: 14,
    color: colors.naranja,
    marginTop: 2,
  },
  filaDeudaSaldoFavor: {
    color: colors.verde,
  },
  filaDeudaCobrar: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.verde,
  },
  modalCobroOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalDetalleContent: {
    backgroundColor: colors.superficie,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.borde,
    maxHeight: '80%',
  },
  modalDetalleDeuda: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.naranja,
    marginBottom: 16,
  },
  modalDetalleDeudaInicial: {
    fontSize: 13,
    color: colors.textoSuave,
    marginBottom: 4,
  },
  modalDetalleSaldoFavor: {
    fontSize: 13,
    color: colors.verde,
    marginBottom: 4,
  },
  detalleAccionesCuenta: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  detalleBtnSecundario: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borde,
    alignItems: 'center',
  },
  detalleBtnSecundarioTexto: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.texto,
  },
  modalDetalleSubtitulo: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textoSuave,
    marginBottom: 10,
  },
  modalDetalleLista: {
    maxHeight: 220,
    marginBottom: 16,
  },
  detalleGrupoFecha: {
    marginBottom: 16,
  },
  detalleFechaHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.texto,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.borde,
  },
  detalleFilaVenta: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 0,
    gap: 12,
  },
  detalleHora: {
    fontSize: 14,
    color: colors.textoSuave,
    minWidth: 48,
  },
  detalleVentaId: {
    flex: 1,
    fontSize: 13,
    color: colors.texto,
  },
  detalleMonto: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.verde,
  },
  detalleLoader: {
    marginVertical: 24,
  },
  detalleComprobante: {
    marginBottom: 14,
    paddingLeft: 8,
    borderLeftWidth: 3,
    borderLeftColor: colors.borde,
  },
  detalleComprobanteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 12,
  },
  detalleItemsWrap: {
    paddingLeft: 4,
    marginTop: 4,
  },
  detalleItemFila: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 8,
  },
  detalleItemDesc: {
    flex: 1,
    fontSize: 13,
    color: colors.textoSuave,
    maxWidth: '40%',
  },
  detalleItemCant: {
    fontSize: 12,
    color: colors.textoSuave,
    minWidth: 24,
    textAlign: 'right',
  },
  detalleItemPu: {
    fontSize: 12,
    color: colors.textoSuave,
    minWidth: 48,
    textAlign: 'right',
  },
  detalleItemSub: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.texto,
    minWidth: 52,
    textAlign: 'right',
  },
  modalCobroContent: {
    backgroundColor: colors.superficie,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.borde,
  },
  modalCobroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalCobroTitulo: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.texto,
  },
  modalCobroCliente: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.texto,
    marginBottom: 4,
  },
  modalCobroDeuda: {
    fontSize: 14,
    color: colors.textoSuave,
    marginBottom: 16,
  },
  modalCobroLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textoSuave,
    marginBottom: 8,
  },
  modalCobroHint: {
    fontSize: 13,
    color: colors.textoSuave,
    marginBottom: 12,
  },
  modalCobroInput: {
    backgroundColor: colors.fondo,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    color: colors.texto,
    borderWidth: 1,
    borderColor: colors.borde,
    marginBottom: 20,
  },
  modalCobroBtn: {
    backgroundColor: colors.verde,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalCobroBtnTexto: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.onPrimario,
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
  seccionHistorial: {
    marginTop: 8,
    marginBottom: 24,
  },
  filaDia: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.superficie,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.borde,
    gap: 12,
  },
  filaDiaFecha: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.texto,
  },
  filaDiaTotal: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.verde,
  },
  filaDiaCantidad: {
    fontSize: 13,
    color: colors.textoSuave,
  },
  hint: {
    fontSize: 13,
    color: colors.textoSuave,
    textAlign: 'center',
    lineHeight: 20,
  },
  });
}
