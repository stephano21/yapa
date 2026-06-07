CREATE TABLE `clientes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`deuda_inicial` real DEFAULT 0,
	`saldo_a_favor` real DEFAULT 0,
	`remote_id` text,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`dirty` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cobros` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cliente_id` integer NOT NULL,
	`monto` real NOT NULL,
	`fecha` text NOT NULL,
	`remote_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`synced_at` text,
	`dirty` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `productos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`precio_venta` real NOT NULL,
	`precio_costo` real DEFAULT 0 NOT NULL,
	`precio_minimo` real,
	`stock` integer DEFAULT 0 NOT NULL,
	`remote_id` text,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`dirty` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `unidades_medida` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`unidades` integer DEFAULT 1 NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`dirty` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `venta_detalle` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`venta_id` integer NOT NULL,
	`producto_id` integer,
	`descripcion` text NOT NULL,
	`cantidad` real NOT NULL,
	`precio_unitario` real NOT NULL,
	`subtotal` real NOT NULL,
	`remote_id` text,
	`synced_at` text,
	`dirty` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ventas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fecha` text NOT NULL,
	`total` real NOT NULL,
	`metodo_pago` text NOT NULL,
	`estado` text DEFAULT 'cobrado',
	`cliente_id` integer,
	`remote_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`synced_at` text,
	`dirty` integer DEFAULT 1 NOT NULL
);
