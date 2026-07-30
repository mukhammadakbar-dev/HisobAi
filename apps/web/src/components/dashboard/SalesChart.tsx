'use client';

import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { SalesDynamicsPoint } from '@baraka/contracts';

interface SalesChartProps {
  data: SalesDynamicsPoint[];
}

export function SalesChart({ data }: SalesChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
        Savdo dinamikasi ma'lumotlari mavjud emas
      </div>
    );
  }

  const formatCurrency = (val: number) => {
    if (val >= 1_000_000) {
      return `${(val / 1_000_000).toFixed(1)}M`;
    }
    if (val >= 1_000) {
      return `${(val / 1_000).toFixed(0)}k`;
    }
    return `${val}`;
  };

  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis
            dataKey="date"
            stroke="#64748b"
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="#64748b"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatCurrency}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#0f172a',
              borderColor: '#1e293b',
              borderRadius: '12px',
              color: '#f8fafc',
              fontSize: '12px',
            }}
            formatter={(value: any) => [`${Number(value).toLocaleString('uz-UZ')} UZS`, 'Aylanma']}
            labelFormatter={(label: any) => `Sana: ${label}`}
          />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="#10b981"
            strokeWidth={3}
            fillOpacity={1}
            fill="url(#salesGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
