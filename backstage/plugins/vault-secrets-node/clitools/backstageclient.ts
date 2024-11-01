#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { VaultService } from '../src/vault';
import { ConfigReader } from '@backstage/config';
import { LoggerService } from '@backstage/backend-plugin-api';

// Create a simple logger for CLI
const logger: LoggerService = {
  debug: (...args: any[]) => console.debug(...args),
  error: (...args: any[]) => console.error(...args),
  info: (...args: any[]) => console.info(...args),
  warn: (...args: any[]) => console.warn(...args),
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
          baseUrl: options.url || process.env.VAULT_ADDR,
          token: options.token || process.env.VAULT_TOKEN,
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

program.parse();
