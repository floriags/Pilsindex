/**
 * Pilsindex Beer Index formula
 * ----------------------------
 * Returns a score from 0 to 1 representing how good the conditions
 * are for sitting outside with a beer.
 *
 * Design: each condition (temp, wind, humidity, cloud) gets a smooth
 * 0-1 score, then they're combined as a WEIGHTED AVERAGE (not
 * multiplied) so one mediocre factor can't tank an otherwise great
 * hour. Rain is the exception - it's applied afterwards as an
 * independent penalty, because nobody wants a beer in a downpour
 * no matter how warm and calm it is.
 */

// Temperature: smooth peak around 24-26C, falling off toward extremes.
function tempScore(temp) {
    const t = Number(temp);
    if (Number.isNaN(t)) return 0.7; // neutral fallback
    const center = 25;
    const sigma = 8.5;
    return Math.exp(-((t - center) ** 2) / (2 * sigma * sigma));
}

// Cloud cover (0-100%): clear/light cloud is best, full overcast is a bit dull.
function cloudScore(cloudCoverPct) {
    const c = Math.min(Math.max(Number(cloudCoverPct) || 0, 0), 100);
    return 1 - 0.35 * (c / 100);
}

// Humidity (0-100%): comfortable band around 40-55%.
function humidityScore(humidityPct) {
    const h = Math.min(Math.max(Number(humidityPct) || 50, 0), 100);
    const center = 47;
    const sigma = 22;
    return Math.exp(-((h - center) ** 2) / (2 * sigma * sigma));
}

// Wind speed in m/s: a light breeze is pleasant, calm is fine, gusty is not.
function windScore(windMs) {
    const w = Math.max(Number(windMs) || 0, 0);
    if (w <= 1.5) return 0.85 + 0.1 * (w / 1.5); // dead calm: good, not perfect
    if (w <= 4) return 1.0; // light breeze: ideal
    if (w <= 8) return 1 - 0.06 * (w - 4); // picking up
    return Math.max(0.15, 0.76 - 0.05 * (w - 8)); // getting gusty/unpleasant
}

// Rain: independent penalty, not part of the weighted average.
// precipProbPct: 0-100 chance of precipitation this hour.
// precipAmountMm: forecast precipitation amount for the hour.
function rainMultiplier(precipProbPct, precipAmountMm) {
    const prob = Math.min(Math.max(Number(precipProbPct) || 0, 0), 100) / 100;
    const amount = Math.max(Number(precipAmountMm) || 0, 0);
    const probPenalty = prob * 0.7;
    const amountPenalty = Math.min(amount / 3, 1) * 0.3;
    return Math.min(Math.max(1 - probPenalty - amountPenalty, 0), 1);
}

const WEIGHTS = {
    temp: 0.35,
    wind: 0.20,
    humidity: 0.15,
    cloud: 0.10,
};
const WEIGHT_SUM = WEIGHTS.temp + WEIGHTS.wind + WEIGHTS.humidity + WEIGHTS.cloud; // 0.80

/**
 * @param {Object} input
 * @param {number} input.temp - air temperature in Celsius
 * @param {number} input.cloudCover - cloud cover in %
 * @param {number} input.humidity - relative humidity in %
 * @param {number} input.wind - wind speed in m/s
 * @param {number} [input.precipProb] - chance of precipitation in %
 * @param {number} [input.precipAmount] - precipitation amount in mm for the hour
 * @returns {number} 0-1 Beer Index
 */
function calculateBeerIndex({ temp, cloudCover, humidity, wind, precipProb = 0, precipAmount = 0 }) {
    const weighted =
        (WEIGHTS.temp * tempScore(temp) +
            WEIGHTS.wind * windScore(wind) +
            WEIGHTS.humidity * humidityScore(humidity) +
            WEIGHTS.cloud * cloudScore(cloudCover)) /
        WEIGHT_SUM;

    const rain = rainMultiplier(precipProb, precipAmount);
    return Math.min(Math.max(weighted * rain, 0), 1);
}
