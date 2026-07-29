// Fallback location (Oslo) used only until geolocation/search resolves,
// or if the user denies location access and hasn't searched yet.
const DEFAULT_LOCATION = { lat: 59.9139, lon: 10.7522, name: "Oslo" };
const STORAGE_KEY = "pilsindex_location";

function setProgress01(value) {
    const v = Math.min(Math.max(value, 0), 1);

    const circle = document.getElementById("progressCircle");
    const text = document.getElementById("indexValue");

    circle.style.setProperty("--progress", v);

    const hue = v * 120;
    const color = `hsl(${hue}, 85%, 50%)`;

    circle.style.setProperty("--progress-color", color);
    text.textContent = v.toFixed(2);
}

function scoreColor01(v) {
    const hue = Math.min(Math.max(v, 0), 1) * 120;
    return `hsl(${hue}, 75%, 42%)`;
}

function verdictText(v) {
    if (v >= 0.8) return "Prime beer weather 🍻";
    if (v >= 0.65) return "Pretty good - go for it";
    if (v >= 0.5) return "Decent, maybe bring a jacket";
    if (v >= 0.3) return "Marginal - your call";
    return "Stay in, drink at the bar";
}

function getWeatherIcon(cloudCover, precipProb) {
    if (precipProb >= 50) return "🌧️";
    if (precipProb >= 25) return "🌦️";
    if (cloudCover < 10) return "☀️";
    if (cloudCover < 33) return "🌤️";
    if (cloudCover < 67) return "⛅️";
    if (cloudCover < 90) return "🌥️";
    return "☁️";
}

// --- Weather data (Open-Meteo: free, no API key, CORS-open, global) ---

async function fetchWeather(lat, lon) {
    const params = new URLSearchParams({
        latitude: lat,
        longitude: lon,
        hourly: "temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,cloud_cover,wind_speed_10m",
        wind_speed_unit: "ms",
        forecast_days: 7,
        timezone: "auto",
    });

    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
}

// Flatten Open-Meteo's parallel arrays into one row per hour.
function buildHourlyRows(hourly) {
    return hourly.time.map((time, i) => ({
        time: new Date(time),
        temp: hourly.temperature_2m[i],
        humidity: hourly.relative_humidity_2m[i],
        wind: hourly.wind_speed_10m[i],
        cloudCover: hourly.cloud_cover[i],
        precipProb: hourly.precipitation_probability[i],
        precipAmount: hourly.precipitation[i],
    }));
}

// Group every 6 rows into one block (averaging continuous values, taking
// the worst-case for rain so a single wet hour still shows up).
function bucketize6h(rows) {
    const buckets = [];
    for (let i = 0; i < rows.length; i += 6) {
        const chunk = rows.slice(i, i + 6);
        if (chunk.length === 0) continue;

        const avg = (key) => chunk.reduce((sum, r) => sum + r[key], 0) / chunk.length;
        const max = (key) => Math.max(...chunk.map((r) => r[key]));

        buckets.push({
            time: chunk[0].time,
            temp: avg("temp"),
            humidity: avg("humidity"),
            wind: avg("wind"),
            cloudCover: avg("cloudCover"),
            precipProb: max("precipProb"),
            precipAmount: chunk.reduce((sum, r) => sum + r.precipAmount, 0),
            isBlock: true,
        });
    }
    return buckets;
}

function rowBeerIndex(row) {
    return calculateBeerIndex({
        temp: row.temp,
        cloudCover: row.cloudCover,
        humidity: row.humidity,
        wind: row.wind,
        precipProb: row.precipProb,
        precipAmount: row.precipAmount,
    });
}

const dayFormatter = new Intl.DateTimeFormat([], { weekday: "short" });
const hourFormatter = new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit", hour12: false });

function formatHour(date) {
    return hourFormatter.format(date);
}

function formatBlock(date) {
    const start = date.getHours();
    const end = (start + 6) % 24;
    return `${String(start).padStart(2, "0")}-${String(end).padStart(2, "0")}`;
}

// --- Card rendering (horizontal scroll, app-style) ---

function renderCards(containerId, rows, timeFormatter) {
    const container = document.getElementById(containerId);

    container.innerHTML = rows
        .map((row) => {
            const bi01 = rowBeerIndex(row);
            const bi100 = Math.round(bi01 * 100);
            const color = scoreColor01(bi01);
            const icon = getWeatherIcon(row.cloudCover, row.precipProb);
            const dayLabel = dayFormatter.format(row.time);
            const timeLabel = timeFormatter(row.time);

            return `
                <div class="hcard">
                    <div class="day">${dayLabel}</div>
                    <div class="time">${timeLabel}</div>
                    <div class="emoji">${icon}</div>
                    <div class="score" style="background:${color}22;color:${color}">${bi100}</div>
                    <div class="deg">${Math.round(row.temp)}°</div>
                </div>
            `;
        })
        .join("");
}

// --- Location handling: geolocation with city-search fallback ---

function saveLocation(lat, lon, name) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ lat, lon, name }));
    } catch (e) {
        // localStorage unavailable (private browsing etc.) - not critical
    }
}

function loadSavedLocation() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

async function reverseGeocode(lat, lon) {
    try {
        const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`;
        const res = await fetch(url);
        const json = await res.json();
        return json.city || json.locality || json.principalSubdivision || `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
    } catch (e) {
        return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
    }
}

function setLocationLabel(name) {
    document.getElementById("locationName").textContent = name;
}

function toggleSearch(force) {
    const row = document.getElementById("searchRow");
    if (force === true) row.classList.add("active");
    else if (force === false) row.classList.remove("active");
    else row.classList.toggle("active");
}

function useGeolocation() {
    if (!navigator.geolocation) {
        setLocationLabel(`${DEFAULT_LOCATION.name} (location unavailable)`);
        loadWeather(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon, DEFAULT_LOCATION.name);
        toggleSearch(true);
        return;
    }

    setLocationLabel("Locating…");

    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            const { latitude, longitude } = pos.coords;
            const name = await reverseGeocode(latitude, longitude);
            saveLocation(latitude, longitude, name);
            setLocationLabel(name);
            loadWeather(latitude, longitude, name);
        },
        () => {
            setLocationLabel(`${DEFAULT_LOCATION.name} (location denied)`);
            loadWeather(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon, DEFAULT_LOCATION.name);
            toggleSearch(true);
        },
        { timeout: 10000 }
    );
}

function setupLocationControls() {
    document.getElementById("changeLocBtn").addEventListener("click", () => toggleSearch());
    document.getElementById("useLocBtn").addEventListener("click", () => {
        toggleSearch(false);
        useGeolocation();
    });

    let searchTimer;
    const input = document.getElementById("cityInput");
    const dropdown = document.getElementById("cityDropdown");

    input.addEventListener("input", (e) => {
        clearTimeout(searchTimer);
        const q = e.target.value.trim();
        if (q.length < 2) {
            dropdown.style.display = "none";
            return;
        }
        searchTimer = setTimeout(async () => {
            try {
                const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en`;
                const res = await fetch(url);
                const json = await res.json();
                if (!json.results || json.results.length === 0) {
                    dropdown.style.display = "none";
                    return;
                }
                dropdown.innerHTML = json.results
                    .map((r) => {
                        const label = [r.name, r.admin1, r.country].filter(Boolean).join(", ");
                        return `<div data-lat="${r.latitude}" data-lon="${r.longitude}" data-name="${r.name}">${label}</div>`;
                    })
                    .join("");
                dropdown.style.display = "block";
                dropdown.querySelectorAll("div").forEach((div) => {
                    div.addEventListener("click", () => {
                        const lat = parseFloat(div.dataset.lat);
                        const lon = parseFloat(div.dataset.lon);
                        const name = div.dataset.name;
                        dropdown.style.display = "none";
                        input.value = "";
                        toggleSearch(false);
                        saveLocation(lat, lon, name);
                        setLocationLabel(name);
                        loadWeather(lat, lon, name);
                    });
                });
            } catch (e) {
                dropdown.style.display = "none";
            }
        }, 350);
    });
}

// --- Main load ---

async function loadWeather(lat, lon, name) {
    try {
        const data = await fetchWeather(lat, lon);
        const rows = buildHourlyRows(data.hourly);

        const current = rows[0];
        const currentBI = rowBeerIndex(current);
        setProgress01(currentBI);
        document.getElementById("heroCaption").textContent = verdictText(currentBI);

        const next48 = rows.slice(0, 48);
        const rest = rows.slice(48);
        const blocks = bucketize6h(rest);

        renderCards("hourlyCards", next48, formatHour);
        renderCards("blockCards", blocks, formatBlock);
    } catch (err) {
        console.error("Failed to load weather:", err);
        setProgress01(0);
        document.getElementById("heroCaption").textContent = "Could not load the forecast.";
        setLocationLabel(`${name} (failed to load weather)`);
    }
}

function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    // Service workers require http(s), so this silently no-ops when the
    // file is opened directly from disk (file://) during local testing.
    if (location.protocol !== "http:" && location.protocol !== "https:") return;

    navigator.serviceWorker.register("./service-worker.js").catch((err) => {
        console.warn("Service worker registration failed:", err);
    });
}

function init() {
    setupLocationControls();
    registerServiceWorker();

    const saved = loadSavedLocation();
    if (saved && typeof saved.lat === "number" && typeof saved.lon === "number") {
        setLocationLabel(saved.name);
        loadWeather(saved.lat, saved.lon, saved.name);
    } else {
        useGeolocation();
    }
}

init();
