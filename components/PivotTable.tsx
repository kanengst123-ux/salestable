
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { SaleRecord, PivotConfig, SortOrder, Product } from '../types';
import { Filter, SortDesc, SortAsc, Search, Star, Package } from 'lucide-react';

const getValByPossibleKeys = (obj: any, keys: string[]) => {
  for (const k of keys) {
    if (obj[k] !== undefined) return obj[k];
    const lowerK = k.toLowerCase();
    const matchedKey = Object.keys(obj).find(key => key.toLowerCase() === lowerK);
    if (matchedKey) return obj[matchedKey];
  }
  return undefined;
};

const parseFieldNum = (obj: any, keys: string[]) => {
  const val = getValByPossibleKeys(obj, keys);
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  const cleaned = val.toString().replace(/[$,\s]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

interface PivotTableProps {
  data: SaleRecord[];
  headers: string[];
  products: Product[];
}

const PivotTable: React.FC<PivotTableProps> = ({ data, headers, products }) => {
  // Map logical names to actual data keys
  const findKey = (candidates: string[]) => {
    const lowerHeaders = headers.map(h => h.toLowerCase());
    for (const cand of candidates) {
      const idx = lowerHeaders.findIndex(h => h.includes(cand.toLowerCase()));
      if (idx !== -1) return headers[idx];
    }
    return candidates[0]; // Fallback to first candidate name
  };

  const itemKey = findKey(['productName', 'item']);
  const customerKey = findKey(['customerName', 'customer', 'customers']);
  const subtotalKey = 'subtotal'; // Virtual field from service
  const countKey = 'countValue'; // Derived from Column R in dataService

  const [config, setConfig] = useState<PivotConfig>({
    rowField: itemKey,
    colField: 'none',
    metric: subtotalKey,
    sortOrder: 'desc',
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('pivot_fav_products');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const toggleFavorite = (name: string) => {
    setFavorites(prev => {
      const next = prev.includes(name) 
        ? prev.filter(n => n !== name) 
        : [...prev, name];
      localStorage.setItem('pivot_fav_products', JSON.stringify(next));
      return next;
    });
  };

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (document.activeElement === searchInputRef.current) {
        searchInputRef.current?.blur();
      }
    };

    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll, { capture: true });
    };
  }, []);

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase().trim();
    return products.filter(p => p.name.toLowerCase().includes(query)).slice(0, 5);
  }, [products, searchQuery]);

  const productStockMap = useMemo(() => {
    const map: Record<string, string | number> = {};
    products.forEach(p => {
      if (p.unlimitedStock) {
        map[p.name] = '無限制';
      } else if (p.stock !== undefined && p.stock !== null) {
        map[p.name] = p.stock;
      } else {
        map[p.name] = 'N/A';
      }
    });
    return map;
  }, [products]);

  const pivotData = useMemo(() => {
    const rows = new Set<string>();
    const matrix: Record<string, Record<string, number>> = {};
    const rowTotals: Record<string, number> = {};
    let grandTotal = 0;

    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(now.getDate() - 30);

    // Filter for last 30 days
    const filteredData = data.filter(item => {
      const orderDate = new Date(item.orderDate);
      return orderDate >= thirtyDaysAgo && orderDate <= now;
    });

    const latestStock: Record<string, string | number> = {};
    const latestDates: Record<string, Date> = {};

    filteredData.forEach((item) => {
      const rowVal = String(item[config.rowField] ?? 'N/A');
      const colVal = 'Grand Total';
      
      let metricVal = 0;
      if (config.metric === countKey) {
        if (config.rowField === itemKey) {
          const qty = parseFieldNum(item, ['Quantity', 'quantity']);
          const ref = parseFieldNum(item, ['Ref', 'ref']);
          metricVal = qty * ref;
        } else if (config.rowField === customerKey) {
          metricVal = 1;
        } else {
          const val = item[config.metric];
          metricVal = typeof val === 'number' ? val : parseFloat(String(val).replace(/[$,]/g, '')) || 0;
        }
      } else {
        const val = item[config.metric];
        metricVal = typeof val === 'number' ? val : parseFloat(String(val).replace(/[$,]/g, '')) || 0;
      }

      rows.add(rowVal);

      if (!matrix[rowVal]) matrix[rowVal] = {};
      matrix[rowVal][colVal] = (matrix[rowVal][colVal] || 0) + metricVal;
      
      rowTotals[rowVal] = (rowTotals[rowVal] || 0) + metricVal;
      grandTotal += metricVal;

      // Track latest stock for items
      if (config.rowField === itemKey) {
        const orderDate = new Date(item.orderDate);
        if (!latestDates[rowVal] || orderDate > latestDates[rowVal]) {
          latestDates[rowVal] = orderDate;
          const matchedStock = productStockMap[rowVal];
          latestStock[rowVal] = matchedStock !== undefined ? matchedStock : 'N/A';
        }
      }
    });

    let sortedRows = Array.from(rows);
    const sortedCols = ['Grand Total'];

    // Apply Sorting based on Row Grand Total
    if (config.sortOrder === 'alpha') {
      sortedRows.sort();
    } else if (config.sortOrder === 'desc') {
      sortedRows.sort((a, b) => (rowTotals[b] || 0) - (rowTotals[a] || 0));
    } else if (config.sortOrder === 'asc') {
      sortedRows.sort((a, b) => (rowTotals[a] || 0) - (rowTotals[b] || 0));
    }

    return { sortedRows, sortedCols, matrix, rowTotals, grandTotal, filteredCount: filteredData.length, latestStock };
  }, [data, config, itemKey, customerKey, subtotalKey, countKey, productStockMap]);

  const formatValue = (val: number) => {
    const isCurrency = config.metric === subtotalKey;
    if (isCurrency) {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
    }
    return val.toLocaleString(undefined, { maximumFractionDigits: 1 });
  };

  const SelectorButton: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
    <button
      onClick={onClick}
      className={`flex-1 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all border ${
        active 
          ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-600/20' 
          : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Top widgets layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        
        {/* Left Columns - Product Stock Search & Watchlist */}
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm lg:col-span-2 flex flex-col justify-between">
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-2xl">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">查詢存貨</h3>
                <p className="text-xs text-slate-400">Search products to find active stock levels or pin them as favorites.</p>
              </div>
            </div>

            {/* Search Input Box */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-slate-400" />
              </div>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Type Chinese or English product name..."
                className="block w-full pl-11 pr-14 py-3 border border-slate-200 rounded-[1.25rem] bg-slate-50 text-slate-800 font-medium placeholder-slate-450 text-sm focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition-all duration-200"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-xs font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Search Results Drawer */}
            {searchQuery.trim() !== '' && (
              <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 space-y-3">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Search Results</h4>
                {filteredProducts.length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-1">No matching products found.</p>
                ) : (
                  <div className="divide-y divide-slate-100 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    {filteredProducts.map((p) => {
                      const isFav = favorites.includes(p.name);
                      const stockVal = productStockMap[p.name] !== undefined ? productStockMap[p.name] : 'N/A';
                      const isUnlimited = p.unlimitedStock || stockVal === '無限制';
                      const isOut = typeof stockVal === 'number' && stockVal <= 0;
                      const isLow = typeof stockVal === 'number' && stockVal < 10;
                      return (
                        <div key={p.name} className="flex items-center justify-between p-3 hover:bg-slate-50 transition-colors">
                          <div className="flex-1 min-w-0 pr-3">
                            <p className="text-xs md:text-sm font-bold text-slate-800 truncate" title={p.name}>{p.name}</p>
                            {p.price !== undefined && (
                              <p className="text-[10px] font-medium text-slate-400">Standard Price: ${p.price}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            {/* Stock Badge */}
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              isUnlimited
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-150'
                                : isOut
                                ? 'bg-rose-50 text-rose-700 border border-rose-150'
                                : isLow
                                ? 'bg-amber-50 text-amber-700 border border-amber-150'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}>
                              {isUnlimited ? '無限制' : typeof stockVal === 'number' ? stockVal.toLocaleString() : stockVal}
                            </span>

                            {/* Favorite Button Toggle */}
                            <button
                              onClick={() => toggleFavorite(p.name)}
                              className="p-1.5 rounded-lg border border-slate-200 bg-white shadow-sm hover:bg-slate-50 active:scale-95 transition-all"
                              title={isFav ? "Remove from Favorites" : "Add to Favorites"}
                            >
                              <Star className={`w-3.5 h-3.5 ${isFav ? 'fill-amber-400 text-amber-500' : 'text-slate-400'}`} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Favorite watchlist */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0" />
                  Quick Favorites Watchlist
                </h4>
                {favorites.length > 0 && (
                  <button 
                    onClick={() => {
                      if (confirm("Are you sure you want to clear all favorites?")) {
                        setFavorites([]);
                        localStorage.setItem('pivot_fav_products', JSON.stringify([]));
                      }
                    }}
                    className="text-[9px] font-bold text-rose-500 hover:text-rose-700 uppercase tracking-wider bg-transparent border-0 cursor-pointer"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {favorites.length === 0 ? (
                <div className="border border-dashed border-slate-200 rounded-2xl p-6 text-center bg-slate-50/50">
                  <p className="text-xs text-slate-450 font-medium">Your watchlist is currently empty.</p>
                  <p className="text-[10px] text-slate-400 mt-1">Search for products above and click the star to pin them here for instant stock tracking.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {favorites.map((favName) => {
                    const matchedProduct = products.find(p => p.name === favName);
                    const stockVal = productStockMap[favName] !== undefined ? productStockMap[favName] : 'N/A';
                    const isUnlimited = matchedProduct?.unlimitedStock || stockVal === '無限制';
                    const isOut = typeof stockVal === 'number' && stockVal <= 0;
                    const isLow = typeof stockVal === 'number' && stockVal < 10;

                    return (
                      <div 
                        key={favName} 
                        className="bg-slate-50/70 border border-slate-150 rounded-2xl p-3 flex items-center justify-between hover:bg-slate-100/50 transition-all duration-200 group"
                      >
                        <div className="min-w-0 flex-1 pr-2.5">
                          <p className="text-xs font-bold text-slate-700 truncate" title={favName}>{favName}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[9px] font-black text-slate-450 tracking-wider">STOCK:</span>
                            <span className={`text-[10px] font-extrabold ${
                              isUnlimited 
                                ? 'text-emerald-600' 
                                : isOut 
                                ? 'text-rose-600' 
                                : isLow 
                                ? 'text-amber-600' 
                                : 'text-slate-600'
                            }`}>
                              {isUnlimited ? '無限制' : typeof stockVal === 'number' ? stockVal.toLocaleString() : stockVal}
                            </span>
                          </div>
                        </div>
                        <button 
                          onClick={() => toggleFavorite(favName)}
                          className="p-1 rounded-full text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all shrink-0"
                          title="Remove watchlist item"
                        >
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Pivot Controls (Narrowed) */}
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm lg:col-span-1 space-y-6 flex flex-col justify-between">
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Pivot Controls</h3>
              <p className="text-xs text-slate-400">Narrow slice configuration dashboard.</p>
            </div>

            {/* Row Selection */}
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Group By (Rows)</label>
              <div className="flex gap-2">
                <SelectorButton 
                  label="Item" 
                  active={config.rowField === itemKey} 
                  onClick={() => setConfig({ ...config, rowField: itemKey })} 
                />
                <SelectorButton 
                  label="Customers" 
                  active={config.rowField === customerKey} 
                  onClick={() => setConfig({ ...config, rowField: customerKey })} 
                />
              </div>
            </div>

            {/* Metric Selection */}
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Aggregate (Metric)</label>
              <div className="flex gap-2">
                <SelectorButton 
                  label="Subtotal" 
                  active={config.metric === subtotalKey} 
                  onClick={() => setConfig({ ...config, metric: subtotalKey })} 
                />
                <SelectorButton 
                  label="Count" 
                  active={config.metric === countKey} 
                  onClick={() => setConfig({ ...config, metric: countKey })} 
                />
              </div>
            </div>

            {/* Sort Selection */}
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Sort Sequence</label>
              <div className="relative">
                <select
                  value={config.sortOrder}
                  onChange={(e) => setConfig({ ...config, sortOrder: e.target.value as SortOrder })}
                  className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 pr-10 text-slate-700 font-bold text-xs uppercase tracking-widest focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition-all duration-200 cursor-pointer"
                >
                  <option value="alpha">Alphabetical (A-Z)</option>
                  <option value="desc">Highest Performance</option>
                  <option value="asc">Lowest Performance</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    {config.sortOrder === 'desc' ? <SortDesc className="w-4 h-4 text-blue-600" /> : 
                     config.sortOrder === 'asc' ? <SortAsc className="w-4 h-4 text-blue-600" /> : 
                     <SortAsc className="w-4 h-4 text-slate-400" />}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 md:px-8 py-4 md:py-5 font-black text-slate-400 sticky left-0 bg-slate-50 z-10 border-r border-slate-200 uppercase tracking-widest text-[9px] md:text-[10px] max-w-[120px] md:max-w-none truncate">
                  {config.rowField === itemKey ? 'Product / Item' : 'Customer Entity'}
                </th>
                {config.rowField === itemKey && (
                  <th className="px-3 md:px-8 py-4 md:py-5 font-black text-slate-400 text-right uppercase tracking-widest text-[9px] md:text-[10px] border-r border-slate-200 whitespace-nowrap">
                    Stock Level
                  </th>
                )}
                <th className="px-3 md:px-8 py-4 md:py-5 font-black text-blue-600 text-right uppercase tracking-widest text-[9px] md:text-[10px] bg-blue-50/30 whitespace-nowrap">
                  {config.metric === subtotalKey ? 'Total Revenue' : 'Total Count'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pivotData.sortedRows.map((row, idx) => (
                <tr key={row} className="hover:bg-slate-50/80 transition-colors group">
                  <td className="px-3 md:px-8 py-4 md:py-5 font-black text-slate-800 sticky left-0 bg-white z-10 border-r border-slate-100 group-hover:bg-slate-50 max-w-[120px] md:max-w-none truncate text-xs md:text-sm">
                    <div className="flex items-center gap-2 md:gap-3">
                      <span className="text-[9px] md:text-[10px] font-black text-slate-300 w-3 md:w-4">{idx + 1}</span>
                      <span className="truncate">{row}</span>
                    </div>
                  </td>
                  {config.rowField === itemKey && (
                    <td className="px-3 md:px-8 py-4 md:py-5 text-right font-bold text-slate-600 border-r border-slate-100 tabular-nums text-xs md:text-sm whitespace-nowrap">
                      {pivotData.latestStock[row] !== undefined ? pivotData.latestStock[row] : 'N/A'}
                    </td>
                  )}
                  <td className="px-3 md:px-8 py-4 md:py-5 text-right font-black text-slate-900 bg-slate-50/10 tabular-nums text-sm md:text-lg whitespace-nowrap">
                    {formatValue(pivotData.rowTotals[row])}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-900 text-white border-t-2 border-slate-800">
              <tr>
                <td className="px-3 md:px-8 py-4 md:py-6 font-black uppercase tracking-widest text-[9px] md:text-[10px] sticky left-0 bg-slate-900 italic max-w-[120px] md:max-w-none truncate">Grand Total (30D)</td>
                {config.rowField === itemKey && <td className="bg-slate-900 border-r border-slate-800"></td>}
                <td className="px-3 md:px-8 py-4 md:py-6 text-right font-black text-blue-400 tabular-nums text-lg md:text-2xl whitespace-nowrap">
                  {formatValue(pivotData.grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      
      <div className="flex items-center gap-2 p-4 bg-blue-50 text-blue-700 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-blue-100">
        <Filter className="w-4 h-4 shrink-0" />
        <span>Aggregating <b>{config.metric === subtotalKey ? 'Subtotal' : 'Count'}</b> for <b>{pivotData.sortedRows.length}</b> entities across <b>{pivotData.filteredCount}</b> transactions from the last 30 days.</span>
      </div>
    </div>
  );
};

export default PivotTable;
