/*eslint no-console: 0*/
"use strict";

/**
 * Standalone smoke test for the Robinhood connector.
 *
 * Runs in mock mode (no network, no credentials) and asserts that connect()
 * returns a client and that the read-only accessors return the expected shape.
 * Exits non-zero on any failure so it can be used in CI.
 *
 *   node test/robinhoodSmoke.js
 */

var assert = require("assert");
var robinhood = require("../lib/robinhood");

// Force mock mode regardless of the ambient environment.
process.env.ROBINHOOD_MOCK = "true";

robinhood.connect().then(function (client) {
	assert.ok(client, "connect() should resolve a client");
	assert.strictEqual(client.mock, true, "client should be in mock mode");

	return Promise.all([
		client.getPortfolio(),
		client.getPositions(),
		client.getQuotes("AAPL,GOOG")
	]);
}).then(function (res) {
	var portfolio = res[0].results[0];
	var positions = res[1].results;
	var quotes = res[2].results;

	assert.ok(portfolio.equity, "portfolio should expose equity");
	assert.ok(positions.length >= 1, "positions should be non-empty");
	assert.ok(positions[0].symbol, "position should have a symbol");
	assert.ok(quotes.length >= 1, "quotes should be non-empty");
	assert.ok(quotes[0].last_trade_price, "quote should have a last_trade_price");

	console.log("robinhoodSmoke: OK (" + positions.length + " positions, " + quotes.length + " quotes)");
}).catch(function (err) {
	console.error("robinhoodSmoke: FAILED -", err.message);
	process.exit(1);
});
