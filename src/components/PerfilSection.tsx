import { useCallback, useMemo, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Store, UserRound } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth, PulseAuthError } from '../context/AuthContext';
import { getMe, setProfilePhoto, type Me } from '../api/pulseProfile';
import { setTenantLogo } from '../api/pulseTeam';
import { uploadFile } from '../api/pulseFiles';
import type { ColorPalette } from '../theme';

function mimeTypeFromUri(uri: string): string {
  const ext = uri.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

async function pickImage(): Promise<{ uri: string; mimeType: string } | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Permiso necesario', 'Yapa necesita acceso a tus fotos para poder cambiar la imagen.');
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });
  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, mimeType: asset.mimeType ?? mimeTypeFromUri(asset.uri) };
}

export default function PerfilSection() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { accessToken } = useAuth();

  const [me, setMe] = useState<Me | null>(null);
  const [cargando, setCargando] = useState(false);
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);

  const cargar = useCallback(() => {
    if (!accessToken) return;
    setCargando(true);
    getMe(accessToken)
      .then(setMe)
      .catch((e) => {
        if (__DEV__) console.warn('[PerfilSection] cargar', e);
      })
      .finally(() => setCargando(false));
  }, [accessToken]);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );

  const onCambiarLogo = useCallback(async () => {
    if (!accessToken) return;
    const picked = await pickImage();
    if (!picked) return;
    setSubiendoLogo(true);
    try {
      const uploaded = await uploadFile(accessToken, picked.uri, picked.mimeType);
      const tenant = await setTenantLogo(accessToken, uploaded.id);
      setMe((prev) => (prev ? { ...prev, tenant_logo_url: tenant.logo_url } : prev));
      Alert.alert('Logo', 'Logo actualizado.');
    } catch (e) {
      Alert.alert('Logo', e instanceof PulseAuthError ? e.message : 'No se pudo subir el logo.');
    } finally {
      setSubiendoLogo(false);
    }
  }, [accessToken]);

  const onCambiarFoto = useCallback(async () => {
    if (!accessToken) return;
    const picked = await pickImage();
    if (!picked) return;
    setSubiendoFoto(true);
    try {
      const uploaded = await uploadFile(accessToken, picked.uri, picked.mimeType);
      const res = await setProfilePhoto(accessToken, uploaded.id);
      setMe((prev) => (prev ? { ...prev, profile_picture_url: res.profile_picture_url } : prev));
      Alert.alert('Foto de perfil', 'Foto actualizada.');
    } catch (e) {
      Alert.alert('Foto de perfil', e instanceof PulseAuthError ? e.message : 'No se pudo subir la foto.');
    } finally {
      setSubiendoFoto(false);
    }
  }, [accessToken]);

  if (!accessToken) return null;

  return (
    <View style={[styles.card, { borderColor: colors.borde }]}>
      <Text style={[styles.cardTitle, { color: colors.texto }]}>Perfil</Text>

      {cargando && !me ? (
        <ActivityIndicator color={colors.verde} style={{ marginTop: 12 }} />
      ) : (
        <>
          <View style={styles.fila}>
            <View style={[styles.avatar, { borderColor: colors.borde, backgroundColor: colors.fondo }]}>
              {me?.tenant_logo_url ? (
                <Image source={{ uri: me.tenant_logo_url }} style={styles.avatarImg} />
              ) : (
                <Store size={24} color={colors.textoSuave} />
              )}
            </View>
            <View style={styles.filaTexto}>
              <Text style={[styles.filaTitulo, { color: colors.texto }]}>{me?.tenant_name ?? 'Mi negocio'}</Text>
              <Text style={[styles.filaSub, { color: colors.textoSuave }]}>Logo del negocio</Text>
            </View>
            <Pressable
              style={[styles.btnCambiar, { borderColor: colors.borde }]}
              onPress={() => void onCambiarLogo()}
              disabled={subiendoLogo}
            >
              {subiendoLogo ? (
                <ActivityIndicator size="small" color={colors.verde} />
              ) : (
                <Text style={[styles.btnCambiarTexto, { color: colors.texto }]}>Cambiar</Text>
              )}
            </Pressable>
          </View>

          <View style={styles.fila}>
            <View style={[styles.avatar, { borderColor: colors.borde, backgroundColor: colors.fondo }]}>
              {me?.profile_picture_url ? (
                <Image source={{ uri: me.profile_picture_url }} style={styles.avatarImg} />
              ) : (
                <UserRound size={24} color={colors.textoSuave} />
              )}
            </View>
            <View style={styles.filaTexto}>
              <Text style={[styles.filaTitulo, { color: colors.texto }]} numberOfLines={1}>
                {me?.email ?? ''}
              </Text>
              <Text style={[styles.filaSub, { color: colors.textoSuave }]}>Tu foto de perfil</Text>
            </View>
            <Pressable
              style={[styles.btnCambiar, { borderColor: colors.borde }]}
              onPress={() => void onCambiarFoto()}
              disabled={subiendoFoto}
            >
              {subiendoFoto ? (
                <ActivityIndicator size="small" color={colors.verde} />
              ) : (
                <Text style={[styles.btnCambiarTexto, { color: colors.texto }]}>Cambiar</Text>
              )}
            </Pressable>
          </View>
        </>
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
    cardTitle: {
      fontSize: 17,
      fontWeight: '700',
      marginBottom: 12,
    },
    fila: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 8,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    avatarImg: {
      width: '100%',
      height: '100%',
    },
    filaTexto: {
      flex: 1,
    },
    filaTitulo: {
      fontSize: 14,
      fontWeight: '600',
    },
    filaSub: {
      fontSize: 12,
      marginTop: 2,
    },
    btnCambiar: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      minWidth: 76,
      alignItems: 'center',
    },
    btnCambiarTexto: {
      fontSize: 13,
      fontWeight: '600',
    },
  });
}
