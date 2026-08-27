import { useState, useRef } from 'react';
import { X, Play, Gauge } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts';
import { Well } from '../types';
import { predictHealthBatch } from '../api/wells';

interface WellPredictModalProps {
  well: Well;
  onClose: () => void;
}

const FEATURE_FIELDS = [
  { key: 'avg_oil_7d', label: 'Avg Oil (7d)', unit: 'BBL', min: 50, max: 2000, desc: 'Rolling 7-day average daily oil production in barrels' },
  { key: 'avg_gas_7d', label: 'Avg Gas (7d)', unit: 'MCF', min: 100, max: 8000, desc: 'Rolling 7-day average daily gas production in MCF' },
  { key: 'avg_water_7d', label: 'Avg Water (7d)', unit: 'BBL', min: 50, max: 1500, desc: 'Rolling 7-day average daily water production in barrels' },
  { key: 'avg_runtime_7d', label: 'Avg Runtime (7d)', unit: 'hrs', min: 4, max: 24, desc: 'Average daily pump runtime hours over last 7 days' },
  { key: 'std_oil_7d', label: 'Oil Std Dev', unit: 'BBL', min: 5, max: 300, desc: 'Standard deviation of daily oil production (volatility indicator)' },
  { key: 'std_water_7d', label: 'Water Std Dev', unit: 'BBL', min: 5, max: 200, desc: 'Standard deviation of daily water production (instability signal)' },
  { key: 'water_cut_7d', label: 'Water Cut', unit: '%', min: 0.1, max: 0.9, desc: 'Water fraction of total liquid produced (water / (oil+water))' },
  { key: 'min_oil_7d', label: 'Min Oil (7d)', unit: 'BBL', min: 0, max: 1500, desc: 'Minimum daily oil rate in last 7 days (downtime indicator)' },
  { key: 'max_oil_7d', label: 'Max Oil (7d)', unit: 'BBL', min: 100, max: 2500, desc: 'Maximum daily oil rate in last 7 days' },
  { key: 'oil_decline_rate', label: 'Oil Decline Rate', unit: 'ratio', min: -0.8, max: 0.1, desc: 'Week-over-month oil production change rate (negative = declining)' },
  { key: 'runtime_change_rate', label: 'Runtime Change', unit: 'ratio', min: -0.8, max: 0.1, desc: 'Week-over-month runtime change (negative = pump running less)' },
  { key: 'water_increase_rate', label: 'Water Increase', unit: 'ratio', min: -0.1, max: 3.0, desc: 'Week-over-month water production increase (high = water breakthrough)' },
  { key: 'avg_motor_temp', label: 'Avg Motor Temp', unit: '°F', min: 180, max: 280, desc: 'Average ESP motor temperature over sensor window' },
  { key: 'max_motor_temp', label: 'Max Motor Temp', unit: '°F', min: 200, max: 320, desc: 'Peak motor temperature (high values indicate overheating risk)' },
  { key: 'avg_motor_amps', label: 'Avg Motor Amps', unit: 'A', min: 30, max: 130, desc: 'Average motor current draw (loading indicator)' },
  { key: 'max_motor_amps', label: 'Max Motor Amps', unit: 'A', min: 40, max: 180, desc: 'Peak motor current (spikes indicate mechanical issues)' },
  { key: 'avg_vibration', label: 'Avg Vibration', unit: 'in/s', min: 0.05, max: 1.0, desc: 'Average downhole vibration velocity' },
  { key: 'max_vibration', label: 'Max Vibration', unit: 'in/s', min: 0.1, max: 2.0, desc: 'Peak vibration (high = mechanical damage or imbalance)' },
  { key: 'avg_intake_psi', label: 'Avg Intake PSI', unit: 'PSI', min: 500, max: 2500, desc: 'Average pump intake pressure (low = gas locking risk)' },
  { key: 'std_intake_psi', label: 'Intake PSI Std', unit: 'PSI', min: 10, max: 300, desc: 'Intake pressure volatility (unstable = slugging)' },
  { key: 'avg_discharge_psi', label: 'Avg Discharge PSI', unit: 'PSI', min: 1500, max: 4000, desc: 'Average pump discharge pressure' },
  { key: 'avg_frequency', label: 'Avg VFD Freq', unit: 'Hz', min: 40, max: 65, desc: 'Average VFD operating frequency (pump speed)' },
  { key: 'std_frequency', label: 'Freq Std Dev', unit: 'Hz', min: 0.1, max: 5, desc: 'Frequency volatility (unstable = hunting/tripping)' },
  { key: 'total_events', label: 'Total Events', unit: '#', min: 0, max: 10, desc: 'Total maintenance/failure events in well history' },
  { key: 'failure_count', label: 'Failure Count', unit: '#', min: 0, max: 5, desc: 'Number of equipment failure events recorded' },
  { key: 'workover_count', label: 'Workover Count', unit: '#', min: 0, max: 3, desc: 'Number of workover operations performed' },
  { key: 'tvd_ft', label: 'TVD', unit: 'ft', min: 8500, max: 13500, desc: 'True vertical depth of the well' },
  { key: 'lateral_length_ft', label: 'Lateral Length', unit: 'ft', min: 5000, max: 15000, desc: 'Horizontal lateral section length' },
];

const SCENARIO_OPTIONS = [10, 50, 100, 1000];

function healthColor(score: number): string {
  if (score >= 85) return '#22c55e';
  if (score >= 70) return '#f59e0b';
  if (score >= 55) return '#f97316';
  return '#ef4444';
}

function healthBg(score: number): string {
  if (score >= 85) return 'bg-green-100 text-green-800';
  if (score >= 70) return 'bg-amber-100 text-amber-800';
  if (score >= 55) return 'bg-orange-100 text-orange-800';
  return 'bg-red-100 text-red-800';
}

function buildHistogram(results: { health_score: number }[]) {
  const bins = [
    { min: 0, max: 10, label: '0-10' },
    { min: 10, max: 20, label: '10-20' },
    { min: 20, max: 30, label: '20-30' },
    { min: 30, max: 40, label: '30-40' },
    { min: 40, max: 50, label: '40-50' },
    { min: 50, max: 60, label: '50-60' },
    { min: 60, max: 70, label: '60-70' },
    { min: 70, max: 80, label: '70-80' },
    { min: 80, max: 90, label: '80-90' },
    { min: 90, max: 101, label: '90-100' },
  ];
  return bins.map(bin => ({
    ...bin,
    color: healthColor(bin.min),
    count: results.filter(r => r.health_score >= bin.min && r.health_score < bin.max).length,
  }));
}

interface ScenarioResult {
  scenario: number;
  anomaly_score: number;
  health_score: number;
  health_status: string;
  inputs: Record<string, number>;
}

export default function WellPredictModal({ well, onClose }: WellPredictModalProps) {
  const [ranges, setRanges] = useState<Record<string, { min: number; max: number }>>(() => {
    const r: Record<string, { min: number; max: number }> = {};
    FEATURE_FIELDS.forEach(f => { r[f.key] = { min: f.min, max: f.max }; });
    return r;
  });
  const [numScenarios, setNumScenarios] = useState(10);
  const [results, setResults] = useState<ScenarioResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const handleRangeChange = (key: string, field: 'min' | 'max', value: number) => {
    setRanges(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const scenarios: Record<string, number>[] = [];
      for (let i = 0; i < numScenarios; i++) {
        const scenario: Record<string, number> = {};
        FEATURE_FIELDS.forEach(f => {
          const { min, max } = ranges[f.key];
          scenario[f.key] = numScenarios === 1 ? min : min + (max - min) * Math.random();
        });
        scenarios.push(scenario);
      }
      const predictions = await predictHealthBatch(scenarios);
      const combined: ScenarioResult[] = predictions.map((p, i) => ({
        ...p,
        inputs: scenarios[i],
      }));
      combined.sort((a, b) => b.health_score - a.health_score);
      setResults(combined);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch {
      setError('Prediction failed. Is the inference service running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-[95vw] max-w-6xl max-h-[92vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Gauge className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="font-bold text-lg text-midnight">{well.well_name}</h2>
              <p className="text-xs text-medium-gray">Sensitivity Analysis — Set min/max ranges per feature</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="text-xs font-medium text-gray-600">Iterations:</span>
            {SCENARIO_OPTIONS.map(n => (
              <button
                key={n}
                onClick={() => setNumScenarios(n)}
                className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
                  numScenarios === n ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {n}
              </button>
            ))}
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-600 w-[30%]">Feature</th>
                  <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-400">Description</th>
                  <th className="px-3 py-1.5 text-center text-xs font-semibold text-gray-600 w-32">Min</th>
                  <th className="px-3 py-1.5 text-center text-xs font-semibold text-gray-600 w-32">Max</th>
                </tr>
              </thead>
              <tbody>
                {FEATURE_FIELDS.map((field, idx) => (
                  <tr key={field.key} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    <td className="px-3 py-1">
                      <span className="text-sm font-medium text-gray-800">{field.label}</span>
                      <span className="text-xs text-gray-400 ml-1">({field.unit})</span>
                    </td>
                    <td className="px-3 py-1 text-xs text-gray-500">{field.desc}</td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        step="any"
                        value={ranges[field.key].min}
                        onChange={e => handleRangeChange(field.key, 'min', parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm text-center focus:outline-none focus:ring-1 focus:ring-purple-300 bg-white"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        step="any"
                        value={ranges[field.key].max}
                        onChange={e => handleRangeChange(field.key, 'max', parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm text-center focus:outline-none focus:ring-1 focus:ring-purple-300 bg-white"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex items-center gap-4">
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              <Play className="w-4 h-4" />
              {loading ? 'Running...' : 'Run Analysis'}
            </button>
            {results.length > 0 && (
              <button
                onClick={() => setResults([])}
                className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Clear
              </button>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <p className="mt-2 text-[10px] text-gray-400 font-mono">
            → WELL_HEALTH_INFERENCE_SERVICE | {numScenarios} scenarios
          </p>

          {results.length > 0 && (
            <div className="mt-6" ref={resultsRef}>
              <h3 className="text-sm font-semibold text-midnight mb-3">Health Score Distribution ({results.length} scenarios)</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={buildHistogram(results)} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10 }}
                    label={{ value: 'Health Score Range', position: 'insideBottom', offset: -2, fontSize: 11 }}
                  />
                  <YAxis tick={{ fontSize: 11 }} label={{ value: 'Count', angle: -90, position: 'insideLeft', fontSize: 11 }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {buildHistogram(results).map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              <h3 className="text-sm font-semibold text-midnight mt-8 mb-3">Scenario Details</h3>
              <div className="border border-gray-200 rounded-lg overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-2 py-2 text-left font-semibold text-gray-600 sticky left-0 bg-gray-50 z-10">#</th>
                      <th className="px-2 py-2 text-left font-semibold text-gray-600 sticky left-6 bg-gray-50 z-10">Score</th>
                      {FEATURE_FIELDS.map(f => (
                        <th key={f.key} className="px-2 py-2 text-right font-semibold text-gray-600 whitespace-nowrap">
                          {f.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.slice(0, 50).map((row, idx) => (
                      <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-2 py-1.5 text-gray-500 sticky left-0 bg-white z-10">{idx + 1}</td>
                        <td className="px-2 py-1.5 sticky left-6 bg-white z-10">
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-bold ${healthBg(row.health_score)}`}
                          >
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: healthColor(row.health_score) }}
                            />
                            {row.health_score.toFixed(1)}
                          </span>
                        </td>
                        {FEATURE_FIELDS.map(f => (
                          <td key={f.key} className="px-2 py-1.5 text-right text-gray-700 font-mono whitespace-nowrap">
                            {row.inputs[f.key]?.toFixed(f.key === 'vibration_ips' ? 3 : f.key === 'avg_water_cut' || f.key === 'avg_gor' ? 2 : 1)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex items-center gap-4 text-[10px] text-gray-500">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#22c55e]" /> Healthy (&lt;50)</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b]" /> Warning (50-70)</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#f97316]" /> At Risk (70-90)</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#ef4444]" /> Critical (≥90)</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
