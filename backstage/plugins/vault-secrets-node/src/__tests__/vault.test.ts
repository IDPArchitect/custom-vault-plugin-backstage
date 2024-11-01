import { ConfigReader } from '@backstage/config';
import { mockServices } from '@backstage/backend-test-utils';
import { VaultService } from '../vault';

// Mock the vault module at the top level
jest.mock('node-vault');

const mockHealthResponse = {
  initialized: true,
  sealed: false,
  standby: false,
  version: '1.12.0',
  cluster_name: 'vault-cluster-1',
};

describe('VaultService', () => {
  const mockConfig = new ConfigReader({
    vault: {
      baseUrl: 'http://localhost:8200',
      token: 'test-token',
    },
  });

  const logger = mockServices.logger.mock();
  const mockHealth = jest.fn();
  const mockVault = jest.fn(() => ({
    health: mockHealth,
  }));

  beforeEach(() => {
    jest.clearAllMocks();
    // Update the mock implementation for each test
    require('node-vault').mockImplementation(mockVault);
  });

  describe('getHealth', () => {
    it('should return successful health status when vault is healthy', async () => {
      mockHealth.mockResolvedValueOnce(mockHealthResponse);

      const service = new VaultService(mockConfig, logger);
      const health = await service.getHealth();

      expect(mockHealth).toHaveBeenCalled();
      expect(health).toEqual({
        initialized: true,
        sealed: false,
        standby: false,
        version: '1.12.0',
        clusterName: 'vault-cluster-1',
        connected: true,
        serverTimeUtc: expect.any(String),
      });
    });

    it('should handle vault connection failure', async () => {
      const error = new Error('Connection failed');
      mockHealth.mockRejectedValueOnce(error);

      const service = new VaultService(mockConfig, logger);
      const health = await service.getHealth();

      expect(mockHealth).toHaveBeenCalled();
      expect(health).toEqual({
        initialized: false,
        sealed: true,
        standby: false,
        version: 'unknown',
        connected: false,
        serverTimeUtc: expect.any(String),
      });

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to check Vault health status',
        expect.objectContaining({
          error,
        }),
      );
    });
  });

  describe('configuration', () => {
    it('should initialize with namespace when provided', () => {
      const configWithNamespace = new ConfigReader({
        vault: {
          baseUrl: 'http://localhost:8200',
          token: 'test-token',
          namespace: 'my-namespace',
        },
      });

      new VaultService(configWithNamespace, logger);

      expect(mockVault).toHaveBeenCalledWith(
        expect.objectContaining({
          namespace: 'my-namespace',
          endpoint: 'http://localhost:8200',
          token: 'test-token',
          apiVersion: 'v1',
        }),
      );
    });

    it('should throw error when required config is missing', () => {
      const invalidConfig = new ConfigReader({
        vault: {
          // missing baseUrl
          token: 'test-token',
        },
      });

      expect(() => new VaultService(invalidConfig, logger)).toThrow(
        "Missing required config value at 'vault.baseUrl'",
      );
    });

    it('should initialize without namespace when not provided', () => {
      new VaultService(mockConfig, logger);

      expect(mockVault).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: 'http://localhost:8200',
          token: 'test-token',
          apiVersion: 'v1',
        }),
      );

      expect(mockVault).toHaveBeenCalledWith(
        expect.not.objectContaining({
          namespace: expect.anything(),
        }),
      );
    });
  });
});
