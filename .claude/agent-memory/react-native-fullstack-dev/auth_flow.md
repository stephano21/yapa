---
name: auth-flow
description: Flujo de autenticación Pulse — login con email/password y OAuth Google, almacenamiento JWT en SecureStore, gate de navegación.
metadata:
  type: project
---

## Endpoints de auth (Pulse API)
- POST /v1/auth/login — { email, password } → { access_token, token_type, expires_in }
- POST /v1/auth/register — { email, password } → { message }
- POST /v1/auth/google — { id_token } → { access_token, token_type, expires_in }
- POST /v1/auth/resend-confirmation — { email } → { message }

NO hay refresh token. Solo access_token. expires_in se parsea pero no se usa para renovar automáticamente.

## Almacenamiento
- "yapa_pulse_access_token" en expo-secure-store
- "yapa_pulse_user_email" en expo-secure-store

## Google Sign-In
- Usa @react-native-google-signin/google-signin (nativo, no Expo Go)
- GoogleSignin.configure({ webClientId }) en useEffect del componente GoogleSignInButton
- SHA-1 hardcodeados en src/config/googleAndroidSigning.ts
- Client IDs en .env (EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, etc.)

## Gate de navegación
- linked=true AND !accessToken → LoginScreen obligatorio
- linked=false → app libre (no requiere login)
- setPulseAccountLinked() se activa tras la primera sync exitosa, no tras el primer login

## Problemas conocidos
- Sin refresh token ni expiración automática: token puede expirar y la app no lo detecta hasta que falla un sync
- JWT se decodifica client-side solo para extraer email (no se valida firma)
- GoogleSignin.configure() está dentro del componente render, no al inicio de la app
