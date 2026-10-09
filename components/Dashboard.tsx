
import React from 'react';
import { SalesAnalytics } from '../types';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Cell
} from 'recharts';
import { DollarSign, Users } from 'lucide-react';

interface DashboardProps {
  analytics: SalesAnalytics;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#ec4899'];

const UserSalesChart: React.FC<{ title: string, sub: string, data: Record<string, number> }> = ({ title, sub, data }) => {
  // Fix: Explicitly convert values to Number to avoid TypeScript arithmetic operation errors
  const chartData = Object.entries(data)
    .map(([name, value]) => ({ name, value: Number(value) }))
    .sort((a, b) => Number(b.value) - Number(a.value));

  return (
    <div className="bg-white p-5 md:p-8 rounded-[2rem] border border-slate-100 shadow-sm">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h3 className="font-black text-slate-800 text-sm md:text-lg uppercase tracking-tight">{title}</h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Sum of Subtotal</p>
        </div>
        <span className="text-[10px] font-black px-3 py-1 bg-slate-100 rounded-full text-slate-500 uppercase tracking-widest">{sub}</span>
      </div>
      <div className="h-[250px] md:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 30 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
            <XAxis type="number" hide />
            <YAxis 
              dataKey="name" 
              type="category" 
              stroke="#64748b" 
              fontSize={11} 
              width={60} 
              tickLine={false} 
              axisLine={false} 
              fontVariant="bold"
            />
            <Tooltip 
              cursor={{ fill: '#f8fafc' }}
              contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '16px', color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
              formatter={(value: number) => [`$${value.toLocaleString()}`, 'Subtotal']}
            />
            <Bar dataKey="value" fill="#3b82f6" radius={[0, 10, 10, 0]} barSize={32}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const Dashboard: React.FC<DashboardProps> = ({ analytics }) => {
  // Aggregate daily data for the Revenue Trajectory
  const dailyData = Object.entries(analytics.salesByDay)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, sales]) => ({ 
      date, 
      sales,
      formattedDate: new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    }));

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-700">
      {/* AI Insights Section Removed */}

      {/* Main Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
        {/* Daily Sales Bar Chart */}
        <div className="bg-white p-5 md:p-8 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-black text-slate-800 text-sm md:text-lg uppercase tracking-tight">每天銷售額</h3>
            <span className="text-[10px] font-black px-3 py-1 bg-blue-50 rounded-full text-blue-600 uppercase tracking-widest">Daily Sum (Subtotal)</span>
          </div>
          <div className="h-[250px] md:h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="formattedDate" 
                  stroke="#94a3b8" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                  dy={10}
                  minTickGap={30}
                />
                <YAxis 
                  stroke="#94a3b8" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                  tickFormatter={(val) => `$${val.toLocaleString()}`} 
                />
                <Tooltip 
                  cursor={{ fill: '#f1f5f9' }}
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '16px', color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                  itemStyle={{ color: '#3b82f6' }}
                  formatter={(value: number) => [`$${value.toLocaleString()}`, 'Subtotal Sum']}
                />
                <Bar 
                  dataKey="sales" 
                  fill="#3b82f6" 
                  radius={[6, 6, 0, 0]} 
                  barSize={dailyData.length > 50 ? undefined : 20}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Market Strength (Sales 銷售額) - Past 7 Days */}
        <UserSalesChart 
          title="Sales 銷售額 (7D)" 
          sub="Last 7 Days" 
          data={analytics.userSalesPastWeek} 
        />

        {/* Market Strength (Sales 銷售額) - Past 30 Days */}
        <UserSalesChart 
          title="Sales 銷售額 (30D)" 
          sub="Last 30 Days" 
          data={analytics.userSalesPast30Days} 
        />
      </div>
    </div>
  );
};

export default Dashboard;
