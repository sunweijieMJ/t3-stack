import { relations } from 'drizzle-orm';
import { account, session, user } from './auth-schema';

export const userRelations = relations(user, ({ many }) => ({
  account: many(account),
  session: many(session),
}));
