export interface VaultHealthStatus {
  initialized: boolean;
  sealed: boolean;
  standby: boolean;
  serverTimeUtc?: string;
  version: string;
  clusterName?: string;
  connected: boolean;
}

export interface VaultServiceConfig {
  baseUrl: string;
  token: string;
  namespace?: string;
}

export interface SecretEntry {
  path: string;
  data: Record<string, unknown>;
  metadata?: {
    created_time: string;
    deletion_time: string;
    destroyed: boolean;
    version: number;
  };
}
