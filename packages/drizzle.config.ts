import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './packages/src/schema.ts',
  out: './packages/drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: './packages/data/coda.db',
  },
});
