
import React, { useState, useEffect, useMemo } from 'react';
import { fetchCustomerGrades, UPDATE_SCRIPT_URL, addCustomerToSheet } from '../services/dataService';
import { Users, Save, CheckCircle2, Loader2, AlertCircle, UserPlus, X } from 'lucide-react';
import { Customer } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface CustomerGradesProps {
  onCustomerAdded?: (name: string) => void;
}

const CustomerGrades: React.FC<CustomerGradesProps> = ({ onCustomerAdded }) => {
  const [data, setData] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSales, setSelectedSales] = useState<string>('EVA');
  const [tempGrades, setTempGrades] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success'>('idle');

  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerDistrict, setNewCustomerDistrict] = useState('九龍東');
  const [newCustomerGrade, setNewCustomerGrade] = useState<'A' | 'B' | 'C'>('C');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const salesPeople = ['EVA', 'KATIE', 'YO', 'KASEY'];
  const districts = ['新界東', '新界西', '九龍東', '九龍西', '港島'];

  useEffect(() => {
    const loadGrades = async () => {
      setLoading(true);
      const grades = await fetchCustomerGrades();
      
      const initialTemp: Record<string, string> = {};
      grades.forEach(item => {
        initialTemp[item.name] = item.grade;
      });
      
      setData(grades);
      setTempGrades(initialTemp);
      setLoading(false);
    };
    loadGrades();
  }, []);

  const filteredItems = useMemo(() => {
    const salesFilter = selectedSales.toUpperCase();
    
    // 1. Filter by sales person
    const filtered = data.filter(item => {
      const salesVal = (item?.sales || (item as any)?.user || '').toString().trim().toUpperCase();
      return salesVal === salesFilter;
    });
    
    // 2. Sort the data
    return filtered.sort((a, b) => {
      const gradeA = a.grade?.trim() || '';
      const gradeB = b.grade?.trim() || '';
      
      // Secondary sort by name
      if (a.name < b.name) return -1;
      if (a.name > b.name) return 1;
      return 0;
    });
  }, [data, selectedSales]);

  const handleGradeChange = (customer: string, grade: string) => {
    setTempGrades(prev => ({
      ...prev,
      [customer]: grade
    }));
  };

  const handleSave = async () => {
    setSaveStatus('saving');
    
    try {
      // Create a payload with current selections
      await fetch(UPDATE_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors', 
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(tempGrades)
      });
      
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (error) {
      console.error('Save failed:', error);
      setSaveStatus('idle');
      alert('Failed to connect to Google Script. Check your internet connection or deployment settings.');
    }
  };

  const handleAddCustomerConfirm = async () => {
    if (!newCustomerName.trim() || !selectedSales) return;
    setIsSubmitting(true);
    const addedCustomerName = newCustomerName.trim();
    try {
      const success = await addCustomerToSheet(addedCustomerName, selectedSales, newCustomerDistrict, newCustomerGrade);
      if (success) {
        // Refresh customer list
        setLoading(true);
        const customerData = await fetchCustomerGrades();
        setData(customerData);
        
        const initialTemp: Record<string, string> = {};
        customerData.forEach(item => {
          initialTemp[item.name] = item.grade;
        });
        setTempGrades(initialTemp);
        setLoading(false);

        setNewCustomerName('');
        setShowAddCustomerModal(false);
        alert('客戶已成功添加！');
        
        if (onCustomerAdded) {
          onCustomerAdded(addedCustomerName);
        }
      }
    } catch (error) {
      console.error('Failed to add customer:', error);
      alert('添加客戶失敗，請重試。');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-slate-400">
        <Loader2 className="w-10 h-10 animate-spin mb-4" />
        <p className="font-bold uppercase tracking-widest text-[10px]">Loading Customer Grades...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Top Controls */}
      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 w-full md:w-auto">
          {salesPeople.map(person => (
            <button
              key={person}
              onClick={() => setSelectedSales(person)}
              className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-xs font-black tracking-widest transition-all border ${
                selectedSales === person 
                ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-600/20' 
                : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {person}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <button
            onClick={() => {
              setNewCustomerDistrict('九龍東');
              setNewCustomerGrade('C');
              setNewCustomerName('');
              setShowAddCustomerModal(true);
            }}
            className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black tracking-widest transition-all border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 shadow-sm active:scale-95"
          >
            <UserPlus className="w-4 h-4 text-slate-500" />
            新增客戶
          </button>

          <button
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            className={`flex items-center justify-center gap-2 px-8 py-2.5 rounded-xl text-xs font-black tracking-widest transition-all shadow-lg active:scale-95 ${
              saveStatus === 'success' 
              ? 'bg-emerald-500 text-white shadow-emerald-500/20 w-full' 
              : 'bg-slate-900 text-white shadow-slate-900/20 hover:bg-slate-800 w-full'
            }`}
          >
            {saveStatus === 'saving' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saveStatus === 'success' ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saveStatus === 'success' ? 'GRADES SAVED' : 'SAVE CHANGES'}
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left table-auto">
            <thead className="bg-slate-50/50 border-b border-slate-100">
              <tr>
                <th className="px-4 md:px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Customer</th>
                <th className="px-2 md:px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-12 md:w-24">A</th>
                <th className="px-2 md:px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-12 md:w-24">B</th>
                <th className="px-2 md:px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-12 md:w-24">C</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 md:px-8 py-20 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-3">
                      <Users className="w-10 h-10 opacity-20" />
                      <p className="text-xs font-bold uppercase tracking-widest">No customers found for {selectedSales}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-4 md:px-8 py-4 md:py-6">
                      <span className="text-slate-900 font-bold text-sm md:text-base leading-tight block line-clamp-2 md:line-clamp-none">{item.name}</span>
                    </td>
                    {['A', 'B', 'C'].map(grade => (
                      <td key={grade} className="px-1 md:px-8 py-4 md:py-6 text-center">
                        <button
                          onClick={() => handleGradeChange(item.name, grade)}
                          className={`w-8 h-8 md:w-10 md:h-10 rounded-full border-2 transition-all flex items-center justify-center mx-auto ${
                            tempGrades[item.name] === grade
                            ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-600/20 scale-105 md:scale-110'
                            : 'bg-white border-slate-200 text-slate-300 hover:border-slate-300'
                          }`}
                        >
                          {tempGrades[item.name] === grade ? <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5" /> : <span className="font-bold text-[10px] md:text-xs uppercase">{grade}</span>}
                        </button>
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-4 flex items-start gap-4">
        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-xs font-bold text-emerald-900 uppercase tracking-widest">Connected to Google Sheets</p>
          <p className="text-[11px] text-emerald-700 leading-relaxed font-medium">
            This tab is synced with your master Google Sheet. Clicking "Save" will instantly update Category (Col C) for the selected customers.
          </p>
        </div>
      </div>

      {/* Add Customer Modal */}
      <AnimatePresence>
        {showAddCustomerModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddCustomerModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-blue-100 rounded-2xl">
                  <UserPlus className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Add New Customer</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Adding to customer_cat via {selectedSales}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Customer Name</label>
                  <input 
                    type="text"
                    autoFocus
                    placeholder="Enter customer name..."
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-bold"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">District / 區域</label>
                  <div className="grid grid-cols-3 gap-2">
                    {districts.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setNewCustomerDistrict(d)}
                        className={`py-2 px-1 rounded-xl text-xs font-black transition-all border ${
                          newCustomerDistrict === d
                            ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-600/10'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Customer Grade / 客戶級別</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['A', 'B', 'C'] as const).map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setNewCustomerGrade(g)}
                        className={`py-2 px-1 rounded-xl text-xs font-black transition-all border ${
                          newCustomerGrade === g
                            ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-600/10'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {g} 級
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setShowAddCustomerModal(false)}
                    className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-slate-500 font-bold text-xs hover:bg-slate-50 transition-colors"
                  >
                    CANCEL
                  </button>
                  <button 
                    onClick={handleAddCustomerConfirm}
                    disabled={isSubmitting || !newCustomerName.trim()}
                    className="flex-1 px-4 py-3 rounded-xl bg-blue-600 text-white text-xs font-black hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSubmitting && <Loader2 className="w-3 h-3 animate-spin" />}
                    CONFIRM
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CustomerGrades;
