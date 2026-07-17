import { pgTableCreator } from 'drizzle-orm/pg-core';

// Business tables use a "organova_" prefix to avoid naming conflicts.
export const createTable = pgTableCreator((name) => `organova_${name}`);
