# Especificación del backend para Yapa (agnóstica de lenguaje)

Este documento describe **qué debe hacer** un servidor backend para integrarse con la app móvil Yapa tal como está diseñada hoy, sin imponer un stack concreto (Node, Go, Python, .NET, etc.). La implementación puede usar cualquier framework si respeta el **modelo de dominio**, el **contrato de API** sugerido y las **reglas de sincronización**.

---

## 1. Contexto de la app cliente

- **Modo actual**: la app guarda todo en **SQLite local** (`yapa_pos.db`); nació offline-first y la sincronización con el servidor es voluntaria/manual.
- **Estado de la integración**: el **push está implementado** en el cliente (`src/api/pulseSync.ts`) con `local_id` + `mutation_id` por registro y manejo de 401/expiración de sesión. La pantalla *Sincronización* dispara el envío. **Falta el pull** (descarga del servidor → dispositivo, §5.4), aún no implementado en cliente.
- **Dominio**: punto de venta ligero — productos, clientes, ventas con detalle, cobros (cuentas por cobrar / abonos).

---

## 2. Principios de diseño (escalabilidad y evolución)

| Principio | Descripción |
|-----------|-------------|
| **Multi-dispositivo / multi-tienda (futuro)** | Modelar datos con `tenant_id` o `store_id` desde el principio (aunque la v1 use un solo comercio). |
| **IDs estables en servidor** | El servidor genera IDs únicos (UUID o bigint). El cliente envía su `local_id` solo para correlación. |
| **Idempotencia** | Reintentos de sync no deben duplicar ventas ni líneas. Usar `client_mutation_id` o hash del payload en endpoints de escritura. |
| **Versionado de API** | Prefijo `/v1/` en rutas; cambios incompatibles → `/v2/`. |
| **Auditoría** | `created_at`, `updated_at` en servidor; opcional `deleted_at` para borrado lógico en lugar de DELETE físico en catálogos. |
| **Contrato JSON** | Tipos explícitos; fechas en **ISO 8601** (UTC recomendado en servidor; el cliente ya usa ISO en varias rutas). |

---

## 3. Modelo de dominio (espeljo lógico del SQLite local)

Los nombres pueden mapearse a tablas SQL en el servidor con nombres en snake_case.

### 3.1 Producto

| Campo | Tipo | Notas |
|-------|------|--------|
| `id` | string (UUID) o int | ID del **servidor** |
| `local_id` | int | Opcional en respuestas; solo lo usa el cliente al correlacionar |
| `nombre` | string | |
| `precio_venta` | decimal | |
| `precio_costo` | decimal | |
| `precio_minimo` | decimal \| null | Opcional por producto |
| `stock` | number | Entero en la práctica |
| `updated_at` | datetime | Para pull incremental |

**Cliente local adicional**: `remote_id`, `dirty`, `updated_at` (ya existen en SQLite).

### 3.2 Cliente

| Campo | Tipo | Notas |
|-------|------|--------|
| `id` | string o int | Servidor |
| `nombre` | string | |
| `deuda_inicial` | decimal | Default 0 |
| `saldo_a_favor` | decimal | Default 0 |
| `updated_at` | datetime | |

### 3.3 Venta

| Campo | Tipo | Notas |
|-------|------|--------|
| `id` | string o int | Servidor |
| `fecha` | datetime | ISO 8601 |
| `total` | decimal | |
| `metodo_pago` | enum | `Efectivo` \| `Transferencia` (extensible: nuevos valores documentados en `/v2`) |
| `estado` | enum | `cobrado` \| `fiado` |
| `cliente_id` | id \| null | Obligatorio si `estado = fiado` |
| `line_items` | array | Ver **Venta detalle** |

### 3.4 Línea de venta (venta_detalle)

| Campo | Tipo | Notas |
|-------|------|--------|
| `descripcion` | string | Nombre en ticket |
| `cantidad` | decimal | Coherente con el cliente (ventas rápidas, fracciones) |
| `precio_unitario` | decimal | |
| `subtotal` | decimal | Redundante pero útil para auditoría |
| `producto_id` | id \| null | Si existe vínculo a catálogo en servidor |

**Regla**: al aceptar una venta, el servidor debe persistir cabecera + líneas en una **transacción**.

### 3.5 Cobro

| Campo | Tipo | Notas |
|-------|------|--------|
| `id` | string o int | Servidor |
| `cliente_id` | id | |
| `monto` | decimal | |
| `fecha` | datetime | |

---

## 4. Autenticación y autorización (recomendado desde v1)

- **Bearer token** (JWT de corta duración + refresh) o **API key** por dispositivo si el alcance es solo un kiosko.
- Cabecera típica: `Authorization: Bearer <token>`.
- Claims mínimos sugeridos: `sub` (usuario o dispositivo), `tenant_id` / `store_id`, `scopes` (ej. `sync:write`, `sync:read`).
- HTTPS obligatorio en producción.

### 4.1 Expiración del token — contrato con el cliente (IMPLEMENTADO)

El cliente ahora **lee el claim `exp`** del JWT (sin validar firma, solo para UX) y actúa así:

- **Obligatorio:** el JWT DEBE incluir el claim estándar `exp` (epoch en segundos). Sin `exp`, el cliente no puede detectar caducidad proactivamente y solo reaccionará al 401.
- Al **hidratar la app**: si `exp` ya pasó, el cliente borra el token de SecureStore y exige re-login (no llega a llamar al API).
- Antes de **sincronizar**: si `exp` ya pasó, corta el intento, cierra sesión local y pide re-login (ahorra un 401).
- Ante **`401` o `403`** desde cualquier `/v1/sync/*`: el cliente cierra sesión local y pide re-login; los datos locales quedan intactos y se reintentan al volver a entrar.

> El servidor DEBE devolver `401` (token inválido/caducado) o `403` (sin scope) de forma consistente en `/v1/sync/*`. No devolver `200` con cuerpo de error para sesiones inválidas.

**Refresh token (recomendado, aún NO implementado en cliente):** si el backend expone `POST /v1/auth/refresh` (recibe refresh token, devuelve nuevo `access_token`), el cliente podrá renovar de forma transparente en vez de exigir re-login. Documentar el endpoint y la vida del refresh para habilitarlo. Punto de extensión en cliente: `src/api/pulseSync.ts` (interceptor de 401) y `src/context/AuthContext.tsx`.

*(El cliente almacena el `access_token` en SecureStore — `src/context/AuthContext.tsx`.)*

---

## 5. API REST sugerida (v1)

Convenciones: JSON, `Content-Type: application/json`, códigos HTTP estándar.

### 5.1 Salud

- `GET /v1/health` → `{ "status": "ok" }` (sin auth o con auth ligera).

### 5.2 Push — enviar cambios del dispositivo al servidor

El cliente agrupa por tipo de entidad. Cada ítem incluye:

- **`local_id`** (entero SQLite) para que el servidor responda con el mapeo a `remote_id`.
- **`mutation_id`** (string estable) como clave de idempotencia por registro — **IMPLEMENTADO en el cliente**. Ver §5.3.

**Productos (crear/actualizar)**

- `POST /v1/sync/productos`
- Body ejemplo:

```json
{
  "items": [
    {
      "local_id": 12,
      "mutation_id": "producto:12:2025-03-25T10:00:00.000Z",
      "nombre": "Arroz 1kg",
      "precio_venta": 2.5,
      "precio_costo": 2.0,
      "precio_minimo": null,
      "stock": 40,
      "client_updated_at": "2025-03-25T10:00:00.000Z"
    }
  ]
}
```

- Respuesta ejemplo:

```json
{
  "results": [
    { "local_id": 12, "remote_id": "550e8400-e29b-41d4-a716-446655440000", "status": "created" }
  ]
}
```

**Clientes**

- `POST /v1/sync/clientes` — mismo patrón `local_id` → `remote_id`.

**Ventas (con detalle)**

- `POST /v1/sync/ventas`
- Body ejemplo:

```json
{
  "items": [
    {
      "local_id": 45,
      "fecha": "2025-03-25T15:30:00.000Z",
      "total": 18.5,
      "metodo_pago": "Efectivo",
      "estado": "cobrado",
      "cliente_id": null,
      "line_items": [
        {
          "descripcion": "Gaseosa",
          "cantidad": 2,
          "precio_unitario": 1.25,
          "subtotal": 2.5,
          "producto_local_id": 3
        }
      ]
    }
  ]
}
```

- **IMPLEMENTADO en cliente:** cada `line_item` incluye `producto_local_id` (si la línea provino del catálogo) y `producto_remote_id` (si el producto ya se sincronizó). Las ventas rápidas (monto manual) no llevan ninguno. El servidor debe vincular la línea al producto por `producto_remote_id` cuando esté presente, o por `producto_local_id` resuelto contra el mapeo de la misma tanda. Las ventas históricas (anteriores a esta versión) no traen el vínculo: se aceptan igual con `descripcion` como texto.
- Respuesta: `local_id` → `remote_id` por venta; opcionalmente IDs de líneas.

**Cobros**

- `POST /v1/sync/cobros` — `local_id`, `cliente_id` (idealmente **remote** del cliente), `monto`, `fecha`.

### 5.3 Idempotencia — `mutation_id` por registro (IMPLEMENTADO en cliente)

El cliente envía un **`mutation_id` estable por registro** en cada ítem de `/v1/sync/*`. El servidor DEBE:

1. Mantener una tabla de claves procesadas (`mutation_id` → `remote_id`), idealmente con `unique(tenant_id, mutation_id)` y TTL de 24–72 h.
2. Antes de insertar, buscar el `mutation_id`. Si ya existe → **no crear duplicado**; devolver el `remote_id` previo con `status: "duplicate"`.
3. Si no existe → procesar (crear/actualizar), persistir la clave y devolver `status: "created" | "updated"`.

**Formato de la clave que envía el cliente** (ver `src/api/pulseSync.ts`):

| Entidad | Patrón | Razón |
|---------|--------|-------|
| Producto | `producto:<local_id>:<client_updated_at ISO>` | Incluye versión: una edición legítima cambia la clave (= update); un reintento del mismo estado la reutiliza (= dedupe). |
| Cliente | `cliente:<local_id>:<client_updated_at ISO>` | Igual que producto. |
| Venta | `venta:<local_id>` | Append-only en el dispositivo: la venta nunca se edita tras crearse. |
| Cobro | `cobro:<local_id>` | Append-only. |

> **Por qué importa:** si la red se corta *después* de que el servidor procesó el batch pero *antes* de que el cliente recibiera la respuesta, los registros siguen `dirty=1` localmente y se reenvían en la próxima tanda. Con `mutation_id` el servidor reconoce el reenvío y responde `duplicate` en vez de crear duplicados. El `status: "duplicate"` también marca el registro como sincronizado en el cliente (`applyXResults` acepta `created|updated|duplicate`).

*(Alternativa adicional, opcional: cabecera `Idempotency-Key: <uuid>` por batch. No es necesaria si respetas `mutation_id` por registro, que es robusta ante fallo parcial.)*

### 5.3.1 Comportamiento de fallo parcial (cliente best-effort)

La sincronización del cliente es **best-effort por entidad** (orden: productos → clientes → ventas → cobros):

- Si una entidad falla por **red/servidor (no-auth)**, el cliente registra el error, **continúa con las demás** y reporta al usuario qué quedó pendiente. Lo no enviado sigue `dirty=1` y se reintenta luego (de ahí la importancia de la idempotencia).
- Si una entidad devuelve **401/403**, el cliente **aborta toda la tanda** y cierra sesión (la sesión es inválida; las siguientes también fallarían).
- El cliente marca cada registro como sincronizado (`dirty=0`, guarda `remote_id`) **solo** con `status` ∈ `{created, updated, duplicate}` por registro en la respuesta.

### 5.4 Pull — traer catálogo y cambios remotos al dispositivo

- `GET /v1/productos?updated_since=<ISO8601>&cursor=...`
- `GET /v1/clientes?updated_since=...`
- Paginación por cursor o `limit`/`offset` (cursor preferible a escala).

Respuestas incluyen `id` (servidor), `updated_at` y datos de negocio. El cliente actualizará SQLite y seteará `remote_id` y `dirty = 0` donde corresponda.

### 5.5 Conflictos (extensible)

- **Productos / clientes**: estrategia recomendada — *last-write-wins* por `updated_at` o bloqueo optimista con `version` o `etag`.
- **Ventas**: normalmente **append-only** en el dispositivo; el servidor no debería “editar” una venta ya sincronizada sin un flujo explícito de anulación.

---

## 6. Comportamiento esperado tras sync (lado app)

Cuando integres el cliente:

1. Tras **push** exitoso, llamar a las funciones ya existentes: `marcarProductoSincronizado`, `marcarClienteSincronizado`, `marcarVentaSincronizada`, `marcarCobroSincronizado` (ver `src/database/sync.ts`).
2. Tras **pull**, hacer upsert local por `remote_id` y limpiar `dirty` si el registro queda alineado con el servidor.
3. **Venta detalle**: hoy las líneas no se listan por separado en la pantalla de sync; el backend debe aceptarlas en el mismo `POST` de ventas para no perder el comprobante.

---

## 7. Mejoras futuras (backlog técnico)

- **Webhooks** o **SSE** para notificar a otros dispositivos de la misma tienda.
- **Informes** en servidor (dashboard) leyendo el mismo modelo.
- **Soft delete** en productos y clientes con `deleted_at` y sync de tombstones.
- **Roles**: cajero vs administrador.
- **Límites de tasa** por API key / IP.

---

## 8. Checklist de implementación del backend

- [ ] Esquema SQL (o documento) alineado con secciones 3 y 5.
- [ ] Autenticación + aislamiento por `tenant_id` / tienda.
- [ ] Endpoints push con transacciones y mapeo `local_id` → `remote_id`.
- [ ] **Idempotencia por `mutation_id`** (tabla de claves + TTL; devolver `status: "duplicate"` con el `remote_id` previo). Ver §5.3.
- [ ] **`exp` en el JWT** y `401/403` consistentes en `/v1/sync/*`. Ver §4.1.
- [ ] (Opcional) `POST /v1/auth/refresh` para renovación transparente del token.
- [ ] Endpoints pull con `updated_since` y paginación.
- [ ] Logs estructurados y trazabilidad por `request_id`.
- [ ] Documentación OpenAPI 3.0 publicada (generada o manual).

---

## 9. Referencia en el repositorio cliente

| Área | Ubicación |
|------|-----------|
| Esquema SQLite y tipos | `src/database/db.ts` |
| Consultas “pendientes de sync” y marcado post-sync | `src/database/sync.ts` |
| UI de estado de sync | `src/screens/SyncScreen.tsx` |

---

*Documento vivo: al cambiar el modelo local (nuevas tablas o campos), actualizar este archivo y la versión de API.*
