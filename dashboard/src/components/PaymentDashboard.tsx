import { useState, useEffect } from "react";
import { fetchGuilds } from "../api/client";
import { PaymentConfig } from "./PaymentConfig";
import { PaymentStats } from "./PaymentStats";
import { PaymentTransactions } from "./PaymentTransactions";
import { PaymentCreateModal } from "./PaymentCreateModal";

type View = "stats" | "transactions" | "config";

export function PaymentDashboard() {
  const [guildId, setGuildId] = useState(() => localStorage.getItem("payment_guild_id") ?? "");
  const [guilds, setGuilds] = useState<{ id: string; name: string }[]>([]);
  const [view, setView] = useState<View>("stats");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetchGuilds()
      .then((data) => {
        setGuilds(data);
        if (!guildId && data.length > 0) {
          setGuildId(data[0].id);
        }
      })
      .catch((err) => console.error("Failed to load guilds:", err));
  }, []);

  useEffect(() => {
    if (guildId) localStorage.setItem("payment_guild_id", guildId);
  }, [guildId]);

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center gap-4">
        <select
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white"
          value={guildId}
          onChange={(e) => setGuildId(e.target.value)}
        >
          <option value="">選擇伺服器</option>
          {guilds.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </div>

      {guildId && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {([
                ["stats", "統計總覽"],
                ["transactions", "交易紀錄"],
                ["config", "金流設定"],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  className={`px-3 py-1.5 rounded text-sm ${view === key ? "btn-accent" : "text-gray-400 hover:text-white"}`}
                  onClick={() => setView(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              className="btn-accent px-4 py-2 rounded text-sm"
              onClick={() => setShowCreateModal(true)}
            >
              建立付款
            </button>
          </div>

          {view === "stats" && <PaymentStats guildId={guildId} />}
          {view === "transactions" && <PaymentTransactions guildId={guildId} refreshKey={refreshKey} />}
          {view === "config" && <PaymentConfig guildId={guildId} />}

          {showCreateModal && (
            <PaymentCreateModal
              guildId={guildId}
              onClose={() => setShowCreateModal(false)}
              onCreated={() => setRefreshKey((k) => k + 1)}
            />
          )}
        </>
      )}
    </div>
  );
}
