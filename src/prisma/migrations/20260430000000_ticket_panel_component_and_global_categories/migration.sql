ALTER TABLE "ticket_configs"
ADD COLUMN "category_open_id" TEXT,
ADD COLUMN "category_close_id" TEXT,
ADD COLUMN "panel_component_type" TEXT NOT NULL DEFAULT 'buttons';
