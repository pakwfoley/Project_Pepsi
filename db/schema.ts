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
  dealerAskMedianCents: integer('dealer_ask_median_cents'),
  privateAskMedianCents: integer('private_ask_median_cents'),
  clearingEstimateCents: integer('clearing_estimate_cents'),
  qlvHaircutBps: integer('qlv_haircut_bps'),
  createdAt: text('created_at').notNull(),
}, (table) => [index('idx_valuations_listing_created').on(table.listingId, table.createdAt)]);

export const scannerCandidates = sqliteTable('scanner_candidates', {
  id: text('id').primaryKey(),
  sourceKey: text('source_key').notNull().unique(),
  url: text('url').notNull(),
  title: text('title').notNull(),
  rawText: text('raw_text').notNull(),
  askCents: integer('ask_cents'),
  locationText: text('location_text').notNull(),
  distanceMiles: real('distance_miles'),
  imageMetadataJson: text('image_metadata_json').notNull(),
  analysisJson: text('analysis_json').notNull(),
  status: text('status').notNull().default('new'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [index('idx_scanner_candidates_status_updated').on(table.status, table.updatedAt)]);
