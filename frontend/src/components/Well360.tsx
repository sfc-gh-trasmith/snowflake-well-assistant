import { useState, useMemo, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, Legend,
} from 'recharts';
import {
  Activity, Droplets, Flame, TrendingDown, AlertTriangle, Wrench,
  ChevronDown, ChevronRight, ChevronUp, MessageSquareText, Send, ArrowLeft,
  Layers, Gauge, Calendar, DollarSign, Clock, Zap, Loader2, Database, Brain,
  Sparkles,
} from 'lucide-react';
import { Well } from '../types';
import { streamChatMessage, fetchWellProductionForecast, WellProductionForecast } from '../api/wells';

interface InlineChatMessage {
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  sql?: string;
}

interface Well360Props {
  wells: Well[];
}

export default function Well360({ wells }: Well360Props) {
  const [selectedField, setSelectedField] = useState<string>('');
  const [selectedWell, setSelectedWell] = useState<Well | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<InlineChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'production' | 'maintenance' | 'wellbore' | 'chemicals'>('production');

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const fields = useMemo(() => {
    const fieldSet = new Set(wells.map(w => w.field));
    return Array.from(fieldSet).sort();
  }, [wells]);

  const fieldWells = useMemo(() => {
    if (!selectedField) return wells;
    return wells.filter(w => w.field === selectedField);
  }, [wells, selectedField]);

  const fieldStats = useMemo(() => {
    const fw = fieldWells;
    const active = fw.filter(w => w.status === 'ACTIVE').length;
    const shutIn = fw.filter(w => w.status === 'SHUT-IN').length;
    const red = fw.filter(w => w.health_status === 'RED').length;
    const orange = fw.filter(w => w.health_status === 'ORANGE').length;
    return { total: fw.length, active, shutIn, red, orange };
  }, [fieldWells]);

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;
    const query = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: query }]);
    setIsChatLoading(true);

    let textSoFar = '';
    let thinkingSoFar = '';
    let sqlFound = '';
    setChatMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      const context = selectedWell ? selectedWell.well_name : (selectedField || undefined);
      const history = chatMessages.map(m => ({ role: m.role, content: m.content }));

      await streamChatMessage(
        query,
        (event) => {
          if (event.type === 'text_delta') {
            textSoFar += event.text || '';
            setChatMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: 'assistant',
                content: textSoFar,
                thinking: thinkingSoFar || undefined,
                sql: sqlFound || undefined,
              };
              return updated;
            });
          } else if (event.type === 'thinking_delta') {
            thinkingSoFar += event.text || '';
            setChatMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                thinking: thinkingSoFar,
              };
              return updated;
            });
          } else if (event.type === 'tool_result' && event.sql && !sqlFound) {
            sqlFound = event.sql;
            setChatMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                sql: sqlFound,
              };
              return updated;
            });
          } else if (event.type === 'error') {
            setChatMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: 'assistant', content: event.message || 'An error occurred.' };
              return updated;
            });
          }
        },
        context,
        history,
      );

      if (!textSoFar) {
        setChatMessages(prev => {
          const updated = [...prev];
          if (!updated[updated.length - 1].content) {
            updated[updated.length - 1] = { role: 'assistant', content: 'No response received.' };
          }
          return updated;
        });
      }
    } catch {
      setChatMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' };
        return updated;
      });
    } finally {
      setIsChatLoading(false);
    }
  };

  if (selectedWell) {
    return (
      <WellDrilldown
        well={selectedWell}
        onBack={() => setSelectedWell(null)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Well 360</h1>
              <p className="text-sm text-gray-500 mt-0.5">Field production insights and well-level analysis</p>
            </div>
            <div className="relative">
              <select
                value={selectedField}
                onChange={e => setSelectedField(e.target.value)}
                className="appearance-none bg-white pl-4 pr-10 py-2.5 rounded-lg border border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#29B5E8] focus:border-transparent shadow-sm min-w-[180px]"
              >
                <option value="">All Fields</option>
                {fields.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
            <KpiCard icon={<Activity className="w-4 h-4" />} label="Total Wells" value={fieldStats.total} color="blue" />
            <KpiCard icon={<Zap className="w-4 h-4" />} label="Active" value={fieldStats.active} color="green" />
            <KpiCard icon={<Clock className="w-4 h-4" />} label="Shut-In" value={fieldStats.shutIn} color="gray" />
            <KpiCard icon={<AlertTriangle className="w-4 h-4" />} label="Critical" value={fieldStats.red} color="red" />
            <KpiCard icon={<TrendingDown className="w-4 h-4" />} label="At Risk" value={fieldStats.orange} color="orange" />
            <KpiCard icon={<Droplets className="w-4 h-4" />} label="Avg Health" value={Math.round(fieldWells.reduce((s, w) => s + (w.health_score || 0), 0) / (fieldWells.length || 1))} color="purple" suffix="/100" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-500" />
                Production Summary
              </h3>
              <div className="space-y-3">
                <MetricRow label="Avg Oil Rate" value="~450 BBL/day" trend="-3.2%" />
                <MetricRow label="Avg Gas Rate" value="~2,100 MCF/day" trend="-1.8%" />
                <MetricRow label="Avg Water Cut" value="~42%" trend="+2.1%" />
                <MetricRow label="Total Runtime" value="~22 hrs/day" trend="+0.5%" />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                Recent Failures
              </h3>
              <div className="space-y-2.5">
                <FailureRow well="University 4H" issue="ESP motor failure" daysAgo={3} />
                <FailureRow well="Bass 7H" issue="Tubing leak at 6200ft" daysAgo={5} />
                <FailureRow well="Wheeler 2H" issue="VSD drive failure" daysAgo={8} />
                <FailureRow well="Hart 11H" issue="Rod parting" daysAgo={12} />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Wrench className="w-4 h-4 text-blue-500" />
                Upcoming Workovers
              </h3>
              <div className="space-y-2.5">
                <WorkoverRow well="Clayton 3H" type="ESP Replacement" date="Jul 18" />
                <WorkoverRow well="Parker 9H" type="Recompletion" date="Jul 22" />
                <WorkoverRow well="Mitchell 1H" type="Zone Isolation" date="Jul 28" />
                <WorkoverRow well="Johnson 6H" type="Convert to Gas Lift" date="Aug 3" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-amber-500" />
                Decline Curve (Field Avg)
              </h3>
              <div className="h-40 flex items-end gap-0.5">
                {Array.from({ length: 24 }, (_, i) => {
                  const height = Math.max(15, 100 * Math.exp(-0.06 * i) + Math.random() * 8);
                  return (
                    <div key={i} className="flex-1 bg-gradient-to-t from-[#29B5E8] to-[#29B5E8]/40 rounded-t" style={{ height: `${height}%` }} />
                  );
                })}
              </div>
              <div className="flex justify-between mt-2 text-[10px] text-gray-400">
                <span>Jan 2025</span>
                <span>Jul 2025</span>
                <span>Jan 2026</span>
                <span>Jul 2026</span>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Gauge className="w-4 h-4 text-purple-500" />
                Health Distribution
              </h3>
              <div className="flex items-end gap-6 h-40 px-4">
                <HealthBar label="Healthy" count={fieldWells.filter(w => w.health_status === 'GREEN').length} total={fieldWells.length} color="#22c55e" />
                <HealthBar label="Warning" count={fieldWells.filter(w => w.health_status === 'YELLOW').length} total={fieldWells.length} color="#f59e0b" />
                <HealthBar label="At Risk" count={fieldWells.filter(w => w.health_status === 'ORANGE').length} total={fieldWells.length} color="#f97316" />
                <HealthBar label="Critical" count={fieldWells.filter(w => w.health_status === 'RED').length} total={fieldWells.length} color="#ef4444" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Wells ({fieldWells.length})</h3>
              <p className="text-xs text-gray-400">Click a well to drill down</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <th className="px-5 py-3 font-medium text-gray-500 text-xs">Well Name</th>
                    <th className="px-5 py-3 font-medium text-gray-500 text-xs">API</th>
                    <th className="px-5 py-3 font-medium text-gray-500 text-xs">Formation</th>
                    <th className="px-5 py-3 font-medium text-gray-500 text-xs">Status</th>
                    <th className="px-5 py-3 font-medium text-gray-500 text-xs">Health</th>
                    <th className="px-5 py-3 font-medium text-gray-500 text-xs">County</th>
                    <th className="px-5 py-3 font-medium text-gray-500 text-xs"></th>
                  </tr>
                </thead>
                <tbody>
                  {fieldWells.slice(0, 50).map(well => (
                    <tr
                      key={well.api_no}
                      onClick={() => setSelectedWell(well)}
                      className="border-b border-gray-50 hover:bg-blue-50/50 cursor-pointer transition-colors"
                    >
                      <td className="px-5 py-3 font-medium text-gray-900">{well.well_name}</td>
                      <td className="px-5 py-3 text-gray-500 font-mono text-xs">{well.api_no}</td>
                      <td className="px-5 py-3 text-gray-600">{well.formation}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          well.status === 'ACTIVE' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
                        }`}>{well.status}</span>
                      </td>
                      <td className="px-5 py-3">
                        {well.health_score !== undefined && (
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{
                              backgroundColor: well.health_status === 'GREEN' ? '#22c55e' : well.health_status === 'YELLOW' ? '#f59e0b' : well.health_status === 'ORANGE' ? '#f97316' : '#ef4444'
                            }} />
                            <span className="text-xs font-medium">{well.health_score}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3 text-gray-500">{well.county}</td>
                      <td className="px-5 py-3">
                        <ChevronRight className="w-4 h-4 text-gray-300" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="w-[340px] border-l border-gray-200 bg-white flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#29B5E8] flex items-center justify-center">
              <MessageSquareText className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Field Assistant</h3>
              <p className="text-xs text-gray-400">Ask about production & operations</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {chatMessages.length === 0 && (
            <div className="text-center py-8">
              <MessageSquareText className="w-8 h-8 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400">Ask questions about your field or wells</p>
              <div className="mt-4 space-y-2">
                {['What is the total oil production this month?', 'Which wells have declining rates?', 'Show me wells with high water cut'].map(q => (
                  <button
                    key={q}
                    onClick={() => { setChatInput(q); }}
                    className="block w-full text-left text-xs text-gray-500 hover:text-[#29B5E8] hover:bg-blue-50 px-3 py-2 rounded-lg transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {chatMessages.map((msg, i) => (
            <InlineChatBubble key={i} msg={msg} isLastLoading={isChatLoading && i === chatMessages.length - 1} />
          ))}
          <div ref={chatEndRef} />
        </div>

        <form onSubmit={handleChatSubmit} className="p-3 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder="Ask about this field..."
              disabled={isChatLoading}
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#29B5E8] focus:border-transparent disabled:bg-gray-50"
            />
            <button type="submit" disabled={isChatLoading} className="p-2 bg-[#29B5E8] text-white rounded-lg hover:bg-[#1a9fd4] transition-colors disabled:opacity-50">
              {isChatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function WellDrilldown({ well, onBack, activeTab, setActiveTab }: {
  well: Well;
  onBack: () => void;
  activeTab: string;
  setActiveTab: (tab: 'production' | 'maintenance' | 'wellbore' | 'chemicals') => void;
}) {
  const [forecastData, setForecastData] = useState<WellProductionForecast | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);

  useEffect(() => {
    if (!well.api_no) return;
    setForecastLoading(true);
    fetchWellProductionForecast(well.api_no)
      .then(setForecastData)
      .catch(() => setForecastData(null))
      .finally(() => setForecastLoading(false));
  }, [well.api_no]);

  // Build combined chart data: historical monthly + forecast daily
  const chartData = useMemo(() => {
    if (!forecastData) return [];
    const points: Array<{
      date: string; label: string; actual: number | null;
      p50: number | null; p10: number | null; p90: number | null; isForecast: boolean;
    }> = [];

    for (const h of forecastData.historical) {
      points.push({
        date: h.month,
        label: new Date(h.month).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        actual: h.avg_oil,
        p50: null, p10: null, p90: null,
        isForecast: false,
      });
    }

    // Aggregate forecast to monthly for smooth continuity
    const byMonth: Record<string, { p50: number[]; p10: number[]; p90: number[] }> = {};
    for (const f of forecastData.forecast) {
      const m = f.forecast_date.slice(0, 7) + '-01';
      if (!byMonth[m]) byMonth[m] = { p50: [], p10: [], p90: [] };
      byMonth[m].p50.push(f.p50);
      byMonth[m].p10.push(f.p10);
      byMonth[m].p90.push(f.p90);
    }
    const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
    for (const [m, v] of Object.entries(byMonth).sort()) {
      points.push({
        date: m,
        label: new Date(m).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        actual: null,
        p50: avg(v.p50), p10: avg(v.p10), p90: avg(v.p90),
        isForecast: true,
      });
    }

    return points;
  }, [forecastData]);

  // Current stats from last historical month
  const lastActual = forecastData?.historical.length
    ? forecastData.historical[forecastData.historical.length - 1]
    : undefined;
  const currentOil = lastActual ? Math.round(lastActual.avg_oil) : null;
  const currentGas = lastActual ? Math.round(lastActual.avg_gas) : null;
  const currentWaterCut = (lastActual && lastActual.avg_oil + lastActual.avg_water > 0)
    ? Math.round((lastActual.avg_water / (lastActual.avg_oil + lastActual.avg_water)) * 100)
    : null;
  const currentRuntime = lastActual ? lastActual.avg_runtime : null;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Field View
        </button>

        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{well.well_name}</h2>
              <p className="text-sm text-gray-500 mt-0.5">{well.api_no} • {well.field} Field • {well.county} County</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                well.status === 'ACTIVE' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
              }`}>{well.status}</span>
              {well.health_score !== undefined && (
                <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg">
                  <div className="w-3 h-3 rounded-full" style={{
                    backgroundColor: well.health_status === 'GREEN' ? '#22c55e' : well.health_status === 'YELLOW' ? '#f59e0b' : well.health_status === 'ORANGE' ? '#f97316' : '#ef4444'
                  }} />
                  <span className="text-sm font-bold">{well.health_score}</span>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-5">
            <DetailItem label="Formation" value={well.formation} />
            <DetailItem label="TVD" value={well.tvd_ft ? `${well.tvd_ft.toLocaleString()} ft` : '—'} />
            <DetailItem label="Lateral" value={well.lateral_length_ft ? `${well.lateral_length_ft.toLocaleString()} ft` : '—'} />
            <DetailItem label="Operator" value={well.operator} />
            <DetailItem label="County" value={well.county} />
          </div>
        </div>

        <div className="flex gap-1 mb-4 bg-white rounded-lg border border-gray-200 p-1 w-fit">
          {([
            { id: 'production', label: 'Production', icon: <Flame className="w-3.5 h-3.5" /> },
            { id: 'maintenance', label: 'Maintenance', icon: <Wrench className="w-3.5 h-3.5" /> },
            { id: 'wellbore', label: 'Wellbore', icon: <Layers className="w-3.5 h-3.5" /> },
            { id: 'chemicals', label: 'Chemicals & Lift', icon: <Droplets className="w-3.5 h-3.5" /> },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab.id ? 'bg-[#29B5E8] text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'production' && (
          <div className="space-y-4">
            {/* Real stat cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <StatCard
                label="Current Oil"
                value={currentOil !== null ? currentOil.toLocaleString() : '—'}
                unit="BBL/day"
                change={forecastLoading ? '...' : (currentOil && forecastData?.forecast[0] ? `→ ${Math.round(forecastData.forecast[0].p50).toLocaleString()} forecast` : '')}
              />
              <StatCard
                label="Current Gas"
                value={currentGas !== null ? currentGas.toLocaleString() : '—'}
                unit="MCF/day"
                change=""
              />
              <StatCard
                label="Water Cut"
                value={currentWaterCut !== null ? String(currentWaterCut) : '—'}
                unit="%"
                change=""
              />
              <StatCard
                label="Runtime"
                value={currentRuntime !== null ? String(currentRuntime) : '—'}
                unit="hrs/day"
                change=""
              />
            </div>

            {/* Production history + forecast chart */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-700">Production History &amp; Forecast</h3>
                {forecastData?.has_forecast && (
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[#29B5E8] bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full">
                    <Sparkles className="w-3 h-3" />
                    Snowflake ML.FORECAST — 90-day P10/P50/P90
                  </div>
                )}
              </div>

              {forecastLoading ? (
                <div className="h-56 flex items-center justify-center text-gray-400 text-sm gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading production data...
                </div>
              ) : chartData.length === 0 ? (
                <div className="h-56 flex items-center justify-center text-gray-400 text-sm">
                  No production data available
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={v => `${(v / 1000).toFixed(1)}k`}
                      width={36}
                    />
                    <Tooltip
                      contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
                      formatter={(value, name) => {
                        const n = String(name ?? '');
                        if (n === 'band' || n === 'p10') return ['', ''];
                        const labels: Record<string, string> = {
                          actual: 'Actual avg (BBL/day)',
                          p50: 'Forecast P50 (BBL/day)',
                          p90: 'Forecast P90 (BBL/day)',
                        };
                        const num = typeof value === 'number' ? value.toLocaleString() : '—';
                        return [num, labels[n] || n];
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                      formatter={(value) =>
                        value === 'actual' ? 'Historical (avg BBL/day)'
                        : value === 'p50' ? 'Forecast P50'
                        : value === 'band' ? 'P10–P90 Confidence'
                        : value
                      }
                    />
                    {/* P10-P90 confidence band */}
                    <Area
                      dataKey="p90"
                      name="band"
                      fill="#dbeafe"
                      stroke="none"
                      legendType="rect"
                      connectNulls
                    />
                    <Area
                      dataKey="p10"
                      fill="#ffffff"
                      stroke="none"
                      legendType="none"
                      connectNulls
                    />
                    {/* Actual line */}
                    <Line
                      dataKey="actual"
                      name="actual"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={false}
                      connectNulls={false}
                    />
                    {/* Forecast P50 */}
                    <Line
                      dataKey="p50"
                      name="p50"
                      stroke="#29B5E8"
                      strokeWidth={2}
                      strokeDasharray="5 3"
                      dot={false}
                      connectNulls
                    />
                    {/* Today reference line */}
                    <ReferenceLine
                      x={new Date().toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
                      stroke="#9ca3af"
                      strokeDasharray="3 3"
                      label={{ value: 'Today', position: 'insideTopRight', fontSize: 9, fill: '#9ca3af' }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}

        {activeTab === 'maintenance' && (
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">Maintenance & Event History</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {[
                { date: '2026-06-28', type: 'MAINTENANCE', desc: 'Routine ESP diagnostic and vibration analysis', cost: '$4,200', duration: '6 hrs' },
                { date: '2026-06-15', type: 'CHEMICAL_TREATMENT', desc: 'Scale inhibitor squeeze treatment, 500 gal', cost: '$8,500', duration: '12 hrs' },
                { date: '2026-05-22', type: 'FAILURE', desc: 'Electrical cable failure on ESP causing intermittent power loss', cost: '$85,000', duration: '72 hrs' },
                { date: '2026-04-10', type: 'INSPECTION', desc: 'Annual casing inspection using electromagnetic tool', cost: '$12,000', duration: '8 hrs' },
                { date: '2026-03-01', type: 'WORKOVER', desc: 'Pulled and replaced ESP with higher capacity unit', cost: '$320,000', duration: '120 hrs' },
                { date: '2025-12-15', type: 'STIMULATION', desc: 'Refrac operation, 25 stages with diverter', cost: '$1,200,000', duration: '168 hrs' },
              ].map((evt, i) => (
                <div key={i} className="px-5 py-3 flex items-start gap-4">
                  <div className="text-xs text-gray-400 w-20 flex-shrink-0 pt-0.5">{evt.date}</div>
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                    evt.type === 'FAILURE' ? 'bg-red-500' : evt.type === 'WORKOVER' ? 'bg-purple-500' : evt.type === 'STIMULATION' ? 'bg-orange-500' : evt.type === 'MAINTENANCE' ? 'bg-blue-500' : 'bg-gray-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800">{evt.desc}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-gray-400 flex items-center gap-1"><DollarSign className="w-3 h-3" />{evt.cost}</span>
                      <span className="text-xs text-gray-400 flex items-center gap-1"><Clock className="w-3 h-3" />{evt.duration}</span>
                      <span className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded ${
                        evt.type === 'FAILURE' ? 'bg-red-50 text-red-600' : evt.type === 'WORKOVER' ? 'bg-purple-50 text-purple-600' : 'bg-gray-50 text-gray-500'
                      }`}>{evt.type.replace('_', ' ')}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'wellbore' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Wellbore Diagram</h3>
              <div className="relative h-[400px] flex justify-center">
                <div className="relative w-24">
                  <div className="absolute inset-x-0 top-0 h-8 bg-gray-700 rounded-t-lg flex items-center justify-center">
                    <span className="text-[9px] text-white font-medium">Wellhead</span>
                  </div>
                  <div className="absolute inset-x-2 top-8 bottom-20 border-2 border-gray-400 bg-gradient-to-b from-gray-100 to-gray-200">
                    <div className="absolute inset-x-1 top-[20%] h-px bg-blue-400" />
                    <div className="absolute -left-6 top-[20%] text-[8px] text-blue-600 font-medium">Surface Csg</div>
                    <div className="absolute inset-x-1 top-[45%] h-px bg-green-500" />
                    <div className="absolute -left-6 top-[45%] text-[8px] text-green-600 font-medium">Prod Csg</div>
                    <div className="absolute inset-x-3 top-[50%] bottom-2 border border-amber-400 bg-amber-50/50">
                      <div className="absolute -right-10 top-1 text-[8px] text-amber-600 font-medium">Tubing</div>
                    </div>
                    <div className="absolute inset-x-0 bottom-0 h-[15%] bg-gradient-to-b from-transparent to-orange-200 border-t border-dashed border-orange-400">
                      <div className="absolute -left-8 top-0 text-[8px] text-orange-600 font-medium">Perfs</div>
                    </div>
                  </div>
                  <div className="absolute inset-x-4 bottom-8 h-12 bg-purple-100 border border-purple-300 rounded flex items-center justify-center">
                    <span className="text-[8px] text-purple-700 font-medium">ESP</span>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 h-6 bg-amber-700 rounded-b flex items-center justify-center">
                    <span className="text-[8px] text-white">TD</span>
                  </div>
                </div>
                <div className="absolute right-4 top-4 text-xs text-gray-500 space-y-1.5">
                  <p><span className="font-medium">TVD:</span> {well.tvd_ft?.toLocaleString() || '—'} ft</p>
                  <p><span className="font-medium">MD:</span> — ft</p>
                  <p><span className="font-medium">Lateral:</span> {well.lateral_length_ft?.toLocaleString() || '—'} ft</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Completion Details</h3>
                <div className="space-y-2.5 text-sm">
                  <CompletionRow label="Completion Date" value="Sep 2024" />
                  <CompletionRow label="Frac Stages" value="38" />
                  <CompletionRow label="Proppant" value="14.2M lbs (100 mesh + 40/70)" />
                  <CompletionRow label="Fluid Volume" value="312K BBL slickwater" />
                  <CompletionRow label="Cluster Spacing" value="25 ft" />
                  <CompletionRow label="Stage Spacing" value="200 ft" />
                  <CompletionRow label="Perf Interval" value="9,600 - 10,100 ft MD" />
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Casing Program</h3>
                <div className="space-y-2.5 text-sm">
                  <CompletionRow label="Surface" value='13-3/8" @ 1,200 ft' />
                  <CompletionRow label="Intermediate" value='9-5/8" @ 8,500 ft' />
                  <CompletionRow label="Production" value='5-1/2" @ TD' />
                  <CompletionRow label="Liner" value='4-1/2" (lateral)' />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'chemicals' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Artificial Lift Details</h3>
              <div className="space-y-2.5 text-sm">
                <CompletionRow label="Lift Type" value="ESP (Electric Submersible Pump)" />
                <CompletionRow label="Pump Model" value="DN2150 (215 stages)" />
                <CompletionRow label="Motor HP" value="250 HP" />
                <CompletionRow label="Set Depth" value="9,400 ft MD" />
                <CompletionRow label="Design Rate" value="1,500 BPD" />
                <CompletionRow label="Operating Freq" value="52 Hz" />
                <CompletionRow label="Install Date" value="Mar 2026" />
                <CompletionRow label="Days on Pump" value="128" />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Chemical Program</h3>
              <div className="space-y-3">
                {[
                  { chemical: 'Scale Inhibitor', type: 'DTPA-based', method: 'Continuous injection', rate: '2 gal/day' },
                  { chemical: 'Corrosion Inhibitor', type: 'Filming amine', method: 'Batch (weekly)', rate: '5 gal/batch' },
                  { chemical: 'Demulsifier', type: 'Polyester-based', method: 'Continuous injection', rate: '1 gal/day' },
                  { chemical: 'Biocide', type: 'THPS', method: 'Batch (monthly)', rate: '20 gal/batch' },
                  { chemical: 'Paraffin Solvent', type: 'Aromatic blend', method: 'As needed', rate: 'Hot oil quarterly' },
                ].map((chem, i) => (
                  <div key={i} className="flex items-start gap-3 pb-3 border-b border-gray-50 last:border-0 last:pb-0">
                    <div className="w-2 h-2 rounded-full bg-[#29B5E8] mt-1.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-gray-800 text-sm">{chem.chemical}</p>
                      <p className="text-xs text-gray-500">{chem.type} • {chem.method} • {chem.rate}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InlineChatBubble({ msg, isLastLoading }: { msg: InlineChatMessage; isLastLoading: boolean }) {
  const [showThinking, setShowThinking] = useState(false);
  const [showSql, setShowSql] = useState(false);
  const isUser = msg.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
        isUser ? 'bg-[#29B5E8] text-white' : 'bg-gray-100 text-gray-700'
      }`}>
        {!isUser && msg.thinking && (
          <div className="mb-1.5">
            <button
              onClick={() => setShowThinking(!showThinking)}
              className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800"
            >
              <Brain className="w-3 h-3" />
              {showThinking ? 'Hide thinking' : 'Show thinking'}
              {showThinking ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {showThinking && (
              <div className="mt-1 p-2 bg-purple-50 border border-purple-100 rounded text-xs text-purple-800 whitespace-pre-wrap max-h-36 overflow-y-auto">
                {msg.thinking}
              </div>
            )}
          </div>
        )}

        {msg.content ? (
          isUser ? (
            msg.content
          ) : (
            <div className="prose prose-sm max-w-none prose-p:my-1 prose-li:my-0.5 prose-table:text-xs prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1 prose-th:bg-gray-200 prose-tr:border-b prose-tr:border-gray-200">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
            </div>
          )
        ) : (isLastLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
        ) : '')}

        {!isUser && msg.sql && (
          <div className="mt-1.5">
            <button
              onClick={() => setShowSql(!showSql)}
              className="flex items-center gap-1 text-xs text-[#29B5E8] hover:text-[#1a9fd4]"
            >
              <Database className="w-3 h-3" />
              {showSql ? 'Hide SQL' : 'View SQL'}
              {showSql ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {showSql && (
              <pre className="mt-1 p-2 bg-gray-900 text-green-400 text-xs rounded overflow-x-auto">
                {msg.sql}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, color, suffix }: { icon: React.ReactNode; label: string; value: number; color: string; suffix?: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    gray: 'bg-gray-100 text-gray-600',
    red: 'bg-red-50 text-red-600',
    orange: 'bg-orange-50 text-orange-600',
    purple: 'bg-purple-50 text-purple-600',
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${colorMap[color]}`}>{icon}</div>
      <p className="text-xl font-bold text-gray-900">{value}{suffix}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function MetricRow({ label, value, trend }: { label: string; value: string; trend: string }) {
  const isNegative = trend.startsWith('-');
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-600">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-900">{value}</span>
        <span className={`text-xs font-medium ${isNegative ? 'text-red-500' : 'text-amber-500'}`}>{trend}</span>
      </div>
    </div>
  );
}

function FailureRow({ well, issue, daysAgo }: { well: string; issue: string; daysAgo: number }) {
  return (
    <div className="flex items-start gap-2">
      <div className="w-2 h-2 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
      <div>
        <p className="text-sm text-gray-800 font-medium">{well}</p>
        <p className="text-xs text-gray-500">{issue} • {daysAgo}d ago</p>
      </div>
    </div>
  );
}

function WorkoverRow({ well, type, date }: { well: string; type: string; date: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-start gap-2">
        <Calendar className="w-3.5 h-3.5 text-gray-400 mt-0.5" />
        <div>
          <p className="text-sm text-gray-800 font-medium">{well}</p>
          <p className="text-xs text-gray-500">{type}</p>
        </div>
      </div>
      <span className="text-xs text-gray-400 font-medium">{date}</span>
    </div>
  );
}

function HealthBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex-1 flex flex-col items-center gap-1">
      <div className="w-full h-full flex items-end justify-center">
        <div className="w-full max-w-[40px] rounded-t" style={{ height: `${Math.max(pct, 5)}%`, backgroundColor: color, opacity: 0.8 }} />
      </div>
      <span className="text-lg font-bold text-gray-900">{count}</span>
      <span className="text-[10px] text-gray-500">{label}</span>
    </div>
  );
}

function StatCard({ label, value, unit, change }: { label: string; value: string; unit: string; change: string }) {
  const isDown = change.startsWith('-');
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-gray-900">{value}</span>
        <span className="text-xs text-gray-400">{unit}</span>
      </div>
      {change ? (
        <span className={`text-xs font-medium ${isDown ? 'text-red-500' : 'text-[#29B5E8]'}`}>{change}</span>
      ) : (
        <span className="text-xs text-gray-300">—</span>
      )}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm font-medium text-gray-800">{value}</p>
    </div>
  );
}

function CompletionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-800">{value}</span>
    </div>
  );
}
