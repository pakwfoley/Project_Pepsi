CREATE TABLE `scanner_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`source_key` text NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`raw_text` text NOT NULL,
	`ask_cents` integer,
	`location_text` text NOT NULL,
	`distance_miles` real,
	`image_metadata_json` text NOT NULL,
	`analysis_json` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scanner_candidates_source_key_unique` ON `scanner_candidates` (`source_key`);--> statement-breakpoint
CREATE INDEX `idx_scanner_candidates_status_updated` ON `scanner_candidates` (`status`,`updated_at`);