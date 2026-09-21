CREATE TABLE `compras_proveedor` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`proveedor_id` integer NOT NULL,
	`monto` real NOT NULL,
	`fecha` text NOT NULL,
	`nota` text,
	`remote_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`synced_at` text,
	`dirty` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pagos_proveedor` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`proveedor_id` integer NOT NULL,
	`monto` real NOT NULL,
	`metodo_pago` text NOT NULL,
	`fecha` text NOT NULL,
	`nota` text,
	`comprobante_uri` text,
	`comprobante_file_id` text,
	`comprobante_url` text,
	`remote_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`synced_at` text,
	`dirty` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `proveedores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`telefono` text,
	`notas` text,
	`deuda_inicial` real DEFAULT 0 NOT NULL,
	`remote_id` text,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`dirty` integer DEFAULT 1 NOT NULL,
	`pending_delete` integer DEFAULT 0 NOT NULL
);
