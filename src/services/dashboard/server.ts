import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function startDashboard(): void {
  const app = express();
  app.use(express.json());

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
