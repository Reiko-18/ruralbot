import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { type Client, ChannelType, type TextChannel } from "discord.js";
import { logger } from "../logger/logger.js";
import { refreshPriceCache } from "../price/price_cache.js";
import {
  getFullTree,
  getNodeById,
  createNode,
  updateNode,
  deleteNode,
  createItem,
  updateItem,
  deleteItem,
  reorderNodes,
  reorderItems,
  getChildrenCount,
  getPriceListConfig,
  upsertPriceListConfig,
} from "../price/repo_price_node.js";
import { MAX_CHILDREN_PER_NODE } from "../../types/price.type.js";
import {
  getAllPresenceTexts,
  createPresenceText,
  deletePresenceText,
} from "../presence/repo_presence.js";
import { refreshPresenceTexts } from "../presence/presence_rotator.js";
import { getAllCategories } from "../accounting/repo_category.js";
import { getAllProducts } from "../accounting/repo_product.js";
import {
  getOrders,
  aggregateSales,
  getDistinctYears,
  getDistinctMonths,
  getDistinctDays,
  getOrderById,
} from "../accounting/repo_order.js";
import { prisma } from "../../core/db.js";
import {
  getTicketConfig,
  getOrCreateTicketConfig,
  upsertTicketConfig,
} from "../ticket/repo_ticket_config.js";
import {
  getButtonTypes,
  createButtonType,
  updateButtonType,
  deleteButtonType,
  reorderButtonTypes,
} from "../ticket/repo_ticket_button_type.js";
import {
  getBlacklist,
  addToBlacklist,
  removeFromBlacklist,
} from "../ticket/repo_ticket_blacklist.js";
import {
  getInstances,
  getInstanceById,
  updateInstanceStatus,
  getTicketStats,
} from "../ticket/repo_ticket_instance.js";
import {
  buildPanelEmbed,
  buildPanelComponents,
  buildClosedTicketButtons,
  buildOpenTicketButtons,
} from "../ticket/ticket_panel_builder.js";
import { updatePanelMessageId } from "../ticket/repo_ticket_config.js";
import { generateAndSendTranscript } from "../ticket/ticket_transcript.js";
import { paymentRoutes, setPaymentDiscordClient } from "./routes/payment.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function startDashboard(client: Client): void {
  setPaymentDiscordClient(client);
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.get("/healthz", (_req, res) => {
    res.json({
      ok: true,
      discordReady: client.isReady(),
      uptimeSec: Math.floor(process.uptime()),
    });
  });

  // ── Discord Guild API Routes ──

  // GET /api/guilds — list all guilds the bot is in
  app.get("/api/guilds", (_req, res) => {
    try {
      const guilds = client.guilds.cache.map((g) => ({
        id: g.id,
        name: g.name,
        icon: g.iconURL({ size: 64 }),
        memberCount: g.memberCount,
      }));
      res.json(guilds);
    } catch (err) {
      logger.error({ err }, "Failed to fetch guilds");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/guilds/:id/channels — list channels for a guild
  app.get("/api/guilds/:id/channels", async (req, res) => {
    try {
      const guild = client.guilds.cache.get(req.params.id);
      if (!guild) return res.status(404).json({ error: "Guild not found" });
      const channels = guild.channels.cache
        .filter((c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildCategory)
        .map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type === ChannelType.GuildCategory ? "category" : "text",
          parentId: c.parentId,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      res.json(channels);
    } catch (err) {
      logger.error({ err }, "Failed to fetch guild channels");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/ticket/deploy-panel/:guildId — deploy or update ticket panel
  app.post("/api/ticket/deploy-panel/:guildId", async (req, res) => {
    try {
      const config = await getTicketConfig(req.params.guildId);
      if (!config || !config.panelChannelId) {
        return res.status(400).json({ error: "請先設定面板頻道" });
      }

      const btnTypes = await getButtonTypes(config.id);
      if (btnTypes.length === 0) {
        return res.status(400).json({ error: "請先新增至少一個按鈕類型" });
      }

      const channel = await client.channels.fetch(config.panelChannelId);
      if (!channel || channel.type !== ChannelType.GuildText) {
        return res.status(400).json({ error: "面板頻道不存在或非文字頻道" });
      }

      const embed = buildPanelEmbed(client, config);
      const components = buildPanelComponents(client, config, btnTypes);

      // Try to edit existing panel message
      if (config.panelMessageId) {
        try {
          const existingMsg = await (channel as TextChannel).messages.fetch(config.panelMessageId);
          await existingMsg.edit({ embeds: [embed], components });
          logger.info({ guildId: req.params.guildId }, "Ticket panel updated via dashboard");
          return res.json({ success: true, action: "updated" });
        } catch {
          // Message deleted, send new one
        }
      }

      // Send new panel message
      const msg = await (channel as TextChannel).send({ embeds: [embed], components });
      await updatePanelMessageId(req.params.guildId, msg.id);
      logger.info({ guildId: req.params.guildId, messageId: msg.id }, "Ticket panel deployed via dashboard");
      res.json({ success: true, action: "deployed" });
    } catch (err) {
      logger.error({ err }, "Failed to deploy ticket panel");
      res.status(500).json({ error: "部署面板失敗，請確認機器人權限" });
    }
  });

  // ── API Routes ──

  // GET /api/price-nodes — full tree
  app.get("/api/price-nodes", async (_req, res) => {
    try {
      const tree = await getFullTree();
      res.json(tree);
    } catch (err) {
      logger.error({ err }, "Failed to fetch price tree");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/price-nodes/:id — single node
  app.get("/api/price-nodes/:id", async (req, res) => {
    try {
      const node = await getNodeById(req.params.id);
      if (!node) return res.status(404).json({ error: "Node not found" });
      res.json(node);
    } catch (err) {
      logger.error({ err }, "Failed to fetch price node");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/price-nodes — create node
  app.post("/api/price-nodes", async (req, res) => {
    try {
      const { name, content, imageUrl, parentId, embedSettings } = req.body;
      if (parentId) {
        const parent = await getNodeById(parentId);
        if (!parent) return res.status(400).json({ error: "parentId not found" });
      }
      const siblingCount = await getChildrenCount(parentId ?? null);
      if (siblingCount >= MAX_CHILDREN_PER_NODE) {
        return res.status(400).json({ error: `Maximum ${MAX_CHILDREN_PER_NODE} children per node` });
      }
      const node = await createNode({
        name: (name || "").trim(),
        content: content || undefined,
        imageUrl: imageUrl || undefined,
        parentId: parentId || undefined,
        embedSettings: embedSettings || undefined,
      });
      await refreshPriceCache();
      logger.info({ nodeId: node.id, name: node.name }, "Price node created");
      res.status(201).json(node);
    } catch (err) {
      logger.error({ err }, "Failed to create price node");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/price-nodes/:id — update node
  app.put("/api/price-nodes/:id", async (req, res) => {
    try {
      const existing = await getNodeById(req.params.id);
      if (!existing) return res.status(404).json({ error: "Node not found" });
      const { name, content, imageUrl, embedSettings } = req.body;
      const node = await updateNode(req.params.id, {
        name: name !== undefined ? (name || "").trim() : undefined,
        content: content !== undefined ? content : undefined,
        imageUrl: imageUrl !== undefined ? imageUrl : undefined,
        embedSettings: embedSettings !== undefined ? embedSettings : undefined,
      });
      await refreshPriceCache();
      logger.info({ nodeId: node.id }, "Price node updated");
      res.json(node);
    } catch (err) {
      logger.error({ err }, "Failed to update price node");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE /api/price-nodes/:id — delete node (cascade)
  app.delete("/api/price-nodes/:id", async (req, res) => {
    try {
      const existing = await getNodeById(req.params.id);
      if (!existing) return res.status(404).json({ error: "Node not found" });
      await deleteNode(req.params.id);
      await refreshPriceCache();
      logger.info({ nodeId: req.params.id }, "Price node deleted");
      res.status(204).end();
    } catch (err) {
      logger.error({ err }, "Failed to delete price node");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/price-items — create item
  app.post("/api/price-items", async (req, res) => {
    try {
      const { label, price, nodeId } = req.body;
      if (!label || typeof label !== "string" || label.trim() === "") {
        return res.status(400).json({ error: "label is required" });
      }
      if (!price || typeof price !== "string" || price.trim() === "") {
        return res.status(400).json({ error: "price is required" });
      }
      if (!nodeId) {
        return res.status(400).json({ error: "nodeId is required" });
      }
      const node = await getNodeById(nodeId);
      if (!node) return res.status(400).json({ error: "nodeId not found" });
      const item = await createItem({
        label: label.trim(),
        price: price.trim(),
        nodeId,
      });
      await refreshPriceCache();
      logger.info({ itemId: item.id, nodeId }, "Price item created");
      res.status(201).json(item);
    } catch (err) {
      logger.error({ err }, "Failed to create price item");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/price-items/:id — update item
  app.put("/api/price-items/:id", async (req, res) => {
    try {
      const { label, price } = req.body;
      if (label !== undefined && (typeof label !== "string" || label.trim() === "")) {
        return res.status(400).json({ error: "label cannot be empty" });
      }
      if (price !== undefined && (typeof price !== "string" || price.trim() === "")) {
        return res.status(400).json({ error: "price cannot be empty" });
      }
      const item = await updateItem(req.params.id, {
        label: label?.trim(),
        price: price?.trim(),
      });
      await refreshPriceCache();
      logger.info({ itemId: item.id }, "Price item updated");
      res.json(item);
    } catch (err: any) {
      if (err?.code === "P2025") {
        return res.status(404).json({ error: "Item not found" });
      }
      logger.error({ err }, "Failed to update price item");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE /api/price-items/:id — delete item
  app.delete("/api/price-items/:id", async (req, res) => {
    try {
      await deleteItem(req.params.id);
      await refreshPriceCache();
      logger.info({ itemId: req.params.id }, "Price item deleted");
      res.status(204).end();
    } catch (err: any) {
      if (err?.code === "P2025") {
        return res.status(404).json({ error: "Item not found" });
      }
      logger.error({ err }, "Failed to delete price item");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/reorder/nodes — batch reorder
  app.put("/api/reorder/nodes", async (req, res) => {
    try {
      const { parentId, ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "ids array is required" });
      }
      await reorderNodes(parentId ?? null, ids);
      await refreshPriceCache();
      res.json({ success: true });
    } catch (err) {
      logger.error({ err }, "Failed to reorder nodes");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/reorder/items — batch reorder
  app.put("/api/reorder/items", async (req, res) => {
    try {
      const { nodeId, ids } = req.body;
      if (!nodeId) return res.status(400).json({ error: "nodeId is required" });
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "ids array is required" });
      }
      await reorderItems(nodeId, ids);
      await refreshPriceCache();
      res.json({ success: true });
    } catch (err) {
      logger.error({ err }, "Failed to reorder items");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/price-config — get homepage config
  app.get("/api/price-config", async (_req, res) => {
    try {
      const config = await getPriceListConfig();
      res.json(config || { id: 1, title: "📋 價目表", description: null, imageUrl: null, embedSettings: null });
    } catch (err) {
      logger.error({ err }, "Failed to fetch price config");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/price-config — update homepage config
  app.put("/api/price-config", async (req, res) => {
    try {
      const { title, description, imageUrl, embedSettings } = req.body;
      const config = await upsertPriceListConfig({
        title: (title || "").trim(),
        description: description || null,
        imageUrl: imageUrl || null,
        embedSettings: embedSettings || null,
      });
      await refreshPriceCache();
      logger.info("Price list config updated");
      res.json(config);
    } catch (err) {
      logger.error({ err }, "Failed to update price config");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Presence API Routes ──

  // GET /api/presence-texts — list all
  app.get("/api/presence-texts", async (_req, res) => {
    try {
      const texts = await getAllPresenceTexts();
      res.json(texts);
    } catch (err) {
      logger.error({ err }, "Failed to fetch presence texts");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/presence-texts — create
  app.post("/api/presence-texts", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text || typeof text !== "string" || text.trim() === "") {
        return res.status(400).json({ error: "text is required" });
      }
      const item = await createPresenceText(text.trim());
      await refreshPresenceTexts();
      logger.info({ id: item.id, text: item.text }, "Presence text created");
      res.status(201).json(item);
    } catch (err) {
      logger.error({ err }, "Failed to create presence text");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE /api/presence-texts/:id — delete
  app.delete("/api/presence-texts/:id", async (req, res) => {
    try {
      await deletePresenceText(req.params.id);
      await refreshPresenceTexts();
      logger.info({ id: req.params.id }, "Presence text deleted");
      res.status(204).end();
    } catch (err: any) {
      if (err?.code === "P2025") {
        return res.status(404).json({ error: "Presence text not found" });
      }
      logger.error({ err }, "Failed to delete presence text");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/presence-refresh — force refresh
  app.post("/api/presence-refresh", async (_req, res) => {
    try {
      await refreshPresenceTexts();
      logger.info("Presence texts force refreshed");
      res.json({ success: true });
    } catch (err) {
      logger.error({ err }, "Failed to refresh presence texts");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Accounting API Routes ──

  // GET /api/accounting/categories — all categories
  app.get("/api/accounting/categories", async (_req, res) => {
    try {
      const categories = await getAllCategories();
      res.json(categories);
    } catch (err) {
      logger.error({ err }, "Failed to fetch categories");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/accounting/products — all products with category
  app.get("/api/accounting/products", async (_req, res) => {
    try {
      const products = await getAllProducts();
      res.json(products);
    } catch (err) {
      logger.error({ err }, "Failed to fetch products");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/accounting/orders?start=ISO&end=ISO — orders with optional date range
  app.get("/api/accounting/orders", async (req, res) => {
    try {
      const start = req.query.start ? new Date(req.query.start as string) : undefined;
      const end = req.query.end ? new Date(req.query.end as string) : undefined;
      const orders = await getOrders(start, end);
      const ordersWithTickets = await Promise.all(
        orders.map(async (o) => {
          const tickets = await prisma.ticketInstance.findMany({
            where: { orderId: o.id },
            select: { ticketNum: true, channelId: true },
          });
          return { ...o, tickets };
        }),
      );
      res.json(ordersWithTickets);
    } catch (err) {
      logger.error({ err }, "Failed to fetch orders");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/accounting/orders/:id — single order by ID
  app.get("/api/accounting/orders/:id", async (req, res) => {
    try {
      const order = await getOrderById(req.params.id);
      if (!order) return res.status(404).json({ error: "Order not found" });
      res.json(order);
    } catch (err) {
      logger.error({ err }, "Failed to fetch order");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/accounting/sales?start=ISO&end=ISO — aggregated sales
  app.get("/api/accounting/sales", async (req, res) => {
    try {
      const start = req.query.start ? new Date(req.query.start as string) : undefined;
      const end = req.query.end ? new Date(req.query.end as string) : undefined;
      const sales = await aggregateSales(start, end);
      res.json(sales);
    } catch (err) {
      logger.error({ err }, "Failed to fetch sales aggregation");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/accounting/years — distinct years
  app.get("/api/accounting/years", async (_req, res) => {
    try {
      const years = await getDistinctYears();
      res.json(years);
    } catch (err) {
      logger.error({ err }, "Failed to fetch distinct years");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/accounting/months/:year — distinct months for year
  app.get("/api/accounting/months/:year", async (req, res) => {
    try {
      const months = await getDistinctMonths(Number(req.params.year));
      res.json(months);
    } catch (err) {
      logger.error({ err }, "Failed to fetch distinct months");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/accounting/days/:year/:month — distinct days for year/month
  app.get("/api/accounting/days/:year/:month", async (req, res) => {
    try {
      const days = await getDistinctDays(Number(req.params.year), Number(req.params.month));
      res.json(days);
    } catch (err) {
      logger.error({ err }, "Failed to fetch distinct days");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Ticket API Routes ──

  // GET /api/ticket/config/:guildId — get ticket config
  app.get("/api/ticket/config/:guildId", async (req, res) => {
    try {
      const config = await getOrCreateTicketConfig(req.params.guildId);
      res.json(config);
    } catch (err) {
      logger.error({ err }, "Failed to fetch ticket config");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/ticket/config/:guildId — upsert ticket config
  app.put("/api/ticket/config/:guildId", async (req, res) => {
    try {
      const config = await upsertTicketConfig(req.params.guildId, req.body);
      logger.info({ guildId: req.params.guildId }, "Ticket config updated via dashboard");
      res.json(config);
    } catch (err) {
      logger.error({ err }, "Failed to upsert ticket config");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/ticket/button-types?configId=xxx — list button types
  app.get("/api/ticket/button-types", async (req, res) => {
    try {
      const configId = req.query.configId as string;
      if (!configId) return res.status(400).json({ error: "configId is required" });
      const types = await getButtonTypes(configId);
      res.json(types);
    } catch (err) {
      logger.error({ err }, "Failed to fetch button types");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/ticket/button-types — create button type
  app.post("/api/ticket/button-types", async (req, res) => {
    try {
      const btn = await createButtonType(req.body);
      logger.info({ id: btn.id, label: btn.label }, "Button type created via dashboard");
      res.status(201).json(btn);
    } catch (err) {
      logger.error({ err }, "Failed to create button type");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/ticket/button-types/:id — update button type
  app.put("/api/ticket/button-types/:id", async (req, res) => {
    try {
      const btn = await updateButtonType(req.params.id, req.body);
      logger.info({ id: btn.id }, "Button type updated via dashboard");
      res.json(btn);
    } catch (err: any) {
      if (err?.code === "P2025") return res.status(404).json({ error: "Button type not found" });
      logger.error({ err }, "Failed to update button type");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE /api/ticket/button-types/:id — delete button type
  app.delete("/api/ticket/button-types/:id", async (req, res) => {
    try {
      await deleteButtonType(req.params.id);
      logger.info({ id: req.params.id }, "Button type deleted via dashboard");
      res.status(204).end();
    } catch (err: any) {
      if (err?.code === "P2025") return res.status(404).json({ error: "Button type not found" });
      logger.error({ err }, "Failed to delete button type");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/ticket/reorder-button-types — reorder button types
  app.put("/api/ticket/reorder-button-types", async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "ids array is required" });
      }
      await reorderButtonTypes(ids);
      res.json({ success: true });
    } catch (err) {
      logger.error({ err }, "Failed to reorder button types");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/ticket/blacklist?configId=xxx — list blacklist entries
  app.get("/api/ticket/blacklist", async (req, res) => {
    try {
      const configId = req.query.configId as string;
      if (!configId) return res.status(400).json({ error: "configId is required" });
      const entries = await getBlacklist(configId);
      res.json(entries);
    } catch (err) {
      logger.error({ err }, "Failed to fetch blacklist");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/ticket/blacklist — add to blacklist
  app.post("/api/ticket/blacklist", async (req, res) => {
    try {
      const entry = await addToBlacklist(req.body);
      logger.info({ userId: req.body.userId, configId: req.body.configId }, "User blacklisted via dashboard");
      res.status(201).json(entry);
    } catch (err: any) {
      if (err?.code === "P2002") return res.status(409).json({ error: "User already blacklisted" });
      logger.error({ err }, "Failed to add to blacklist");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE /api/ticket/blacklist/:id — remove from blacklist
  app.delete("/api/ticket/blacklist/:id", async (req, res) => {
    try {
      await removeFromBlacklist(req.params.id);
      logger.info({ id: req.params.id }, "User removed from blacklist via dashboard");
      res.status(204).end();
    } catch (err: any) {
      if (err?.code === "P2025") return res.status(404).json({ error: "Blacklist entry not found" });
      logger.error({ err }, "Failed to remove from blacklist");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/ticket/instances — list instances with filters
  app.get("/api/ticket/instances", async (req, res) => {
    try {
      const configId = req.query.configId as string | undefined;
      const status = req.query.status as string | undefined;
      const search = req.query.search as string | undefined;
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      const offset = req.query.offset ? Number(req.query.offset) : 0;
      const instances = await getInstances({ configId, status, search, limit, offset });
      res.json(instances);
    } catch (err) {
      logger.error({ err }, "Failed to fetch ticket instances");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/ticket/instances/:id — single instance
  app.get("/api/ticket/instances/:id", async (req, res) => {
    try {
      const instance = await getInstanceById(req.params.id);
      if (!instance) return res.status(404).json({ error: "Instance not found" });
      res.json(instance);
    } catch (err) {
      logger.error({ err }, "Failed to fetch ticket instance");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/ticket/instances/:id/close — close ticket
  app.post("/api/ticket/instances/:id/close", async (req, res) => {
    try {
      const instance = await getInstanceById(req.params.id);
      if (!instance) return res.status(404).json({ error: "Instance not found" });
      const channel = await client.channels.fetch(instance.channelId).catch(() => null);
      if (channel?.type === ChannelType.GuildText) {
        const textChannel = channel as TextChannel;
        await textChannel.permissionOverwrites.delete(instance.creatorId).catch(() => {});
        const closeCategoryId = instance.buttonType?.categoryCloseId ?? instance.config.categoryCloseId;
        if (closeCategoryId) await textChannel.setParent(closeCategoryId, { lockPermissions: false });
        await textChannel.send({
          content: "🔒 票口已由管理面板關閉。",
          components: buildClosedTicketButtons(),
        });
      }
      const updated = await updateInstanceStatus(instance.channelId, "CLOSED", new Date(), {
        closeReason: "由管理面板關閉",
        closedById: "dashboard",
        locked: true,
      });
      logger.info({ id: req.params.id }, "Ticket closed via dashboard");
      res.json(updated);
    } catch (err) {
      logger.error({ err }, "Failed to close ticket instance");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/ticket/instances/:id/reopen — reopen ticket
  app.post("/api/ticket/instances/:id/reopen", async (req, res) => {
    try {
      const instance = await getInstanceById(req.params.id);
      if (!instance) return res.status(404).json({ error: "Instance not found" });
      const channel = await client.channels.fetch(instance.channelId).catch(() => null);
      if (channel?.type === ChannelType.GuildText) {
        const textChannel = channel as TextChannel;
        await textChannel.permissionOverwrites.edit(instance.creatorId, {
          ViewChannel: true,
          SendMessages: true,
          AttachFiles: true,
        });
        const openCategoryId = instance.buttonType?.categoryOpenId ?? instance.config.categoryOpenId;
        if (openCategoryId) await textChannel.setParent(openCategoryId, { lockPermissions: false });
        await textChannel.send({
          content: "🔓 票口已由管理面板重新開啟。",
          components: buildOpenTicketButtons(),
        });
      }
      const updated = await updateInstanceStatus(instance.channelId, "OPEN", undefined, {
        closeReason: null,
        closedById: null,
        locked: false,
      });
      logger.info({ id: req.params.id }, "Ticket reopened via dashboard");
      res.json(updated);
    } catch (err) {
      logger.error({ err }, "Failed to reopen ticket instance");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE /api/ticket/instances/:id — archive ticket
  app.delete("/api/ticket/instances/:id", async (req, res) => {
    try {
      const instance = await getInstanceById(req.params.id);
      if (!instance) return res.status(404).json({ error: "Instance not found" });
      await updateInstanceStatus(instance.channelId, "ARCHIVED");
      const channel = await client.channels.fetch(instance.channelId).catch(() => null);
      if (channel?.type === ChannelType.GuildText) {
        await (channel as TextChannel).delete("Ticket deleted via dashboard");
      }
      logger.info({ id: req.params.id }, "Ticket archived via dashboard");
      res.status(204).end();
    } catch (err) {
      logger.error({ err }, "Failed to archive ticket instance");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/ticket/instances/:id/transcript — generate transcript
  app.post("/api/ticket/instances/:id/transcript", async (req, res) => {
    try {
      const instance = await getInstanceById(req.params.id);
      if (!instance) return res.status(404).json({ error: "Instance not found" });
      const channel = await client.channels.fetch(instance.channelId).catch(() => null);
      if (!channel || channel.type !== ChannelType.GuildText) {
        return res.status(404).json({ error: "Ticket channel not found" });
      }
      await generateAndSendTranscript(
        client,
        channel as TextChannel,
        {
          ticketNum: instance.ticketNum,
          creatorId: instance.creatorId,
          createdAt: instance.createdAt,
          closedAt: instance.closedAt,
          configId: instance.configId,
          status: instance.status,
          closeReason: instance.closeReason,
          closedById: instance.closedById,
          claimedById: instance.claimedById,
        },
        instance.config.transcriptTarget,
        instance.config.logChannelId,
        instance.config.transcriptLogMessage,
        instance.config.transcriptDmMessage,
      );
      res.json({ success: true });
    } catch (err) {
      logger.error({ err }, "Failed to process transcript request");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/ticket/stats/:configId — ticket statistics
  app.get("/api/ticket/stats/:configId", async (req, res) => {
    try {
      const stats = await getTicketStats(req.params.configId);
      res.json(stats);
    } catch (err) {
      logger.error({ err }, "Failed to fetch ticket stats");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Payment API Routes ──
  app.use("/api/payment", paymentRoutes);

  // ── Static files (SPA) ──
  const dashboardDist = path.resolve(__dirname, "../../../dashboard/dist");

  if (!fs.existsSync(dashboardDist)) {
    logger.warn("dashboard/dist/ not found — dashboard UI unavailable. Run: cd dashboard && npm run build");
  }

  app.use(express.static(dashboardDist));

  // API catch-all 404 — prevent SPA fallback from intercepting mistyped API routes
  app.all("/api/{*splat}", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(dashboardDist, "index.html"), (err) => {
      if (err) res.status(404).send("Dashboard not built. Run: cd dashboard && npm run build");
    });
  });

  // ── Start server ──
  const port = parseInt(process.env.PORT || process.env.DASHBOARD_PORT || "3000", 10);
  const host = "0.0.0.0";
  const server = app.listen(port, host, () => {
    logger.info({ port, host }, `Dashboard server started on http://${host}:${port}`);
  });
  server.on("error", (err) => {
    logger.error({ err }, "Failed to start dashboard server");
  });
}
