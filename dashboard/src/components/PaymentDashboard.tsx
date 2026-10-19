import { useState, useEffect } from "react";
import { CreditCard } from "lucide-react";
import { fetchGuilds } from "../api/client";
import { PaymentConfig } from "./PaymentConfig";
import { PaymentStats } from "./PaymentStats";
import { PaymentTransactions } from "./PaymentTransactions";
import { BlurFade } from "./magicui/blur-fade";

type View = "stats" | "transactions" | "config";

export function PaymentDashboard() {
  const [guildId, setGuildId] = useState(() => localStorage.getItem("payment_guild_id") ?? "");
  const [guilds, setGuilds] = useState<{ id: string; name: string }[]>([]);
  const [view, setView] = useState<View>("stats");

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
      <BlurFade delay={0} direction="down">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CreditCard size={20} className="text-violet-400" />
            <h2 className="text-lg font-semibold">金流管理</h2>
          </div>
          <select
            className="glow-input"
            value={guildId}
            onChange={(e) => setGuildId(e.target.value)}
          >
            <option value="">選擇伺服器</option>
            {guilds.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
      </BlurFade>

      {guildId && (
        <>
          <div className="flex flex-wrap gap-1">
            {([
              ["stats", "統計總覽"],
              ["transactions", "交易紀錄"],
              ["config", "付款回報設定"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                className={`tab-btn ${view === key ? "active" : ""}`}
                onClick={() => setView(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <BlurFade delay={0.1} direction="up">
            {view === "stats" && <PaymentStats guildId={guildId} />}
            {view === "transactions" && <PaymentTransactions guildId={guildId} />}
            {view === "config" && <PaymentConfig guildId={guildId} />}
          </BlurFade>
        </>
      )}
    </div>
  );
}
