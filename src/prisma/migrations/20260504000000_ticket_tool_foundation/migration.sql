ALTER TABLE "ticket_configs"
  ADD COLUMN "max_open_per_user" INTEGER,
  ADD COLUMN "open_cooldown_seconds" INTEGER,
  ADD COLUMN "channel_name_format" TEXT,
  ADD COLUMN "support_role_ids" TEXT;

ALTER TABLE "ticket_button_types"
  ADD COLUMN "max_open_per_user" INTEGER,
  ADD COLUMN "cooldown_seconds" INTEGER,
  ADD COLUMN "questions" TEXT;

ALTER TABLE "ticket_instances"
  ADD COLUMN "form_answers" TEXT;
