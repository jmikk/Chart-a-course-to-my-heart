// ==UserScript==
// @name         NationStates Card Price Tracker with FMV and Persistent Settings
// @namespace    http://tampermonkey.net/
// @version      1.9
// @description  Replace the chart on NationStates card pages with a more useful one tracking price and Fair Market Value (FMV) with adjustable and persistent trade limits.
// @author       Your Name
// @match        https://www.nationstates.net/page=deck/card=*
// @require      https://cdn.jsdelivr.net/npm/chart.js
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
    'use strict';

    const API_BASE = "https://www.nationstates.net/cgi-bin/api.cgi?q=card+trades";
    const USER_AGENT = "CHANGE ME TO YOUR NATION (9003's Chart additon script)";
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

    // Function to extract card ID and season
    function getCardInfo() {
        // Get the full URL
        const url = window.location.href;

        // Extract card ID from the URL
        const cardMatch = url.match(/card=(\d+)/);
        const cardId = cardMatch ? cardMatch[1] : null;

        // Extract season manually
        let season = CURRENT_SEASON; // Default to 3
        const seasonMatch = url.match(/season=(\d+)/);
        if (seasonMatch) {
            season = seasonMatch[1];
        }

        // Debugging
        if (!cardId) {
            console.error("Card ID not found in the URL.");
        } else {
            console.log(`Card ID: ${cardId}`);
            console.log(`Season: ${season}`);
        }

        return { cardId, season };
    }

    function calculateFairMarketValue(trades, threshold = 2) {
        // Extract prices from the trades and use only the last 15 valid ones
        const validPrices = trades.slice(-15).map(trade => trade.price);

        if (validPrices.length === 0) {
            return 0; // No valid trades to calculate FMV
        }

        // Calculate mean and standard deviation
        const mean = validPrices.reduce((sum, price) => sum + price, 0) / validPrices.length;
        const deviation = Math.sqrt(
            validPrices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / validPrices.length
        );

        // Filter prices within the threshold of standard deviation
        const filteredPrices = validPrices.filter(price => Math.abs(price - mean) <= threshold * deviation);

        // Calculate and return FMV as the mean of filtered prices
        return filteredPrices.reduce((sum, price) => sum + price, 0) / filteredPrices.length || mean;
    }



    // Create input boxes for controlling trade count and outlier threshold
    function createControlInputs(onTradeLimitChange, onThresholdChange) {
        const controlContainer = document.createElement("div");
        controlContainer.style.margin = "10px 0";
        controlContainer.style.textAlign = "center";

        // Load saved values or use defaults
        const savedTradeLimit = localStorage.getItem('tradeLimit') || "1000";
        const savedThreshold = localStorage.getItem('outlierThreshold') || "2";

        // Trade limit input
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

        // Outlier threshold input
        const thresholdLabel = document.createElement("label");
        thresholdLabel.textContent = "Outlier Threshold: ";
        thresholdLabel.style.marginLeft = "20px";
        thresholdLabel.style.marginRight = "10px";

        const thresholdInput = document.createElement("input");
        thresholdInput.type = "number";
        thresholdInput.min = "0";
        thresholdInput.step = "0.1";
        thresholdInput.value = savedThreshold;
        thresholdInput.style.width = "80px";
        thresholdInput.style.padding = "5px";

        thresholdInput.onchange = () => {
            const newThreshold = parseFloat(thresholdInput.value) || 2;
            localStorage.setItem('outlierThreshold', newThreshold);
            onThresholdChange(newThreshold);
        };

        // Append to container
        controlContainer.appendChild(tradeLimitLabel);
        controlContainer.appendChild(tradeLimitInput);
        controlContainer.appendChild(thresholdLabel);
        controlContainer.appendChild(thresholdInput);

        return controlContainer;
    }

function replaceChart(data, tradeLimit, threshold) {

    const tradeData = processTrades(data).slice(0, tradeLimit); // Process trades and apply limit

    const prices = tradeData.map(t => t.price).reverse();
    const labels = tradeData.map(t => t.timestamp.toLocaleDateString()).reverse();

    // Calculate Fair Market Value
    const fairMarketValue = calculateFairMarketValue(tradeData, threshold);


    // Crop the data to the trade limit for display purposes
    const croppedTradeData = tradeData.slice(0, tradeLimit);


    // Set FMV line as two points spanning the chart's date range
    const fmvLine = [
        { x: labels[0], y: fairMarketValue }, // Start of the chart
        { x: labels[labels.length - 1], y: fairMarketValue } // End of the chart
    ];

    // Locate the chart container and clear it
    const chartContainer = document.querySelector("#chart-container");
    if (chartContainer) {
        chartContainer.innerHTML = ""; // Clear the existing chart
    } else {
        console.warn("Chart container not found");
        return;
    }

    // Style the container for full width
    chartContainer.style.width = "100%";
    chartContainer.style.padding = "20px";
    chartContainer.style.boxSizing = "border-box";

    // Create a canvas for the new chart
    const canvas = document.createElement("canvas");
    canvas.id = "priceChart";
    canvas.style.width = "100%"; // Full width
    canvas.style.height = "400px"; // Set a fixed height
    chartContainer.appendChild(canvas);

    // Create the chart using Chart.js
    const ctx = canvas.getContext("2d");
    console.log("FMV:", fairMarketValue);
    new Chart(ctx, {
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
                    label: 'Fair Market Value',
                    data: [
                        { x: labels[0], y: fairMarketValue }, // Start of the graph
                        { x: labels[labels.length - 1], y: fairMarketValue } // End of the graph
                    ],
                    type: 'scatter',
                    showLine: true, // Draw a line between points
                    borderColor: 'green',
                    borderDash: [5, 5], // Dashed line
                    borderWidth: 2, // Thickness of the line
                    pointRadius: 5, // Larger dots at the ends
                    fill: false,
                    tension: 0, // Straight line
                    spanGaps: true // Ensure gaps are connected
                }
            ]
        }

,
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
            let threshold = parseFloat(localStorage.getItem('outlierThreshold')) || 2;

            const control = createControlInputs(
                (newLimit) => {
                    tradeLimit = newLimit;
                    fetchCardData(cardId, season)
                        .then(data => replaceChart(data, tradeLimit, threshold))
                        .catch(err => console.error(err));
                },
                (newThreshold) => {
                    threshold = newThreshold;
                    fetchCardData(cardId, season)
                        .then(data => replaceChart(data, tradeLimit, threshold))
                        .catch(err => console.error(err));
                }
            );

            document.body.insertBefore(control, container);

            fetchCardData(cardId, season)
                .then(data => replaceChart(data, tradeLimit, threshold))
                .catch(err => console.error(err));
        }
    }

function processTrades(data) {
    const trades = data.querySelectorAll("TRADE");
    return Array.from(trades)
        .map(trade => {
            const priceText = trade.querySelector("PRICE").textContent.trim();
            return {
                price: priceText ? parseFloat(priceText) : null, // Parse price or set to null if empty
                timestamp: new Date(trade.querySelector("TIMESTAMP").textContent * 1000) // Convert to Date
            };
        })
        .filter(trade => trade.price !== null); // Exclude trades with null prices (gifts)
}


    // Run the main function
    main();
})();
