/*eslint no-console: 0*/
"use strict";

/**
 * Connect to Robinhood and print a short account summary.
 *
 * Usage:
 *   node robinhood-connect.js            # uses env vars, or mock mode
 *   ROBINHOOD_MOCK=true node robinhood-connect.js
 *   ROBINHOOD_TOKEN=... node robinhood-connect.js
 *   ROBINHOOD_USERNAME=... ROBINHOOD_PASSWORD=... node robinhood-connect.js
 */

var robinhood = require("./lib/robinhood");

var SYMBOLS = process.env.ROBINHOOD_SYMBOLS || "AAPL,GOOG";

robinhood.connect().then(function (client) {
	console.log("[robinhood] Connected (" + (client.mock ? "mock" : "live") + " mode).");

	return Promise.all([
		client.getPortfolio(),
		client.getPositions(),
		client.getQuotes(SYMBOLS)
	]).then(function (res) {
		var portfolio = (res[0].results && res[0].results[0]) || {};
		var positions = res[1].results || [];
		var quotes = res[2].results || [];

		console.log("\nPortfolio equity : " + (portfolio.equity || "n/a"));
		console.log("Market value     : " + (portfolio.market_value || "n/a"));

		console.log("\nPositions:");
		positions.forEach(function (p) {
			console.log("  " + p.symbol + "  qty=" + p.quantity + "  avg=" + p.average_buy_price);
		});

		console.log("\nQuotes (" + SYMBOLS + "):");
		quotes.forEach(function (q) {
			console.log("  " + q.symbol + "  last=" + q.last_trade_price + "  prevClose=" + q.previous_close);
		});
	});
}).catch(function (err) {
	console.error("[robinhood] Connection failed:", err.message);
	process.exit(1);
});
