import * as schema from './schema.js';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

export const createDb = (url: string) => {
    const sqlClient = neon(url);
    return drizzle({ client: sqlClient, schema });
};
