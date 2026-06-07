import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { db } from './client';
import migrations from './migrations/migrations';

export async function runMigrations(): Promise<void> {
  await migrate(db, migrations);
  await seedInitialData();
}

async function seedInitialData(): Promise<void> {
  const { unidadesMedida } = await import('./schema');
  const { sql } = await import('drizzle-orm');
  const rows = await db.all(sql`SELECT COUNT(*) as count FROM unidades_medida`);
  const count = (rows[0] as { count: number })?.count ?? 0;
  if (count > 0) return;
  await db.insert(unidadesMedida).values([
    { nombre: 'Unidad', unidades: 1, dirty: 0 },
    { nombre: 'Docena', unidades: 12, dirty: 0 },
  ]);
}
