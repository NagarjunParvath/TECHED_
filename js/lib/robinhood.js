/*eslint no-console: 0*/
"use strict";

/**
 * Robinhood connector (read-only).
 *
 * A small, self-contained client for connecting to Robinhood and reading
 * account data. Robinhood does not publish an official public API, so this
 * talks to the community-documented REST endpoints at api.robinhood.com.
 *
 * Design notes:
 *  - Credentials are NEVER hardcoded. They are read from environment
 *    variables (see the CONFIG section below) or passed to connect().
 *  - Only read-only operations are exposed (quotes, portfolio, positions).
 *    No order placement / trading is implemented on purpose.
 *  - A mock mode (ROBINHOOD_MOCK=true, or missing credentials) lets the
 *    integration be exercised end-to-end without real credentials.
 *
 * Environment variables:
 *  - ROBINHOOD_TOKEN      Pre-obtained OAuth2 bearer token (preferred).
 *  - ROBINHOOD_USERNAME   Username, used only if no token is supplied.
 *  - ROBINHOOD_PASSWORD   Password, used only if no token is supplied.
 *  - ROBINHOOD_MFA        Optional MFA/2FA code for username+password login.
 *  - ROBINHOOD_MOCK       When "true", returns sample data, no network calls.
 */

var https = require("https");
var querystring = require("querystring");

var API_HOST = "api.robinhood.com";

// Public OAuth client id used by the Robinhood web/mobile clients. This is
// not a secret; it identifies the application, not the user.
var OAUTH_CLIENT_ID = "c82SH0WZOsabOXGP2sxqcj34FxkvfnWRZBKlBjFS";

function envConfig() {
	return {
		token: process.env.ROBINHOOD_TOKEN,
		username: process.env.ROBINHOOD_USERNAME,
		password: process.env.ROBINHOOD_PASSWORD,
		mfa: process.env.ROBINHOOD_MFA,
		mock: String(process.env.ROBINHOOD_MOCK).toLowerCase() === "true"
	};
}

/**
 * Low-level HTTPS request helper that resolves with parsed JSON.
 */
function request(options, body) {
	return new Promise(function (resolve, reject) {
		var payload = body ? (typeof body === "string" ? body : JSON.stringify(body)) : null;

		var req = https.request(options, function (res) {
			var chunks = "";
			res.on("data", function (d) { chunks += d; });
			res.on("end", function () {
				var parsed = null;
				try {
					parsed = chunks ? JSON.parse(chunks) : {};
				} catch (e) {
					return reject(new Error("Invalid JSON from Robinhood (" + res.statusCode + "): " + chunks.slice(0, 200)));
				}
				if (res.statusCode >= 200 && res.statusCode < 300) {
					resolve(parsed);
				} else {
					var msg = (parsed && (parsed.detail || parsed.error_description || parsed.error)) || ("HTTP " + res.statusCode);
					reject(new Error("Robinhood request failed: " + msg));
				}
			});
		});

		req.on("error", reject);
		if (payload) { req.write(payload); }
		req.end();
	});
}

function get(path, token) {
	return request({
		host: API_HOST,
		path: path,
		method: "GET",
		headers: {
			"Accept": "application/json",
			"Authorization": token ? ("Bearer " + token) : undefined
		}
	});
}

/**
 * RobinhoodClient wraps an authenticated session (a bearer token) and
 * exposes read-only data accessors.
 */
function RobinhoodClient(token, mock) {
	this.token = token || null;
	this.mock = !!mock;
}

RobinhoodClient.prototype.getAccounts = function () {
	if (this.mock) { return Promise.resolve(mockData.accounts); }
	return get("/accounts/", this.token);
};

RobinhoodClient.prototype.getPortfolio = function () {
	if (this.mock) { return Promise.resolve(mockData.portfolio); }
	return get("/portfolios/", this.token);
};

RobinhoodClient.prototype.getPositions = function () {
	if (this.mock) { return Promise.resolve(mockData.positions); }
	return get("/positions/?nonzero=true", this.token);
};

/**
 * Fetch a quote for one or more symbols, e.g. getQuotes("AAPL,GOOG").
 */
RobinhoodClient.prototype.getQuotes = function (symbols) {
	if (this.mock) { return Promise.resolve(mockData.quotes); }
	return get("/quotes/?symbols=" + encodeURIComponent(symbols), this.token);
};

/**
 * Authenticate and return a connected RobinhoodClient.
 *
 * @param {Object} [config] Optional overrides for the env-based config.
 * @returns {Promise<RobinhoodClient>}
 */
function connect(config) {
	var cfg = Object.assign(envConfig(), config || {});

	// Mock mode: no network, no credentials required.
	if (cfg.mock || (!cfg.token && !(cfg.username && cfg.password))) {
		if (!cfg.mock) {
			console.log("[robinhood] No credentials found; connecting in MOCK mode.");
		}
		return Promise.resolve(new RobinhoodClient(null, true));
	}

	// Preferred path: caller already has a bearer token.
	if (cfg.token) {
		return Promise.resolve(new RobinhoodClient(cfg.token, false));
	}

	// Fall back to username/password OAuth2 login.
	var form = {
		grant_type: "password",
		client_id: OAUTH_CLIENT_ID,
		username: cfg.username,
		password: cfg.password,
		scope: "internal",
		expires_in: 86400
	};
	if (cfg.mfa) { form.mfa_code = cfg.mfa; }

	var payload = querystring.stringify(form);
	return request({
		host: API_HOST,
		path: "/oauth2/token/",
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			"Content-Length": Buffer.byteLength(payload)
		}
	}, payload).then(function (res) {
		if (res.mfa_required) {
			throw new Error("MFA required: set ROBINHOOD_MFA and retry.");
		}
		if (!res.access_token) {
			throw new Error("Login succeeded but no access_token was returned.");
		}
		return new RobinhoodClient(res.access_token, false);
	});
}

// Sample data returned in mock mode so the integration can be demonstrated
// without real credentials.
var mockData = {
	accounts: {
		results: [{ account_number: "MOCK123456", type: "individual", buying_power: "1000.0000" }]
	},
	portfolio: {
		results: [{
			equity: "12345.67",
			market_value: "11000.00",
			extended_hours_equity: "12300.00"
		}]
	},
	positions: {
		results: [
			{ symbol: "AAPL", quantity: "10.0000", average_buy_price: "150.0000" },
			{ symbol: "GOOG", quantity: "3.0000", average_buy_price: "2500.0000" }
		]
	},
	quotes: {
		results: [
			{ symbol: "AAPL", last_trade_price: "195.20", previous_close: "193.10" },
			{ symbol: "GOOG", last_trade_price: "178.45", previous_close: "176.00" }
		]
	}
};

module.exports = {
	connect: connect,
	RobinhoodClient: RobinhoodClient,
	envConfig: envConfig
};
