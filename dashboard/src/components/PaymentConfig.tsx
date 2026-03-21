import { useState, useEffect } from "react";
import type { PaymentConfig as PaymentConfigType } from "../types";
import { fetchPaymentConfig, updatePaymentConfig } from "../api/client";

interface Props {
  guildId: string;
}

export function PaymentConfig({ guildId }: Props) {
  const [config, setConfig] = useState<PaymentConfigType | null>(null);
  const [hasEnvCredentials, setHasEnvCredentials] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dcvc, setDcvc] = useState("");
  const [rvg2c, setRvg2c] = useState("");
  const [verifyKey, setVerifyKey] = useState("");
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    fetchPaymentConfig(guildId)
      .then(({ config: c, hasEnvCredentials: hasEnv }) => {
        setConfig(c);
        setHasEnvCredentials(hasEnv);
        if (c) {
          setDcvc(c.dcvc ?? "");
          setRvg2c(c.rvg2c ?? "");
          setVerifyKey(c.verifyKey ?? "");
          setEnabled(c.enabled);
        }
      })
      .catch((err) => console.error("Failed to load payment config:", err))
      .finally(() => setLoading(false));
  }, [guildId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updatePaymentConfig(guildId, {
        dcvc: dcvc || null,
        rvg2c: rvg2c || null,
        verifyKey: verifyKey || null,
        enabled,
      } as any);
      setConfig(updated);
    } catch (err) {
      console.error("Failed to save payment config:", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-gray-400">載入中...</div>;

  return (
    <div className="glow-card p-6 space-y-4">
      <h3 className="text-lg font-semibold">SmilePay 商家設定</h3>

      {hasEnvCredentials && (
        <div className="text-sm text-gray-400 bg-gray-800 p-3 rounded">
          已偵測到環境變數預設憑證。下方欄位留空將使用預設值。
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">商家代號 (Dcvc)</label>
          <input
            type="text"
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
            value={dcvc}
            onChange={(e) => setDcvc(e.target.value)}
            placeholder={hasEnvCredentials ? "使用環境變數預設值" : ""}
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">參數碼 (Rvg2c)</label>
          <input
            type="text"
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
            value={rvg2c}
            onChange={(e) => setRvg2c(e.target.value)}
            placeholder={hasEnvCredentials ? "使用環境變數預設值" : ""}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1">檢查碼 (Verify Key)</label>
        <input
          type="password"
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
          value={verifyKey}
          onChange={(e) => setVerifyKey(e.target.value)}
          placeholder={hasEnvCredentials ? "使用環境變數預設值" : ""}
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="payment-enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="rounded"
        />
        <label htmlFor="payment-enabled" className="text-sm text-gray-300">啟用金流功能</label>
      </div>

      <button
        className="btn-accent px-4 py-2 rounded text-sm"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? "儲存中..." : "儲存設定"}
      </button>
    </div>
  );
}
