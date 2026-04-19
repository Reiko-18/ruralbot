-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "guilds" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT '!',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guilds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "members" (
    "id" TEXT NOT NULL,
    "discord_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log_configs" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "webhook_url" TEXT NOT NULL,
    "min_level" INTEGER NOT NULL DEFAULT 30,
    "label" TEXT,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "log_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_health" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "last_ping" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'OK',

    CONSTRAINT "system_health_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "source" TEXT,
    "category_id" TEXT NOT NULL,
    "face_value" DOUBLE PRECISION,
    "cost_discount" DOUBLE PRECISION,
    "price_discount" DOUBLE PRECISION,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "product_id" TEXT,
    "product_name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "actual_price" DOUBLE PRECISION NOT NULL,
    "actual_cost" DOUBLE PRECISION NOT NULL,
    "profit" DOUBLE PRECISION NOT NULL,
    "is_custom" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_configs" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_configs" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "primary_guild_id" TEXT NOT NULL,
    "sync_channel_id" TEXT NOT NULL,
    "ticket_log_channel_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bot_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_nodes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT,
    "image_url" TEXT,
    "embed_settings" TEXT,
    "parent_id" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_items" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "price" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "presence_texts" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "presence_texts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_list_configs" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL DEFAULT '',
    "description" TEXT,
    "image_url" TEXT,
    "embed_settings" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_list_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_configs" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "panel_channel_id" TEXT,
    "panel_message_id" TEXT,
    "log_channel_id" TEXT,
    "panel_embed" TEXT,
    "default_message" TEXT,
    "last_ticket_num" INTEGER NOT NULL DEFAULT 0,
    "auto_remind_hours" INTEGER,
    "auto_close_hours" INTEGER,
    "blacklist_mode" TEXT NOT NULL DEFAULT 'ephemeral',
    "blacklist_message" TEXT,
    "transcript_target" TEXT NOT NULL DEFAULT 'both',
    "transcript_log_message" TEXT,
    "transcript_dm_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_button_types" (
    "id" TEXT NOT NULL,
    "config_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "emoji" TEXT,
    "style" TEXT NOT NULL DEFAULT 'PRIMARY',
    "category_open_id" TEXT,
    "category_close_id" TEXT,
    "welcome_message" TEXT,
    "embed_settings" TEXT,
    "notify_role_ids" TEXT,
    "auto_remind_hours" INTEGER,
    "auto_close_hours" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_button_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_blacklists" (
    "id" TEXT NOT NULL,
    "config_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reason" TEXT,
    "added_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_blacklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_instances" (
    "id" TEXT NOT NULL,
    "config_id" TEXT NOT NULL,
    "button_type_id" TEXT,
    "channel_id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "ticket_num" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "order_id" TEXT,
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reminded" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "ticket_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_configs" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "dcvc" TEXT,
    "rvg2c" TEXT,
    "verify_key" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "fee_family" INTEGER,
    "fee_711" INTEGER,
    "fee_711_over" INTEGER,
    "fee_711_threshold" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payer_name" TEXT,
    "payer_email" TEXT,
    "payer_phone" TEXT,
    "remark" TEXT,
    "smilepay_no" TEXT,
    "payment_code" TEXT,
    "payment_deadline" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "original_amount" INTEGER,
    "fee_amount" INTEGER,
    "payment_store" TEXT,
    "channel_id" TEXT,
    "message_id" TEXT,
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_callback_logs" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "raw_data" TEXT NOT NULL,
    "source_ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_callback_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "members_discord_id_guild_id_key" ON "members"("discord_id", "guild_id");

-- CreateIndex
CREATE UNIQUE INDEX "log_configs_channel_id_key" ON "log_configs"("channel_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "products_name_key" ON "products"("name");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_configs_guild_id_key" ON "accounting_configs"("guild_id");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_configs_guild_id_key" ON "ticket_configs"("guild_id");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_blacklists_config_id_user_id_key" ON "ticket_blacklists"("config_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_instances_channel_id_key" ON "ticket_instances"("channel_id");

-- CreateIndex
CREATE INDEX "ticket_instances_config_id_status_idx" ON "ticket_instances"("config_id", "status");

-- CreateIndex
CREATE INDEX "ticket_instances_creator_id_idx" ON "ticket_instances"("creator_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_configs_guild_id_key" ON "payment_configs"("guild_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_order_id_key" ON "payment_transactions"("order_id");

-- CreateIndex
CREATE INDEX "payment_transactions_guild_id_idx" ON "payment_transactions"("guild_id");

-- CreateIndex
CREATE INDEX "payment_transactions_status_idx" ON "payment_transactions"("status");

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_nodes" ADD CONSTRAINT "price_nodes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "price_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_items" ADD CONSTRAINT "price_items_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "price_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_button_types" ADD CONSTRAINT "ticket_button_types_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "ticket_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_blacklists" ADD CONSTRAINT "ticket_blacklists_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "ticket_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_instances" ADD CONSTRAINT "ticket_instances_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "ticket_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_instances" ADD CONSTRAINT "ticket_instances_button_type_id_fkey" FOREIGN KEY ("button_type_id") REFERENCES "ticket_button_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_instances" ADD CONSTRAINT "ticket_instances_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_callback_logs" ADD CONSTRAINT "payment_callback_logs_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "payment_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
