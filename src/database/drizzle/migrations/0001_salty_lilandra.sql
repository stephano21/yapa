CREATE TABLE `sync_state` (
	`resource` text PRIMARY KEY NOT NULL,
	`last_cursor` text,
	`last_pulled_at` text
);
--> statement-breakpoint
ALTER TABLE `clientes` ADD `pending_delete` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `productos` ADD `pending_delete` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `unidades_medida` ADD `remote_id` text;--> statement-breakpoint
ALTER TABLE `unidades_medida` ADD `pending_delete` integer DEFAULT 0 NOT NULL;