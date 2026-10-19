import assert from "node:assert/strict";
import { test } from "node:test";
import { Events, InteractionContextType, REST, SlashCommandBuilder, type Client, type ChatInputCommandInteraction } from "discord.js";

// 測試不使用正式憑證，也不建立資料庫或 Discord 連線。
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/ruralbot_test";
process.env.TOKEN = "test-token";
process.env.APPLICATION_ID = "test-app";

const { commands, registerCommand, handleInteraction, deployCommands } = await import("../src/core/command_handler.js");
const { registerPriceMenuEvent } = await import("../src/events/price/price-menu.event.js");
const { registerTicketButtonEvent } = await import("../src/events/ticket/ticket-button.event.js");
const { registerTicketManageEvent } = await import("../src/events/ticket/ticket-manage.event.js");

const privateInteraction = new Proxy({ inGuild: () => false }, {
  get(target, property) {
    assert.equal(property, "inGuild", "私訊必須在讀取操作內容或呼叫服務前返回");
    return Reflect.get(target, property);
  },
}) as unknown as ChatInputCommandInteraction;

test("私訊指令不進入執行或同步流程", async () => {
  await handleInteraction(privateInteraction);
});

for (const register of [registerPriceMenuEvent, registerTicketButtonEvent, registerTicketManageEvent]) {
  test(`${register.name} 拒絕私訊選單、按鈕與表單`, async () => {
    let listener: ((interaction: ChatInputCommandInteraction) => Promise<void>) | undefined;
    register({ on(event: string, handler: typeof listener) {
      assert.equal(event, Events.InteractionCreate);
      listener = handler;
    } } as unknown as Client);
    assert.ok(listener);
    await listener(privateInteraction);
  });
}

test("伺服器指令仍可正常執行，部署僅允許 Guild", async (t) => {
  let executions = 0;
  registerCommand({
    data: new SlashCommandBuilder().setName("scope-check").setDescription("檢查操作範圍"),
    execute: async () => { executions++; },
    mirrorResponse: false,
  });
  t.after(() => commands.delete("scope-check"));

  await handleInteraction({
    inGuild: () => true,
    guildId: "123456789012345678",
    commandName: "scope-check",
  } as unknown as ChatInputCommandInteraction);
  assert.equal(executions, 1);

  const put = t.mock.method(REST.prototype, "put", async (_route, options) => {
    assert.ok(Array.isArray(options?.body));
    assert.deepEqual(options.body[0].contexts, [InteractionContextType.Guild]);
    return [];
  });
  await deployCommands();
  assert.equal(put.mock.callCount(), 1);
});

test("獨立部署移除開單並保留記帳指令，全部限制於伺服器", async (t) => {
  const put = t.mock.method(REST.prototype, "put", async (_route, options) => {
    const body = options?.body;
    assert.ok(Array.isArray(body));
    assert.equal(body.some((command: { name: string }) => command.name === "rp"), false);
    for (const command of body) {
      assert.deepEqual(command.contexts, [InteractionContextType.Guild]);
    }
    const payment = body.find((command: { name: string }) => command.name === "payment");
    assert.deepEqual(payment.options.map((option: { name: string }) => option.name), ["status", "list", "stats"]);
    for (const name of ["accounting-setup", "product-add", "product-list", "order-add", "order-custom", "order-delete", "order-restore", "sales-overview", "sales-export"]) {
      assert.ok(body.some((command: { name: string }) => command.name === name), `${name} 必須保留`);
    }
    return body;
  });
  await import("../deploy-commands.mjs");
  assert.equal(put.mock.callCount(), 1);
});
