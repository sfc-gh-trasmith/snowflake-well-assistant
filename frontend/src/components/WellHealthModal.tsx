import { useEffect, useState, useCallback, useRef } from 'react';
import { X, Activity, RotateCcw } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, ReferenceArea
} from 'recharts';
import { Well } from '../types';
import { fetchWellSensors } from '../api/wells';

interface WellHealthModalProps {
  well: Well;
  onClose: () => void;
}

const SENSOR_CONFIG = [
  { key: 'INTAKE_PRESSURE_PSI', label: 'Intake Pressure (PSI)', color: '#3b82f6', unit: 'PSI' },
  { key: 'DISCHARGE_PRESSURE_PSI', label: 'Discharge Pressure (PSI)', color: '#8b5cf6', unit: 'PSI' },
  { key: 'MOTOR_TEMP_F', label: 'Motor Temperature', color: '#ef4444', unit: '°F' },
  { key: 'MOTOR_AMPS', label: 'Motor Current', color: '#f59e0b', unit: 'A' },
  { key: 'VIBRATION_IPS', label: 'Vibration', color: '#10b981', unit: 'in/s' },
  { key: 'WELLHEAD_PRESSURE_PSI', label: 'Wellhead Pressure (PSI)', color: '#06b6d4', unit: 'PSI' },
  { key: 'WELLHEAD_TEMP_F', label: 'Wellhead Temperature', color: '#f97316', unit: '°F' },
  { key: 'FREQUENCY_HZ', label: 'VFD Frequency', color: '#6366f1', unit: 'Hz' },
];

const TIME_PRESETS = [
  { label: '1D', days: 1 },
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: 'All', days: 0 },
];

function smoothData(data: Record<string, unknown>[], keys: string[], windowSize = 5): Record<string, unknown>[] {
  if (data.length <= windowSize) return data;
  return data.map((row, i) => {
    const smoothed: Record<string, unknown> = { ...row };
    for (const key of keys) {
      const start = Math.max(0, i - Math.floor(windowSize / 2));
      const end = Math.min(data.length, i + Math.floor(windowSize / 2) + 1);
      const window = data.slice(start, end).map(d => d[key] as number).filter(v => v != null);
      smoothed[key] = window.length > 0 ? window.reduce((a, b) => a + b, 0) / window.length : row[key];
    }
    return smoothed;
  });
}

export default function WellHealthModal({ well, onClose }: WellHealthModalProps) {
  const [allData, setAllData] = useState<Record<string, unknown>[]>([]);
  const [visibleData, setVisibleData] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePreset, setActivePreset] = useState('All');
  const [refAreaLeft, setRefAreaLeft] = useState<string | null>(null);
  const [refAreaRight, setRefAreaRight] = useState<string | null>(null);
  const isDragging = useRef(false);

  useEffect(() => {
    fetchWellSensors(well.api_no)
      .then(data => {
        const formatted = data.map(row => ({
          ...row,
          date: new Date(row.READING_TS as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }),
          ts: new Date(row.READING_TS as string).getTime(),
        }));
        const step = Math.max(1, Math.floor(formatted.length / 500));
        const downsampled = formatted.filter((_, i) => i % step === 0);
        setAllData(downsampled);
        setVisibleData(downsampled);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [well.api_no]);

  const applyPreset = useCallback((days: number, label: string) => {
    setActivePreset(label);
    if (days === 0 || allData.length === 0) {
      setVisibleData(allData);
      return;
    }
    const maxTs = allData[allData.length - 1].ts as number;
    const cutoff = maxTs - days * 24 * 60 * 60 * 1000;
    const filtered = allData.filter(d => (d.ts as number) >= cutoff);
    setVisibleData(filtered.length > 0 ? filtered : allData);
  }, [allData]);

  const handleMouseDown = useCallback((dateLabel: string) => {
    isDragging.current = true;
    setRefAreaLeft(dateLabel);
    setRefAreaRight(null);
  }, []);

  const handleMouseMove = useCallback((dateLabel: string) => {
    if (isDragging.current && refAreaLeft) {
      setRefAreaRight(dateLabel);
    }
  }, [refAreaLeft]);

  const handleMouseUp = useCallback(() => {
    if (!isDragging.current || !refAreaLeft || !refAreaRight) {
      isDragging.current = false;
      setRefAreaLeft(null);
      setRefAreaRight(null);
      return;
    }
    isDragging.current = false;

    const leftIdx = visibleData.findIndex(d => d.date === refAreaLeft);
    const rightIdx = visibleData.findIndex(d => d.date === refAreaRight);
    const [startIdx, endIdx] = leftIdx <= rightIdx ? [leftIdx, rightIdx] : [rightIdx, leftIdx];

    if (endIdx - startIdx < 2) {
      setRefAreaLeft(null);
      setRefAreaRight(null);
      return;
    }

    setVisibleData(visibleData.slice(startIdx, endIdx + 1));
    setActivePreset('');
    setRefAreaLeft(null);
    setRefAreaRight(null);
  }, [refAreaLeft, refAreaRight, visibleData]);

  const resetZoom = useCallback(() => {
    setVisibleData(allData);
    setActivePreset('All');
  }, [allData]);

  const statusColor = well.health_status === 'GREEN' ? '#22c55e' :
    well.health_status === 'YELLOW' ? '#f59e0b' :
    well.health_status === 'ORANGE' ? '#f97316' : '#ef4444';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-[95vw] max-w-6xl max-h-[92vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-mid-blue/10 flex items-center justify-center">
              <Activity className="w-5 h-5 text-mid-blue" />
            </div>
            <div>
              <h2 className="font-bold text-lg text-midnight">{well.well_name}</h2>
              <p className="text-xs text-medium-gray">ESP Sensor History • Click &amp; drag on any chart to zoom all</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {well.health_score !== undefined && (
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: statusColor }} />
                <span className="text-sm font-bold">{well.health_score}</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: statusColor + '20', color: statusColor }}>
                  {well.health_status}
                </span>
              </div>
            )}
            <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex flex-col items-center gap-2">
                <Activity className="w-8 h-8 text-mid-blue animate-pulse" />
                <p className="text-medium-gray">Loading sensor history...</p>
              </div>
            </div>
          ) : allData.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-medium-gray">No sensor data available for this well</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-4">
                {TIME_PRESETS.map(p => (
                  <button
                    key={p.label}
                    onClick={() => applyPreset(p.days, p.label)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      activePreset === p.label
                        ? 'bg-mid-blue text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                {activePreset === '' && (
                  <button
                    onClick={resetZoom}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-orange-100 text-orange-700 hover:bg-orange-200 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" /> Reset Zoom
                  </button>
                )}
                <span className="text-xs text-medium-gray ml-auto">
                  Showing {visibleData.length} data points
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {SENSOR_CONFIG.map(sensor => {
                  const smoothed = smoothData(visibleData, [sensor.key], 7);
                  const vals = smoothed.map(d => d[sensor.key] as number).filter(v => v != null);
                  const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
                  const yMin = vals.length > 0 ? Math.floor(Math.min(...vals) * 0.95) : 0;
                  const yMax = vals.length > 0 ? Math.ceil(Math.max(...vals) * 1.05) : 100;
                  return (
                    <div key={sensor.key} className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-midnight">{sensor.label}</h3>
                        <span className="text-xs text-medium-gray bg-gray-100 px-2 py-0.5 rounded">
                          avg: {avg.toFixed(1)} {sensor.unit}
                        </span>
                      </div>
                      <ResponsiveContainer width="100%" height={160}>
                        <LineChart
                          data={smoothed}
                          margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                          onMouseDown={e => e?.activeLabel && handleMouseDown(String(e.activeLabel))}
                          onMouseMove={e => e?.activeLabel && handleMouseMove(String(e.activeLabel))}
                          onMouseUp={handleMouseUp}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis
                            dataKey="date"
                            tick={{ fontSize: 10 }}
                            interval="preserveStartEnd"
                            tickCount={6}
                          />
                          <YAxis tick={{ fontSize: 10 }} width={55} domain={[yMin, yMax]} />
                          <Tooltip
                            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                            labelStyle={{ fontWeight: 'bold', marginBottom: 4 }}
                          />
                          <ReferenceLine y={avg} stroke={sensor.color} strokeDasharray="4 4" strokeOpacity={0.5} />
                          <Line
                            type="natural"
                            dataKey={sensor.key}
                            stroke={sensor.color}
                            strokeWidth={1.5}
                            dot={false}
                            activeDot={{ r: 4, stroke: sensor.color, strokeWidth: 2, fill: '#fff' }}
                          />
                          {refAreaLeft && refAreaRight && (
                            <ReferenceArea
                              x1={refAreaLeft}
                              x2={refAreaRight}
                              strokeOpacity={0.3}
                              fill="#6366f1"
                              fillOpacity={0.1}
                            />
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
