import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface AgentChartsProps {
  orders: any[];
}

const NETWORK_COLORS: Record<string, string> = {
  MTN: 'hsl(48, 100%, 50%)',
  Telecel: 'hsl(0, 85%, 50%)',
  AirtelTigo: 'hsl(210, 85%, 45%)',
};

const periodFilters = [
  { label: 'Today', days: 1 },
  { label: '7 Days', days: 7 },
  { label: '30 Days', days: 30 },
  { label: '3 Months', days: 90 },
];

const AgentCharts = ({ orders }: AgentChartsProps) => {
  const [period, setPeriod] = useState(7);

  // Profit over time data
  const profitData = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - period);

    const filtered = orders.filter((o: any) => new Date(o.created_at) >= cutoff);
    const grouped: Record<string, number> = {};

    filtered.forEach((o: any) => {
      const date = new Date(o.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      grouped[date] = (grouped[date] || 0) + Number(o.profit_ghs || 0);
    });

    return Object.entries(grouped).map(([date, profit]) => ({
      date,
      profit: Number(profit.toFixed(2)),
    }));
  }, [orders, period]);

  // Network distribution data
  const networkData = useMemo(() => {
    const counts: Record<string, number> = {};
    orders.forEach((o: any) => {
      counts[o.network] = (counts[o.network] || 0) + 1;
    });
    const total = orders.length || 1;
    return Object.entries(counts).map(([name, value]) => ({
      name,
      value,
      percentage: Math.round((value / total) * 100),
    }));
  }, [orders]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Profit Over Time */}
      <Card className="card-shadow border-border">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm font-bold">Profit Over Time</CardTitle>
            <div className="flex gap-1">
              {periodFilters.map((f) => (
                <button
                  key={f.days}
                  onClick={() => setPeriod(f.days)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors ${
                    period === f.days
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {profitData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
              No data for this period
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={profitData}>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                  formatter={(value: number) => [`GHS ${value.toFixed(2)}`, 'Profit']}
                />
                <Line
                  type="monotone"
                  dataKey="profit"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2.5}
                  dot={{ fill: 'hsl(var(--primary))', r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Network Distribution */}
      <Card className="card-shadow border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold">Orders by Network</CardTitle>
        </CardHeader>
        <CardContent>
          {networkData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
              No order data yet
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={180}>
                <PieChart>
                  <Pie
                    data={networkData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {networkData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={NETWORK_COLORS[entry.name] || 'hsl(var(--muted))'}
                        stroke="none"
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2.5">
                {networkData.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: NETWORK_COLORS[entry.name] || 'hsl(var(--muted))' }}
                    />
                    <span className="text-xs font-medium flex-1">{entry.name}</span>
                    <span className="text-xs font-bold">{entry.percentage}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AgentCharts;
