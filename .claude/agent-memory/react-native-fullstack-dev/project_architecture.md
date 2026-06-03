---
name: project-architecture
description: Arquitectura general de Yapa — app POS offline-first con sincronización hacia API Pulse. Stack, estructura de carpetas, almacenamiento, estado, navegación.
metadata:
  type: project
---

App de punto de venta (POS) para pequeño comercio. Nació 100% offline-first y se está migrando a híbrido offline+backend.

**Why:** El usuario quería una app funcional sin dependencia de internet; luego decidió agregar backend para respaldo y multi-dispositivo futuro.

**How to apply:** Nunca romper el flujo offline. Todo debe seguir funcionando sin conexión; la sincronización es voluntaria/manual desde la pantalla Sync.

## Stack
- Expo SDK ~54 (bare workflow — tiene ios/ nativo, Pods, etc.)
- React Native 0.81.5 / React 19.1.0
- React Navigation v7 (nativeStack + bottomTabs), NO Expo Router
- Zustand 5 para estado UI (carrito, caja)
- expo-sqlite v16 como almacenamiento principal (SQLite local)
- @react-native-async-storage/async-storage para flags simples (pulseLinkStorage)
- expo-secure-store para JWT
- fetch nativo (sin axios, sin React Query)
- TypeScript ~5.9

## Estructura src/
- `src/api/` — pulseAuth.ts (login/register/google), pulseSync.ts (push de datos locales)
- `src/config/` — pulse.ts (URL env, Google client IDs), googleAndroidSigning.ts (SHA-1 hardcodeados)
- `src/context/` — AuthContext.tsx (JWT en SecureStore), ThemeContext.tsx
- `src/database/` — db.ts (esquema SQLite principal: yapa_pos.db), database.ts (esquema viejo: yapa.db — legacy), sync.ts (queries dirty/marcado)
- `src/navigation/` — RootNavigator.tsx, TabNavigator.tsx, types.ts
- `src/screens/` — HomeScreen, InventarioScreen, BalanceScreen, SyncScreen, LoginScreen, UnidadesMedidaScreen
- `src/storage/` — pulseLinkStorage.ts (AsyncStorage flag "linked")
- `src/store/` — useYapaStore.ts (store activo), useCartStore.ts (store legacy/obsoleto)

## Almacenamiento local
- SQLite `yapa_pos.db` (archivo db.ts): tablas productos, ventas, venta_detalle, clientes, cobros, unidades_medida. Cada tabla tiene `remote_id`, `dirty`, timestamps.
- SQLite `yapa.db` (archivo database.ts): esquema legacy simplificado, solo productos/ventas sin campos sync. Referenciado solo desde database.ts; aparentemente no usado activamente.
- AsyncStorage: solo flags ("yapa_pulse_account_linked", timestamp del link)
- SecureStore: "yapa_pulse_access_token", "yapa_pulse_user_email"

## Flujo de navegación / auth gate
RootNavigator lee: (1) `AuthContext.ready` + `accessToken`, (2) `isPulseAccountLinked()` de AsyncStorage.
- Si linked=true y no hay token → fuerza LoginScreen.
- Si linked=false o no linked → acceso directo a Main (no requiere login).
- setPulseAccountLinked() se llama al final de sincronizarPendientesConPulse() exitoso.
