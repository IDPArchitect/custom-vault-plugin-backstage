import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';
import { VaultService } from './vault';

/**
 * vaultSecretsPlugin backend plugin
 *
 * @public
 */
export const vaultSecretsPlugin = createBackendPlugin({
  pluginId: 'vault-secrets',
  register(env) {
    env.registerInit({
      deps: {
        logger: coreServices.logger,
        rootConfig: coreServices.rootConfig,
        discovery: coreServices.discovery,
        http: coreServices.httpRouter,
      },
      async init({ logger, rootConfig, discovery, http }) {
        // Initialize the vault service
        const vaultService = new VaultService(rootConfig, logger);

        // Create the router with the vault service
        const router = await createRouter({
          logger,
          config: rootConfig,
          discovery,
        });

        // Register vault health endpoint directly on the router
        router.get('/health', async (_req, res) => {
          try {
            const health = await vaultService.getHealth();
            res.json(health);
          } catch (err) {
            logger.error('Failed to get vault health status', err as Error);
            res.status(500).json({
              error: 'Failed to get vault health status',
            });
          }
        });

        // Mount the router
        http.use(router);
      },
    });
  },
});
