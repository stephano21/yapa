import * as SQLite from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';

const expo = SQLite.openDatabaseSync('yapa_pos.db');
export const db = drizzle(expo, { schema });
export type DbClient = typeof db;
