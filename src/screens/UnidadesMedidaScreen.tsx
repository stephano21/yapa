import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ruler } from 'lucide-react-native';
import {
  getUnidadesMedida,
  crearUnidadMedida,
  type UnidadMedida,
} from '../database/db';
import { useTheme } from '../context/ThemeContext';
import type { ColorPalette } from '../theme';

export default function UnidadesMedidaScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [unidades, setUnidades] = useState<UnidadMedida[]>([]);
  const [cargando, setCargando] = useState(true);
  const [nombre, setNombre] = useState('');
  const [factor, setFactor] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const list = await getUnidadesMedida();
      setUnidades(list);
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );

  const agregar = async () => {
    const n = nombre.trim();
    const f = parseInt(factor.replace(',', '.'), 10);
    if (!n || !Number.isFinite(f) || f <= 0) return;
    setGuardando(true);
    try {
      await crearUnidadMedida(n, f);
      setNombre('');
      setFactor('');
      await cargar();
    } catch (e) {
      console.error(e);
    } finally {
      setGuardando(false);
    }
  };

  const renderItem = ({ item }: { item: UnidadMedida }) => (
    <View style={styles.fila}>
      <View style={styles.filaIcono}>
        <Ruler size={20} color={colors.verde} />
      </View>
      <View style={styles.filaTexto}>
        <Text style={styles.filaNombre} numberOfLines={1}>
          {item.nombre}
        </Text>
        <Text style={styles.filaSub}>
          Factor: {item.unidades} unidades base (ej. docena = 12)
        </Text>
      </View>
    </View>
  );

  const renderHeader = () => (
    <View style={styles.intro}>
      <Text style={styles.introTitulo}>Cómo se usa</Text>
      <Text style={styles.introTexto}>
        Cada unidad tiene un factor: cuántas “unidades base” representa (la unidad base es 1).
        En inventario eliges la unidad, ingresas cantidad y costo total de ese paquete; la app
        convierte a stock y costo unitario al guardar el producto.
      </Text>
      {cargando ? (
        <ActivityIndicator size="large" color={colors.verde} style={styles.loader} />
      ) : null}
    </View>
  );

  const renderFooter = () => (
    <View style={styles.formCard}>
      <Text style={styles.formTitulo}>Nueva unidad</Text>
      <Text style={styles.label}>Nombre</Text>
      <TextInput
        style={styles.input}
        placeholder="Ej: Media docena"
        placeholderTextColor={colors.textoSuave}
        value={nombre}
        onChangeText={setNombre}
      />
      <Text style={styles.label}>Factor (unidades base)</Text>
      <TextInput
        style={styles.input}
        placeholder="Ej: 6"
        placeholderTextColor={colors.textoSuave}
        value={factor}
        onChangeText={setFactor}
        keyboardType="number-pad"
      />
      <TouchableOpacity
        style={[styles.btnAgregar, guardando && styles.btnDisabled]}
        onPress={agregar}
        disabled={guardando}
        activeOpacity={0.85}
      >
        <Text style={styles.btnAgregarTexto}>
          {guardando ? 'Guardando…' : 'Agregar unidad'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={cargando ? [] : unidades}
        keyExtractor={(u) => String(u.id)}
        contentContainerStyle={styles.listaContent}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        renderItem={renderItem}
        ListEmptyComponent={
          cargando ? null : (
            <Text style={styles.empty}>No hay unidades. Agrega una abajo.</Text>
          )
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.fondo,
    },
    listaContent: {
      paddingHorizontal: 20,
      paddingBottom: 32,
    },
    intro: {
      marginBottom: 20,
      paddingTop: 8,
    },
    introTitulo: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.texto,
      marginBottom: 8,
    },
    introTexto: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.textoSuave,
    },
    loader: {
      marginVertical: 24,
    },
    empty: {
      color: colors.textoSuave,
      fontSize: 15,
      textAlign: 'center',
      marginVertical: 16,
    },
    fila: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.superficie,
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.borde,
    },
    filaIcono: {
      marginRight: 12,
    },
    filaTexto: {
      flex: 1,
    },
    filaNombre: {
      fontSize: 17,
      fontWeight: '600',
      color: colors.texto,
    },
    filaSub: {
      marginTop: 4,
      fontSize: 13,
      color: colors.textoSuave,
    },
    formCard: {
      marginTop: 28,
      backgroundColor: colors.superficie,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.borde,
    },
    formTitulo: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.texto,
      marginBottom: 12,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textoSuave,
      marginBottom: 8,
      marginTop: 10,
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
    btnAgregar: {
      backgroundColor: colors.verde,
      borderRadius: 14,
      paddingVertical: 16,
      marginTop: 20,
      alignItems: 'center',
    },
    btnDisabled: {
      opacity: 0.65,
    },
    btnAgregarTexto: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.onPrimario,
    },
  });
}
