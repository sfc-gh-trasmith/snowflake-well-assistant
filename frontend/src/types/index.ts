export interface Well {
  api_no: string;
  well_name: string;
  field: string;
  latitude: number;
  longitude: number;
  county: string;
  operator: string;
  status: string;
  formation: string;
  tvd_ft?: number;
  lateral_length_ft?: number;
  health_score?: number;
  health_status?: 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
}

export interface WellHealth {
  api_no: string;
  well_name: string;
  health_score: number;
  health_status: 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
  anomaly_score: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sql?: string;
  data?: Record<string, unknown>[];
  wellsMentioned?: string[];
  thinking?: string;
  statusMessage?: string;
  timestamp: Date;
}

