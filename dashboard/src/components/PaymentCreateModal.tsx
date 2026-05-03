import { useMemo, useState } from "react";
import { X, CheckCircle, Copy, AlertCircle } from "lucide-react";
import { createPayment } from "../api/client";

interface Props {
  guildId: string;
  onClose: () => void;
  onCreated: () => void;
}

const gmailRe = /^[A-Z0-9._%+-]+@gmail\.com$/i;

export function PaymentCreateModal({ guildId, onClose, onCreated }: Props) {
  const [amount, setAmount] = useState("");
  const [payerName, setPayerName] = useState("");
  const [payerEmail, setPayerEmail] = useState("");
  const [payerPhone, setPayerPhone] = useState("");
  const [remark, setRemark] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ orderId: string; paymentCode?: string; paymentUrl: string } | null>(null);

  const validationError = useMemo(() => {
    const amt = parseInt(amount, 10);
    const phoneDigits = payerPhone.replace(/\D/g, "");
    if (!amt || amt <= 0) return "請輸入有效金額。";
    if (payerName.trim().length < 2) return "請填寫買家真實姓名。";
    if (!gmailRe.test(payerEmail.trim())) return "請填寫 @gmail.com 的 Gmail 信箱。";
    if (phoneDigits.length < 8 || phoneDigits.length > 15) return "請填寫有效電話。";
    return "";
  }, [amount, payerName, payerEmail, payerPhone]);

  const handleSubmit = async () => {
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const res = await createPayment(guildId, {
        amount: parseInt(amount, 10),
        payerName: payerName.trim(),
        payerEmail: payerEmail.trim().toLowerCase(),
        payerPhone: payerPhone.trim(),
        remark: remark.trim() || undefined,
      });
      setResult({
        orderId: res.transaction.orderId,
        paymentCode: res.transaction.paymentCode ?? undefined,
        paymentUrl: res.paymentUrl,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "建立付款失敗，請稍後再試。");
    } finally {
      setSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in p-4" onClick={onClose}>
      <div className="glow-card p-6 w-full max-w-md space-y-5 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">建立付款</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-violet-500/10">
            <X size={18} />
          </button>
        </div>

        {result ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
              <CheckCircle size={16} />
              <span className="text-sm font-medium">付款已建立</span>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between bg-surface p-3 rounded-lg">
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">訂單編號</div>
                  <div className="font-mono text-sm">{result.orderId}</div>
                </div>
                <button onClick={() => copyToClipboard(result.orderId)} className="text-gray-400 hover:text-violet-300 p-1">
                  <Copy size={14} />
                </button>
              </div>

              {result.paymentCode && (
                <div className="flex items-center justify-between bg-surface p-3 rounded-lg">
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5">超商繳費代碼</div>
                    <div className="font-mono text-lg font-bold text-violet-300">{result.paymentCode}</div>
                  </div>
                  <button onClick={() => copyToClipboard(result.paymentCode!)} className="text-gray-400 hover:text-violet-300 p-1">
                    <Copy size={14} />
                  </button>
                </div>
              )}

              <div className="bg-surface p-3 rounded-lg">
                <div className="text-xs text-gray-400 mb-0.5">付款連結</div>
                <a href={result.paymentUrl} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300 text-sm break-all">
                  {result.paymentUrl}
                </a>
              </div>
            </div>

            <button className="btn-accent w-full" onClick={onClose}>關閉</button>
          </div>
        ) : (
          <>
            {error && (
              <div className="flex items-start gap-2 text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-sm text-gray-400 mb-1.5">金額 (新台幣) *</label>
              <input type="number" min="1" className="w-full glow-input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="輸入金額" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">買家真實姓名 *</label>
              <input type="text" className="w-full glow-input" value={payerName} onChange={(e) => setPayerName(e.target.value)} placeholder="請輸入真實姓名" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Gmail *</label>
                <input type="email" className="w-full glow-input" value={payerEmail} onChange={(e) => setPayerEmail(e.target.value)} placeholder="name@gmail.com" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">電話 *</label>
                <input type="tel" className="w-full glow-input" value={payerPhone} onChange={(e) => setPayerPhone(e.target.value)} placeholder="09xxxxxxxx" />
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">備註</label>
              <textarea className="w-full glow-input resize-none" rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="選填" />
            </div>
            <div className="flex gap-2">
              <button className="btn-accent flex-1 disabled:opacity-50 disabled:cursor-not-allowed" onClick={handleSubmit} disabled={submitting || !!validationError}>
                {submitting ? <span className="flex items-center justify-center gap-2"><div className="spinner" /> 建立中...</span> : "建立付款"}
              </button>
              <button className="btn-accent-outline" onClick={onClose}>取消</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
