import { useState, useEffect } from "react";
import { Settings, Store, Shield } from "lucide-react";
import { fetchPaymentConfig, updatePaymentConfig } from "../api/client";
import type { SanitizedPaymentConfig } from "../types";
import { BlurFade } from "./magicui/blur-fade";

interface Props {
  guildId: string;
}

export function PaymentConfig({ guildId }: Props) {
  const [config, setConfig] = useState<SanitizedPaymentConfig | null>(null);
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
  const [enabled, setEnabled] = useState(true);
  const [feeFamily, setFeeFamily] = useState("");
  const [fee711, setFee711] = useState("");
  const [fee711Over, setFee711Over] = useState("");
  const [fee711Threshold, setFee711Threshold] = useState("1000");

  useEffect(() => {
    fetchPaymentConfig(guildId)
      .then(({ config: c, hasEnvCredentials: hasEnv }) => {
        setConfig(c);
        setHasEnvCredentials(hasEnv);
        // 每次載入都清空輸入框，避免舊的暫存輸入誤植為新金鑰
        setDcvc("");
        setRvg2c("");
        setVerifyKey("");
        if (c) {
          setHasDcvc(c.hasDcvc);
          setHasRvg2c(c.hasRvg2c);
          setHasVerifyKey(c.hasVerifyKey);
          setEnabled(c.enabled);
          setFeeFamily(c.feeFamily != null ? String(c.feeFamily) : "");
          setFee711(c.fee711 != null ? String(c.fee711) : "");
          setFee711Over(c.fee711Over != null ? String(c.fee711Over) : "");
          setFee711Threshold(c.fee711Threshold != null ? String(c.fee711Threshold) : "1000");
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
      const payload: Record<string, unknown> = {
        enabled,
        feeFamily: feeFamily ? Number(feeFamily) : null,
        fee711: fee711 ? Number(fee711) : null,
        fee711Over: fee711Over ? Number(fee711Over) : null,
        fee711Threshold: fee711Threshold ? Number(fee711Threshold) : null,
      };
      // 金鑰欄位留空代表「不變更」，只有使用者實際輸入新值時才送出，避免把既有金鑰清空
      if (dcvc.trim() !== "") payload.dcvc = dcvc;
      if (rvg2c.trim() !== "") payload.rvg2c = rvg2c;
      if (verifyKey.trim() !== "") payload.verifyKey = verifyKey;

      const updated = await updatePaymentConfig(guildId, payload as any);
      setConfig(updated);
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
            <h3 className="text-base font-semibold">SmilePay 商家憑證</h3>
          </div>

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

          <label className="flex items-center gap-2.5 cursor-pointer">
            <div className={`w-9 h-5 rounded-full relative transition-colors ${enabled ? "bg-violet-600" : "bg-gray-600"}`}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${enabled ? "translate-x-4" : "translate-x-0.5"}`} />
            </div>
            <input type="checkbox" className="hidden" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span className="text-sm text-gray-300">啟用金流功能</span>
          </label>
        </div>
      </BlurFade>

      {/* Fee Configuration */}
      <BlurFade delay={0.1} direction="up">
        <div className="glow-card p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Store size={16} className="text-violet-400" />
            <h3 className="text-base font-semibold">SmilePay 代收手續費設定</h3>
          </div>

          <div className="text-sm text-gray-400 bg-violet-500/5 border border-violet-500/10 p-3 rounded-lg">
            此費用不是商品售價；系統會先把 SmilePay/超商代收手續費加到客人的應繳總額。
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">全家代收手續費 (元)</label>
              <input type="number" min="0" className="w-full glow-input" value={feeFamily} onChange={(e) => setFeeFamily(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">7-11 代收手續費 (元)</label>
              <input type="number" min="0" className="w-full glow-input" value={fee711} onChange={(e) => setFee711(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">7-11 代收手續費 - 超過門檻 (元)</label>
              <input type="number" min="0" className="w-full glow-input" value={fee711Over} onChange={(e) => setFee711Over(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">7-11 階梯門檻 (元)</label>
              <input type="number" min="0" className="w-full glow-input" value={fee711Threshold} onChange={(e) => setFee711Threshold(e.target.value)} placeholder="1000" />
            </div>
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
