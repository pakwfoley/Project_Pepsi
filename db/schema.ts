import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const listings = sqliteTable('listings', {
  id: text('id').primaryKey(),
  url: text('url').notNull(),
  source: text('source').notNull(),
  rawText: text('raw_text').notNull(),
  brand: text('brand').notNull(),
  model: text('model').notNull(),
  reference: text('reference').notNull(),
  askCents: integer('ask_cents').notNull(),
  normalizationConfidence: real('normalization_confidence').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [index('idx_listings_created_at').on(table.createdAt)]);

export const valuations = sqliteTable('valuations', {
  id: text('id').primaryKey(),
  listingId: text('listing_id').notNull().references(() => listings.id),
  policyVersion: text('policy_version').notNull(),
  receivedQlvCents: integer('received_qlv_cents').notNull(),
  givenQlvCents: integer('given_qlv_cents').notNull(),
  cashPaidCents: integer('cash_paid_cents').notNull(),
  costCents: integer('cost_cents').notNull(),
  expectedRiskLossCents: integer('expected_risk_loss_cents').notNull(),
  liquidityAdjustmentCents: integer('liquidity_adjustment_cents').notNull(),
  economicAlphaCents: integer('economic_alpha_cents').notNull(),
  strategicScoreCents: integer('strategic_score_cents').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [index('idx_valuations_listing_created').on(table.listingId, table.createdAt)]);
