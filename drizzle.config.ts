import type { Config } from 'drizzle-kit';

export default {
  schema: './src/database/drizzle/schema.ts',
  out: './src/database/drizzle/migrations',
  dialect: 'sqlite',
  driver: 'expo',
} satisfies Config;
