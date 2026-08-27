import { Well, WellHealth } from '../types';

const API_BASE = '/api';

export interface StreamEvent {
  type: 'text_delta' | 'thinking_delta' | 'status' | 'tool_use' | 'tool_result' | 'clarification' | 'done' | 'error';
  text?: string;
  tool?: string;
  sql?: string;
  data?: Record<string, unknown>[];
  wells_mentioned?: string[];
  well_options?: string[];
  message?: string;
}

export interface WorkoverFormData {
  wellName: string;
  apiNumber: string;
  field: string;
  county: string;
  operator: string;
  wellType: string;
  formation: string;
  tvdFt: string;
  mdFt: string;
  lateralLengthFt: string;
  currentLiftType: string;
  proposedLiftType: string;
  workoverReason: string;
  problemDescription: string;
  lastProductionOil: string;
  lastProductionGas: string;
  lastProductionWater: string;
  shutInDate: string;
  proposedStartDate: string;
  estimatedDuration: string;
  estimatedCost: string;
  additionalNotes: string;
}

export async function generateWorkoverReport(
  formData: WorkoverFormData,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  const response = await fetch(`${API_BASE}/workover/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formData),
  });

  if (!response.ok) throw new Error('Failed to generate workover report');
  if (!response.body) throw new Error('No response body');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const dataStr = line.slice(6).trim();
      if (!dataStr) continue;
      try {
        const event: StreamEvent = JSON.parse(dataStr);
        onEvent(event);
      } catch {
        // skip malformed
      }
    }
  }

  if (buffer.startsWith('data: ')) {
    const dataStr = buffer.slice(6).trim();
    if (dataStr) {
      try {
        const event: StreamEvent = JSON.parse(dataStr);
        onEvent(event);
      } catch {
        // skip
      }
    }
  }
}

export async function streamChatMessage(
  query: string,
  onEvent: (event: StreamEvent) => void,
  selectedWell?: string,
  conversationHistory?: { role: string; content: string }[],
  selectedWells?: string[],
): Promise<void> {
  const response = await fetch(`${API_BASE}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      selected_well: selectedWell,
      conversation_history: conversationHistory,
      selected_wells: selectedWells,
    }),
  });

  if (!response.ok) throw new Error('Failed to send message');
  if (!response.body) throw new Error('No response body');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const dataStr = line.slice(6).trim();
      if (!dataStr) continue;
      try {
        const event: StreamEvent = JSON.parse(dataStr);
        onEvent(event);
      } catch {
        // skip malformed
      }
    }
  }

  if (buffer.startsWith('data: ')) {
    const dataStr = buffer.slice(6).trim();
    if (dataStr) {
      try {
        const event: StreamEvent = JSON.parse(dataStr);
        onEvent(event);
      } catch {
        // skip
      }
    }
  }
}

export async function fetchWells(): Promise<Well[]> {
  const response = await fetch(`${API_BASE}/wells`);
  if (!response.ok) throw new Error('Failed to fetch wells');
  return response.json();
}

export async function fetchWellHealth(): Promise<WellHealth[]> {
  const response = await fetch(`${API_BASE}/wells/health`);
  if (!response.ok) throw new Error('Failed to fetch well health');
  return response.json();
}

export async function fetchInferenceStatus(): Promise<{ status: string; message: string }> {
  const response = await fetch(`${API_BASE}/inference/status`);
  if (!response.ok) throw new Error('Failed to fetch inference status');
  return response.json();
}

export async function resumeInferenceService(): Promise<{ status: string; message: string }> {
  const response = await fetch(`${API_BASE}/inference/resume`, { method: 'POST' });
  if (!response.ok) throw new Error('Failed to resume service');
  return response.json();
}

export async function fetchWellSensors(apiNo: string): Promise<Record<string, unknown>[]> {
  const response = await fetch(`${API_BASE}/wells/${encodeURIComponent(apiNo)}/sensors`);
  if (!response.ok) throw new Error('Failed to fetch sensors');
  return response.json();
}

export async function predictHealth(features: Record<string, number>): Promise<{ anomaly_score: number; health_score: number; health_status: string }> {
  const response = await fetch(`${API_BASE}/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(features),
  });
  if (!response.ok) throw new Error('Prediction failed');
  return response.json();
}

export async function predictHealthBatch(scenarios: Record<string, number>[]): Promise<{ scenario: number; anomaly_score: number; health_score: number; health_status: string }[]> {
  const response = await fetch(`${API_BASE}/predict/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenarios }),
  });
  if (!response.ok) throw new Error('Batch prediction failed');
  return response.json();
}

export async function getCurrentUser(): Promise<{ user: string; role: string }> {
  const response = await fetch(`${API_BASE}/me`);
  if (!response.ok) throw new Error('Failed to fetch user');
  return response.json();
}

export interface MonthlyProduction {
  month: string;       // "2024-03-01"
  avg_oil: number;
  avg_gas: number;
  avg_water: number;
  avg_runtime: number;
  days_in_month: number;
}

export interface ForecastPoint {
  forecast_date: string;  // "2026-07-16"
  p50: number;
  p10: number;
  p90: number;
  model_version: string;
  created_at: string;
}

export interface WellProductionForecast {
  historical: MonthlyProduction[];
  forecast: ForecastPoint[];
  has_forecast: boolean;
}

export async function fetchWellProductionForecast(apiNo: string): Promise<WellProductionForecast> {
  const response = await fetch(`${API_BASE}/wells/${encodeURIComponent(apiNo)}/production-forecast`);
  if (!response.ok) throw new Error('Failed to fetch production forecast');
  return response.json();
}
