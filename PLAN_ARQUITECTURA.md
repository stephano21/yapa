# Plan de Acción — Refactor de Arquitectura Yapa POS

> **Estado:** Pendiente de implementación  
> **Modelo a usar para implementar:** claude-sonnet-4-6  
> **Rama base:** `main` → crear rama `refactor/architecture-drizzle`

---

## Contexto del proyecto

Yapa es un POS offline-first para Android (Expo SDK 54, React Native 0.81.5).  
- **BD local:** expo-sqlite (actualmente sin ORM, raw SQL en `src/database/db.ts`)  
- **Sync:** push unidireccional a backend "Pulse" con dirty flag  
- **Estado:** Zustand (carrito) + Context API (auth, tema)  
- **Navegación:** React Navigation (Stack + Bottom Tabs)  
- **Auth:** JWT en expo-secure-store + Google Sign-In  

---

## Arquitectura objetivo (post-refactor)

```
src/
├── database/
│   ├── drizzle/
│   │   ├── client.ts          ← singleton expo-sqlite + drizzle client
│   │   ├── schema.ts          ← todas las tablas en Drizzle schema
│   │   ├── migrations/        ← archivos de migración generados por drizzle-kit
│   │   │   └── 0001_initial.sql
│   │   └── migrate.ts         ← runner de migraciones con PRAGMA user_version
│   └── repositories/
│       ├── productosRepo.ts
│       ├── ventasRepo.ts
│       ├── clientesRepo.ts
│       ├── cobrosRepo.ts
│       └── unidadesRepo.ts
├── domain/
│   └── finanzas.ts            ← lógica FIFO de deuda (pura, testeable)
├── api/
│   ├── httpUtils.ts           ← parseJsonBody compartido
│   ├── pulseAuth.ts
│   └── pulseSync.ts
├── context/
│   ├── AuthContext.tsx        ← incluye isPulseLinked en el mismo contexto
│   └── ThemeContext.tsx       ← inicializar con Appearance.getColorScheme()
├── store/
│   └── useYapaStore.ts        ← agregar persist middleware para cajaAbierta
├── screens/
│   ├── HomeScreen.tsx         ← orquestador liviano (~200 líneas)
│   ├── InventarioScreen.tsx
│   ├── BalanceScreen.tsx
│   ├── SyncScreen.tsx
│   └── LoginScreen.tsx
├── features/
│   └── carrito/
│       ├── CartDrawer.tsx
│       ├── VentaExpressModal.tsx
│       ├── EditPrecioModal.tsx
│       └── useCart.ts
├── components/
│   └── ComprobanteModal.tsx
├── navigation/
│   ├── RootNavigator.tsx
│   ├── TabNavigator.tsx       ← con TabParamList tipado
│   └── types.ts               ← RootStackParamList + TabParamList
├── config/
│   ├── pulse.ts
│   └── googleSignIn.ts        ← SHA-1 desde env
├── storage/
│   └── pulseLinkStorage.ts
├── utils/
│   └── dateLocal.ts
└── theme.ts
```

---

## Fases de implementación

---

### FASE 1 — Instalar Drizzle ORM y migrar la capa de BD

**Objetivo:** Reemplazar el raw SQL de `db.ts` con Drizzle ORM + sistema de migraciones formal.

#### 1.1 Instalar dependencias

```bash
npx expo install drizzle-orm
npm install --save-dev drizzle-kit
npm install --save-dev babel-plugin-module-resolver
```

**Nota:** `drizzle-orm` requiere `expo-sqlite` ≥ 16 (ya instalado). No requiere native rebuild.

#### 1.2 Crear `src/database/drizzle/schema.ts`

Definir todas las tablas usando `sqliteTable` de drizzle-orm. Esquema completo:

```typescript
import { sqliteTable, integer, real, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const productos = sqliteTable('productos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nombre: text('nombre').notNull(),
  precioVenta: real('precio_venta').notNull(),
  precioCosto: real('precio_costo').notNull().default(0),
  precioMinimo: real('precio_minimo'),
  stock: integer('stock').notNull().default(0),
  remoteId: text('remote_id'),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  dirty: integer('dirty', { mode: 'boolean' }).notNull().default(false),
});

export const ventas = sqliteTable('ventas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fecha: text('fecha').notNull(),
  total: real('total').notNull(),
  metodoPago: text('metodo_pago').notNull(),
  estado: text('estado').default('cobrado'),
  clienteId: integer('cliente_id'),
  remoteId: text('remote_id'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  syncedAt: text('synced_at'),
  dirty: integer('dirty', { mode: 'boolean' }).notNull().default(true),
});

export const ventaDetalle = sqliteTable('venta_detalle', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ventaId: integer('venta_id').notNull().references(() => ventas.id),
  productoId: integer('producto_id'),
  descripcion: text('descripcion').notNull(),
  cantidad: real('cantidad').notNull(),
  precioUnitario: real('precio_unitario').notNull(),
  subtotal: real('subtotal').notNull(),
  remoteId: text('remote_id'),
  syncedAt: text('synced_at'),
  dirty: integer('dirty', { mode: 'boolean' }).notNull().default(true),
});

export const clientes = sqliteTable('clientes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nombre: text('nombre').notNull(),
  deudaInicial: real('deuda_inicial').default(0),
  saldoAFavor: real('saldo_a_favor').default(0),
  remoteId: text('remote_id'),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  dirty: integer('dirty', { mode: 'boolean' }).notNull().default(false),
});

export const cobros = sqliteTable('cobros', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clienteId: integer('cliente_id').notNull().references(() => clientes.id),
  monto: real('monto').notNull(),
  fecha: text('fecha').notNull(),
  remoteId: text('remote_id'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  syncedAt: text('synced_at'),
  dirty: integer('dirty', { mode: 'boolean' }).notNull().default(true),
});

export const unidadesMedida = sqliteTable('unidades_medida', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nombre: text('nombre').notNull(),
  unidades: integer('unidades').notNull().default(1),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  dirty: integer('dirty', { mode: 'boolean' }).notNull().default(false),
});
```

#### 1.3 Crear `src/database/drizzle/client.ts`

```typescript
import * as SQLite from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';

const expo = SQLite.openDatabaseSync('yapa_pos.db', { enableChangeListener: true });
export const db = drizzle(expo, { schema });
export type DbClient = typeof db;
```

**IMPORTANTE:** `openDatabaseSync` (no Async) es el API que usa drizzle con expo-sqlite.

#### 1.4 Configurar `drizzle.config.ts` en raíz del proyecto

```typescript
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/database/drizzle/schema.ts',
  out: './src/database/drizzle/migrations',
  dialect: 'sqlite',
  driver: 'expo',
} satisfies Config;
```

#### 1.5 Agregar script en `package.json`

```json
"db:generate": "drizzle-kit generate",
"db:studio": "drizzle-kit studio"
```

#### 1.6 Generar migración inicial

```bash
npm run db:generate
```

Esto crea `src/database/drizzle/migrations/0001_initial.sql` con el DDL completo.

#### 1.7 Crear `src/database/drizzle/migrate.ts` — runner de migraciones

```typescript
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { db } from './client';
import migrations from './migrations/meta/_journal.json';

export async function runMigrations(): Promise<void> {
  await migrate(db, migrations);
  await seedInitialData();
}

async function seedInitialData(): Promise<void> {
  const { unidadesMedida } = await import('./schema');
  const count = await db.$count(unidadesMedida);
  if (count > 0) return;
  await db.insert(unidadesMedida).values([
    { nombre: 'Unidad', unidades: 1, dirty: false },
    { nombre: 'Docena', unidades: 12, dirty: false },
  ]);
}
```

**Nota:** El migrador de drizzle maneja la versión internamente con una tabla `__drizzle_migrations`. No necesitamos PRAGMA user_version manualmente.

#### 1.8 Llamar `runMigrations()` en el entry point

En `App.tsx` (o `index.ts`), antes de renderizar, esperar que las migraciones terminen. Usar un `AppReadyProvider` o manejar directamente en el splash:

```typescript
// App.tsx
import { runMigrations } from './src/database/drizzle/migrate';

export default function App() {
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    runMigrations()
      .then(() => setDbReady(true))
      .catch((e) => {
        console.error('Migration failed:', e);
        setDbReady(true); // no bloquear la app por migración fallida
      });
  }, []);

  if (!dbReady) return <SplashScreen />;
  return <RootApp />;
}
```

---

### FASE 2 — Crear repositorios por entidad

**Objetivo:** Separar las operaciones de datos en archivos especializados usando el cliente Drizzle.

#### 2.1 `src/database/repositories/productosRepo.ts`

```typescript
import { db } from '../drizzle/client';
import { productos } from '../drizzle/schema';
import { eq, like, sql } from 'drizzle-orm';

export type Producto = typeof productos.$inferSelect;
export type NuevoProducto = Pick<Producto, 'nombre' | 'precioVenta' | 'precioCosto' | 'stock'>;

export const productosRepo = {
  getAll: (busqueda?: string) => {
    if (busqueda?.trim()) {
      return db.select().from(productos)
        .where(like(productos.nombre, `%${busqueda.trim()}%`))
        .orderBy(productos.nombre);
    }
    return db.select().from(productos).orderBy(productos.nombre);
  },

  getById: (id: number) =>
    db.select().from(productos).where(eq(productos.id, id)).then(r => r[0] ?? null),

  crear: (data: NuevoProducto) =>
    db.insert(productos).values({ ...data, dirty: true,
      updatedAt: sql`(datetime('now'))` }).returning({ id: productos.id })
      .then(r => r[0].id),

  actualizar: (id: number, data: Partial<NuevoProducto>) =>
    db.update(productos)
      .set({ ...data, dirty: true, updatedAt: sql`(datetime('now'))` })
      .where(eq(productos.id, id)),

  eliminar: (id: number) =>
    db.delete(productos).where(eq(productos.id, id)),

  descontarStock: (id: number, cantidad: number) =>
    db.update(productos)
      .set({ stock: sql`MAX(0, COALESCE(${productos.stock}, 0) - ${cantidad})` })
      .where(eq(productos.id, id)),

  getDirty: () =>
    db.select().from(productos).where(eq(productos.dirty, true)),

  marcarSynced: (id: number, remoteId: string) =>
    db.update(productos)
      .set({ dirty: false, remoteId })
      .where(eq(productos.id, id)),
};
```

#### 2.2 `src/database/repositories/clientesRepo.ts`

```typescript
import { db } from '../drizzle/client';
import { clientes, cobros, ventas } from '../drizzle/schema';
import { eq, like, sql, and } from 'drizzle-orm';

export type Cliente = typeof clientes.$inferSelect;

export const clientesRepo = {
  getAll: (busqueda?: string) => {
    if (busqueda?.trim()) {
      return db.select().from(clientes)
        .where(like(clientes.nombre, `%${busqueda.trim()}%`))
        .orderBy(clientes.nombre);
    }
    return db.select().from(clientes).orderBy(clientes.nombre);
  },

  getById: (id: number) =>
    db.select().from(clientes).where(eq(clientes.id, id)).then(r => r[0] ?? null),

  crear: (nombre: string) =>
    db.insert(clientes).values({ nombre: nombre.trim(), dirty: true,
      updatedAt: sql`(datetime('now'))` }).returning({ id: clientes.id })
      .then(r => r[0].id),

  setDeudaInicial: (id: number, monto: number) =>
    db.update(clientes).set({ deudaInicial: Math.max(0, monto) }).where(eq(clientes.id, id)),

  addSaldoAFavor: (id: number, monto: number) =>
    db.update(clientes)
      .set({ saldoAFavor: sql`COALESCE(${clientes.saldoAFavor}, 0) + ${Math.max(0, monto)}` })
      .where(eq(clientes.id, id)),

  // Query agregada — resuelve el N+1 de getClientesConDeuda
  getConBalance: () => db.all(sql`
    SELECT
      c.id,
      c.nombre,
      (
        COALESCE(c.deuda_inicial, 0)
        + COALESCE(vf.total_fiado, 0)
        - COALESCE(cb.total_cobrado, 0)
        - COALESCE(c.saldo_a_favor, 0)
      ) AS balance
    FROM clientes c
    LEFT JOIN (
      SELECT cliente_id, SUM(total) AS total_fiado
      FROM ventas
      WHERE COALESCE(estado, 'cobrado') = 'fiado'
      GROUP BY cliente_id
    ) vf ON vf.cliente_id = c.id
    LEFT JOIN (
      SELECT cliente_id, SUM(monto) AS total_cobrado
      FROM cobros
      GROUP BY cliente_id
    ) cb ON cb.cliente_id = c.id
    HAVING balance != 0
    ORDER BY c.nombre
  `) as Promise<{ id: number; nombre: string; balance: number }[]>,

  getDirty: () =>
    db.select().from(clientes).where(eq(clientes.dirty, true)),

  marcarSynced: (id: number, remoteId: string) =>
    db.update(clientes).set({ dirty: false, remoteId }).where(eq(clientes.id, id)),
};
```

#### 2.3 `src/database/repositories/ventasRepo.ts`

```typescript
import { db } from '../drizzle/client';
import { ventas, ventaDetalle, productos } from '../drizzle/schema';
import { eq, sql, and } from 'drizzle-orm';
import { getFechaHoraLocalParaDb, getFechaLocalYYYYMMDD } from '../../utils/dateLocal';

export type Venta = typeof ventas.$inferSelect;
export type VentaDetalle = typeof ventaDetalle.$inferSelect;

export type ItemVentaInput = {
  nombre: string;
  cantidad: number;
  precio: number;
  productoId?: number;
};

export const ventasRepo = {
  registrarConDetalle: async (
    total: number,
    metodoPago: string,
    items: ItemVentaInput[],
    opciones?: { esFiado?: boolean; clienteId?: number }
  ) => {
    return db.transaction(async (tx) => {
      const fecha = getFechaHoraLocalParaDb();
      const estado = opciones?.esFiado ? 'fiado' : 'cobrado';
      const clienteId = opciones?.esFiado && opciones?.clienteId != null
        ? opciones.clienteId : null;

      const [{ ventaId }] = await tx.insert(ventas)
        .values({ fecha, total, metodoPago, estado, clienteId })
        .returning({ ventaId: ventas.id });

      for (const it of items) {
        const subtotal = it.precio * it.cantidad;
        const productoId = it.productoId != null && it.productoId > 0
          ? it.productoId : null;

        await tx.insert(ventaDetalle).values({
          ventaId, productoId, descripcion: it.nombre,
          cantidad: it.cantidad, precioUnitario: it.precio, subtotal,
        });

        if (productoId) {
          await tx.update(productos)
            .set({ stock: sql`MAX(0, COALESCE(${productos.stock}, 0) - ${it.cantidad})` })
            .where(eq(productos.id, productoId));
        }
      }

      return { ventaId, fecha, total, metodoPago, items };
    });
    // NOTA: usar db.transaction garantiza atomicidad — si el detalle falla,
    // la venta también se revierte. Esto resuelve C5 del reporte de arquitectura.
  },

  getHoy: () => {
    const hoy = getFechaLocalYYYYMMDD();
    return db.select({
      total: ventas.total,
      metodoPago: ventas.metodoPago,
      estado: ventas.estado,
    }).from(ventas).where(sql`date(${ventas.fecha}) = ${hoy}`);
  },

  getDelDiaConId: (fecha?: string) => {
    const dia = fecha ?? getFechaLocalYYYYMMDD();
    return db.select({
      id: ventas.id, fecha: ventas.fecha,
      total: ventas.total, metodoPago: ventas.metodoPago,
    }).from(ventas)
      .where(sql`date(${ventas.fecha}) = ${dia}`)
      .orderBy(sql`${ventas.fecha} DESC`);
  },

  getFiadasPorCliente: (clienteId: number) =>
    db.select({ id: ventas.id, fecha: ventas.fecha, total: ventas.total })
      .from(ventas)
      .where(and(
        eq(ventas.clienteId, clienteId),
        sql`COALESCE(${ventas.estado}, 'cobrado') = 'fiado'`
      ))
      .orderBy(sql`${ventas.fecha} DESC`),

  getComprobantePorId: async (ventaId: number) => {
    const venta = await db.select().from(ventas).where(eq(ventas.id, ventaId))
      .then(r => r[0] ?? null);
    if (!venta) return null;
    const items = await db.select().from(ventaDetalle)
      .where(eq(ventaDetalle.ventaId, ventaId));
    return { ...venta, items };
  },

  getDirty: () => db.select().from(ventas).where(eq(ventas.dirty, true)),
  getDetalleDirty: () =>
    db.select().from(ventaDetalle).where(eq(ventaDetalle.dirty, true)),

  marcarSynced: (id: number, remoteId: string) =>
    db.update(ventas).set({ dirty: false, remoteId, syncedAt: sql`(datetime('now'))` })
      .where(eq(ventas.id, id)),
};
```

#### 2.4 `src/database/repositories/cobrosRepo.ts`

```typescript
import { db } from '../drizzle/client';
import { cobros } from '../drizzle/schema';
import { eq, sql } from 'drizzle-orm';
import { getFechaHoraLocalParaDb } from '../../utils/dateLocal';

export const cobrosRepo = {
  registrar: (clienteId: number, monto: number) =>
    db.insert(cobros).values({
      clienteId, monto, fecha: getFechaHoraLocalParaDb(),
      dirty: true, createdAt: sql`(datetime('now'))`,
    }).returning({ id: cobros.id }).then(r => r[0].id),

  getPorCliente: (clienteId: number) =>
    db.select().from(cobros).where(eq(cobros.clienteId, clienteId)),

  getTotalPorCliente: (clienteId: number) =>
    db.select({ total: sql<number>`COALESCE(SUM(${cobros.monto}), 0)` })
      .from(cobros).where(eq(cobros.clienteId, clienteId))
      .then(r => r[0]?.total ?? 0),

  getDirty: () => db.select().from(cobros).where(eq(cobros.dirty, true)),

  marcarSynced: (id: number, remoteId: string) =>
    db.update(cobros).set({ dirty: false, remoteId, syncedAt: sql`(datetime('now'))` })
      .where(eq(cobros.id, id)),
};
```

#### 2.5 `src/database/repositories/unidadesRepo.ts`

```typescript
import { db } from '../drizzle/client';
import { unidadesMedida } from '../drizzle/schema';
import { eq, sql } from 'drizzle-orm';

export const unidadesRepo = {
  getAll: () =>
    db.select().from(unidadesMedida).orderBy(unidadesMedida.unidades, unidadesMedida.nombre),

  crear: (nombre: string, unidades: number) => {
    const n = nombre.trim();
    const u = Math.floor(unidades);
    if (!n) throw new Error('Nombre requerido');
    if (!Number.isFinite(u) || u <= 0) throw new Error('Unidades inválidas');
    return db.insert(unidadesMedida).values({ nombre: n, unidades: u, dirty: false,
      updatedAt: sql`(datetime('now'))` }).returning({ id: unidadesMedida.id })
      .then(r => r[0].id);
  },

  actualizar: (id: number, nombre: string, unidades: number) => {
    const n = nombre.trim();
    const u = Math.floor(unidades);
    if (!n) throw new Error('Nombre requerido');
    if (!Number.isFinite(u) || u <= 0) throw new Error('Unidades inválidas');
    return db.update(unidadesMedida)
      .set({ nombre: n, unidades: u, dirty: true, updatedAt: sql`(datetime('now'))` })
      .where(eq(unidadesMedida.id, id));
  },
};
```

---

### FASE 3 — Separar dominio financiero

**Objetivo:** Extraer la lógica FIFO de deuda a `src/domain/finanzas.ts` (pura, sin acceso directo a BD).

#### 3.1 `src/domain/finanzas.ts`

```typescript
export const MARGEN_MINIMO_GLOBAL = 0.1;

export type ProductoParaMargen = {
  precioVenta: number;
  precioCosto: number;
  precioMinimo?: number | null;
};

export function calcularPrecioMinimo(producto: ProductoParaMargen): number {
  if (producto.precioMinimo != null) return producto.precioMinimo;
  const base = producto.precioCosto;
  const minimo = base * (1 + MARGEN_MINIMO_GLOBAL);
  if (!Number.isFinite(minimo) || minimo <= 0) return producto.precioVenta;
  return minimo;
}

export type VentaFiada = { id: number; total: number };
export type BalanceInputs = {
  deudaInicial: number;
  saldoAFavor: number;
  totalCobros: number;
  ventasFiadas: VentaFiada[];
};

/**
 * Distribuye los pagos FIFO sobre ventas fiadas.
 * Retorna un Map<ventaId, montoPendiente>.
 */
export function calcularPendientePorVenta(inputs: BalanceInputs): Map<number, number> {
  let remaining = inputs.totalCobros + inputs.saldoAFavor;
  remaining -= Math.min(remaining, inputs.deudaInicial);

  const map = new Map<number, number>();
  for (const v of inputs.ventasFiadas) {
    const paid = Math.min(remaining, v.total);
    map.set(v.id, v.total - paid);
    remaining -= paid;
  }
  return map;
}

export function calcularBalance(inputs: Omit<BalanceInputs, 'ventasFiadas'> & {
  totalVentasFiadas: number;
}): number {
  return (
    inputs.deudaInicial +
    inputs.totalVentasFiadas -
    inputs.totalCobros -
    inputs.saldoAFavor
  );
}

export function calcularGananciaEstimada(
  totalVentas: number,
  productos: ProductoParaMargen[]
): number {
  if (productos.length === 0) return totalVentas;
  const margenPromedio =
    productos.reduce(
      (s, p) =>
        s + (p.precioVenta - p.precioCosto) / Math.max(p.precioVenta, 0.01),
      0
    ) / productos.length;
  return totalVentas * margenPromedio;
}
```

---

### FASE 4 — Consolidar utilidades API

**Objetivo:** Eliminar duplicaciones de `parseJsonBody` y `decodeJwtEmail`.

#### 4.1 Crear `src/api/httpUtils.ts`

```typescript
export function parseJsonBody<T = unknown>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

export function decodeJwtPayload<T = Record<string, unknown>>(token: string): T | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const atobFn = globalThis.atob as ((d: string) => string) | undefined;
    if (!atobFn) return null;
    const binary = atobFn(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

export function decodeJwtEmail(token: string): string | undefined {
  const payload = decodeJwtPayload<{ email?: string }>(token);
  return typeof payload?.email === 'string' ? payload.email : undefined;
}
```

#### 4.2 Actualizar `pulseAuth.ts`

Reemplazar `decodeJwtPayload` y `parseJsonBody` locales por imports de `./httpUtils`.

#### 4.3 Actualizar `pulseSync.ts`

Reemplazar `parseJsonBody` local por import de `./httpUtils`.

#### 4.4 Actualizar `AuthContext.tsx`

Eliminar `decodeJwtEmail` local. Importar desde `../api/httpUtils`.

---

### FASE 5 — Consolidar AuthContext + flag pulseLinked

**Objetivo:** Eliminar la race condition de `RootNavigator.tsx` moviendo `pulseLinked` al contexto de auth.

#### 5.1 Actualizar `src/context/AuthContext.tsx`

Agregar al estado del contexto:
```typescript
type AuthContextValue = {
  ready: boolean;           // auth + pulseLinked ambos hidratados
  accessToken: string | null;
  userEmail: string | null;
  isPulseLinked: boolean;   // ← NUEVO
  signInWithPassword: ...
  signInWithGoogleIdToken: ...
  signOut: ...
  applySession: ...
  setPulseLinked: (v: boolean) => Promise<void>; // ← NUEVO (para PulseAuthSection)
};
```

En el `useEffect` de hidratación, cargar `isPulseAccountLinked()` junto con el token:
```typescript
const [token, email, linked] = await Promise.all([
  SecureStore.getItemAsync(KEY_ACCESS),
  SecureStore.getItemAsync(KEY_EMAIL),
  isPulseAccountLinked(),       // ← cargar aquí
]);
// ...setReady(true) solo cuando los tres estén listos
```

El flag `ready` pasa a ser `true` solo cuando los tres valores están cargados.

#### 5.2 Simplificar `src/navigation/RootNavigator.tsx`

Eliminar el `useEffect` y `useState` para `pulseLinked`. Leerlo directamente del contexto:
```typescript
const { ready, accessToken, isPulseLinked } = useAuth();
const cargandoGate = !ready;
const requiereLogin = isPulseLinked && !accessToken;
```

---

### FASE 6 — Descomponer HomeScreen

**Objetivo:** Reducir `HomeScreen.tsx` a un orquestador de ~200 líneas.

#### 6.1 Crear `src/features/carrito/useCart.ts`

Hook que abstrae el acceso a Zustand y expone la API del carrito:
```typescript
export function useCart() {
  const store = useYapaStore();
  return {
    items: store.items,
    total: store.getTotal(),
    totalUnidades: store.items.reduce((s, i) => s + i.cantidad, 0),
    metodoPago: store.metodoPagoSeleccionado,
    carritoVisible: store.carritoVisible,
    addProducto: store.addProducto,
    removeProducto: store.removeProducto,
    updateCantidad: store.updateCantidad,
    updatePrecio: store.updatePrecio,
    clearCart: store.clearCart,
    addVentaExpress: store.addVentaExpress,
    setMetodoPago: store.setMetodoPago,
    abrirCarrito: store.abrirCarrito,
    cerrarCarrito: store.cerrarCarrito,
  };
}
```

#### 6.2 Crear `src/features/carrito/CartDrawer.tsx`

Extraer de `HomeScreen`: el panel lateral del carrito completo (lista de items, totales, botón finalizar, selector fiado/cliente, método de pago).  
Props:
```typescript
type CartDrawerProps = {
  visible: boolean;
  onCerrar: () => void;
  onFinalizarVenta: (opciones: { esFiado: boolean; clienteId?: number }) => Promise<void>;
  finalizando: boolean;
  esFiado: boolean;
  onToggleFiado: (v: boolean) => void;
  clienteSeleccionado: Cliente | null;
  onSeleccionarCliente: (c: Cliente | null) => void;
};
```

#### 6.3 Crear `src/features/carrito/VentaExpressModal.tsx`

Extraer el modal de venta express (monto + método de pago rápido).

#### 6.4 Crear `src/features/carrito/EditPrecioModal.tsx`

Extraer el modal de edición de precio con validación de margen.

#### 6.5 `HomeScreen.tsx` resultante — solo orquestador

```typescript
export default function HomeScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const cart = useCart();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [esFiado, setEsFiado] = useState(false);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);
  const [comprobanteActual, setComprobanteActual] = useState<ComprobanteVenta | null>(null);
  const [finalizando, setFinalizando] = useState(false);

  // cargar productos con debounce
  // handleFinalizarVenta con try/catch
  // render: ProductList + CartDrawer + VentaExpressModal + ComprobanteModal
}
```

---

### FASE 7 — Fixes críticos de estabilidad

#### 7.1 `handleFinalizarVenta` con try/catch y transacción

La transacción ya está garantizada por `ventasRepo.registrarConDetalle` (Fase 2.3).  
En `HomeScreen.tsx` agregar el manejo de error:

```typescript
const handleFinalizarVenta = async (opciones: { esFiado: boolean; clienteId?: number }) => {
  if (!cart.metodoPago) return;
  setFinalizando(true);
  try {
    const result = await ventasRepo.registrarConDetalle(
      cart.total,
      cart.metodoPago,
      cart.items.map(i => ({ nombre: i.nombre, cantidad: i.cantidad,
        precio: i.precio, productoId: i.id > 0 ? i.id : undefined })),
      opciones,
    );
    cart.clearCart();
    setComprobanteActual({ ...result, items: result.items.map(i => ({
      descripcion: i.nombre, cantidad: i.cantidad,
      precioUnitario: i.precio, subtotal: i.precio * i.cantidad,
    })) });
  } catch (e) {
    Alert.alert('Error', 'No se pudo registrar la venta. El carrito se conservó.');
    // NO llamar clearCart() si falló
  } finally {
    setFinalizando(false);
  }
};
```

#### 7.2 Agregar debounce a búsqueda de productos

Instalar `use-debounce`:
```bash
npx expo install use-debounce
```

En `HomeScreen.tsx`:
```typescript
import { useDebounce } from 'use-debounce';
const [debouncedBusqueda] = useDebounce(busqueda, 300);

useEffect(() => {
  setCargando(true);
  productosRepo.getAll(debouncedBusqueda)
    .then(setProductos)
    .finally(() => setCargando(false));
}, [debouncedBusqueda]);
```

#### 7.3 Agregar `TabParamList` tipado en `src/navigation/types.ts`

```typescript
export type RootStackParamList = {
  Main: undefined;
  Login: undefined;
  UnidadesMedida: undefined;
};

export type TabParamList = {
  Home: undefined;
  Inventario: undefined;
  Balance: undefined;
  Sync: undefined;
};
```

En `TabNavigator.tsx`:
```typescript
const Tab = createBottomTabNavigator<TabParamList>();
```

---

### FASE 8 — Persistencia y UI polish

#### 8.1 Persistir `cajaAbierta` en Zustand

```bash
npx expo install @react-native-async-storage/async-storage  # ya instalado
```

En `useYapaStore.ts`, agregar el middleware `persist`:
```typescript
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const useYapaStore = create<YapaState>()(
  persist(
    (set, get) => ({
      // ... mismo estado actual
    }),
    {
      name: 'yapa-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ cajaAbierta: state.cajaAbierta }),
      // Solo persistir cajaAbierta, no el carrito (los items son transaccionales)
    }
  )
);
```

#### 8.2 Inicializar tema con `Appearance.getColorScheme()`

En `src/context/ThemeContext.tsx`, cambiar:
```typescript
// Antes:
const [theme, setTheme] = useState<ThemeMode>('dark');

// Después:
import { Appearance } from 'react-native';
const systemTheme = Appearance.getColorScheme() === 'light' ? 'light' : 'dark';
const [theme, setTheme] = useState<ThemeMode>(systemTheme);
// AsyncStorage override se aplica en useEffect como ya está
```

#### 8.3 Mover SHA-1 a variables de entorno

1. En `src/config/googleAndroidSigning.ts`, leer desde `process.env`:
```typescript
export const SHA1_DEBUG = process.env.EXPO_PUBLIC_SHA1_DEBUG ?? '';
export const SHA1_RELEASE = process.env.EXPO_PUBLIC_SHA1_RELEASE ?? '';
```

2. Crear `.env.local` (ya en `.gitignore`):
```
EXPO_PUBLIC_SHA1_DEBUG=<valor actual>
EXPO_PUBLIC_SHA1_RELEASE=<valor actual>
```

3. Verificar que `.env.local` esté en `.gitignore`.

---

### FASE 9 — Simplificar BalanceScreen

#### 9.1 Consolidar estado en un tipo `ResumenBalance`

En `src/screens/BalanceScreen.tsx`, reemplazar los 15+ `useState` individuales:
```typescript
type ResumenBalance = {
  totalVentas: number;
  totalCobrado: number;
  totalFiado: number;
  gananciaEstimada: number;
  porMetodo: Record<string, number>;
  cantidadVentas: number;
};

const [resumen, setResumen] = useState<ResumenBalance | null>(null);
const [cargando, setCargando] = useState(true);
```

---

## Orden de implementación recomendado

| Orden | Fase | Justificación |
|-------|------|---------------|
| 1 | FASE 1 (Drizzle install + schema + migrate) | Todo lo demás depende del cliente Drizzle |
| 2 | FASE 2 (Repositorios) | Desbloquea reemplazar db.ts en pantallas |
| 3 | FASE 3 (Dominio finanzas) | Limpia lógica antes de tocar pantallas |
| 4 | FASE 4 (httpUtils) | Cambio pequeño, elimina duplicación |
| 5 | FASE 7.1 (try/catch venta) | Fix crítico de pérdida de datos — hacerlo antes de tocar HomeScreen |
| 6 | FASE 5 (AuthContext + pulseLinked) | Race condition en navegación |
| 7 | FASE 6 (Descomponer HomeScreen) | Requiere repositorios listos |
| 8 | FASE 7.2-7.3 (debounce, tipos nav) | Fixes menores |
| 9 | FASE 8 (Zustand persist, tema, SHA-1) | Polish final |
| 10 | FASE 9 (BalanceScreen) | Refactor menor |

---

## Qué NO tocar en este refactor

- La lógica de `pulseSync.ts` — solo actualizar para que use los nuevos repos en vez de raw SQL.
- El sistema de `mutation_id` en sync — está bien implementado.
- El comportamiento de `marcarPendientes` — migrar como seed en `migrate.ts`.
- El flujo de Google Sign-In — no cambiar, solo mover SHA-1 a env.
- Los estilos y temas — no tocar `theme.ts` ni el sistema `createStyles`.

---

## Comandos necesarios antes de empezar

```bash
# Desde C:\PROJECTS\Yapa
git checkout main
git pull
git checkout -b refactor/architecture-drizzle

# Instalar dependencias nuevas
npx expo install drizzle-orm
npm install --save-dev drizzle-kit
npx expo install use-debounce

# Generar migración inicial (DESPUÉS de crear schema.ts)
npm run db:generate
```

---

## Notas para el implementador

1. **`openDatabaseSync` vs `openDatabaseAsync`:** Drizzle con expo-sqlite usa la API síncrona. El `client.ts` debe usar `openDatabaseSync`, no `openDatabaseAsync`. La app sigue siendo async — Drizzle internamente maneja el threading.

2. **Migraciones en Expo:** drizzle-kit con `driver: 'expo'` genera un bundled JSON de migraciones que se importa en runtime. NO usar el CLI `drizzle-kit migrate` — usar el migrador de runtime `migrate()` de `drizzle-orm/expo-sqlite/migrator`.

3. **Tipos inferidos:** Con Drizzle, los tipos de las entidades se infieren del schema: `typeof tabla.$inferSelect` (para SELECT) y `typeof tabla.$inferInsert` (para INSERT). No redefinir interfaces manualmente.

4. **Transacciones:** `db.transaction(async tx => { ... })` — usar `tx` (no `db`) dentro de la transacción. Esto es crítico para `registrarConDetalle`.

5. **Raw SQL en Drizzle:** Para queries complejas (como `getConBalance`), usar `db.all(sql\`...\`)`. El sql template tag de drizzle escapa los parámetros correctamente.

6. **`db.ts` existente:** NO eliminar `db.ts` hasta que todas las pantallas hayan sido migradas a los repos. Hacer la migración gradual pantalla por pantalla.

7. **babel-plugin-module-resolver:** Si se usa path aliases (`@/database/...`), configurar en `babel.config.js`. Si no se usan aliases actualmente, no es necesario.
