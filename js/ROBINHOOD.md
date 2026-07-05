# Robinhood Connector

A small, read-only connector for reaching Robinhood account data from the
Node.js backend of this project.

> Robinhood does not publish an official public API. This client talks to the
> community-documented REST endpoints at `api.robinhood.com`. Use it in
> accordance with Robinhood's terms of service.

## What it does

- Connects to Robinhood using a bearer token **or** username/password (+ MFA).
- Exposes **read-only** accessors: accounts, portfolio, positions, quotes.
- Never trades. No order-placement endpoints are implemented, on purpose.
- Falls back to a **mock mode** (sample data, no network) when credentials are
  absent or `ROBINHOOD_MOCK=true`, so the integration can be exercised safely.

## Configuration

Credentials are read from environment variables — nothing is hardcoded:

| Variable              | Purpose                                             |
|-----------------------|-----------------------------------------------------|
| `ROBINHOOD_TOKEN`     | Pre-obtained OAuth2 bearer token (preferred).       |
| `ROBINHOOD_USERNAME`  | Username, used only when no token is supplied.      |
| `ROBINHOOD_PASSWORD`  | Password, used only when no token is supplied.      |
| `ROBINHOOD_MFA`       | Optional MFA/2FA code for username+password login.  |
| `ROBINHOOD_MOCK`      | `true` → return sample data, no network calls.      |
| `ROBINHOOD_SYMBOLS`   | Comma-separated symbols for the demo (default AAPL,GOOG). |

## Usage

```bash
# Mock mode (no credentials needed)
ROBINHOOD_MOCK=true npm run robinhood

# With a token
ROBINHOOD_TOKEN=xxxxx npm run robinhood

# With username/password
ROBINHOOD_USERNAME=me ROBINHOOD_PASSWORD=secret npm run robinhood

# Smoke test (always mock, CI-friendly)
npm run robinhood:test
```

## Programmatic API

```js
var robinhood = require("./lib/robinhood");

robinhood.connect().then(function (client) {
  return client.getQuotes("AAPL,GOOG");
}).then(function (res) {
  console.log(res.results);
});
```

`connect(config?)` resolves a `RobinhoodClient` with:

- `getAccounts()`
- `getPortfolio()`
- `getPositions()`
- `getQuotes(symbols)`

Each returns a Promise for the parsed JSON response.
