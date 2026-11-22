CREATE TABLE `ol_search_cache` (
	`query` text PRIMARY KEY NOT NULL,
	`results` text NOT NULL,
	`fetched_at` integer NOT NULL
);
