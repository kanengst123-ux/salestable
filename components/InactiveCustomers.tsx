
import React, { useMemo, useState, useEffect } from 'react';
import { SaleRecord, Customer } from '../types';
import { Users, Clock, AlertCircle, ChevronRight, X, Search } from 'lucide-react';

interface InactiveCustomersProps {
  data: SaleRecord[];
  masters?: Customer[];
}

const InactiveCustomers: React.FC<InactiveCustomersProps> = ({ data, masters = [] }) => {
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [showNewCustomerPopup, setShowNewCustomerPopup] = useState(false);
  const [popupContent, setPopupContent] = useState({ title: '', message: '', type: 'new' });
  const [showSuggestions, setShowSuggestions] = useState(false);

  const allCustomers = useMemo(() => {
    // If we have masters, use them as primary source for names
    if (masters && masters.length > 0) {
      return masters.map(m => ({ name: m.name, user: m.sales || 'Unknown' }));
    }

    const latestUserMap: Record<string, string> = {};
    data.forEach(item => {
      const customer = String(item.customerName || 'Unknown').trim();
      const user = String(item.userName || 'Unknown').trim();
      
      if (!latestUserMap[customer]) {
        latestUserMap[customer] = user;
      }
    });
    return Object.entries(latestUserMap).map(([name, user]) => ({ name, user }));
  }, [data, masters]);

  const suggestions = useMemo(() => {
    if (!searchInput.trim()) return [];
    const term = searchInput.toLowerCase().trim();
    return allCustomers
      .filter(c => c.name.toLowerCase().includes(term))
      .slice(0, 8); 
  }, [allCustomers, searchInput]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.search-container')) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const inactiveData = useMemo(() => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const latestEntries: Record<string, { lastDate: Date; user: string; lastOrderId: string }> = {};
    
    data.forEach(item => {
      const customer = String(item.customerName || 'Unknown').trim();
      const date = new Date(item.orderDate);
      const user = String(item.userName || 'Unknown').trim();
      
      if (isNaN(date.getTime())) return;

      if (!latestEntries[customer] || date > latestEntries[customer].lastDate) {
        latestEntries[customer] = { 
          lastDate: date, 
          user: user,
          lastOrderId: item.orderId
        };
      }
    });

    return Object.entries(latestEntries)
      .map(([customer, stats]) => ({
        customer,
        lastDate: stats.lastDate,
        user: stats.user,
        lastOrderId: stats.lastOrderId,
        daysInactive: Math.floor((now.getTime() - stats.lastDate.getTime()) / (1000 * 60 * 60 * 24))
      }))
      .filter(item => item.lastDate < sevenDaysAgo)
      .sort((a, b) => a.daysInactive - b.daysInactive); 
  }, [data]);

  const filteredInactiveData = useMemo(() => {
    if (!appliedSearch.trim()) return inactiveData;
    const term = appliedSearch.toLowerCase().trim();
    return inactiveData.filter(item => 
      item.customer.toLowerCase().includes(term)
    );
  }, [inactiveData, appliedSearch]);

  const customerDetails = useMemo(() => {
    if (!selectedCustomer) return [];
    
    const customerRecords = data.filter(item => String(item.customerName || '').trim() === selectedCustomer);
    if (customerRecords.length === 0) return [];
    
    const lastDateStr = customerRecords.reduce((latest, curr) => {
      const currDate = new Date(curr.orderDate);
      const latestDate = new Date(latest);
      return currDate > latestDate ? curr.orderDate : latest;
    }, customerRecords[0].orderDate);

    return customerRecords.filter(item => item.orderDate === lastDateStr);
  }, [data, selectedCustomer]);

  const handleCustomerClick = (customer: string) => {
    setSelectedCustomer(customer);
    setIsModalOpen(true);
  };

  const handleSearch = () => {
    const term = searchInput.toLowerCase().trim();
    if (term) {
      // 1. Check if found in inactive list (already displayed)
      const foundInInactive = inactiveData.filter(item => 
        item.customer.toLowerCase().includes(term)
      );

      if (foundInInactive.length === 0) {
        // 2. Search in MASTERS (Col A of customer_cat)
        const matchedMaster = allCustomers.find(c => 
          c.name.toLowerCase().includes(term)
        );
        
        if (matchedMaster) {
          // Exists but is active (not in inactive list)
          setPopupContent({
            title: '活躍客戶',
            message: `「${matchedMaster.name}」在過去 7 天內有訂單記錄，不屬於非活躍客戶。`,
            type: 'active'
          });
          setShowNewCustomerPopup(true);
        } else {
          // Not found at all
          setPopupContent({
            title: '新客!',
            message: `在客戶清單 (customer_cat) 中找不到「${searchInput}」。`,
            type: 'new'
          });
          setShowNewCustomerPopup(true);
        }
      }
    }
    setAppliedSearch(searchInput);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full relative">
      {/* Search Feedback Popup */}
      {showNewCustomerPopup && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-300 p-8 text-center">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${
              popupContent.type === 'active' ? 'bg-blue-100' : 'bg-amber-100'
            }`}>
              {popupContent.type === 'active' ? (
                <Clock className="w-10 h-10 text-blue-600" />
              ) : (
                <Users className="w-10 h-10 text-amber-600" />
              )}
            </div>
            <h3 className="text-3xl font-black text-slate-900 mb-2 tracking-tight">{popupContent.title}</h3>
            <p className="text-slate-500 font-medium mb-8 leading-relaxed truncate-3-lines">{popupContent.message}</p>
            <button 
              onClick={() => setShowNewCustomerPopup(false)}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/20 active:scale-95"
            >
              確定
            </button>
          </div>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && selectedCustomer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-slate-100 bg-slate-50/30 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">{selectedCustomer}</h3>
                <p className="text-slate-500 text-xs font-medium mt-1">Last Activity Entries: {customerDetails[0]?.orderDate ? new Date(customerDetails[0].orderDate).toLocaleDateString() : 'N/A'}</p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="overflow-x-auto max-h-[60vh]">
              <table className="w-full text-left table-auto">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Item (Col B)</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Quantity (Col D)</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Unit (Col E)</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Price (Col G)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customerDetails.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="px-8 py-5 text-slate-900 font-bold">{item.productName}</td>
                      <td className="px-8 py-5 text-center text-slate-600 font-medium tabular-nums">{item.quantity}</td>
                      <td className="px-8 py-5 text-center text-slate-600 font-medium">{item.unit}</td>
                      <td className="px-8 py-5 text-right text-slate-900 font-black tabular-nums">${item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="p-8 bg-slate-50/50 border-t border-slate-100 flex justify-end">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="px-8 py-3 bg-slate-900 text-white rounded-2xl font-black hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/20 active:scale-95"
              >
                Close Briefing
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 w-full">
        <div className="bg-slate-900 text-white p-8 md:p-10 rounded-[2rem] border border-slate-800 shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-10 transform translate-x-4 -translate-y-4 group-hover:translate-x-0 group-hover:translate-y-0 transition-transform">
            <Users size={160} />
          </div>
          <div className="relative z-10">
            <p className="text-amber-400 font-bold text-xs uppercase tracking-widest mb-2">Inactive Accounts</p>
            <h3 className="text-4xl md:text-6xl font-black tabular-nums">{inactiveData.length}</h3>
            <div className="mt-6 flex items-center gap-2">
              <span className="px-4 py-1.5 bg-amber-500/20 text-amber-300 text-xs font-bold rounded-xl border border-amber-500/20">No activity in 7+ days</span>
              <span className="px-4 py-1.5 bg-slate-800/50 text-slate-400 text-xs font-bold rounded-xl border border-slate-700">
                Action Required
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden w-full">
        <div className="p-4 sm:p-8 border-b border-slate-100 bg-slate-50/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-black text-slate-900 tracking-tight">搜查鋪名</h3>
            <p className="text-slate-500 text-xs font-medium mt-1">Customers whose last entry (Col A) was more than 7 days ago</p>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="relative search-container">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text"
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={handleKeyPress}
                placeholder="Search customer..."
                className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all w-full md:w-64"
              />
              
              {/* Suggestions Dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl z-[80] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="p-2 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-2">Suggestions</span>
                    <button onClick={() => setShowSuggestions(false)} className="p-1 hover:bg-slate-200 rounded-md transition-colors">
                      <X className="w-3 h-3 text-slate-400" />
                    </button>
                  </div>
                  <div 
                    onScroll={() => {
                      if (document.activeElement instanceof HTMLInputElement) {
                        document.activeElement.blur();
                      }
                    }}
                    className="max-h-64 overflow-y-auto overscroll-contain"
                  >
                    {suggestions.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setSearchInput(s.name);
                          setAppliedSearch(s.name);
                          setShowSuggestions(false);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-amber-50 transition-colors flex flex-col border-b border-slate-50 last:border-0"
                      >
                        <span className="text-sm font-bold text-slate-900">{s.name}</span>
                        <span className="text-[10px] text-slate-500 font-medium">User: {s.user}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button 
              onClick={handleSearch}
              className="px-6 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-all active:scale-95 whitespace-nowrap"
            >
              Search
            </button>
          </div>

          <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-slate-200 text-[10px] font-black text-slate-600 uppercase tracking-widest shadow-sm">
            <Clock className="w-4 h-4 text-amber-500" />
            Ranked: Most Inactive
          </div>
        </div>

        {filteredInactiveData.length > 0 ? (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left table-auto">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-4 sm:px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Customer Entity</th>
                  <th className="px-4 sm:px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Days Inactive</th>
                  <th className="px-4 sm:px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest w-px whitespace-nowrap">User</th>
                  <th className="px-4 sm:px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInactiveData.map((item) => (
                  <tr key={item.customer} className="hover:bg-amber-50/30 transition-all group">
                    <td className="px-4 sm:px-8 py-6">
                      <div 
                        className="flex flex-col cursor-pointer"
                        onClick={() => handleCustomerClick(item.customer)}
                      >
                        <span className="text-slate-900 font-black text-sm sm:text-base group-hover:text-amber-600 transition-colors decoration-amber-500/30 hover:underline underline-offset-4">{item.customer}</span>
                        <span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Ref: {item.lastOrderId}</span>
                      </div>
                    </td>
                    <td className="px-4 sm:px-8 py-6 text-right">
                      <span className="text-lg sm:text-xl font-black text-slate-900 tabular-nums">
                        {item.daysInactive}d
                      </span>
                    </td>
                    <td className="px-4 sm:px-8 py-6 w-px whitespace-nowrap">
                       <span className="px-4 py-1.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold border border-slate-200 inline-block">
                        {item.user}
                       </span>
                    </td>
                    <td className="px-4 sm:px-8 py-6">
                      <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-amber-500 transition-colors" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-24 text-center">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-10 h-10 text-slate-200" />
            </div>
            <h4 className="text-xl font-black text-slate-800">All Customers Active</h4>
            <p className="text-slate-400 font-medium max-w-sm mx-auto mt-2">Every customer has had an entry within the last 7 days.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default InactiveCustomers;
