import { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  FileText, Wrench, FlaskConical, ShieldCheck, TrendingUp, Truck,
  ArrowLeft, Send, CheckCircle2, Circle, Database,
  TrendingDown, ClipboardList, Layers, Printer, RotateCcw,
  AlertTriangle, Gauge, Sun, Microscope, Compass, Zap, Package,
  BarChart3, Archive, Navigation, Activity, HardHat,
} from 'lucide-react';
import { generateWorkoverReport, WorkoverFormData, StreamEvent } from '../api/wells';

interface WellSuggestion {
  well_name: string;
  api_no: string;
  field: string;
  county: string;
  formation: string;
  status: string;
}

interface AgentCard {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  status: 'active' | 'coming_soon';
}

interface AgentCategory {
  id: string;
  name: string;
  description: string;
  accent: { bg: string; text: string; dot: string };
  headerIcon: React.ReactNode;
  agents: AgentCard[];
}

const AGENT_CATEGORIES: AgentCategory[] = [
  {
    id: 'production',
    name: 'Production',
    description: 'Well performance, intervention workflows, and production reporting',
    accent: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    headerIcon: <Activity className="w-4 h-4" />,
    agents: [
      {
        id: 'workover-report',
        name: 'Workover Report',
        description: 'Generate comprehensive workover authorization packages with AI-assisted root cause analysis, cost justification, and well history synthesis',
        icon: <Wrench className="w-5 h-5" />,
        status: 'active',
      },
      {
        id: 'production-optimization',
        name: 'Production Optimization',
        description: 'AI-driven lift optimization covering ESP sizing, gas lift valve spacing, and pump-off controller tuning to maximize recovery',
        icon: <TrendingUp className="w-5 h-5" />,
        status: 'coming_soon',
      },
      {
        id: 'artificial-lift-surveillance',
        name: 'Artificial Lift Surveillance',
        description: 'Continuous ESP, rod pump, and gas lift performance monitoring with automated fault detection and run-life trend analysis',
        icon: <Gauge className="w-5 h-5" />,
        status: 'coming_soon',
      },
      {
        id: 'chemical-treatment',
        name: 'Chemical Treatment',
        description: 'Plan and document scale, corrosion, and paraffin inhibitor programs with dosage optimization and field spend tracking',
        icon: <FlaskConical className="w-5 h-5" />,
        status: 'coming_soon',
      },
      {
        id: 'safety-compliance',
        name: 'Safety & Compliance',
        description: 'Standardize field inspection workflows with MOC tracking, incident documentation, and regulatory compliance reporting',
        icon: <ShieldCheck className="w-5 h-5" />,
        status: 'coming_soon',
      },
    ],
  },
  {
    id: 'drilling',
    name: 'Drilling & Completions',
    description: 'Automate drilling reports, analyze completion performance, and optimize well design',
    accent: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
    headerIcon: <HardHat className="w-4 h-4" />,
    agents: [
      {
        id: 'morning-report',
        name: 'Morning Report',
        description: 'Compile daily drilling morning reports from wellsite data, highlighting NPT events, cost-to-date, and progress against AFE plan',
        icon: <Sun className="w-5 h-5" />,
        status: 'coming_soon',
      },
      {
        id: 'daily-drilling-report',
        name: 'Daily Drilling Report',
        description: 'Auto-generate structured DDRs with mud weight, ROP, BHA details, and bit footage summaries from WITSML or EDR data feeds',
        icon: <FileText className="w-5 h-5" />,
        status: 'coming_soon',
      },
      {
        id: 'bit-forensics',
        name: 'Bit Forensics',
        description: 'Analyze bit dull grading, lithology correlation, and footage-per-bit performance to optimize bit selection for upcoming wells',
        icon: <Microscope className="w-5 h-5" />,
        status: 'coming_soon',
      },
      {
        id: 'offset-analysis',
        name: 'Offset Well Analysis',
        description: 'Benchmark new well candidates against offset producers using completion design, production performance, and geologic similarity scoring',
        icon: <Compass className="w-5 h-5" />,
        status: 'coming_soon',
      },
      {
        id: 'completion-design',
        name: 'Completion Design Optimizer',
        description: 'Recommend frac stage count, cluster spacing, fluid volume, and proppant loading based on formation properties and offset EUR performance',
        icon: <Zap className="w-5 h-5" />,
        status: 'coming_soon',
      },
      {
        id: 'wellbore-positioning',
        name: 'Wellbore Positioning',
        description: 'Review directional surveys, build anti-collision proximity reports, and validate well trajectory against geological targets',
        icon: <Navigation className="w-5 h-5" />,
        status: 'coming_soon',
      },
    ],
  },
  {
    id: 'supply-chain',
    name: 'Supply Chain',
    description: 'Coordinate logistics, manage equipment procurement, and track vendor performance',
    accent: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
    headerIcon: <Truck className="w-4 h-4" />,
    agents: [
      {
        id: 'logistics-planning',
        name: 'Logistics & Scheduling',
        description: 'Coordinate rig schedules, tubular deliveries, and crew rotations with conflict detection and critical path analysis',
        icon: <Truck className="w-5 h-5" />,
        status: 'coming_soon',
      },
      {
        id: 'tubular-procurement',
        name: 'Tubular & Equipment Procurement',
        description: 'Generate material take-offs, compare vendor quotes, and track delivery status for casing, tubing, and wellhead equipment',
        icon: <Package className="w-5 h-5" />,
        status: 'coming_soon',
      },
      {
        id: 'vendor-scorecard',
        name: 'Rig & Vendor Scorecard',
        description: 'Score contractor KPIs including NPT%, cost-per-foot, safety incidents, and equipment uptime against fleet benchmarks',
        icon: <BarChart3 className="w-5 h-5" />,
        status: 'coming_soon',
      },
      {
        id: 'chemical-inventory',
        name: 'Chemical Inventory',
        description: 'Track chemical stock levels across field locations, forecast consumption rates, and automate reorder triggers',
        icon: <Archive className="w-5 h-5" />,
        status: 'coming_soon',
      },
    ],
  },
];

const ARTIFICIAL_LIFT_TYPES = [
  'ESP (Electric Submersible Pump)',
  'Rod Pump (Beam Pump)',
  'Gas Lift',
  'PCP (Progressive Cavity Pump)',
  'Jet Pump',
  'Plunger Lift',
  'None (Flowing)',
];

const WORKOVER_REASONS = [
  'ESP Failure',
  'Rod Parting',
  'Tubing Leak',
  'Casing Damage',
  'Sand Control',
  'Zone Change / Recompletion',
  'Convert Lift Type',
  'Stimulation / Refrac',
  'Water Shut-off',
  'Plug & Abandon',
  'Other',
];

const WELL_TYPES = ['Horizontal', 'Vertical', 'Directional'];

const INITIAL_FORM: WorkoverFormData = {
  // Pre-populated with Hamilton 12H — SHUT-IN, 9 reported failures, high-value Wolfcamp A producer
  wellName: 'Hamilton 12H',
  apiNumber: '42-301-89424',
  field: 'Orla',
  county: 'Loving',
  operator: 'Texas Energy LLC',
  wellType: 'Horizontal',
  formation: 'Wolfcamp A',
  tvdFt: '12784',
  mdFt: '26258',
  lateralLengthFt: '13474',
  currentLiftType: 'ESP (Electric Submersible Pump)',
  proposedLiftType: 'ESP (Electric Submersible Pump)',
  workoverReason: 'Tubing Leak',
  problemDescription: 'Hole in tubing at 6,500 ft MD causing severe production loss and gas migration to surface. Well is flowing up the annulus indicating integrity failure. History includes two VSD drive failures on the ESP (Oct 2023, Aug 2024) and a downhole pump seizure due to sand production (Mar 2026). Most recent inspection confirmed corrosion-induced tubing failure. Well shut-in on June 3, 2026 pending workover authorization.',
  lastProductionOil: '912',
  lastProductionGas: '2480',
  lastProductionWater: '498',
  shutInDate: '2026-06-03',
  proposedStartDate: '2026-07-22',
  estimatedDuration: '8',
  estimatedCost: '385000',
  additionalNotes: 'Corrosion pattern on tubing suggests need to upgrade chemical inhibitor program. Evaluate sand control options during workover — previous pump seizure attributed to sand influx. Consider corrosion-resistant alloy (CRA) tubing for replacement string given formation water salinity.',
};

interface ProcessingStep {
  id: string;
  label: string;
  detail: string;
  icon: React.ReactNode;
  status: 'pending' | 'active' | 'done' | 'skipped';
  toolTriggers: string[];
  wasTriggered: boolean;
}

const INITIAL_STEPS: ProcessingStep[] = [
  {
    id: 'well-data',
    label: 'Retrieving Well Records',
    detail: 'Fetching metadata, depths, and well configuration',
    icon: <Database className="w-4 h-4" />,
    status: 'pending',
    toolTriggers: [],
    wasTriggered: true, // always considered triggered
  },
  {
    id: 'production',
    label: 'Analyzing Production History',
    detail: 'Querying 24 months of oil, gas & water production',
    icon: <TrendingDown className="w-4 h-4" />,
    status: 'pending',
    toolTriggers: ['well_analyst', 'cortex_analyst', 'system_execute_sql'],
    wasTriggered: false,
  },
  {
    id: 'events',
    label: 'Reviewing Maintenance Logs',
    detail: 'Searching failure events, workovers & inspections',
    icon: <ClipboardList className="w-4 h-4" />,
    status: 'pending',
    toolTriggers: ['well_events_search', 'cortex_search'],
    wasTriggered: false,
  },
  {
    id: 'completion',
    label: 'Analyzing Completion Data',
    detail: 'Retrieving frac stages, perforations & treating data',
    icon: <Layers className="w-4 h-4" />,
    status: 'pending',
    toolTriggers: ['well_completions_analyst', 'code_execution'],
    wasTriggered: false,
  },
  {
    id: 'report',
    label: 'Generating Workover Report',
    detail: 'Synthesizing data into comprehensive engineering report',
    icon: <FileText className="w-4 h-4" />,
    status: 'pending',
    toolTriggers: ['__text_started__'],
    wasTriggered: false,
  },
];

type ViewMode = 'agents' | 'form' | 'processing' | 'report';

export default function WorkflowAutomation() {
  const [view, setView] = useState<ViewMode>('agents');
  const [form, setForm] = useState<WorkoverFormData>(INITIAL_FORM);
  const [steps, setSteps] = useState<ProcessingStep[]>(INITIAL_STEPS.map(s => ({ ...s })));
  const [reportContent, setReportContent] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [submittedWellName, setSubmittedWellName] = useState('');
  const toolCallCountRef = useRef(0);

  const updateField = (field: keyof WorkoverFormData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const advanceSteps = (toolName: string) => {
    setSteps(prev => {
      const updated = [...prev];

      // Activate first step immediately if not already started
      const firstPending = updated.find(s => s.status === 'pending');
      if (firstPending && toolCallCountRef.current === 0) {
        firstPending.status = 'active';
      }

      // Find and activate matching step, mark previous active ones as done
      for (let i = 0; i < updated.length; i++) {
        const step = updated[i];
        if (step.toolTriggers.includes(toolName)) {
          for (let j = 0; j < i; j++) {
            if (updated[j].status === 'active') updated[j].status = 'done';
          }
          if (step.status !== 'done') {
            step.status = 'active';
            step.wasTriggered = true;
          }
          break;
        }
      }
      return updated;
    });
    toolCallCountRef.current += 1;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittedWellName(form.wellName);
    setError('');
    setReportContent('');
    setStatusMessage('Connecting to Workover Report Agent...');
    toolCallCountRef.current = 0;

    const resetSteps = INITIAL_STEPS.map((s, i) => ({
      ...s,
      status: (i === 0 ? 'active' : 'pending') as ProcessingStep['status'],
      wasTriggered: i === 0, // only step 1 is pre-triggered
    }));
    setSteps(resetSteps);
    setView('processing');

    let textStarted = false;

    try {
      await generateWorkoverReport(form, (event: StreamEvent) => {
        if (event.type === 'status' && event.message) {
          setStatusMessage(event.message);
        }

        if (event.type === 'tool_use' && event.tool) {
          advanceSteps(event.tool);
          setStatusMessage(`Using ${event.tool.replace(/_/g, ' ')}...`);
        }

        if (event.type === 'text_delta' && event.text) {
          if (!textStarted) {
            textStarted = true;
            advanceSteps('__text_started__');
            // Mark all non-report steps as done/skipped appropriately; report step active
            setSteps(prev =>
              prev.map(s => s.id === 'report'
                ? { ...s, status: 'active', wasTriggered: true }
                : s.status === 'pending' && !s.wasTriggered && s.toolTriggers.length > 0
                  ? { ...s, status: 'skipped' }
                  : { ...s, status: 'done' }
              )
            );
            setStatusMessage('Writing workover report...');
          }
          setReportContent(prev => prev + event.text);
        }

        if (event.type === 'done') {
          setSteps(prev => prev.map(s => ({
            ...s,
            status: s.status === 'active' ? 'done'
              : s.status === 'pending' && !s.wasTriggered && s.toolTriggers.length > 0 ? 'skipped'
              : s.status === 'pending' ? 'done'
              : s.status,
          })));
          if (textStarted) {
            setStatusMessage('Report complete');
            setView('report');
          } else {
            setError(
              'The agent completed but produced no report content. ' +
              'Please try again — if the issue persists, try a different well name (e.g. "Hamilton 12H", "Cyclone 1H").'
            );
          }
        }

        if (event.type === 'error') {
          setError(event.message || 'An error occurred generating the report');
          setSteps(prev => prev.map(s => s.status === 'active' ? { ...s, status: 'pending' } : s));
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
      setView('form');
    }
  };

  const handleReset = () => {
    setForm(INITIAL_FORM);
    setReportContent('');
    setError('');
    setStatusMessage('');
    setView('form');
  };

  const handlePrint = () => {
    window.print();
  };

  if (view === 'agents') {
    return (
      <div className="flex-1 overflow-y-auto bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12">
            <h1 className="text-3xl font-bold text-gray-900">Workflow Automation</h1>
            <p className="text-base text-gray-500 mt-2">Select an AI agent to automate oil &amp; gas operations across your asset teams</p>
          </div>

          <div className="space-y-12">
            {AGENT_CATEGORIES.map(category => (
              <section key={category.id}>
                {/* Category header */}
                <div className="flex items-center gap-4 mb-6 pb-5 border-b border-gray-200">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${category.accent.bg} ${category.accent.text}`}>
                    <span className="[&>svg]:w-5 [&>svg]:h-5">{category.headerIcon}</span>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{category.name}</h2>
                    <p className="text-sm text-gray-500 mt-0.5">{category.description}</p>
                  </div>
                  <div className="ml-auto flex items-center gap-2 shrink-0">
                    <span className={`inline-block w-2 h-2 rounded-full ${category.accent.dot}`} />
                    <span className="text-sm text-gray-400">
                      {category.agents.filter(a => a.status === 'active').length} active
                    </span>
                  </div>
                </div>

                {/* Agent cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {category.agents.map(agent => (
                    <button
                      key={agent.id}
                      onClick={() => agent.status === 'active' && setView('form')}
                      disabled={agent.status === 'coming_soon'}
                      className={`relative text-left p-6 rounded-xl border-2 transition-all shadow-sm ${
                        agent.status === 'active'
                          ? 'bg-white border-gray-300 hover:border-[#29B5E8] hover:shadow-lg cursor-pointer'
                          : 'bg-gray-50 border-gray-200 cursor-not-allowed'
                      }`}
                    >
                      {agent.status === 'coming_soon' && (
                        <span className="absolute top-4 right-4 text-[11px] font-semibold uppercase tracking-wide text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
                          Coming Soon
                        </span>
                      )}
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
                        agent.status === 'active'
                          ? `${category.accent.bg} ${category.accent.text}`
                          : 'bg-gray-50 text-gray-300'
                      }`}>
                        <span className="[&>svg]:w-6 [&>svg]:h-6">{agent.icon}</span>
                      </div>
                      <h3 className={`font-semibold text-base ${agent.status === 'active' ? 'text-gray-900' : 'text-gray-500'}`}>
                        {agent.name}
                      </h3>
                      <p className={`text-sm mt-1.5 leading-relaxed ${agent.status === 'active' ? 'text-gray-700' : 'text-gray-400'}`}>
                        {agent.description}
                      </p>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (view === 'form') {
    return (
      <>
        {/* Print-only report (hidden on screen) */}
        <PrintableReport content={reportContent} wellName={submittedWellName} />

        <div className="flex-1 overflow-y-auto bg-gray-50 p-8">
          <div className="max-w-4xl mx-auto">
            <button
              onClick={() => setView('agents')}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Agents
            </button>

            {error && (
              <div className="mb-6 flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="px-8 py-6 border-b border-gray-100">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-blue-50 text-[#29B5E8] flex items-center justify-center">
                      <Wrench className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">Workover Report Agent</h2>
                      <p className="text-sm text-gray-500">Fill in the well and workover details below to generate an AI-assisted report</p>
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full mt-1">
                    Sample: Hamilton 12H
                  </span>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="p-8 space-y-8">
                <section>
                  <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Well Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <WellNameAutocomplete
                      value={form.wellName}
                      onChange={v => updateField('wellName', v)}
                      onSelect={suggestion => {
                        updateField('wellName', suggestion.well_name);
                        if (suggestion.api_no) updateField('apiNumber', suggestion.api_no);
                        if (suggestion.field) updateField('field', suggestion.field);
                        if (suggestion.county) updateField('county', suggestion.county);
                        if (suggestion.formation) updateField('formation', suggestion.formation);
                      }}
                    />
                    <FormInput label="API Number" value={form.apiNumber} onChange={v => updateField('apiNumber', v)} placeholder="Auto-filled on well select" />
                    <FormInput label="Field" value={form.field} onChange={v => updateField('field', v)} placeholder="e.g. Pecos Valley" />
                    <FormInput label="County" value={form.county} onChange={v => updateField('county', v)} placeholder="e.g. Reeves" />
                    <FormInput label="Operator" value={form.operator} onChange={v => updateField('operator', v)} />
                    <FormSelect label="Well Type" value={form.wellType} onChange={v => updateField('wellType', v)} options={WELL_TYPES} />
                  </div>
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Well Specifications</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <FormInput label="Formation" value={form.formation} onChange={v => updateField('formation', v)} placeholder="e.g. Wolfcamp A" />
                    <FormInput label="TVD (ft)" value={form.tvdFt} onChange={v => updateField('tvdFt', v)} type="number" placeholder="10000" />
                    <FormInput label="MD (ft)" value={form.mdFt} onChange={v => updateField('mdFt', v)} type="number" placeholder="20000" />
                    <FormInput label="Lateral Length (ft)" value={form.lateralLengthFt} onChange={v => updateField('lateralLengthFt', v)} type="number" placeholder="10000" />
                  </div>
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Artificial Lift</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormSelect label="Current Lift Type" value={form.currentLiftType} onChange={v => updateField('currentLiftType', v)} options={ARTIFICIAL_LIFT_TYPES} required />
                    <FormSelect label="Proposed Lift Type" value={form.proposedLiftType} onChange={v => updateField('proposedLiftType', v)} options={ARTIFICIAL_LIFT_TYPES} />
                  </div>
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Workover Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <FormSelect label="Reason for Workover" value={form.workoverReason} onChange={v => updateField('workoverReason', v)} options={WORKOVER_REASONS} required />
                    <FormInput label="Shut-in Date" value={form.shutInDate} onChange={v => updateField('shutInDate', v)} type="date" />
                  </div>
                  <FormTextarea label="Problem Description" value={form.problemDescription} onChange={v => updateField('problemDescription', v)} required placeholder="Describe the issue in detail: symptoms, timeline, suspected root cause..." />
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Last Production (Before Shut-in)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormInput label="Oil (BBL/day)" value={form.lastProductionOil} onChange={v => updateField('lastProductionOil', v)} type="number" placeholder="0" />
                    <FormInput label="Gas (MCF/day)" value={form.lastProductionGas} onChange={v => updateField('lastProductionGas', v)} type="number" placeholder="0" />
                    <FormInput label="Water (BBL/day)" value={form.lastProductionWater} onChange={v => updateField('lastProductionWater', v)} type="number" placeholder="0" />
                  </div>
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Planning</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <FormInput label="Proposed Start Date" value={form.proposedStartDate} onChange={v => updateField('proposedStartDate', v)} type="date" />
                    <FormInput label="Estimated Duration (days)" value={form.estimatedDuration} onChange={v => updateField('estimatedDuration', v)} type="number" placeholder="7" />
                    <FormInput label="Estimated Cost ($)" value={form.estimatedCost} onChange={v => updateField('estimatedCost', v)} type="number" placeholder="250000" />
                  </div>
                  <FormTextarea label="Additional Notes" value={form.additionalNotes} onChange={v => updateField('additionalNotes', v)} placeholder="Any additional context, constraints, or considerations..." />
                </section>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Reset Form
                  </button>
                  <button
                    type="submit"
                    className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-[#29B5E8] rounded-lg hover:bg-[#1a9fd4] transition-colors"
                  >
                    <Send className="w-4 h-4" />
                    Generate Workover Report
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (view === 'processing') {
    return (
      <>
        <PrintableReport content={reportContent} wellName={submittedWellName} />
        <div className="flex-1 overflow-y-auto bg-gray-50 flex items-start justify-center p-8">
          <div className="w-full max-w-2xl">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden">
              {/* Animated header */}
              <div className="relative bg-gradient-to-br from-[#0a1628] to-[#1a3a5c] px-8 py-10 overflow-hidden">
                {/* Animated scan lines */}
                <div className="absolute inset-0 opacity-10">
                  {[...Array(8)].map((_, i) => (
                    <div
                      key={i}
                      className="absolute w-full h-px bg-[#29B5E8]"
                      style={{
                        top: `${i * 14 + 2}%`,
                        animation: `scanline 3s ease-in-out ${i * 0.3}s infinite`,
                        opacity: 0.6,
                      }}
                    />
                  ))}
                </div>

                {/* Well schematic */}
                <div className="relative flex items-start gap-8">
                  <WellSchematic steps={steps} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-2 h-2 rounded-full bg-[#29B5E8] animate-pulse" />
                      <span className="text-xs font-medium text-[#29B5E8] uppercase tracking-widest">AI Agent Active</span>
                    </div>
                    <h2 className="text-xl font-bold text-white mb-1">Generating Report</h2>
                    <p className="text-sm text-blue-200 font-medium truncate">{submittedWellName}</p>
                    <p className="text-xs text-blue-300 mt-3 leading-relaxed min-h-[2.5rem]">{statusMessage}</p>
                  </div>
                </div>
              </div>

              {/* Steps */}
              <div className="px-8 py-6 space-y-3">
                {steps.map((step, idx) => (
                  <ProcessingStepRow key={step.id} step={step} index={idx} />
                ))}
              </div>

              {/* Live preview */}
              {reportContent && (
                <div className="px-8 pb-6">
                  <div className="rounded-lg bg-gray-50 border border-gray-100 px-4 py-3">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Live Preview</p>
                    <p className="text-xs text-gray-600 leading-relaxed line-clamp-3 font-mono">
                      {reportContent.slice(0, 320)}{reportContent.length > 320 ? '...' : ''}
                    </p>
                  </div>
                </div>
              )}

              {error && (
                <div className="px-8 pb-6">
                  <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                    <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-red-700">Generation failed</p>
                      <p className="text-xs text-red-600 mt-0.5">{error}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setView('form')}
                    className="mt-3 w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Back to Form
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <style>{`
          @keyframes scanline {
            0%, 100% { transform: translateX(-100%); opacity: 0; }
            50% { transform: translateX(100%); opacity: 0.8; }
          }
        `}</style>
      </>
    );
  }

  // Report view
  return (
    <>
      <PrintableReport content={reportContent} wellName={submittedWellName} />

      <div className="flex-1 overflow-y-auto bg-gray-50">
        {/* Report action bar */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm print:hidden">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setView('agents')}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Agents
            </button>
            <span className="text-gray-300">/</span>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-blue-50 text-[#29B5E8] flex items-center justify-center">
                <FileText className="w-3 h-3" />
              </div>
              <span className="text-sm font-medium text-gray-900">Workover Report</span>
              <span className="text-sm text-gray-400">— {submittedWellName}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-green-600 bg-green-50 px-2.5 py-1 rounded-full border border-green-100">
              <CheckCircle2 className="w-3 h-3" />
              Report Complete
            </span>
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              New Report
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-[#29B5E8] rounded-lg hover:bg-[#1a9fd4] transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              Download PDF
            </button>
          </div>
        </div>

        {/* Report document */}
        <div className="max-w-4xl mx-auto px-6 py-8 print:hidden">
          <ReportDocument content={reportContent} wellName={submittedWellName} />
        </div>
      </div>

      <PrintStyles />
    </>
  );
}

// ─── Processing step row ──────────────────────────────────────────────────────

function ProcessingStepRow({ step, index }: { step: ProcessingStep; index: number }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 shrink-0">
        {step.status === 'done' ? (
          <CheckCircle2 className="w-5 h-5 text-green-500" />
        ) : step.status === 'skipped' ? (
          <div className="w-5 h-5 rounded-full border-2 border-gray-200 flex items-center justify-center">
            <div className="w-1.5 h-0.5 bg-gray-300 rounded" />
          </div>
        ) : step.status === 'active' ? (
          <div className="w-5 h-5 rounded-full border-2 border-[#29B5E8] border-t-transparent animate-spin" />
        ) : (
          <Circle className="w-5 h-5 text-gray-200" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium transition-colors ${
            step.status === 'done' ? 'text-green-700' :
            step.status === 'skipped' ? 'text-gray-300' :
            step.status === 'active' ? 'text-[#29B5E8]' :
            'text-gray-400'
          }`}>
            {index + 1}. {step.label}
          </span>
          {step.status === 'active' && (
            <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-[#29B5E8] rounded-full animate-pulse">
              Running
            </span>
          )}
          {step.status === 'skipped' && (
            <span className="text-xs px-1.5 py-0.5 bg-gray-50 text-gray-400 rounded-full">
              Not needed
            </span>
          )}
        </div>
        <p className={`text-xs mt-0.5 transition-colors ${
          step.status === 'pending' || step.status === 'skipped' ? 'text-gray-300' : 'text-gray-500'
        }`}>
          {step.detail}
        </p>
      </div>
    </div>
  );
}

// ─── Animated well schematic ─────────────────────────────────────────────────

function WellSchematic({ steps }: { steps: ProcessingStep[] }) {
  const activeIdx = steps.findIndex(s => s.status === 'active');
  const progress = activeIdx >= 0 ? (activeIdx / (steps.length - 1)) : 1;

  return (
    <div className="shrink-0 w-16 flex flex-col items-center">
      {/* Derrick top */}
      <div className="w-0 h-0 border-l-[20px] border-r-[20px] border-b-[28px] border-l-transparent border-r-transparent border-b-[#29B5E8] opacity-80" />
      {/* Derrick body */}
      <div className="w-8 h-20 relative flex items-center justify-center">
        <div className="absolute inset-0 border-l-2 border-r-2 border-[#29B5E8] opacity-40" />
        {/* Pulse scanner */}
        <div
          className="absolute w-full h-1 bg-[#29B5E8] rounded opacity-70 transition-all duration-700"
          style={{ top: `${progress * 80}%` }}
        />
      </div>
      {/* Ground */}
      <div className="w-12 h-1.5 bg-[#29B5E8] opacity-60 rounded-sm" />
      {/* Wellbore */}
      <div className="w-1 flex-1 mt-1 bg-gradient-to-b from-[#29B5E8] to-[#29B5E8]/20 rounded-full min-h-[24px]" />
    </div>
  );
}

// ─── Report document (screen) ────────────────────────────────────────────────

function ReportDocument({ content, wellName }: { content: string; wellName: string }) {
  const reportDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Cover page */}
      <div className="bg-gradient-to-br from-[#0a1628] to-[#1a3a5c] px-10 py-12">
        <div className="flex items-start justify-between mb-10">
          <div>
            <p className="text-[#29B5E8] text-xs font-semibold uppercase tracking-[0.2em] mb-2">Confidential — Internal Use Only</p>
            <h1 className="text-3xl font-bold text-white tracking-tight">WORKOVER REPORT</h1>
            <p className="text-blue-200 mt-2 text-base">{wellName}</p>
          </div>
          <div className="text-right">
            <div className="w-12 h-12 bg-[#29B5E8]/20 border border-[#29B5E8]/30 rounded-lg flex items-center justify-center mb-2 ml-auto">
              <Wrench className="w-6 h-6 text-[#29B5E8]" />
            </div>
            <p className="text-blue-300 text-xs">{reportDate}</p>
            <p className="text-blue-400 text-xs mt-0.5">AI-Generated</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 pt-6 border-t border-white/10">
          <div>
            <p className="text-blue-400 text-xs uppercase tracking-wide">Document Type</p>
            <p className="text-white text-sm font-medium mt-0.5">Workover Authorization</p>
          </div>
          <div>
            <p className="text-blue-400 text-xs uppercase tracking-wide">Status</p>
            <p className="text-green-400 text-sm font-medium mt-0.5">Draft — Pending Review</p>
          </div>
          <div>
            <p className="text-blue-400 text-xs uppercase tracking-wide">Generated By</p>
            <p className="text-white text-sm font-medium mt-0.5">Cortex Workover Agent</p>
          </div>
        </div>
      </div>

      {/* Report body */}
      <div className="px-10 py-8">
        <div className="prose prose-sm max-w-none
          prose-headings:font-bold prose-headings:text-gray-900
          prose-h2:text-base prose-h2:uppercase prose-h2:tracking-wide prose-h2:text-[#29B5E8] prose-h2:border-b prose-h2:border-gray-100 prose-h2:pb-2 prose-h2:mt-8 prose-h2:mb-4
          prose-h3:text-sm prose-h3:font-semibold prose-h3:text-gray-800 prose-h3:mt-5 prose-h3:mb-2
          prose-p:text-gray-700 prose-p:leading-relaxed prose-p:text-sm
          prose-strong:text-gray-900 prose-strong:font-semibold
          prose-ul:text-gray-700 prose-ul:text-sm prose-li:my-0.5
          prose-ol:text-gray-700 prose-ol:text-sm
          prose-table:text-sm prose-table:w-full
          prose-th:bg-gray-50 prose-th:text-gray-700 prose-th:font-semibold prose-th:px-4 prose-th:py-2 prose-th:text-left prose-th:border prose-th:border-gray-200
          prose-td:px-4 prose-td:py-2 prose-td:border prose-td:border-gray-200 prose-td:text-gray-600
          prose-code:bg-gray-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
        ">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      </div>

      {/* Report footer */}
      <div className="px-10 py-6 border-t border-gray-100 bg-gray-50">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">
            This report was AI-generated by Snowflake Cortex Workover Report Agent and requires review and sign-off by a licensed Professional Engineer before AFE submission.
          </p>
          <div className="shrink-0 ml-6">
            <div className="border border-gray-300 rounded px-3 py-1 text-center">
              <p className="text-xs text-gray-400">PE Signature</p>
              <div className="w-24 mt-3" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Printable report (hidden on screen, shown when printing) ────────────────

const PrintableReport = ({
  content,
  wellName,
}: {
  content: string;
  wellName: string;
}) => {
  const reportDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div id="printable-report" className="hidden print:block">
      <div className="print-cover">
        <div className="print-logo">
          <span className="print-logo-text">WORKOVER REPORT</span>
        </div>
        <h1 className="print-title">{wellName}</h1>
        <div className="print-meta">
          <div><span>Date:</span> {reportDate}</div>
          <div><span>Status:</span> Draft — Pending PE Review</div>
          <div><span>Classification:</span> Confidential</div>
        </div>
      </div>
      <div className="print-body prose prose-sm max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    </div>
  );
};

// ─── Print styles ─────────────────────────────────────────────────────────────

function PrintStyles() {
  return (
    <style>{`
      @media print {
        /* Hide everything except print content */
        body > * { display: none !important; }
        #printable-report { display: block !important; }

        @page {
          size: A4;
          margin: 18mm 16mm 20mm 16mm;
        }

        #printable-report {
          font-family: 'Georgia', serif;
          color: #111;
          font-size: 10pt;
          line-height: 1.5;
        }

        .print-cover {
          page-break-after: always;
          border-bottom: 3px solid #29B5E8;
          padding-bottom: 2cm;
          margin-bottom: 1cm;
        }

        .print-logo {
          border: 2px solid #29B5E8;
          display: inline-block;
          padding: 4px 12px;
          margin-bottom: 24px;
        }

        .print-logo-text {
          font-size: 8pt;
          font-weight: bold;
          letter-spacing: 0.3em;
          color: #29B5E8;
          text-transform: uppercase;
        }

        .print-title {
          font-size: 28pt;
          font-weight: bold;
          color: #0a1628;
          margin: 8px 0 20px;
          line-height: 1.2;
        }

        .print-meta {
          font-size: 10pt;
          color: #444;
          margin-top: 12px;
          display: flex;
          gap: 32px;
        }

        .print-meta span {
          font-weight: bold;
          color: #0a1628;
        }

        .print-body {
          margin-top: 12pt;
        }

        .print-body h2 {
          font-size: 11pt;
          font-weight: bold;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #0a1628;
          border-bottom: 1.5px solid #29B5E8;
          padding-bottom: 4px;
          margin-top: 20pt;
          margin-bottom: 8pt;
          page-break-after: avoid;
        }

        .print-body h3 {
          font-size: 10pt;
          font-weight: bold;
          color: #1a3a5c;
          margin-top: 12pt;
          margin-bottom: 4pt;
          page-break-after: avoid;
        }

        .print-body p {
          margin: 4pt 0;
          orphans: 3;
          widows: 3;
        }

        .print-body table {
          width: 100%;
          border-collapse: collapse;
          margin: 8pt 0;
          font-size: 9pt;
          page-break-inside: avoid;
        }

        .print-body th {
          background: #f0f5fa;
          font-weight: bold;
          text-align: left;
          padding: 4pt 6pt;
          border: 1px solid #ccc;
        }

        .print-body td {
          padding: 3pt 6pt;
          border: 1px solid #ddd;
          vertical-align: top;
        }

        .print-body ul, .print-body ol {
          margin: 4pt 0;
          padding-left: 16pt;
        }

        .print-body li {
          margin: 2pt 0;
        }

        .print-body strong {
          color: #0a1628;
        }

        /* Footer on every page */
        #printable-report::after {
          content: "${new Date().toLocaleDateString()} — CONFIDENTIAL — Workover Report — AI-Generated Draft";
          position: fixed;
          bottom: 10mm;
          left: 16mm;
          right: 16mm;
          font-size: 7pt;
          color: #999;
          text-align: center;
          border-top: 0.5px solid #ddd;
          padding-top: 3mm;
        }
      }
    `}</style>
  );
}

// ─── Reusable form helpers ────────────────────────────────────────────────────

function WellNameAutocomplete({ value, onChange, onSelect }: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (s: WellSuggestion) => void;
}) {
  const [suggestions, setSuggestions] = useState<WellSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (v: string) => {
    onChange(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (v.length < 2) { setSuggestions([]); setOpen(false); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/wells/search?q=${encodeURIComponent(v)}`);
        const data: WellSuggestion[] = await res.json();
        setSuggestions(data);
        setOpen(data.length > 0);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }, 250);
  };

  const handleSelect = (s: WellSuggestion) => {
    onSelect(s);
    setOpen(false);
    setSuggestions([]);
  };

  return (
    <div className="relative">
      <label className="block text-xs font-medium text-gray-600 mb-1.5">
        Well Name <span className="text-red-400">*</span>
      </label>
      <input
        type="text"
        value={value}
        onChange={e => handleChange(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder="Type to search wells..."
        required
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#29B5E8] focus:border-transparent placeholder-gray-300 transition-shadow"
      />
      {loading && (
        <div className="absolute right-3 top-8 text-gray-400">
          <div className="w-3 h-3 border border-gray-300 border-t-[#29B5E8] rounded-full animate-spin" />
        </div>
      )}
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={() => handleSelect(s)}
              className="w-full text-left px-3 py-2.5 hover:bg-blue-50 border-b border-gray-50 last:border-0 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900">{s.well_name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                  s.status === 'ACTIVE' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>{s.status}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-400">{s.field}</span>
                {s.county && <span className="text-xs text-gray-300">·</span>}
                <span className="text-xs text-gray-400">{s.county} Co.</span>
                <span className="text-xs text-gray-300">·</span>
                <span className="text-xs text-gray-400 font-mono">{s.api_no}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FormInput({ label, value, onChange, type = 'text', placeholder, required }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#29B5E8] focus:border-transparent placeholder-gray-300 transition-shadow"
      />
    </div>
  );
}

function FormSelect({ label, value, onChange, options, required }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#29B5E8] focus:border-transparent bg-white transition-shadow"
      >
        <option value="">Select...</option>
        {options.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  );
}

function FormTextarea({ label, value, onChange, placeholder, required }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        rows={4}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#29B5E8] focus:border-transparent placeholder-gray-300 resize-none transition-shadow"
      />
    </div>
  );
}
