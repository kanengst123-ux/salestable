import React, { useState, useMemo } from 'react';
import { SavedOrder, APP_USERS, isOrderOwner } from '../types';
import { 
  Calendar, 
  User, 
  DollarSign, 
  MessageSquare, 
  UserCircle, 
  Plus, 
  Trash2, 
  Anchor, 
  X, 
  Users, 
  Search, 
  RefreshCw, 
  ChevronDown, 
  ChevronUp, 
  Package, 
  CheckCircle2, 
  Clock,
  Pencil,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { fetchStrictTradeLogOrders } from '../services/dataService';

interface OrderListProps {
  orders: SavedOrder[];
  onEditOrder: (order: SavedOrder) => void;
  onDeleteOrder: (orderId: string) => void;
  onToggleHold: (orderId: string) => void;
  onToggleKeyIn?: (orderId: string) => void;
  currentRole: string | null;
  onSelectRole?: (role: string) => void;
  onNewOrder: () => void;
  onKeyInOrders?: () => Promise<boolean>;
  isKeyingIn?: boolean;
  onRefreshOrders?: () => Promise<void> | void;
}

const PAGE_SIZE = 50;

// Helper to parse order date into a sortable timestamp
const getOrderDateTimestamp = (order: SavedOrder): number => {
  if (order.date) {
    const raw = order.date.trim();
    // 1. Direct parse
    let parsed = Date.parse(raw);
    if (!isNaN(parsed)) return parsed;

    // 2. Format with slashes or dashes: YYYY/MM/DD or YYYY-MM-DD
    const normalized = raw.replace(/-/g, '/');
    parsed = Date.parse(normalized);
    if (!isNaN(parsed)) return parsed;

    // 3. Format YYYY/MM/DD HH:mm:ss or similar parts
    const parts = raw.split(/[\s/:\-_]+/);
    if (parts.length >= 3 && parts[0].length === 4) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      const hh = parts[3] ? parseInt(parts[3], 10) : 0;
      const mm = parts[4] ? parseInt(parts[4], 10) : 0;
      const ss = parts[5] ? parseInt(parts[5], 10) : 0;
      const dt = new Date(y, m, d, hh, mm, ss);
      if (!isNaN(dt.getTime())) return dt.getTime();
    }
  }

  // Fallback to order.updatedAt if date string cannot be parsed
  if (order.updatedAt) return order.updatedAt;

  // Fallback to timestamp in numeric ID
  const numId = Number(order.id);
  if (!isNaN(numId) && numId > 1000000000000) {
    return numId;
  }

  return 0;
};

const OrderList: React.FC<OrderListProps> = ({ 
  orders, 
  onEditOrder, 
  onDeleteOrder, 
  onToggleHold, 
  onToggleKeyIn,
  currentRole, 
  onSelectRole,
  onNewOrder, 
  onKeyInOrders, 
  isKeyingIn = false,
  onRefreshOrders
}) => {
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<SavedOrder | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'KEYED_IN' | 'HELD'>('ALL');
  const [selectedUser, setSelectedUser] = useState<string>('ALL');
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const [showAll, setShowAll] = useState(false);
  const [strictTradeOrders, setStrictTradeOrders] = useState<SavedOrder[] | null>(null);
  const [isLoadingTradeLog, setIsLoadingTradeLog] = useState<boolean>(false);

  // Checks whether the current user is the owner of an order
  const isOwner = (order: SavedOrder) => isOrderOwner(order, currentRole);

  // When '全部Sales' toggle button is pressed: clear info and strictly load 'Trade_log' tab
  const handleToggleAllSales = async () => {
    setShowAll(true);
    // Immediately clear all info in the order list tab
    setStrictTradeOrders([]);
    setIsLoadingTradeLog(true);
    setStatusMessage(null);
    try {
      const loaded = await fetchStrictTradeLogOrders();
      setStrictTradeOrders(loaded);
      setStatusMessage({ 
        text: `已成功載入 Google Sheet 'Trade_log' 共 ${loaded.length} 筆訂單！`, 
        type: 'success' 
      });
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err) {
      console.error("Error loading Trade_log:", err);
      setStatusMessage({ 
        text: '載入 Trade_log 失敗，請重試。', 
        type: 'error' 
      });
      setTimeout(() => setStatusMessage(null), 4000);
    } finally {
      setIsLoadingTradeLog(false);
    }
  };

  const handleToggleSelf = () => {
    setShowAll(false);
    setStrictTradeOrders(null);
    setIsLoadingTradeLog(false);
    if (onRefreshOrders) {
      onRefreshOrders();
    }
  };

  // Handle manual refresh
  const handleRefresh = async () => {
    if (showAll) {
      await handleToggleAllSales();
      return;
    }
    if (!onRefreshOrders || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefreshOrders();
      setStatusMessage({ text: '訂單記錄已成功同步更新！', type: 'success' });
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err) {
      setStatusMessage({ text: '同步失敗，請檢查網絡連接。', type: 'error' });
      setTimeout(() => setStatusMessage(null), 4000);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Base orders: if in showAll mode, strictly use the loaded Trade_log orders
  const baseOrders = useMemo(() => {
    if (showAll && strictTradeOrders !== null) {
      return strictTradeOrders;
    }
    return orders;
  }, [showAll, strictTradeOrders, orders]);

  // Extract unique sales names from orders
  const uniqueSalesReps = useMemo(() => {
    const set = new Set<string>();
    baseOrders.forEach(o => {
      if (o.salesName && o.salesName.trim()) {
        set.add(o.salesName.trim());
      }
    });
    APP_USERS.forEach(u => set.add(u));
    return Array.from(set).sort();
  }, [baseOrders]);

  // Base role-filtered orders: only show current role unless showAll is toggled
  const roleFilteredOrders = useMemo(() => {
    if (!showAll && currentRole) {
      return baseOrders.filter(o => isOwner(o));
    }
    return baseOrders;
  }, [baseOrders, currentRole, showAll]);

  // Counts for tabs
  const counts = useMemo(() => {
    let pending = 0;
    let keyedIn = 0;
    let held = 0;
    roleFilteredOrders.forEach(o => {
      // Other users cannot see if an order is '暫存': only the owner sees an order as held
      const owner = isOwner(o);
      if (owner && o.isHeld) {
        held++;
      } else if (o.isKeyedIn) {
        keyedIn++;
      } else {
        pending++;
      }
    });
    return { total: roleFilteredOrders.length, pending, keyedIn, held };
  }, [roleFilteredOrders, currentRole]);

  // Detailed filtering by user, status, and search query
  const filteredOrders = useMemo(() => {
    const list = roleFilteredOrders.filter(order => {
      // User filter
      if (selectedUser !== 'ALL' && (order.salesName || '').trim().toUpperCase() !== selectedUser.trim().toUpperCase()) {
        return false;
      }

      // Status filter
      // Other users cannot see if an order is '暫存':
      const isHeldForUser = isOwner(order) && Boolean(order.isHeld);

      if (statusFilter === 'PENDING' && (order.isKeyedIn || isHeldForUser)) return false;
      if (statusFilter === 'KEYED_IN' && !order.isKeyedIn) return false;
      if (statusFilter === 'HELD' && !isHeldForUser) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesCust = (order.customerName || '').toLowerCase().includes(q);
        const matchesId = (order.id || '').toLowerCase().includes(q);
        const matchesSales = (order.salesName || '').toLowerCase().includes(q);
        const matchesRemark = (order.remark || '').toLowerCase().includes(q);
        const matchesItem = order.items?.some(it => (it.name || '').toLowerCase().includes(q));
        if (!matchesCust && !matchesId && !matchesSales && !matchesRemark && !matchesItem) {
          return false;
        }
      }

      return true;
    });

    // When '全部sales' is selected (showAll is true or selectedUser === 'ALL'), show the orders in descending order by date
    if (showAll || selectedUser === 'ALL') {
      return [...list].sort((a, b) => {
        const timeA = getOrderDateTimestamp(a);
        const timeB = getOrderDateTimestamp(b);
        if (timeB !== timeA) {
          return timeB - timeA;
        }
        const updatedA = a.updatedAt || 0;
        const updatedB = b.updatedAt || 0;
        if (updatedB !== updatedA) {
          return updatedB - updatedA;
        }
        return (b.id || '').localeCompare(a.id || '');
      });
    }

    return list;
  }, [roleFilteredOrders, selectedUser, statusFilter, searchQuery, currentRole, showAll]);

  // Pagination slice
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredOrders.slice(start, start + PAGE_SIZE);
  }, [filteredOrders, currentPage]);

  const keyInCount = orders.filter(
    o => isOwner(o) && !o.isHeld && !o.isKeyedIn
  ).length;

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr.split(' ')[0] || dateStr;
      return `${date.getMonth() + 1}/${date.getDate()}`;
    } catch {
      return dateStr;
    }
  };

  const toggleExpand = (orderId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setExpandedOrderId(prev => prev === orderId ? null : orderId);
  };

  return (
    <div className="relative space-y-4 pb-20 sm:pb-8 w-full">
      {/* Top Banner / Controls Card */}
      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div className="px-4 sm:px-6 py-4 bg-slate-50/50 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          {/* Header Title & Role Indicators */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h3 className="text-sm sm:text-base font-black text-slate-800 tracking-tight">
                {showAll ? '全部Sales的訂單記錄' : `${currentRole || '未登入'} 的個人訂單`}
              </h3>
              {showAll && strictTradeOrders !== null && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                  Google Sheet Trade_log 純即時分頁
                </span>
              )}
            </div>

            {/* Role Switcher */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 border border-slate-200 rounded-full text-xs font-bold shadow-inner">
              <UserCircle className="w-3.5 h-3.5 text-blue-600" />
              <span className="text-[10px] font-bold text-slate-500 uppercase">當前身份:</span>
              <select
                value={currentRole || ''}
                onChange={(e) => onSelectRole?.(e.target.value)}
                className="bg-white border border-slate-200 rounded-md px-2 py-0.5 text-xs font-black text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                <option value="" disabled>請選擇身份...</option>
                {APP_USERS.map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>

            {currentRole && (
              <div className="inline-flex p-0.5 bg-slate-100 border border-slate-200 rounded-full text-[10px] font-bold shadow-inner">
                <button
                  type="button"
                  onClick={handleToggleSelf}
                  className={`flex items-center gap-1 px-3 py-1 rounded-full transition-all duration-200 ${
                    !showAll
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20 font-black'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <User className="w-3 h-3" />
                  只看自己 ({currentRole})
                </button>
                <button
                  type="button"
                  onClick={handleToggleAllSales}
                  disabled={isLoadingTradeLog}
                  className={`flex items-center gap-1 px-3 py-1 rounded-full transition-all duration-200 ${
                    showAll
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20 font-black'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {isLoadingTradeLog ? (
                    <Loader2 className="w-3 h-3 animate-spin text-white" />
                  ) : (
                    <Users className="w-3 h-3" />
                  )}
                  全部Sales
                </button>
              </div>
            )}
          </div>

          {/* Action buttons: Refresh, New Order, Key-in */}
          <div className="flex items-center gap-2 flex-wrap">
            {onRefreshOrders && (
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isRefreshing}
                title="重新整理訂單資料"
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-600 font-bold text-xs transition-all flex items-center gap-1 border border-slate-200"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
                <span className="hidden sm:inline">刷新</span>
              </button>
            )}

            {currentRole && (
              <button
                type="button"
                onClick={onNewOrder}
                className="px-3.5 py-1.5 rounded-xl font-bold text-xs bg-slate-900 hover:bg-slate-800 text-white transition-all shadow-sm flex items-center gap-1 active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>落單</span>
              </button>
            )}

            {onKeyInOrders && (
              <button
                disabled={isKeyingIn || keyInCount === 0 || !currentRole}
                title={
                  !currentRole 
                    ? "請先選擇身份後再入機" 
                    : keyInCount === 0 
                      ? `沒有屬於 ${currentRole} 的待入機訂單` 
                      : `為 ${currentRole} 的 ${keyInCount} 筆待入機訂單入機`
                }
                onClick={async (e) => {
                  e.stopPropagation();
                  setStatusMessage(null);
                  const success = await onKeyInOrders();
                  if (success) {
                    setStatusMessage({
                      text: `🎉 入機成功！已為 ${currentRole} 記錄並在 Google 表格中扣減庫存。`,
                      type: 'success'
                    });
                    setTimeout(() => setStatusMessage(null), 8000);
                  } else {
                    setStatusMessage({
                      text: "❌ 入機失敗，請確認網絡連接後重試。",
                      type: 'error'
                    });
                    setTimeout(() => setStatusMessage(null), 8000);
                  }
                }}
                className={`px-4 py-1.5 rounded-xl font-bold text-xs select-none shadow-sm transition-all focus:outline-none flex items-center gap-1.5
                  ${keyInCount === 0 || !currentRole
                    ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed' 
                    : isKeyingIn 
                      ? 'bg-blue-100 text-blue-500 cursor-wait'
                      : 'bg-blue-600 hover:bg-blue-700 text-white hover:scale-[1.02] active:scale-95 shadow-md shadow-blue-600/20'
                  }`}
              >
                {isKeyingIn ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-current rounded-full animate-spin" />
                    入機中...
                  </>
                ) : (
                  <>
                    入機 ({keyInCount})
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Filter bar: Search, Status, & Sales Rep */}
        <div className="p-4 bg-white border-b border-slate-100 flex flex-col gap-3">
          {/* Search box & Status pills */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="搜尋客戶名、訂單編號、貨品或備註..."
                className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Status Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
              <button
                type="button"
                onClick={() => { setStatusFilter('ALL'); setCurrentPage(1); }}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                  statusFilter === 'ALL'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                全部 ({counts.total})
              </button>

              <button
                type="button"
                onClick={() => { setStatusFilter('PENDING'); setCurrentPage(1); }}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1 ${
                  statusFilter === 'PENDING'
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                }`}
              >
                <Clock className="w-3 h-3" />
                未入機 ({counts.pending})
              </button>

              <button
                type="button"
                onClick={() => { setStatusFilter('KEYED_IN'); setCurrentPage(1); }}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1 ${
                  statusFilter === 'KEYED_IN'
                    ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                <CheckCircle2 className="w-3 h-3" />
                已入機 ({counts.keyedIn})
              </button>

              <button
                type="button"
                onClick={() => { setStatusFilter('HELD'); setCurrentPage(1); }}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1 ${
                  statusFilter === 'HELD'
                    ? 'bg-amber-600 text-white shadow-sm shadow-amber-600/20'
                    : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                }`}
              >
                <Anchor className="w-3 h-3" />
                暫存 ({counts.held})
              </button>
            </div>
          </div>

          {/* Sales Rep Selector (Especially for Admin or when viewing All) */}
          {(currentRole === 'Admin' || showAll) && uniqueSalesReps.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pt-1 scrollbar-none border-t border-slate-100">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 whitespace-nowrap mr-1">
                業務代表:
              </span>
              <button
                type="button"
                onClick={() => { setSelectedUser('ALL'); setCurrentPage(1); }}
                className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold transition-all whitespace-nowrap ${
                  selectedUser === 'ALL'
                    ? 'bg-blue-100 text-blue-800 border border-blue-300'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                全部 Sales
              </button>
              {uniqueSalesReps.map(rep => (
                <button
                  key={rep}
                  type="button"
                  onClick={() => { setSelectedUser(rep); setCurrentPage(1); }}
                  className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold transition-all whitespace-nowrap ${
                    selectedUser === rep
                      ? 'bg-blue-600 text-white border border-blue-600 shadow-sm'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  {rep}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Status Message Notification */}
        <AnimatePresence>
          {statusMessage && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className={`px-4 sm:px-6 py-3 text-xs font-bold border-b flex items-center justify-between gap-4 overflow-hidden
                ${statusMessage.type === 'success' 
                  ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' 
                  : 'bg-rose-500/10 text-rose-700 border-rose-500/20'
                }`}
            >
              <div className="flex items-center gap-2">
                <span className="leading-relaxed">{statusMessage.text}</span>
              </div>
              <button 
                onClick={() => setStatusMessage(null)}
                className="p-1 hover:bg-slate-500/10 text-slate-400 hover:text-slate-600 rounded-lg transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Orders Table */}
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-slate-50/80 border-b border-slate-100">
              <tr>
                <th className="px-2 py-3 font-bold text-slate-500 uppercase tracking-widest text-[9px] w-12 text-center">日期</th>
                <th className="px-3 py-3 font-bold text-slate-500 uppercase tracking-widest text-[10px] w-full">客戶名稱 / 訂單資訊</th>
                <th className="px-3 py-3 font-bold text-slate-500 uppercase tracking-widest text-[10px] text-right whitespace-nowrap">金額</th>
                <th className="px-2 py-3 font-bold text-slate-500 uppercase tracking-widest text-[10px] w-10 text-center">詳情</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoadingTradeLog ? (
                <tr>
                  <td colSpan={4} className="px-4 py-20 text-center text-slate-500 font-medium">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <Loader2 className="w-9 h-9 animate-spin text-blue-600" />
                      <div>
                        <p className="text-slate-800 font-black text-sm">已清除訂單列表，正在從 Google Sheet 載入 'Trade_log'...</p>
                        <p className="text-xs text-slate-400 mt-1">僅嚴格載入試算表中的 Trade_log 即時資料，請稍候</p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : paginatedOrders.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-16 text-center text-slate-400 font-medium">
                    <div className="flex flex-col items-center gap-3">
                      <UserCircle className="w-10 h-10 text-slate-300" />
                      <div>
                        <p className="text-slate-700 font-bold">沒有符合條件的訂單記錄</p>
                        <p className="text-xs text-slate-400 mt-1">
                          {searchQuery ? '請嘗試清除搜尋關鍵字，或切換狀態篩選條件。' : '當有其他用戶落單或入機後，會自動在此處更新顯示。'}
                        </p>
                      </div>
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
                        >
                          清除搜尋關鍵字
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedOrders.map((order) => {
                  const isExpanded = expandedOrderId === order.id;
                  const orderOwner = isOwner(order);
                  return (
                    <React.Fragment key={order.id}>
                      <tr 
                        onClick={(e) => {
                          toggleExpand(order.id, e);
                        }}
                        className={`transition-colors group cursor-pointer ${
                          orderOwner && order.isHeld 
                            ? 'bg-amber-50/60 hover:bg-amber-100/60' 
                            : isExpanded 
                              ? 'bg-blue-50/40' 
                              : 'hover:bg-slate-50/80'
                        }`}
                      >
                        {/* Date */}
                        <td className="px-2 py-3 text-slate-500 font-bold whitespace-nowrap text-center text-[11px] align-top pt-3.5">
                          <div className="flex flex-col items-center justify-center">
                            <Calendar className="w-3 h-3 text-slate-400 group-hover:text-blue-500 transition-colors mb-0.5" />
                            <span>{formatDate(order.date)}</span>
                          </div>
                        </td>

                        {/* Customer, ID, Sales badge, Status badges, and Action Buttons */}
                        <td className="px-3 py-3 text-slate-900 font-black align-top">
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <User className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                              <span className="text-sm font-black text-slate-900 leading-tight">
                                {order.customerName}
                              </span>

                              {/* Order ID */}
                              {order.id && (
                                <span className="px-1.5 py-0.5 rounded-md text-[9px] bg-slate-100 text-slate-600 border border-slate-200 font-mono font-bold tracking-wider tabular-nums shrink-0 leading-none">
                                  {order.id}
                                </span>
                              )}

                              {/* Sales Rep Badge */}
                              {order.salesName && (
                                <span className="px-2 py-0.5 rounded-md text-[9px] bg-blue-50 text-blue-700 border border-blue-200 font-black tracking-wide shrink-0 leading-none">
                                  Sales: {order.salesName}
                                </span>
                              )}

                              {/* Status Badges */}
                              {/* Requirement 3: Other users cannot see if an order is '暫存' */}
                              {orderOwner && order.isHeld && (
                                <span className="px-1.5 py-0.5 rounded-md text-[9px] bg-amber-500/15 text-amber-700 border border-amber-500/30 font-bold uppercase tracking-wider tabular-nums shrink-0 leading-none">
                                  暫存
                                </span>
                              )}
                              {order.isKeyedIn ? (
                                orderOwner && onToggleKeyIn ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onToggleKeyIn(order.id);
                                    }}
                                    title="點擊切換為未入機"
                                    className="px-1.5 py-0.5 rounded-md text-[9px] bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 border border-emerald-500/30 font-bold uppercase tracking-wider tabular-nums shrink-0 leading-none flex items-center gap-1 transition-colors cursor-pointer"
                                  >
                                    <CheckCircle2 className="w-2.5 h-2.5" />
                                    已入機
                                  </button>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded-md text-[9px] bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 font-bold uppercase tracking-wider tabular-nums shrink-0 leading-none flex items-center gap-1 select-none">
                                    <CheckCircle2 className="w-2.5 h-2.5" />
                                    已入機
                                  </span>
                                )
                              ) : (
                                /* Requirement 2: Stay as '暫存' and '未入機' in the order list */
                                orderOwner && onToggleKeyIn ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onToggleKeyIn(order.id);
                                    }}
                                    title="點擊切換為已入機"
                                    className="px-1.5 py-0.5 rounded-md text-[9px] bg-sky-500/15 hover:bg-sky-500/25 text-sky-700 border border-sky-500/30 font-bold uppercase tracking-wider tabular-nums shrink-0 leading-none flex items-center gap-1 transition-colors cursor-pointer"
                                  >
                                    <Clock className="w-2.5 h-2.5" />
                                    未入機
                                  </button>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded-md text-[9px] bg-sky-500/15 text-sky-700 border border-sky-500/30 font-bold uppercase tracking-wider tabular-nums shrink-0 leading-none flex items-center gap-1 select-none">
                                    <Clock className="w-2.5 h-2.5" />
                                    未入機
                                  </span>
                                )
                              )}
                            </div>

                            {/* Item count & Sub-buttons */}
                            <div className="flex items-center gap-2 flex-wrap pt-0.5" onClick={(e) => e.stopPropagation()}>
                              <span className="text-[11px] text-slate-400 font-medium">
                                共 {order.items?.length || 0} 種貨品
                              </span>

                              <span className="text-slate-300">•</span>

                              {orderOwner ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onEditOrder(order);
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold transition-all active:scale-95 bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 hover:text-blue-700"
                                  >
                                    <Pencil className="w-2.5 h-2.5" />
                                    <span>修改</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onToggleHold(order.id);
                                    }}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold transition-all active:scale-95 border ${
                                      order.isHeld
                                        ? 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200'
                                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200 hover:text-slate-800'
                                    }`}
                                  >
                                    <Anchor className="w-2.5 h-2.5" />
                                    <span>{order.isHeld ? '取消暫存' : '暫存'}</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOrderToDelete(order);
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold transition-all active:scale-95 bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 hover:text-rose-700"
                                  >
                                    <Trash2 className="w-2.5 h-2.5" />
                                    <span>刪除</span>
                                  </button>
                                </>
                              ) : (
                                <span className="text-[10px] text-slate-400 font-medium italic">
                                  僅限 {order.salesName || '負責人'} 修改及入機
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Order Amount */}
                        <td className="px-3 py-3 text-right text-slate-900 font-black tabular-nums text-sm align-top pt-3.5 whitespace-nowrap">
                          <div className="flex items-center justify-end gap-0.5 text-emerald-600">
                            <DollarSign className="w-3.5 h-3.5" />
                            <span>{Math.round(order.orderAmount).toLocaleString()}</span>
                          </div>
                        </td>

                        {/* Expand / Collapse Button */}
                        <td className="px-2 py-3 text-center align-top pt-3.5" onClick={(e) => toggleExpand(order.id, e)}>
                          <button
                            type="button"
                            className="p-1 rounded-lg hover:bg-slate-200/60 text-slate-400 hover:text-slate-600 transition-colors"
                            title={isExpanded ? '收起詳情' : '展開貨品清單'}
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </td>
                      </tr>

                      {/* Remark line */}
                      {order.remark && !isExpanded && (
                        <tr 
                          onClick={(e) => {
                            toggleExpand(order.id, e);
                          }}
                          className={`border-t-0 bg-slate-50/30 hover:bg-blue-50/40 cursor-pointer transition-colors`}
                        >
                          <td />
                          <td colSpan={3} className="px-3 py-1.5 pb-3">
                            <div className="flex items-start gap-1.5 text-slate-500 text-[11px] font-medium leading-relaxed bg-white/60 px-2.5 py-1.5 rounded-lg border border-slate-100">
                              <MessageSquare className="w-3 h-3 text-blue-400 mt-0.5 shrink-0" />
                              <span className="italic">{order.remark}</span>
                            </div>
                          </td>
                        </tr>
                      )}

                      {/* Expanded Line Items Detail */}
                      {isExpanded && (
                        <tr className="bg-blue-50/20 border-t border-b border-blue-100">
                          <td />
                          <td colSpan={3} className="px-3 py-3 pb-4">
                            <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm space-y-2">
                              <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 border-b border-slate-100 pb-1.5">
                                <span className="flex items-center gap-1 text-slate-700">
                                  <Package className="w-3.5 h-3.5 text-blue-500" />
                                  訂單包含貨品清單 ({order.items?.length || 0})
                                </span>
                                {orderOwner ? (
                                  <button
                                    type="button"
                                    onClick={() => onEditOrder(order)}
                                    className="text-blue-600 hover:underline text-[10px] font-bold"
                                  >
                                    編輯此訂單 &rarr;
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-slate-400 italic">
                                    僅限 {order.salesName || '負責人'} 編輯
                                  </span>
                                )}
                              </div>

                              <div className="divide-y divide-slate-50">
                                {order.items?.map((item, itmIdx) => (
                                  <div key={itmIdx} className="py-1.5 flex items-center justify-between text-xs gap-3">
                                    <div className="flex-1 truncate">
                                      <span className="font-bold text-slate-800">{item.name}</span>
                                      {item.isOuterBox && (
                                        <span className="ml-1.5 px-1 py-0.2 rounded text-[9px] bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                                          {item.outerBoxUnit || '箱'}裝 ({item.unitsPerBox || 1})
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-right text-slate-500 tabular-nums shrink-0 text-[11px]">
                                      <span>${item.price} &times; </span>
                                      <span className="font-bold text-slate-900">{item.quantity}</span>
                                      <span className="ml-2 font-black text-slate-900">
                                        = ${Math.round(item.price * item.quantity).toLocaleString()}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {order.remark && (
                                <div className="pt-2 border-t border-slate-100 flex items-start gap-1.5 text-slate-600 text-xs">
                                  <MessageSquare className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
                                  <span className="font-medium italic">備註: {order.remark}</span>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="px-4 sm:px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-600">
            <div>
              顯示第 {(currentPage - 1) * PAGE_SIZE + 1} 至 {Math.min(currentPage * PAGE_SIZE, filteredOrders.length)} 筆（共 {filteredOrders.length} 筆）
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                上一頁
              </button>
              <span className="px-2 text-slate-400">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                下一頁
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Floating Action Button for New Order */}
      {currentRole && (
        <button 
          onClick={onNewOrder}
          className="fixed bottom-24 right-6 md:bottom-10 md:right-10 z-[60] bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-full shadow-2xl transition-all duration-300 hover:scale-110 active:scale-95 group flex items-center gap-2"
          title="落單"
        >
          <Plus className="w-6 h-6 shrink-0" />
          <span className="font-black text-xs uppercase tracking-widest whitespace-nowrap hidden md:block">落單</span>
        </button>
      )}

      {/* Delete Confirmation Dialog */}
      <AnimatePresence>
        {orderToDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOrderToDelete(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-white rounded-3xl shadow-2xl p-6 w-full max-w-xs overflow-hidden z-10 border border-slate-100"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-black text-slate-900">確認刪除訂單？</h4>
                  <p className="text-xs font-bold text-slate-400">{orderToDelete.customerName}</p>
                </div>
              </div>
              
              <p className="text-xs text-slate-600 mb-6 font-medium leading-relaxed">
                確定要刪除「<span className="font-bold text-slate-900">{orderToDelete.customerName}</span>」金額為 <span className="font-bold text-emerald-600">${Math.round(orderToDelete.orderAmount).toLocaleString()}</span> 的訂單嗎？
                {orderToDelete.isKeyedIn && '（此操作會同時在伺服器及 Google 表格中刪除並回補庫存）'}
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setOrderToDelete(null)}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={async () => {
                    if (isDeleting) return;
                    setIsDeleting(true);
                    try {
                      await onDeleteOrder(orderToDelete.id);
                    } finally {
                      setIsDeleting(false);
                      setOrderToDelete(null);
                    }
                  }}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs shadow-md shadow-rose-600/20 transition-colors flex items-center justify-center gap-1.5"
                >
                  {isDeleting ? '刪除中...' : '確認刪除'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default OrderList;
