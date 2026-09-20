import { useCallback, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Users, UserPlus, Mail, Lock } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth, PulseAuthError } from '../context/AuthContext';
import { listTeamUsers, createTeamUser, type TeamUser } from '../api/pulseTeam';
import type { ColorPalette } from '../theme';

/** Validación básica de formato de email (UX; el servidor valida de verdad). */
function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function EquipoSection() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { accessToken } = useAuth();

  const [usuarios, setUsuarios] = useState<TeamUser[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(() => {
    if (!accessToken) return;
    setCargando(true);
    listTeamUsers(accessToken)
      .then(setUsuarios)
      .catch((e) => {
        if (__DEV__) console.warn('[EquipoSection] listar', e);
      })
      .finally(() => setCargando(false));
  }, [accessToken]);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );

  const onAgregar = useCallback(async () => {
    if (!accessToken) return;
    if (!email.trim() || !password) {
      Alert.alert('Agregar usuario', 'Introduce correo y contraseña.');
      return;
    }
    if (!isValidEmail(email)) {
      Alert.alert('Agregar usuario', 'El correo no tiene un formato válido.');
      return;
    }
    setEnviando(true);
    try {
      await createTeamUser(accessToken, email.trim(), password);
      setEmail('');
      setPassword('');
      setMostrarForm(false);
      cargar();
      Alert.alert('Agregar usuario', 'Usuario creado. Ya puede iniciar sesión con esa contraseña.');
    } catch (e) {
      const msg = e instanceof PulseAuthError ? e.message : 'Error inesperado';
      Alert.alert('Agregar usuario', msg);
    } finally {
      setEnviando(false);
    }
  }, [accessToken, email, password, cargar]);

  if (!accessToken) return null;

  return (
    <View style={[styles.card, { borderColor: colors.borde }]}>
      <View style={styles.headerRow}>
        <Users size={20} color={colors.verde} />
        <Text style={[styles.cardTitle, { color: colors.texto }]}>Mi equipo</Text>
      </View>
      <Text style={[styles.hint, { color: colors.textoSuave }]}>
        Los usuarios que agregues acá pueden iniciar sesión con su propio correo y ver los datos de
        tu negocio.
      </Text>

      {cargando && usuarios === null ? (
        <ActivityIndicator color={colors.verde} style={{ marginTop: 12 }} />
      ) : (
        <View style={styles.lista}>
          {(usuarios ?? []).map((u, i) => (
            <View
              key={u.id}
              style={[styles.itemFila, i === (usuarios?.length ?? 0) - 1 && styles.itemFilaLast]}
            >
              <Text style={[styles.itemEmail, { color: colors.texto }]} numberOfLines={1}>
                {u.email}
              </Text>
              <Text style={[styles.itemDetalle, { color: colors.textoSuave }]}>
                {u.email_confirmed ? 'Confirmado' : 'Sin confirmar'}
              </Text>
            </View>
          ))}
        </View>
      )}

      {mostrarForm ? (
        <View style={styles.form}>
          <View style={[styles.inputRow, { borderColor: colors.borde, backgroundColor: colors.fondo }]}>
            <Mail size={18} color={colors.textoSuave} />
            <TextInput
              style={[styles.inputField, { color: colors.texto }]}
              placeholder="Correo del nuevo usuario"
              placeholderTextColor={colors.textoSuave}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
            />
          </View>
          <View style={[styles.inputRow, { borderColor: colors.borde, backgroundColor: colors.fondo }]}>
            <Lock size={18} color={colors.textoSuave} />
            <TextInput
              style={[styles.inputField, { color: colors.texto }]}
              placeholder="Contraseña"
              placeholderTextColor={colors.textoSuave}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.btnPrimary,
              { backgroundColor: colors.verde, opacity: pressed || enviando ? 0.85 : 1 },
            ]}
            disabled={enviando}
            onPress={() => void onAgregar()}
          >
            {enviando ? (
              <ActivityIndicator color={colors.onPrimario} />
            ) : (
              <Text style={[styles.btnPrimaryText, { color: colors.onPrimario }]}>Crear usuario</Text>
            )}
          </Pressable>
        </View>
      ) : (
        <Pressable
          style={({ pressed }) => [
            styles.btnSecondary,
            { borderColor: colors.borde, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={() => setMostrarForm(true)}
        >
          <UserPlus size={18} color={colors.texto} />
          <Text style={[styles.btnSecondaryText, { color: colors.texto }]}>Agregar usuario</Text>
        </Pressable>
      )}
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.superficie,
      borderRadius: 16,
      padding: 16,
      marginBottom: 20,
      borderWidth: 1,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 6,
    },
    cardTitle: {
      fontSize: 17,
      fontWeight: '700',
    },
    hint: {
      fontSize: 13,
      lineHeight: 19,
      marginBottom: 12,
    },
    lista: {
      marginBottom: 12,
    },
    itemFila: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.borde,
      gap: 8,
    },
    itemFilaLast: {
      borderBottomWidth: 0,
    },
    itemEmail: {
      flex: 1,
      fontSize: 14,
      fontWeight: '500',
    },
    itemDetalle: {
      fontSize: 12,
    },
    form: {
      marginTop: 4,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      marginBottom: 10,
    },
    inputField: {
      flex: 1,
      paddingVertical: 12,
      fontSize: 15,
    },
    btnPrimary: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      borderRadius: 12,
      marginTop: 4,
    },
    btnPrimaryText: {
      fontSize: 16,
      fontWeight: '600',
    },
    btnSecondary: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
    },
    btnSecondaryText: {
      fontSize: 15,
      fontWeight: '600',
    },
  });
}
