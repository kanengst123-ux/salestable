import React, { useState, useEffect, useMemo } from "react";
import {
  TrendingUp,
  TrendingDown,
  History,
  RefreshCw,
  X,
  Package,
  ShoppingCart,
  UserCheck,
  Search,
  ArrowUpDown,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
  Clock,
  Layers,
  FileSpreadsheet,
  HelpCircle
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from "recharts";

export interface StockHistoryEvent {
  id: string;
  source: "Purchase" | "Trade_Log" | "Trade_log_admin";
  sourceLabel: string;
  date: string;
  formattedDate: string;
  timestamp: number;
  change: number;
  stockLevel: number | string;
  quantityFrom?: string | number;
  quantityTo?: string | number;
  customer?: string;
  district?: string;
  user?: string;
  orderId?: string;
  unit?: string;
  quantity?: number;
  refMultiplier?: number;
  totalUnits?: number;
  price?: number;
  subtotal?: number;
  remarks?: string;
}

export interface StockHistoryResponse {
  product: {
    id: string;
    name: string;
    currentStock: number | string;
    alwaysStock: boolean;
    hasStock: boolean;
  };
  summary: {
    totalEvents: number;
    purchaseCount: number;
    tradeLogCount: number;
    tradeLogAdminCount: number;
    totalInbound: number;
    totalOutbound: number;
    netChange: number;
  };
  events: StockHistoryEvent[];
}

interface StockHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
  currentStockDisplay?: string | number;
  isAlwaysStock?: boolean;
}

export const StockHistoryModal: React.FC<StockHistoryModalProps> = ({
  isOpen,
  onClose,
  productId,
  productName,
  currentStockDisplay,
  isAlwaysStock: initialAlwaysStock
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<StockHistoryResponse | null>(null);
  const [filterSource, setFilterSource] = useState<"ALL" | "Purchase" | "Trade_Log" | "Trade_log_admin">("ALL");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc"); // default chronological ascending (earliest to latest)
  const [searchTerm, setSearchTerm] = useState("");

  const fetchHistory = async (forceRefresh = false) => {
    if (!productName && !productId) return;
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams();
      if (productId) queryParams.set("productId", productId);
      if (productName) queryParams.set("productName", productName);
      if (forceRefresh) queryParams.set("refresh", "true");

      const response = await fetch(`/api/stock-history?${queryParams.toString()}`);
      if (!response.ok) {
        throw new Error(`伺服器回應錯誤 (${response.status})`);
      }
      const result: StockHistoryResponse = await response.json();
      setData(result);
    } catch (err: any) {
      console.error("Failed to load stock history:", err);
      setError(err.message || "無法載入庫存記錄，請確認網路連線或稍後再試");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    } else {
      setData(null);
      setError(null);
      setSearchTerm("");
    }
  }, [isOpen, productId, productName]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Filtered and sorted events for table
  const processedEvents = useMemo(() => {
    if (!data || !data.events) return [];

    let filtered = data.events;

    // Filter by source
    if (filterSource !== "ALL") {
      filtered = filtered.filter((ev) => ev.source === filterSource);
    }

    // Filter by search query (customer, user, orderId, remarks)
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      filtered = filtered.filter(
        (ev) =>
          (ev.customer && ev.customer.toLowerCase().includes(q)) ||
          (ev.user && ev.user.toLowerCase().includes(q)) ||
          (ev.orderId && ev.orderId.toLowerCase().includes(q)) ||
          (ev.remarks && ev.remarks.toLowerCase().includes(q)) ||
          (ev.formattedDate && ev.formattedDate.toLowerCase().includes(q))
      );
    }

    // Sort by timestamp
    const sorted = [...filtered].sort((a, b) => {
      if (sortOrder === "asc") {
        return a.timestamp - b.timestamp;
      } else {
        return b.timestamp - a.timestamp;
      }
    });

    return sorted;
  }, [data, filterSource, sortOrder, searchTerm]);

  // Chart data: always in chronological order (earliest to latest)
  const chartData = useMemo(() => {
    if (!data || !data.events || data.events.length === 0) return [];

    // Filter for chart if needed, but preserve chronological order
    let eventsForChart = data.events;
    if (filterSource !== "ALL") {
      eventsForChart = eventsForChart.filter((ev) => ev.source === filterSource);
    }

    return eventsForChart.map((ev, index) => {
      const numericStock =
        typeof ev.stockLevel === "number"
          ? ev.stockLevel
          : parseFloat(String(ev.stockLevel)) || 0;

      return {
        index,
        id: ev.id,
        date: ev.formattedDate,
        shortDate: ev.formattedDate.split(" ")[0].slice(5), // MM-DD
        source: ev.source,
        sourceLabel: ev.sourceLabel,
        change: ev.change,
        stockLevel: numericStock,
        customer: ev.customer || "",
        user: ev.user || "",
        orderId: ev.orderId || "",
        remarks: ev.remarks || ""
      };
    });
  }, [data, filterSource]);

  if (!isOpen) return null;

  return (
    <div
      id="stock-history-modal-backdrop"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="stock-history-modal-container"
        className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-scaleUp"
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-slate-900 truncate">
                  庫存異動歷史追蹤與趨勢圖表
                </h3>
                <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                  時間正序 (Chronological)
                </span>
                {data?.product?.alwaysStock || initialAlwaysStock ? (
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    長期充足商品
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200 font-mono">
                    當前系統庫存: {data?.product?.currentStock ?? currentStockDisplay ?? 0} 件
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 truncate mt-0.5 font-medium">
                {productName}
                {productId && (
                  <span className="ml-1.5 text-[10px] font-mono text-slate-400">
                    ({productId})
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 shrink-0 ml-3">
            <button
              id="btn-stock-history-refresh"
              type="button"
              onClick={() => fetchHistory(true)}
              disabled={loading}
              title="從 Google Sheet 重新抓取最新異動記錄"
              className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-indigo-600" : ""}`} />
            </button>
            <button
              id="btn-stock-history-close"
              type="button"
              onClick={onClose}
              title="關閉視窗 (Esc)"
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Summary Metrics Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
            {/* Metric 1: Current Stock */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold">
                <span>當前系統庫存</span>
                <Package className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-xl font-bold text-slate-900">
                  {data?.product?.alwaysStock || initialAlwaysStock
                    ? "長期充足"
                    : `${data?.product?.currentStock ?? currentStockDisplay ?? 0}`}
                </span>
                {!(data?.product?.alwaysStock || initialAlwaysStock) && (
                  <span className="text-xs text-slate-400 font-medium">件</span>
                )}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 truncate">
                來源：試算表 raw 分頁
              </span>
            </div>

            {/* Metric 2: Purchase Tab */}
            <div className="bg-emerald-50/50 p-3.5 rounded-xl border border-emerald-200/70 flex flex-col justify-between">
              <div className="flex items-center justify-between text-emerald-800 text-[11px] font-semibold">
                <span className="flex items-center gap-1">
                  <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
                  Purchase 庫存異動
                </span>
                <span className="text-[10px] bg-emerald-100/80 text-emerald-800 px-1.5 py-0.2 rounded">
                  {data?.summary?.purchaseCount || 0} 筆
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-xl font-bold text-emerald-700">
                  {data?.summary?.totalInbound ? `+${data.summary.totalInbound}` : "0"}
                </span>
                <span className="text-xs text-emerald-600 font-medium">件進貨</span>
              </div>
              <span className="text-[10px] text-emerald-600/80 mt-1 truncate">
                進貨 / 來貨記錄 / 盤點修改
              </span>
            </div>

            {/* Metric 3: Trade_Log Tab */}
            <div className="bg-blue-50/50 p-3.5 rounded-xl border border-blue-200/70 flex flex-col justify-between">
              <div className="flex items-center justify-between text-blue-800 text-[11px] font-semibold">
                <span className="flex items-center gap-1">
                  <ShoppingCart className="w-3 h-3 text-blue-600" />
                  Trade_Log 客戶銷售
                </span>
                <span className="text-[10px] bg-blue-100/80 text-blue-800 px-1.5 py-0.2 rounded">
                  {data?.summary?.tradeLogCount || 0} 筆
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-xl font-bold text-blue-700">
                  {data?.summary?.totalOutbound ? `-${data.summary.totalOutbound}` : "0"}
                </span>
                <span className="text-xs text-blue-600 font-medium">件出庫</span>
              </div>
              <span className="text-[10px] text-blue-600/80 mt-1 truncate">
                客戶訂單扣減記錄
              </span>
            </div>

            {/* Metric 4: Trade_log_admin Tab */}
            <div className="bg-purple-50/50 p-3.5 rounded-xl border border-purple-200/70 flex flex-col justify-between">
              <div className="flex items-center justify-between text-purple-800 text-[11px] font-semibold">
                <span className="flex items-center gap-1">
                  <UserCheck className="w-3 h-3 text-purple-600" />
                  Trade_log_admin
                </span>
                <span className="text-[10px] bg-purple-100/80 text-purple-800 px-1.5 py-0.2 rounded">
                  {data?.summary?.tradeLogAdminCount || 0} 筆
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-xl font-bold text-purple-700">
                  {data?.summary?.tradeLogAdminCount || 0}
                </span>
                <span className="text-xs text-purple-600 font-medium">筆開單</span>
              </div>
              <span className="text-[10px] text-purple-600/80 mt-1 truncate">
                管理員手動開單扣減
              </span>
            </div>
          </div>

          {/* Chart Section */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3">
              <div>
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-indigo-600" />
                  庫存水位歷程趨勢圖表 (Chronological Stock Level Chart)
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  依照時間先後順序，整合進貨來貨 (Purchase) 與訂單出庫銷售 (Trade_Log) 的水位變化
                </p>
              </div>

              {/* Source Filter Chips */}
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[11px]">
                <button
                  type="button"
                  onClick={() => setFilterSource("ALL")}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                    filterSource === "ALL"
                      ? "bg-white text-slate-800 shadow-xs"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  全部來源 ({data?.events?.length || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterSource("Purchase")}
                  className={`px-2 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                    filterSource === "Purchase"
                      ? "bg-white text-emerald-700 shadow-xs"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Purchase ({data?.summary?.purchaseCount || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterSource("Trade_Log")}
                  className={`px-2 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                    filterSource === "Trade_Log"
                      ? "bg-white text-blue-700 shadow-xs"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Trade_Log ({data?.summary?.tradeLogCount || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterSource("Trade_log_admin")}
                  className={`px-2 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                    filterSource === "Trade_log_admin"
                      ? "bg-white text-purple-700 shadow-xs"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Admin ({data?.summary?.tradeLogAdminCount || 0})
                </button>
              </div>
            </div>

            {/* Recharts Area Container */}
            {loading ? (
              <div className="h-56 flex flex-col items-center justify-center gap-2 text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
                <span className="text-xs font-medium">正在載入試算表歷史記錄...</span>
              </div>
            ) : chartData.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center gap-1.5 text-slate-400 bg-slate-50/60 rounded-lg border border-dashed border-slate-200">
                <AlertCircle className="w-5 h-5 text-slate-300" />
                <span className="text-xs font-medium">尚無相應來源的歷史記錄</span>
                <span className="text-[10px] text-slate-400">
                  當此商品有進貨更新或客戶下單後將自動繪製水位曲線
                </span>
              </div>
            ) : (
              <div className="w-full h-56 pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={chartData}
                    margin={{ top: 10, right: 15, left: -20, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="stockGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="shortDate"
                      tickLine={false}
                      stroke="#94a3b8"
                      fontSize={10}
                      tickMargin={6}
                    />
                    <YAxis
                      tickLine={false}
                      stroke="#94a3b8"
                      fontSize={10}
                      tickMargin={4}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const item = payload[0].payload;
                          const isPurchase = item.source === "Purchase";
                          const isAdmin = item.source === "Trade_log_admin";
                          const isPositive = item.change > 0;
                          return (
                            <div className="bg-slate-900/95 text-white p-3 rounded-xl shadow-xl border border-slate-800 text-xs min-w-[200px] backdrop-blur-xs">
                              <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5 mb-1.5">
                                <span className="font-semibold text-[11px] text-slate-300">
                                  {item.date}
                                </span>
                                <span
                                  className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                                    isPurchase
                                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                      : isAdmin
                                      ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                      : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                                  }`}
                                >
                                  {item.sourceLabel}
                                </span>
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">異動差額：</span>
                                  <span
                                    className={`font-bold ${
                                      isPositive
                                        ? "text-emerald-400"
                                        : "text-rose-400"
                                    }`}
                                  >
                                    {isPositive ? `+${item.change}` : item.change} 件
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">變動後水位：</span>
                                  <span className="font-bold text-white font-mono">
                                    {item.stockLevel} 件
                                  </span>
                                </div>
                                {item.customer && (
                                  <div className="flex items-center justify-between">
                                    <span className="text-slate-400">客戶名稱：</span>
                                    <span className="text-slate-200 truncate max-w-[130px]">
                                      {item.customer}
                                    </span>
                                  </div>
                                )}
                                {item.user && (
                                  <div className="flex items-center justify-between">
                                    <span className="text-slate-400">經手業務：</span>
                                    <span className="text-indigo-300">{item.user}</span>
                                  </div>
                                )}
                                {item.orderId && (
                                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                                    <span>單號：</span>
                                    <span className="font-mono">{item.orderId}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="stockLevel"
                      stroke="#4f46e5"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#stockGradient)"
                      dot={{ r: 3, fill: "#4f46e5", strokeWidth: 1, stroke: "#ffffff" }}
                      activeDot={{ r: 5, fill: "#4f46e5", stroke: "#ffffff", strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Table Header Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-slate-700" />
              <h4 className="text-xs font-bold text-slate-800">
                依時間順序異動明細 (Chronological Event Log)
              </h4>
              <span className="text-[10px] text-slate-400 font-mono">
                ({processedEvents.length} 筆)
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Search filter input */}
              <div className="relative w-48 sm:w-56">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="搜尋客戶、業務、單號..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white text-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs outline-none transition-all"
                />
              </div>

              {/* Sort toggle */}
              <button
                type="button"
                onClick={() => setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all cursor-pointer shrink-0"
                title={sortOrder === "asc" ? "目前：時間正序（遠至近）" : "目前：最新優先（近至遠）"}
              >
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
                <span>{sortOrder === "asc" ? "時間正序 ⬆" : "最新優先 ⬇"}</span>
              </button>
            </div>
          </div>

          {/* Detailed Chronological Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs bg-white">
            <div className="overflow-x-auto max-h-72">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 text-slate-600 text-[11px] font-bold uppercase tracking-wider sticky top-0 border-b border-slate-200 z-10">
                  <tr>
                    <th className="py-2.5 px-3">日期時間</th>
                    <th className="py-2.5 px-3">異動來源</th>
                    <th className="py-2.5 px-3 text-right">異動數量</th>
                    <th className="py-2.5 px-3 text-right">變動後水位</th>
                    <th className="py-2.5 px-3">客戶 / 業務 / 單號</th>
                    <th className="py-2.5 px-3">備註說明</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading && processedEvents.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-1 text-indigo-500" />
                        <span>載入資料中...</span>
                      </td>
                    </tr>
                  ) : error ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-rose-500">
                        <AlertCircle className="w-5 h-5 mx-auto mb-1" />
                        <span>{error}</span>
                      </td>
                    </tr>
                  ) : processedEvents.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        <p className="text-xs font-medium">此商品目前無匹配的異動記錄</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          若在後台編輯庫存或進行訂單銷售，系統將自動同步並顯示於此
                        </p>
                      </td>
                    </tr>
                  ) : (
                    processedEvents.map((ev) => {
                      const isPurchase = ev.source === "Purchase";
                      const isAdmin = ev.source === "Trade_log_admin";
                      const isPositive = ev.change > 0;

                      return (
                        <tr
                          key={ev.id}
                          className="hover:bg-slate-50/80 transition-colors group"
                        >
                          {/* Date */}
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3 h-3 text-slate-400" />
                              <span>{ev.formattedDate}</span>
                            </div>
                          </td>

                          {/* Source Badge */}
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {isPurchase ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
                                Purchase 庫存異動
                              </span>
                            ) : isAdmin ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                <UserCheck className="w-3 h-3 text-purple-600" />
                                Trade_log_admin
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                <ShoppingCart className="w-3 h-3 text-blue-600" />
                                Trade_Log 客戶訂單
                              </span>
                            )}
                          </td>

                          {/* Quantity Change */}
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-0.5 font-bold font-mono ${
                                isPositive
                                  ? "text-emerald-600"
                                  : "text-rose-600"
                              }`}
                            >
                              {isPositive ? (
                                <ArrowUpRight className="w-3.5 h-3.5" />
                              ) : (
                                <ArrowDownRight className="w-3.5 h-3.5" />
                              )}
                              {isPositive ? `+${ev.change}` : ev.change}
                            </span>
                          </td>

                          {/* Resulting Stock Level */}
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                            {ev.stockLevel}
                          </td>

                          {/* Customer / User / Order ID */}
                          <td className="py-2.5 px-3 text-slate-700">
                            <div className="flex flex-col">
                              {ev.customer && (
                                <span className="font-semibold text-slate-800 truncate max-w-[180px]">
                                  {ev.customer}
                                </span>
                              )}
                              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 flex-wrap">
                                {ev.user && (
                                  <span className="bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-medium">
                                    業務: {ev.user}
                                  </span>
                                )}
                                {ev.orderId && (
                                  <span className="font-mono text-slate-400">
                                    #{ev.orderId}
                                  </span>
                                )}
                                {ev.unit && ev.quantity !== undefined && (
                                  <span className="text-slate-400">
                                    ({ev.quantity} {ev.unit})
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Remarks */}
                          <td className="py-2.5 px-3 text-[11px] text-slate-500 max-w-[200px] truncate">
                            {ev.remarks || "-"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-slate-400" />
            <span>
              資料來源：Google 試算表之 <strong>Purchase 庫存異動記錄</strong>、<strong>Trade_Log</strong> 及 <strong>Trade_log_admin</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 font-bold text-xs transition-all cursor-pointer shadow-xs"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
};
