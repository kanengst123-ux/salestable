
import React, { useMemo } from 'react';
import { SaleRecord } from '../types';
import { Wallet, TrendingDown, AlertCircle, ChevronRight } from 'lucide-react';

interface CollectionsTableProps {
  data: SaleRecord[];
}

const CollectionsTable: React.FC<CollectionsTableProps> = ({ data }) => {
  const collectionsData = useMemo(() => {
    const now = new Date();
    
    // Logic:
    // EITHER: "Paid" (Column M) is later than current date
    // OR: "Paid" (Column M) = "N" AND simultaneously "F" (Column S) = "F"
    const filtered = data.filter(item => {
      const colMValue = String(item.paidStatus || '').trim();
      const colSValue = String(item.colSValue || '').trim();
      
      // Try to parse Column M as a date for Condition 1
      const mDate = new Date(colMValue);
      const isLaterThanNow = !isNaN(mDate.getTime()) && mDate > now;
      
      // Condition 2: Paid = "N" and Col S = "F"
      const isUnpaidFlag = colMValue.toUpperCase() === 'N';
      const isConditionS = colSValue.toUpperCase() === 'F';
      
      return isLaterThanNow || (isUnpaidFlag && isConditionS);
    });

    // Grouping by customer and keeping track of the user
    const grouped: Record<string, { total: number; user: string }> = {};
    
    filtered.forEach(item => {
      const customer = String(item.customerName || 'Other Entities').trim();
      const amount = Number(item.subtotal) || 0;
      const user = String(item.userName || 'Unknown').trim();
      
      if (!grouped[customer]) {
        grouped[customer] = { total: 0, user: user };
      }
      
      grouped[customer].total += amount;
    });

    // Final array with strict numeric descending sort
    return Object.entries(grouped)
      .map(([customer, stats]) => ({ 
        customer, 
        user: stats.user,
        total: stats.total
      }))
      .filter(item => item.total > 0)
      .sort((a, b) => b.total - a.total); 
  }, [data]);

  const totalOutstanding = collectionsData.reduce((acc, curr) => acc + curr.total, 0);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full">
      {/* KPI Section - Featuring only the primary metric */}
      <div className="grid grid-cols-1 gap-6 w-full">
        <div className="bg-slate-900 text-white p-8 md:p-10 rounded-[2rem] border border-slate-800 shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-10 transform translate-x-4 -translate-y-4 group-hover:translate-x-0 group-hover:translate-y-0 transition-transform">
            <Wallet size={160} />
          </div>
          <div className="relative z-10">
            <p className="text-blue-400 font-bold text-xs uppercase tracking-widest mb-2">Total Outstanding Dues</p>
            <h3 className="text-4xl md:text-6xl font-black tabular-nums">${totalOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
            <div className="mt-6 flex items-center gap-2">
              <span className="px-4 py-1.5 bg-blue-500/20 text-blue-300 text-xs font-bold rounded-xl border border-blue-500/20">Awaiting Portfolio Settlement</span>
              <span className="px-4 py-1.5 bg-slate-800/50 text-slate-400 text-xs font-bold rounded-xl border border-slate-700">
                {collectionsData.length} Accounts Active
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden w-full">
        <div className="p-4 sm:p-8 border-b border-slate-100 bg-slate-50/30 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-black text-slate-900 tracking-tight">Accounts Receivable Breakdown</h3>
            <p className="text-slate-500 text-xs font-medium mt-1">Logic: [Col M &gt; Now] OR [Col M='N' & Col S='F']</p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-slate-200 text-[10px] font-black text-slate-600 uppercase tracking-widest shadow-sm">
            <TrendingDown className="w-4 h-4 text-emerald-500" />
            Ranked: Highest First
          </div>
        </div>

        {collectionsData.length > 0 ? (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left table-auto">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-4 sm:px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Customer Entity</th>
                  <th className="px-4 sm:px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Balance Due</th>
                  <th className="px-4 sm:px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest w-px whitespace-nowrap">User</th>
                  <th className="px-4 sm:px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {collectionsData.map((item, index) => (
                  <tr key={item.customer} className="hover:bg-blue-50/30 transition-all group">
                    <td className="px-4 sm:px-8 py-6">
                      <div className="flex flex-col">
                        <span className="text-slate-900 font-black text-sm sm:text-base group-hover:text-blue-600 transition-colors">{item.customer}</span>
                        <span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Verified Account</span>
                      </div>
                    </td>
                    <td className="px-4 sm:px-8 py-6 text-right">
                      <span className="text-lg sm:text-xl font-black text-slate-900 tabular-nums">
                        ${item.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-4 sm:px-8 py-6 w-px whitespace-nowrap">
                       <span className="px-4 py-1.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold border border-slate-200 inline-block">
                        {item.user}
                       </span>
                    </td>
                    <td className="px-4 sm:px-8 py-6">
                      <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 transition-colors" />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50/80 border-t border-slate-200">
                <tr>
                  <td className="px-8 py-8 text-sm font-black text-slate-500 uppercase tracking-widest">Consolidated Portfolio Total</td>
                  <td className="px-8 py-8 text-right text-3xl font-black text-slate-900 tabular-nums">
                    ${totalOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="w-px"></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="p-24 text-center">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-10 h-10 text-slate-200" />
            </div>
            <h4 className="text-xl font-black text-slate-800">No Matching Records</h4>
            <p className="text-slate-400 font-medium max-w-sm mx-auto mt-2">No records found satisfying the criteria: [Col M &gt; Now] OR [Col M='N' & Col S='F'].</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CollectionsTable;
