import { useState } from "react";
import { createPayment } from "../api/client";

interface Props {
  guildId: string;
  onClose: () => void;
  onCreated: () => void;
}

export function PaymentCreateModal({ guildId, onClose, onCreated }: Props) {
  const [amount, setAmount] = useState("");
  const [payerName, setPayerName] = useState("");
  const [payerEmail, setPayerEmail] = useState("");
  const [payerPhone, setPayerPhone] = useState("");
  const [remark, setRemark] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ orderId: string; paymentCode?: string; paymentUrl: string } | null>(null);

  const handleSubmit = async () => {
    const amt = parseInt(amount, 10);
    if (!amt || amt <= 0) return;

    setSubmitting(true);
    try {
      const res = await createPayment(guildId, {
        amount: amt,
        payerName: payerName || undefined,
        payerEmail: payerEmail || undefined,
        payerPhone: payerPhone || undefined,
        remark: remark || undefined,
      });
      setResult({
        orderId: res.transaction.orderId,
        paymentCode: res.transaction.paymentCode ?? undefined,
        paymentUrl: res.paymentUrl,
      });
      onCreated();
    } catch (err) {
      console.error("Failed to create payment:", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">建立付款</h3>

        {result ? (
          <div className="space-y-3">
            <div className="bg-green-900/30 border border-green-700 rounded p-3 text-sm">付款已建立</div>
            <div><span className="text-gray-400 text-sm">訂單編號：</span><span className="font-mono">{result.orderId}</span></div>
            {result.paymentCode && (
              <div><span className="text-gray-400 text-sm">超商繳費代碼：</span><span className="font-mono text-lg font-bold">{result.paymentCode}</span></div>
            )}
            <div>
              <span className="text-gray-400 text-sm">付款連結：</span>
              <a href={result.paymentUrl} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline text-sm break-all">{result.paymentUrl}</a>
            </div>
            <button className="btn-accent px-4 py-2 rounded text-sm w-full" onClick={onClose}>關閉</button>
          </div>
        ) : (
          <>
            <div>
              <label className="block text-sm text-gray-400 mb-1">金額 (新台幣) *</label>
              <input type="number" min="1" className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">付款人名稱</label>
              <input type="text" className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white" value={payerName} onChange={(e) => setPayerName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Email</label>
                <input type="email" className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white" value={payerEmail} onChange={(e) => setPayerEmail(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">電話</label>
                <input type="tel" className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white" value={payerPhone} onChange={(e) => setPayerPhone(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">備註</label>
              <textarea className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white" rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <button className="btn-accent px-4 py-2 rounded text-sm flex-1" onClick={handleSubmit} disabled={submitting || !amount}>
                {submitting ? "建立中..." : "建立付款"}
              </button>
              <button className="px-4 py-2 rounded text-sm text-gray-400 hover:text-white border border-gray-700" onClick={onClose}>取消</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
