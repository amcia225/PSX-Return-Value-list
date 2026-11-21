export interface HugePet {
  id: number;
  name: string;
  imageUrl: string;
  normalValue: number;
  goldenMultiplier: number;
  rainbowMultiplier: number;
  createdAt: string;
  updatedAt: string;
}

export interface HugeFormPayload {
  name: string;
  imageUrl: string;
  normalValue: number;
  goldenMultiplier: number;
  rainbowMultiplier: number;
}

export type SortOption = 'value-desc' | 'value-asc' | 'name-asc';

export interface AdminStatusResponse {
  envPinConfigured: boolean;
  needsSetup: boolean;
  authenticated: boolean;
}

export interface HealthResponse {
  status: 'ONLINE' | 'OFFLINE';
  count: number;
}
