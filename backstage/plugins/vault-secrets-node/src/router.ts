import { DiscoveryService, LoggerService } from '@backstage/backend-plugin-api';
import express from 'express';
import Router from 'express-promise-router';
import { Config } from '@backstage/config';
import { NotFoundError } from '@backstage/errors';

export interface RouterOptions {
  logger: LoggerService;
  config: Config;
  discovery: DiscoveryService;
}

export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { logger, config } = options;
  const router = Router();
  router.use(express.json());

  // Dynamic import of VaultService to support ESM module
  const { VaultService } = await import('./vault.js');
  const vaultService = new VaultService(config, logger);

  router.get('/health', async (_req, res) => {
    try {
      const health = await vaultService.getHealth();
      res.json(health);
    } catch (err) {
      logger.error('Failed to get vault health status', err as Error);
      throw new NotFoundError('Could not get vault health status');
    }
  });

  return router;
}
