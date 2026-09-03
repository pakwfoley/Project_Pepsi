CREATE TABLE `listings` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`source` text NOT NULL,
	`raw_text` text NOT NULL,
	`brand` text NOT NULL,
	`model` text NOT NULL,
	`reference` text NOT NULL,
	`ask_cents` integer NOT NULL,
	`normalization_confidence` real NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_listings_created_at` ON `listings` (`created_at`);--> statement-breakpoint
CREATE TABLE `valuations` (
	`id` text PRIMARY KEY NOT NULL,
	`listing_id` text NOT NULL,
	`policy_version` text NOT NULL,
	`received_qlv_cents` integer NOT NULL,
	`given_qlv_cents` integer NOT NULL,
	`cash_paid_cents` integer NOT NULL,
	`cost_cents` integer NOT NULL,
	`expected_risk_loss_cents` integer NOT NULL,
	`liquidity_adjustment_cents` integer NOT NULL,
	`economic_alpha_cents` integer NOT NULL,
	`strategic_score_cents` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_valuations_listing_created` ON `valuations` (`listing_id`,`created_at`);