# Custom-vault-plugin-backstage

### Steps to Reproduce

- 1. Install the vscode plugin extension Tools for JavaScript/TypeScript
- 2. npx @backstage/create-app@latest use default name backstage
- 3. cd backstage
- 4. yarn install
- 5. yarn dev

### Custom Vault Plugin for Backstage Development Phase

- node backstageclient.mjs health --token hvs.XXXXX
- node backstageclient.mjs list-all --token hvs.XXXXX --json
- node backstageclient.mjs interactive --token hvs.XXXXX
- node backstageclient.mjs list-all --token hvs.XXXXX

### Sample Output

```bash
Checking Vault health...
✓ Vault is healthy
Status:
  Version: 1.17.6
  Initialized: true
  Sealed: false
  Standby: false
```

```bash
Scanning Vault for secrets...
Scanning secrets in mount: development
Scanning secrets in mount: kv
Scanning secrets in mount: production
  No secrets found in production/
  No secrets found in production
Scanning secrets in mount: secret
Scanning secrets in mount: secrets
Scanning secrets in mount: staging
  No secrets found in staging/
  No secrets found in staging

Mount: development (KV2)
  development/backstage/backstage-development
  development/backstage/backstage-login
  development/my-app/config

Mount: kv (KV2)
  kv/backstage/app-config
  kv/backstage/development
  kv/my-secret

Mount: production (KV2)
  No secrets found

Mount: secret (KV2)
  secret/backstage/backstage-plugins-tutorial

Mount: secrets (KV2)
  secrets/backstage/backstage-plugins-tutorial
  secrets/testsecret

Mount: staging (KV2)
  No secrets found

Total secrets found: 9
```
