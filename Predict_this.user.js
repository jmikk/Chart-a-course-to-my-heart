// ==UserScript==
// @name         NationStates Card Price Tracker with Accurate Rolling FMV
// @namespace    http://tampermonkey.net/
// @version      2.4
// @description  Replace the chart on NationStates card pages with FMV calculated using a rolling window of 15 trades chronologically, removing outliers.
// @author       Your Name
// @match        https://www.nationstates.net/page=deck/card=*
// @require      https://cdn.jsdelivr.net/npm/chart.js
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
    'use strict';

    const API_BASE = "https://www.nationstates.net/cgi-bin/api.cgi?q=card+trades";
    const USER_AGENT = "CHANGE ME TO YOUR NATION (9003's Chart addition script)";
    const CURRENT_SEASON = "3";

    // Utility function to fetch card data
    function fetchCardData(cardId, season) {
        const url = `${API_BASE};cardid=${cardId};season=${season};limit=1000`;
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: url,
                headers: {
                    "User-Agent": USER_AGENT
                },
                onload: (response) => {
                    if (response.status === 200) {
                        const parser = new DOMParser();
                        const xmlDoc = parser.parseFromString(response.responseText, "application/xml");
                        resolve(xmlDoc);
                    } else {
                        reject(`Error fetching data: ${response.status}`);
                    }
                },
                onerror: (err) => reject(`Request failed: ${err}`)
            });
        });
    }

    // Extract card ID and season
    function getCardInfo() {
        const url = window.location.href;
        const cardMatch = url.match(/card=(\d+)/);
        const cardId = cardMatch ? cardMatch[1] : null;
        let season = CURRENT_SEASON;
        const seasonMatch = url.match(/season=(\d+)/);
        if (seasonMatch) season = seasonMatch[1];
        return { cardId, season };
    }

    // Calculate FMV using a rolling 15-trade window
    function calculateRollingFMV(trades, threshold = 2) {
        const rollingFMVs = [];
        for (let i = 0; i < trades.length; i++) {
            const windowStart = Math.max(0, i - 14); // Include the current trade and the 14 before it
            const recentTrades = trades.slice(windowStart, i + 1).map(trade => trade.price);

            // Calculate mean and standard deviation
            const mean = recentTrades.reduce((sum, price) => sum + price, 0) / recentTrades.length;
            const deviation = Math.sqrt(
                recentTrades.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / recentTrades.length
            );

            // Filter prices within the threshold
            const filteredPrices = recentTrades.filter(price => Math.abs(price - mean) <= threshold * deviation);
            const fmv = filteredPrices.reduce((sum, price) => sum + price, 0) / filteredPrices.length || mean;

            rollingFMVs.push(fmv);
        }
        return rollingFMVs.reverse(); // Reverse for chronological display
    }

    // Process trade data
    function processTrades(data) {
        const trades = data.querySelectorAll("TRADE");
        return Array.from(trades)
            .map(trade => {
                const priceText = trade.querySelector("PRICE").textContent.trim();
                return {
                    price: priceText ? parseFloat(priceText) : null,
                    timestamp: new Date(trade.querySelector("TIMESTAMP").textContent * 1000)
                };
            })
            .filter(trade => trade.price !== null); // Exclude trades with null prices
    }

    // Create controls for trade limit
    function createControlInputs(onTradeLimitChange) {
        const controlContainer = document.createElement("div");
        controlContainer.style.margin = "10px 0";
        controlContainer.style.textAlign = "center";

        const savedTradeLimit = localStorage.getItem('tradeLimit') || "1000";

        const tradeLimitLabel = document.createElement("label");
        tradeLimitLabel.textContent = "Trades to Show: ";
        tradeLimitLabel.style.marginRight = "10px";

        const tradeLimitInput = document.createElement("input");
        tradeLimitInput.type = "number";
        tradeLimitInput.min = "1";
        tradeLimitInput.value = savedTradeLimit;
        tradeLimitInput.style.width = "80px";
        tradeLimitInput.style.padding = "5px";

        tradeLimitInput.onchange = () => {
            const newLimit = parseInt(tradeLimitInput.value) || 1000;
            localStorage.setItem('tradeLimit', newLimit);
            onTradeLimitChange(newLimit);
        };

        controlContainer.appendChild(tradeLimitLabel);
        controlContainer.appendChild(tradeLimitInput);

        return controlContainer;
    }

    // Replace the chart
    function replaceChart(data, tradeLimit) {
        const tradeData = processTrades(data).slice(0, tradeLimit);
        const prices = tradeData.map(t => t.price).reverse();
        const labels = tradeData.map(t => t.timestamp.toLocaleDateString()).reverse();
        const rollingFMVs = calculateRollingFMV(tradeData);

        const chartContainer = document.querySelector("#chart-container");
        if (chartContainer) chartContainer.innerHTML = ""; // Clear existing chart
        else return;

        chartContainer.style.width = "100%";
        const canvas = document.createElement("canvas");
        canvas.style.width = "100%";
        canvas.style.height = "400px";
        chartContainer.appendChild(canvas);

        new Chart(canvas.getContext("2d"), {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Market Price',
                        data: prices,
                        borderColor: 'blue',
                        fill: false
                    },
                    {
                        label: 'Fair Market Value (Rolling Window)',
                        data: rollingFMVs,
                        borderColor: 'green',
                        borderDash: [5, 5],
                        borderWidth: 2,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Date'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Price'
                        }
                    }
                }
            }
        });
    }

    // Main function
    function main() {
        const { cardId, season } = getCardInfo();
        if (cardId) {
            const container = document.createElement("div");
            container.id = "chart-container";
            document.body.appendChild(container);

            let tradeLimit = parseInt(localStorage.getItem('tradeLimit')) || 1000;

            const control = createControlInputs(newLimit => {
                tradeLimit = newLimit;
                fetchCardData(cardId, season)
                    .then(data => replaceChart(data, tradeLimit))
                    .catch(err => console.error(err));
            });

            document.body.insertBefore(control, container);

            fetchCardData(cardId, season)
                .then(data => replaceChart(data, tradeLimit))
                .catch(err => console.error(err));
        }
    }

    main();
})();
