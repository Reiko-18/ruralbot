import { useState, useEffect, useCallback } from "react";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Package,
  ShoppingCart,
  ChevronRight,
  ChevronLeft,
  Search,
  BarChart3,
} from "lucide-react";
import type { AccountingProduct, AccountingOrder, SalesAggregation } from "../types";
import {
  fetchProducts,
  fetchOrders,
  fetchSales,
  fetchDistinctYears,
  fetchDistinctMonths,
  fetchDistinctDays,
} from "../api/client";
import { NumberTicker } from "./magicui/number-ticker";
import { BlurFade } from "./magicui/blur-fade";

type View = "overview" | "products" | "orders";

interface DatePath {
  year?: number;
  month?: number;
  day?: number;
}

function fmt(n: number): string {
  return n.toLocaleString("zh-TW", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function dateRangeFromPath(path: DatePath): { start?: string; end?: string } {
  if (path.day != null && path.month != null && path.year != null) {
    const s = new Date(path.year, path.month - 1, path.day);
    const e = new Date(path.year, path.month - 1, path.day + 1);
    return { start: s.toISOString(), end: e.toISOString() };
  }
  if (path.month != null && path.year != null) {
    const s = new Date(path.year, path.month - 1, 1);
    const e = new Date(path.year, path.month, 1);
    return { start: s.toISOString(), end: e.toISOString() };
  }
  if (path.year != null) {
    const s = new Date(path.year, 0, 1);
    const e = new Date(path.year + 1, 0, 1);
    return { start: s.toISOString(), end: e.toISOString() };
  }
  return {};
}

function pathLabel(path: DatePath): string {
  if (path.day != null) return `${path.year}/${String(path.month).padStart(2, "0")}/${String(path.day).padStart(2, "0")}`;
  if (path.month != null) return `${path.year}/${String(path.month).padStart(2, "0")}`;
  if (path.year != null) return `${path.year}`;
  return "全部時間";
}

// ── Sales Overview Sub-Component ──
function SalesOverview() {
  const [datePath, setDatePath] = useState<DatePath>({});
  const [sales, setSales] = useState<SalesAggregation | null>(null);
  const [orders, setOrders] = useState<AccountingOrder[]>([]);
  const [ordersTotalCount, setOrdersTotalCount] = useState(0);
  const [years, setYears] = useState<number[]>([]);
  const [months, setMonths] = useState<number[]>([]);
  const [days, setDays] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchId, setSearchId] = useState("");
  const [searchResult, setSearchResult] = useState<AccountingOrder | null>(null);
  const [searchError, setSearchError] = useState("");

  const loadData = useCallback(async (path: DatePath) => {
    setLoading(true);
    try {
      const range = dateRangeFromPath(path);
      const [salesData, ordersData] = await Promise.all([
        fetchSales(range.start, range.end),
        fetchOrders(range.start, range.end),
      ]);
      setSales(salesData);
      setOrders(ordersData.orders);
      setOrdersTotalCount(ordersData.totalCount);

      // Load navigation options
      if (path.month != null && path.year != null) {
        const d = await fetchDistinctDays(path.year, path.month);
        setDays(d);
      } else if (path.year != null) {
        const m = await fetchDistinctMonths(path.year);
        setMonths(m);
      } else {
        const y = await fetchDistinctYears();
        setYears(y);
      }
    } catch (err) {
      console.error("Failed to load sales:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(datePath);
  }, [datePath, loadData]);

  const navigateTo = (path: DatePath) => {
    setDatePath(path);
    setSearchResult(null);
    setSearchError("");
  };

  const goBack = () => {
    if (datePath.day != null) {
      navigateTo({ year: datePath.year, month: datePath.month });
    } else if (datePath.month != null) {
      navigateTo({ year: datePath.year });
    } else if (datePath.year != null) {
      navigateTo({});
    }
  };

  const handleSearch = async () => {
    if (!searchId.trim()) return;
    setSearchError("");
    setSearchResult(null);
    try {
      const res = await fetch(`/api/accounting/orders/${searchId.trim().toUpperCase()}`);
      if (!res.ok) {
        setSearchError("找不到此訂單");
        return;
      }
      const order = await res.json();
      setSearchResult(order);
    } catch {
      setSearchError("查詢失敗");
    }
  };

  const profitColor = (profit: number) =>
    profit >= 0 ? "text-purple-400" : "text-red-400";

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        {(datePath.year != null) && (
          <button onClick={goBack} className="text-purple-400 hover:text-purple-300 flex items-center gap-1">
            <ChevronLeft size={14} /> 返回
          </button>
        )}
        <span className="text-gray-300 font-medium">{pathLabel(datePath)}</span>
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full glow-input pl-9"
            placeholder="搜尋訂單 ID..."
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
        </div>
        <button
          className="px-3 py-2 btn-accent"
          onClick={handleSearch}
        >
          查詢
        </button>
      </div>

      {/* Search result */}
      {searchResult && (
        <div className="glow-card p-4 space-y-1 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-mono font-bold text-purple-400">{searchResult.id}</span>
            {searchResult.isCustom && (
              <span className="text-xs bg-yellow-600 px-2 py-0.5 rounded">自訂</span>
            )}
          </div>
          <div>商品：{searchResult.productName} x{searchResult.quantity}</div>
          <div>售價：${fmt(searchResult.actualPrice)} / 成本：${fmt(searchResult.actualCost)}</div>
          <div className={profitColor(searchResult.profit)}>
            利潤：${fmt(searchResult.profit)}
          </div>
          <div className="text-gray-400">
            {new Date(searchResult.createdAt).toLocaleString("zh-TW")}
          </div>
        </div>
      )}
      {searchError && <div className="text-red-400 text-sm">{searchError}</div>}

      {loading ? (
        <div className="flex justify-center py-12"><div className="spinner-lg" /></div>
      ) : (
        <>
          {/* Summary cards */}
          {sales && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {([
                { label: "總營收", icon: DollarSign, value: sales.totalRevenue, color: "text-violet-400", prefix: "$" },
                { label: "總成本", icon: TrendingDown, value: sales.totalCost, color: "text-blue-400", prefix: "$" },
                { label: "總利潤", icon: TrendingUp, value: sales.totalProfit, color: sales.totalProfit >= 0 ? "text-emerald-400" : "text-red-400", prefix: "$" },
                { label: "訂單數", icon: ShoppingCart, value: sales.orderCount, color: "text-amber-400" },
              ] as { label: string; icon: typeof DollarSign; value: number; color: string; prefix?: string }[]).map((card, i) => {
                const Icon = card.icon;
                return (
                  <BlurFade key={card.label} delay={0.05 * i} direction="up">
                    <div className="stat-card">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-gray-400 text-xs font-medium uppercase tracking-wider">{card.label}</span>
                        <Icon size={16} className={card.color} />
                      </div>
                      <div className={`text-2xl font-bold ${card.label === "總利潤" ? profitColor(sales.totalProfit) : ""}`}>
                        {card.prefix ?? ""}
                        <NumberTicker
                          value={card.value}
                          delay={0.1 * i}
                          formatter={(n) => fmt(n)}
                        />
                      </div>
                    </div>
                  </BlurFade>
                );
              })}
            </div>
          )}

          {/* Date navigation */}
          {datePath.day == null && (
            <div>
              <h3 className="text-sm text-gray-400 mb-2">
                {datePath.month != null ? "選擇日期" : datePath.year != null ? "選擇月份" : "選擇年份"}
              </h3>
              <div className="flex flex-wrap gap-2">
                {datePath.month != null
                  ? days.map((d) => (
                      <button
                        key={d}
                        className="px-3 py-1.5 glow-item hover:bg-purple-400/10 text-sm flex items-center gap-1"
                        onClick={() => navigateTo({ ...datePath, day: d })}
                      >
                        {d} 日 <ChevronRight size={12} />
                      </button>
                    ))
                  : datePath.year != null
                  ? months.map((m) => (
                      <button
                        key={m}
                        className="px-3 py-1.5 glow-item hover:bg-purple-400/10 text-sm flex items-center gap-1"
                        onClick={() => navigateTo({ year: datePath.year, month: m })}
                      >
                        {m} 月 <ChevronRight size={12} />
                      </button>
                    ))
                  : years.map((y) => (
                      <button
                        key={y}
                        className="px-3 py-1.5 glow-item hover:bg-purple-400/10 text-sm flex items-center gap-1"
                        onClick={() => navigateTo({ year: y })}
                      >
                        {y} <ChevronRight size={12} />
                      </button>
                    ))}
                {(datePath.year == null && years.length === 0) && (
                  <span className="text-gray-500 text-sm">尚無訂單資料</span>
                )}
              </div>
            </div>
          )}

          {/* Orders table */}
          {orders.length > 0 && (
            <div>
              <h3 className="text-sm text-gray-400 mb-2">
                {orders.length < ordersTotalCount
                  ? `顯示最新 ${orders.length} 筆（共 ${ordersTotalCount} 筆）`
                  : `共 ${ordersTotalCount} 筆`}
              </h3>
              <BlurFade delay={0.15} direction="up">
                <div className="glow-card overflow-hidden">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>日期</th>
                        <th>商品</th>
                        <th className="text-right">數量</th>
                        <th className="text-right">售價</th>
                        <th className="text-right">成本</th>
                        <th className="text-right">利潤</th>
                        <th>類型</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((o) => (
                        <tr key={o.id}>
                          <td className="font-mono text-violet-400">{o.id}</td>
                          <td className="text-gray-400">
                            {new Date(o.createdAt).toLocaleDateString("zh-TW")}
                          </td>
                          <td>{o.productName}</td>
                          <td className="text-right">{o.quantity}</td>
                          <td className="text-right">${fmt(o.actualPrice)}</td>
                          <td className="text-right">${fmt(o.actualCost)}</td>
                          <td className={`text-right font-medium ${profitColor(o.profit)}`}>
                            ${fmt(o.profit)}
                          </td>
                          <td>
                            {o.isCustom ? (
                              <span className="badge-yellow">自訂</span>
                            ) : (
                              <span className="badge-purple">一般</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </BlurFade>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Products Sub-Component ──
function ProductList() {
  const [products, setProducts] = useState<AccountingProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    fetchProducts()
      .then(setProducts)
      .catch((err) => console.error("Failed to load products:", err))
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter
    ? products.filter((p) => p.category.name === filter)
    : products;

  const categories = [...new Set(products.map((p) => p.category.name))].sort();

  if (loading) {
    return <div className="flex justify-center py-12"><div className="spinner-lg" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        <button
          className={`px-3 py-1 rounded-lg text-sm transition-all ${!filter ? "btn-accent" : "bg-surface-overlay text-gray-300 hover:bg-violet-500/10"}`}
          onClick={() => setFilter("")}
        >
          全部 ({products.length})
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            className={`px-3 py-1 rounded-lg text-sm transition-all ${filter === cat ? "btn-accent" : "bg-surface-overlay text-gray-300 hover:bg-violet-500/10"}`}
            onClick={() => setFilter(cat)}
          >
            {cat} ({products.filter((p) => p.category.name === cat).length})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-gray-500 text-center py-8">尚無商品</div>
      ) : (
        <BlurFade delay={0.1} direction="up">
          <div className="glow-card overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>商品名稱</th>
                  <th>分類</th>
                  <th className="text-right">成本</th>
                  <th className="text-right">售價</th>
                  <th className="text-right">利潤率</th>
                  <th>來源</th>
                  <th>折扣</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const margin = p.price > 0 ? ((p.price - p.cost) / p.price * 100) : 0;
                  const isDiscount = p.costDiscount != null && p.priceDiscount != null;
                  return (
                    <tr key={p.id}>
                      <td className="font-medium">{p.name}</td>
                      <td className="text-gray-400">{p.category.name}</td>
                      <td className="text-right">${fmt(p.cost)}</td>
                      <td className="text-right">${fmt(p.price)}</td>
                      <td className={`text-right ${margin >= 0 ? "text-violet-400" : "text-red-400"}`}>
                        {fmt(margin)}%
                      </td>
                      <td className="text-gray-400">{p.source || "-"}</td>
                      <td>
                        {isDiscount ? (
                          <span className="badge-purple">
                            面額制 (成本{p.costDiscount}x / 售{p.priceDiscount}x)
                          </span>
                        ) : (
                          <span className="text-xs text-gray-500">固定價</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </BlurFade>
      )}
    </div>
  );
}

// ── Main Accounting Dashboard ──
export function AccountingDashboard() {
  const [view, setView] = useState<View>("overview");

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 size={18} className="text-purple-400" />
          <h2 className="text-lg font-semibold">記帳系統</h2>
        </div>
        <div className="flex gap-1">
          <button
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              view === "overview" ? "btn-accent" : "text-gray-400 hover:text-purple-300 hover:bg-purple-400/10"
            }`}
            onClick={() => setView("overview")}
          >
            營收總覽
          </button>
          <button
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              view === "products" ? "btn-accent" : "text-gray-400 hover:text-purple-300 hover:bg-purple-400/10"
            }`}
            onClick={() => setView("products")}
          >
            商品管理
          </button>
        </div>
      </div>

      {view === "overview" ? <SalesOverview /> : <ProductList />}
    </div>
  );
}
