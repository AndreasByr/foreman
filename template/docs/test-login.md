# Test-login pattern

The pretest logs in without driving a third-party login (OAuth, SSO, a chat platform). The project provides a small test login. The runner (`scripts/pretest-run.mjs`) and the guards assume this pattern; if your app has no login, use only role `anonymous` and skip this file.

## Rules for the endpoint

1. **Own switch.** The endpoint exists only when a dedicated setting turns it on (for example `TEST_LOGIN_ENABLED=true`). It is off by default.
2. **Never on production.** The app refuses to start, or answers 404, when the switch is on and the host or the environment is production. Check the environment name and the public URL, not only the switch.
3. **Allowlist.** It logs in only accounts and tenants from an allowlist in the environment (for example `TEST_LOGIN_USER_IDS`, `TEST_LOGIN_TENANTS`). Anything else gets 403, with the same answer for unknown and forbidden to leak nothing.
4. **Secret of at least 32 characters** in the request body, compared in constant time. One secret per environment (`TEST_LOGIN_SECRET_DEV`, `TEST_LOGIN_SECRET_STAGING`), never reused, never in the repo.
5. **Rate limit** failed attempts per client (for example 10 per 5 minutes). Runs make at most two failed attempts per target.
6. **Never admin.** The allowlist has no operator or administrator account. The endpoint cannot create accounts or grant rights.
7. **Logging** records that a test login happened and for which role, never the secret or the account ID.

## Request

`POST <path>` with a JSON body. The runner sends `{ "secret": ..., "userId": ..., "tenant": ... }`; rename the fields in `.foreman.json` `pretest.login.fields` if your endpoint differs. Status 200 and a session cookie mean success.

## Configuration in `.foreman.json`

```json
"pretest": {
  "targets": { "dev": "https://dev.example.com", "staging": "https://staging.example.com" },
  "productionHosts": ["app.example.com"],
  "tenants": { "dev": ["test-a", "test-b"], "staging": ["test-a"] },
  "blocked": ["^/t/protected-tenant"],
  "login": {
    "path": "/api/test-login",
    "secretEnv": { "dev": "TEST_LOGIN_SECRET_DEV", "staging": "TEST_LOGIN_SECRET_STAGING" },
    "roles": { "owner": "TEST_LOGIN_USER_OWNER", "member": "TEST_LOGIN_USER_MEMBER" },
    "fields": { "secret": "secret", "user": "userId", "tenant": "tenant" }
  }
}
```

### Keeping addresses out of the repo (`.foreman.local.json`)

Put the values that must not be committed (the dev address, the production hosts) into `.foreman.local.json` next to `.foreman.json`. The file is git-ignored (the installer adds it to `.gitignore`), has the same shape and holds only what differs, for example `{ "pretest": { "targets": { "dev": "https://dev.example.com" }, "productionHosts": ["app.example.com"] } }`. The pretest runner merges it over `.foreman.json`: objects merge key by key, arrays and single values of the local file replace. The guards still apply to the merged result. The file must exist where the work run starts the runner, so provide it there (a path outside the repo is not read). Only the pretest runner reads it; scripts that read `.foreman.json` directly see the committed file.

`roles` maps a role name to the name of the variable that holds that account's ID. The variables must also exist in the work run's environment (names only in this file). `blocked` are regular expressions matched against tenants and paths; use them for a tenant that must never be touched.

## Effects in other systems

For an effect in a bot or another service, add a test-interaction endpoint with the same six rules (own switch, never production, allowlist of tenants or guilds, secret, rate limit, no admin) and prove the effect with a read-only check script that uses only GET and a token that cannot write. Never automate a real user account.
