import vault from 'node-vault';
import { LoggerService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import { VaultHealthStatus, VaultServiceConfig, SecretEntry } from './types';
import { JsonValue } from '@backstage/types';
import type { VaultOptions, client as VaultClient } from 'node-vault';

class VaultService {
  private readonly logger: LoggerService;
  private readonly config: VaultServiceConfig;
  private readonly client: VaultClient;

  constructor(config: Config, logger: LoggerService) {
    this.logger = logger;
    this.config = this.readConfig(config);
    if (!this.config.token) {
      throw new Error("Missing required config value at 'vault.token'");
    }
    this.client = this.initializeClient();
  }

  private readConfig(config: Config): VaultServiceConfig {
    const vaultConfig = config.getConfig('vault');
    return {
      baseUrl: vaultConfig.getString('baseUrl'),
      token: vaultConfig.getString('token'),
      namespace: vaultConfig.getOptionalString('namespace'),
    };
  }

  private initializeClient(): VaultClient {
    const options: VaultOptions = {
      apiVersion: 'v1',
      endpoint: this.config.baseUrl,
      token: this.config.token,
    };
    if (this.config.namespace) {
      options.namespace = this.config.namespace;
    }
    this.logger.debug('Initializing Vault client', {
      endpoint: options.endpoint,
    });
    return vault(options);
  }
  async getSecret(path: string): Promise<SecretEntry> {
    try {
      const response = await this.client.read(path);
      return {
        path,
        data: response.data,
        metadata: response.metadata,
      };
    } catch (error) {
      this.logger.error('Failed to read secret', {
        path,
        error: error as JsonValue,
      });
      throw error;
    }
  }
  async getHealth(): Promise<VaultHealthStatus> {
    try {
      this.logger.debug('Checking Vault health status');
      const healthResponse = await this.client.health();
      return {
        initialized: healthResponse.initialized,
        sealed: healthResponse.sealed,
        standby: healthResponse.standby,
        serverTimeUtc: new Date().toISOString(),
        version: healthResponse.version,
        clusterName: healthResponse.cluster_name,
        connected: true,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to check Vault health status', {
        error: errorMessage as JsonValue,
      });
      return {
        initialized: false,
        sealed: true,
        standby: false,
        version: 'unknown',
        connected: false,
        serverTimeUtc: new Date().toISOString(),
      };
    }
  }
}

export { VaultService };
