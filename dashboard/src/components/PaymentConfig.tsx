import { useState, useEffect } from "react";
import { Settings, Shield } from "lucide-react";
import { fetchPaymentConfig, updatePaymentConfig } from "../api/client";
import type { PaymentConfig as PaymentConfigData } from "../types";
import { BlurFade } from "./magicui/blur-fade";

interface Props {
  guildId: string;
}

export function PaymentConfig({ guildId }: Props) {
  const [hasEnvCredentials, setHasEnvCredentials] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // 金鑰不再由後端明文回傳，輸入框只承載「使用者這次要輸入的新值」，留空代表不變更。
  const [dcvc, setDcvc] = useState("");
  const [rvg2c, setRvg2c] = useState("");
  const [verifyKey, setVerifyKey] = useState("");
  const [hasDcvc, setHasDcvc] = useState(false);
  const [hasRvg2c, setHasRvg2c] = useState(false);
  const [hasVerifyKey, setHasVerifyKey] = useState(false);

  useEffect(() => {
    fetchPaymentConfig(guildId)
      .then(({ config: c, hasEnvCredentials: hasEnv }) => {
        setHasEnvCredentials(hasEnv);
        // 每次載入都清空輸入框，避免舊的暫存輸入誤植為新金鑰
        setDcvc("");
        setRvg2c("");
        setVerifyKey("");
        if (c) {
          setHasDcvc(c.hasDcvc);
          setHasRvg2c(c.hasRvg2c);
          setHasVerifyKey(c.hasVerifyKey);
        } else {
          setHasDcvc(false);
          setHasRvg2c(false);
          setHasVerifyKey(false);
        }
      })
      .catch((err) => console.error("Failed to load payment config:", err))
      .finally(() => setLoading(false));
  }, [guildId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Partial<PaymentConfigData> = {};
      // 金鑰欄位留空代表「不變更」，只有使用者實際輸入新值時才送出，避免把既有金鑰清空
      if (dcvc.trim() !== "") payload.dcvc = dcvc;
      if (rvg2c.trim() !== "") payload.rvg2c = rvg2c;
      if (verifyKey.trim() !== "") payload.verifyKey = verifyKey;

      const updated = await updatePaymentConfig(guildId, payload);
      setHasDcvc(updated.hasDcvc);
      setHasRvg2c(updated.hasRvg2c);
      setHasVerifyKey(updated.hasVerifyKey);
      // 儲存成功後清空輸入框，畫面上不殘留剛輸入的金鑰
      setDcvc("");
      setRvg2c("");
      setVerifyKey("");
    } catch (err) {
      console.error("Failed to save payment config:", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><div className="spinner-lg" /></div>;

  return (
    <div className="space-y-6">
      {/* Merchant Credentials */}
      <BlurFade delay={0} direction="up">
        <div className="glow-card p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Shield size={16} className="text-violet-400" />
            <h3 className="text-base font-semibold">SmilePay 付款回報憑證</h3>
          </div>

          <p className="text-sm text-gray-400">超商代碼開單已停用，此設定僅供既有交易付款回報使用。</p>

          {hasEnvCredentials && (
            <div className="text-sm text-gray-400 bg-violet-500/5 border border-violet-500/10 p-3 rounded-lg">
              已偵測到環境變數預設憑證。下方欄位留空將使用預設值。
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label className="block text-sm text-gray-400">商家代號 (Dcvc)</label>
                <span className={`text-xs shrink-0 ${hasDcvc ? "text-emerald-400" : "text-gray-500"}`}>{hasDcvc ? "已設定" : "未設定"}</span>
              </div>
              <input type="text" className="w-full glow-input" value={dcvc} onChange={(e) => setDcvc(e.target.value)} placeholder={hasDcvc ? "已設定，留空則不變" : "尚未設定"} />
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label className="block text-sm text-gray-400">參數碼 (Rvg2c)</label>
                <span className={`text-xs shrink-0 ${hasRvg2c ? "text-emerald-400" : "text-gray-500"}`}>{hasRvg2c ? "已設定" : "未設定"}</span>
              </div>
              <input type="text" className="w-full glow-input" value={rvg2c} onChange={(e) => setRvg2c(e.target.value)} placeholder={hasRvg2c ? "已設定，留空則不變" : "尚未設定"} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label className="block text-sm text-gray-400">檢查碼 (Verify Key)</label>
              <span className={`text-xs shrink-0 ${hasVerifyKey ? "text-emerald-400" : "text-gray-500"}`}>{hasVerifyKey ? "已設定" : "未設定"}</span>
            </div>
            <input type="password" className="w-full glow-input" value={verifyKey} onChange={(e) => setVerifyKey(e.target.value)} placeholder={hasVerifyKey ? "已設定，留空則不變" : "尚未設定"} />
          </div>
        </div>
      </BlurFade>

      <BlurFade delay={0.15} direction="up">
        <button className="btn-accent" onClick={handleSave} disabled={saving}>
          {saving ? (
            <span className="flex items-center gap-2"><div className="spinner" /> 儲存中...</span>
          ) : (
            <span className="flex items-center gap-2"><Settings size={14} /> 儲存設定</span>
          )}
        </button>
      </BlurFade>
    </div>
  );
}
