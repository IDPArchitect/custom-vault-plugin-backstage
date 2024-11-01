#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { ConfigReader } from '@backstage/config';
import inquirer from 'inquirer';

// Inline the service for now
class VaultService {
  constructor(config, logger) {
    this.logger = logger;
    const vaultConfig = config.getConfig('vault');
    this.baseUrl = vaultConfig.getString('baseUrl');
    this.token = vaultConfig.getString('token');
  }

  async createOrUpdateSecret(path, data, isKV2 = false) {
    try {
      let secretPath = path;
      let payload = data;

      // For KV2, we need to remove the mount prefix first, then add it back with data
      if (isKV2) {
        // Split path into mount and secret path
        const pathParts = secretPath.split('/');
        const mountPoint = pathParts[0];
        const remainingPath = pathParts.slice(1).join('/');

        // Reconstruct path with /data/ after mount point
        secretPath = `${mountPoint}/data/${remainingPath}`;
        payload = { data: data };

        console.log(chalk.gray('KV2 path details:'));
        console.log(chalk.gray(`Mount point: ${mountPoint}`));
        console.log(chalk.gray(`Secret path: ${remainingPath}`));
      }

      // Remove any double slashes and leading slash
      secretPath = secretPath.replace(/\/+/g, '/').replace(/^\//, '');

      console.log(chalk.blue(`Saving to path: ${secretPath}`));
      console.log(chalk.gray('Payload:', JSON.stringify(payload, null, 2)));

      const response = await fetch(`${this.baseUrl}/v1/${secretPath}`, {
        method: 'POST',
        headers: {
          'X-Vault-Token': this.token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.log(chalk.red('Response:', JSON.stringify(errorData, null, 2)));
        const warnings = errorData.warnings?.join(', ') || '';
        throw new Error(
          warnings || `Failed to save secret (${response.status})`,
        );
      }

      return true;
    } catch (error) {
      this.logger.error('Failed to save secret', {
        path,
        error: error.message,
      });
      throw error;
    }
  }

  // Also update validatePath
  async validatePath(path, isKV2) {
    try {
      // Clean the path
      let checkPath = path.replace(/\/+/g, '/').replace(/^\//, '');

      if (isKV2) {
        // Split path into mount and secret path
        const pathParts = checkPath.split('/');
        const mountPoint = pathParts[0];
        const remainingPath = pathParts.slice(1).join('/');

        // Check metadata path
        checkPath = `${mountPoint}/metadata/${remainingPath}`;
      }

      console.log(chalk.gray(`Checking path: ${checkPath}`));

      const response = await fetch(`${this.baseUrl}/v1/${checkPath}`, {
        headers: {
          'X-Vault-Token': this.token,
        },
      });

      // For new secrets, 404 is expected
      if (response.status === 404) {
        return false;
      }

      return response.status === 200;
    } catch {
      return false;
    }
  }

  // And update getSecret
  async getSecret(path, isKV2 = false) {
    try {
      let secretPath = path;

      if (isKV2) {
        // Split path into mount and secret path
        const pathParts = secretPath.split('/');
        const mountPoint = pathParts[0];
        const remainingPath = pathParts.slice(1).join('/');

        // Reconstruct path with /data/ after mount point
        secretPath = `${mountPoint}/data/${remainingPath}`;
      }

      // Remove any double slashes and leading slash
      secretPath = secretPath.replace(/\/+/g, '/').replace(/^\//, '');

      console.log(chalk.gray(`Reading from path: ${secretPath}`));

      const response = await fetch(`${this.baseUrl}/v1/${secretPath}`, {
        headers: {
          'X-Vault-Token': this.token,
        },
      });

      if (response.status === 404) {
        throw new Error(`Secret not found at ${path}`);
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch secret: ${response.status}`);
      }

      const data = await response.json();
      return isKV2 ? data.data.data : data.data;
    } catch (error) {
      this.logger.error('Failed to get secret', { path, error: error.message });
      throw error;
    }
  }
  async getAllSecrets() {
    try {
      // First, list all secret engines
      const response = await fetch(`${this.baseUrl}/v1/sys/mounts`, {
        headers: {
          'X-Vault-Token': this.token,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const mounts = await response.json();
      const results = [];

      // Iterate through each mount
      for (const [path, info] of Object.entries(mounts.data)) {
        // Remove trailing slash from path
        const mountPath = path.endsWith('/') ? path.slice(0, -1) : path;

        if (info.type === 'kv' || info.type === 'kv-v2') {
          console.log(chalk.blue(`Scanning secrets in mount: ${mountPath}`));
          try {
            const isKV2 =
              info.options?.version === '2' || info.type === 'kv-v2';
            const secrets = await this.listSecretsRecursively(mountPath, isKV2);

            if (secrets.length === 0) {
              console.log(chalk.yellow(`  No secrets found in ${mountPath}`));
            }

            results.push({
              mount: mountPath,
              type: isKV2 ? 'KV2' : 'KV1',
              secrets,
            });
          } catch (error) {
            console.log(
              chalk.red(
                `  Error listing secrets in ${mountPath}: ${error.message}`,
              ),
            );
          }
        }
      }

      return results;
    } catch (error) {
      this.logger.error('Failed to list all secrets', { error: error.message });
      throw error;
    }
  }

  async listSecretsRecursively(mountPath, isKV2, currentPath = '') {
    const results = [];
    try {
      const listPath = isKV2
        ? `${mountPath}/metadata/${currentPath}`
        : `${mountPath}/${currentPath}`;

      const response = await fetch(`${this.baseUrl}/v1/${listPath}?list=true`, {
        headers: {
          'X-Vault-Token': this.token,
        },
      });

      if (response.status === 404) {
        console.log(
          chalk.yellow(`  No secrets found in ${mountPath}/${currentPath}`),
        );
        return results;
      }

      if (!response.ok) {
        throw new Error(`Failed to list secrets: ${response.status}`);
      }

      const data = await response.json();
      const keys = data.data?.keys || [];

      for (const key of keys) {
        const fullPath = currentPath + key;
        if (key.endsWith('/')) {
          // This is a folder, recurse into it
          const subResults = await this.listSecretsRecursively(
            mountPath,
            isKV2,
            fullPath,
          );
          results.push(...subResults);
        } else {
          // This is a secret
          results.push({
            path: `${mountPath}/${fullPath}`,
            isKV2,
          });
        }
      }

      return results;
    } catch (error) {
      if (!error.message.includes('404')) {
        console.log(
          chalk.red(
            `  Error listing ${mountPath}/${currentPath}: ${error.message}`,
          ),
        );
      }
      return results;
    }
  }
  async getHealth() {
    try {
      const response = await fetch(`${this.baseUrl}/v1/sys/health`, {
        headers: {
          'X-Vault-Token': this.token,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return {
        initialized: data.initialized,
        sealed: data.sealed,
        standby: data.standby,
        serverTimeUtc: new Date().toISOString(),
        version: data.version,
        clusterName: data.cluster_name,
        connected: true,
      };
    } catch (error) {
      this.logger.error('Failed to check Vault health status', {
        error: error.message,
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

const logger = {
  debug: (...args) => console.debug(...args),
  error: (...args) => console.error(...args),
  info: (...args) => console.info(...args),
  warn: (...args) => console.warn(...args),
  child: () => logger,
};

const program = new Command();

program
  .name('backstagevault')
  .description('CLI tool for managing Vault secrets in Backstage')
  .version('0.1.0');

program
  .command('health')
  .description('Check Vault server health status')
  .option('-u, --url <url>', 'Vault server URL', 'http://localhost:8200')
  .option('-t, --token <token>', 'Vault token')
  .action(async options => {
    try {
      const config = new ConfigReader({
        vault: {
          baseUrl:
            options.url || process.env.VAULT_ADDR || 'http://localhost:8200',
          token: options.token || process.env.VAULT_TOKEN || '',
        },
      });

      const vaultService = new VaultService(config, logger);

      console.log(chalk.blue('Checking Vault health...'));
      const health = await vaultService.getHealth();

      if (health.connected) {
        console.log(chalk.green('✓ Vault is healthy'));
        console.log(chalk.white('Status:'));
        console.log(`  Version: ${health.version}`);
        console.log(`  Initialized: ${health.initialized}`);
        console.log(`  Sealed: ${health.sealed}`);
        console.log(`  Standby: ${health.standby}`);
      } else {
        console.log(chalk.red('✗ Vault is not accessible'));
      }
    } catch (error) {
      console.error(chalk.red('Error checking vault health:'), error);
      process.exit(1);
    }
  });

program
  .command('list-all')
  .description('List all secrets in all mounts')
  .option('-u, --url <url>', 'Vault server URL', 'http://localhost:8200')
  .option('-t, --token <token>', 'Vault token')
  .option('--json', 'Output in JSON format')
  .action(async options => {
    try {
      const config = new ConfigReader({
        vault: {
          baseUrl:
            options.url || process.env.VAULT_ADDR || 'http://localhost:8200',
          token: options.token || process.env.VAULT_TOKEN || '',
        },
      });

      const vaultService = new VaultService(config, logger);

      console.log(chalk.blue('Scanning Vault for secrets...'));
      const results = await vaultService.getAllSecrets();

      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        let totalSecrets = 0;

        results.forEach(mount => {
          console.log(chalk.yellow(`\nMount: ${mount.mount} (${mount.type})`));
          if (mount.secrets.length === 0) {
            console.log(chalk.gray('  No secrets found'));
          } else {
            mount.secrets.forEach(secret => {
              console.log(chalk.white(`  ${secret.path}`));
              totalSecrets++;
            });
          }
        });

        console.log(chalk.green(`\nTotal secrets found: ${totalSecrets}`));
      }
    } catch (error) {
      console.error(chalk.red('Error listing secrets:'), error);
      process.exit(1);
    }
  });

program
  .command('interactive')
  .description('Interactively create or update a secret')
  .option('-u, --url <url>', 'Vault server URL', 'http://localhost:8200')
  .option('-t, --token <token>', 'Vault token')
  .action(async options => {
    try {
      const config = new ConfigReader({
        vault: {
          baseUrl:
            options.url || process.env.VAULT_ADDR || 'http://localhost:8200',
          token: options.token || process.env.VAULT_TOKEN || '',
        },
      });

      const vaultService = new VaultService(config, logger);

      // Get list of secret engines first
      const mounts = await vaultService.getAllSecrets();
      const engineChoices = mounts.map(mount => ({
        name: `${mount.mount} (${mount.type})`,
        value: { path: mount.mount, type: mount.type },
      }));

      // Get engine and path information
      const engineAnswer = await inquirer.prompt([
        {
          type: 'list',
          name: 'engine',
          message: 'Select secret engine:',
          choices: engineChoices,
        },
      ]);

      const pathAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'path',
          message: 'Enter the secret path (e.g., my-app/config):',
          validate: async input => {
            if (!input) return 'Path cannot be empty';
            if (input.startsWith('/')) return 'Path should not start with /';
            if (input.endsWith('/')) return 'Path should not end with /';
            if (!/^[a-zA-Z0-9_/-]+$/.test(input)) {
              return 'Path should only contain letters, numbers, underscores, hyphens, and forward slashes';
            }
            return true;
          },
        },
      ]);

      const isKV2 = engineAnswer.engine.type === 'KV2';
      const enginePath = engineAnswer.engine.path.replace(/\/$/, '');
      const secretPath = pathAnswer.path.replace(/^\//, '');
      const fullPath = `${enginePath}/${secretPath}`;

      console.log(chalk.blue(`\nWorking with secret at: ${fullPath}`));

      // Check if secret exists
      const exists = await vaultService.validatePath(fullPath, isKV2);

      if (exists) {
        console.log(chalk.yellow('\nSecret already exists. Current values:'));
        const currentSecret = await vaultService.getSecret(fullPath, isKV2);
        console.log(currentSecret);
      }

      // Collect secret data
      const secretData = {};
      let addingFields = true;

      while (addingFields) {
        const fieldAnswers = await inquirer.prompt([
          {
            type: 'input',
            name: 'key',
            message: 'Enter secret key (or leave empty to finish):',
            validate: input => {
              if (input && !/^[a-zA-Z0-9_-]+$/.test(input)) {
                return 'Key should only contain letters, numbers, underscores, and hyphens';
              }
              return true;
            },
          },
        ]);

        if (!fieldAnswers.key) {
          addingFields = false;
          continue;
        }

        const valueAnswer = await inquirer.prompt([
          {
            type: 'input',
            name: 'value',
            message: `Enter value for ${fieldAnswers.key}:`,
            validate: input => {
              if (!input) return 'Value cannot be empty';
              return true;
            },
          },
        ]);

        secretData[fieldAnswers.key] = valueAnswer.value;

        console.log(chalk.gray('\nCurrent secret data:'));
        console.log(secretData);

        const continueAnswer = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'continue',
            message: 'Add another field?',
            default: true,
          },
        ]);

        addingFields = continueAnswer.continue;
      }

      if (Object.keys(secretData).length === 0) {
        console.log(
          chalk.yellow('No secret data provided. Operation cancelled.'),
        );
        return;
      }

      const confirmSave = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'save',
          message: chalk.yellow('Save this secret?'),
          default: true,
        },
      ]);

      if (confirmSave.save) {
        await vaultService.createOrUpdateSecret(fullPath, secretData, isKV2);
        console.log(chalk.green('\nSecret saved successfully!'));
        console.log(chalk.white('\nSecret details:'));
        console.log(chalk.white(`Path: ${fullPath}`));
        console.log(chalk.white(`Engine type: ${isKV2 ? 'KV2' : 'KV1'}`));
        console.log(chalk.white('Data:'));
        console.log(secretData);
      } else {
        console.log(chalk.yellow('\nOperation cancelled.'));
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });
program.parse();
