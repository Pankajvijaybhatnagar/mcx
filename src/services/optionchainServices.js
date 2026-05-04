// ─────────────────────────────────────────────────────────────────────────────
// Option Chain Service
//
// NSE flow:
//   GET /api/option-chain-v3?type=Indices&symbol=NIFTY&expiry=30-Apr-2026
//
// MCX flow:
//   Step 1 — Expiry dates:
//     We do NOT use the broken /api/get-expiry.php endpoint.
//     Instead we call GetOptionChain with NO expiry first.
//     MCX returns all rows across all expiries — we extract unique ExpiryDate
//     values from d.Data to build the expiry list.
//     If that fails we fall back to hardcoded near-term expiry format.
//
//   Step 2 — Option chain rows:
//     POST /api/mcx/option-chain
//     body: { "Commodity": "CRUDEOIL", "Expiry": "14MAY2026" }
//     → proxied to mcxindia.com/backpage.aspx/GetOptionChain
//
// Real MCX GetOptionChain response shape:
//   { "d": { "Data": [ { CE_StrikePrice, CE_OpenInterest, CE_ChangeInOI,
//                         CE_Volume, CE_LTP, PE_OpenInterest, PE_ChangeInOI,
//                         PE_Volume, PE_LTP, UnderlyingValue, ExpiryDate } ],
//            "Summary": { Count, AsOn } } }
// ─────────────────────────────────────────────────────────────────────────────

const MCX_OPTION_CHAIN_URL = "/api/mcx/option-chain"; // POST { Commodity, Expiry }
const MCX_EXPIRY_API_URL = "/api/mcx/expiry"; // GET with ?symbol= param

// Cache expiry lists per symbol so we don't re-fetch on every render
const _mcxExpiryCache = {};

/**
 * Fetch MCX expiry dates directly from the MCX API
 * @param {string} symbol - Commodity symbol (e.g., 'CRUDEOIL', 'GOLD', 'SILVERM')
 * @returns {Promise<{symbol: string, expiries: string[], totalCount: number}>}
 */
async function getMCXExpiriesForSymbol(symbol) {
    try {
        const url = `${MCX_EXPIRY_API_URL}?symbol=${symbol.toUpperCase()}`;
        console.log("[MCX API] Fetching expiries from:", url);

        const response = await fetch(url, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
        });

        if (!response.ok) {
            throw new Error(`MCX API HTTP ${response.status}`);
        }

        const data = await response.json();
        
        // The API typically returns: { expiryDates: ['14MAY2026', '16JUN2026', ...] }
        // Or it might return an array directly
        const expiryDates = Array.isArray(data) 
            ? data 
            : data?.expiryDates || data?.Expiry || [];

        if (!Array.isArray(expiryDates) || expiryDates.length === 0) {
            throw new Error(`No expiry dates found for symbol: ${symbol}`);
        }

        const sorted = expiryDates.sort();
        
        console.log(`[MCX API] Found ${sorted.length} expiries for ${symbol}:`, sorted);
        
        return {
            symbol: symbol.toUpperCase(),
            expiries: sorted,
            totalCount: sorted.length
        };

    } catch (error) {
        console.error("[MCX API] Error fetching expiries:", error);
        throw error;
    }
}

/**
 * Get just the expiry array for a symbol
 * @param {string} symbol - Commodity symbol
 * @returns {Promise<string[]>} Array of expiry dates
 */
async function getExpiriesArray(symbol) {
    const result = await getMCXExpiriesForSymbol(symbol);
    return result.expiries;
}

class OptionChainService {
    constructor() {
        this.baseUrl = "/api/option-chain-v3";
    }

    // ─── NSE Helpers ──────────────────────────────────────────────────────────

    async _nseRequest(params = {}) {
        for (const field of ["type", "symbol", "expiry"]) {
            if (!params[field]) throw new Error(`Missing NSE param: "${field}"`);
        }
        const query = new URLSearchParams(params).toString();
        const url = `${this.baseUrl}?${query}`;
        console.log("[NSE] GET", url);
        const res = await fetch(url, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) throw new Error(`NSE HTTP ${res.status}`);
        return res.json();
    }

    // ─── Public API ───────────────────────────────────────────────────────────

    async fetchExpiryDates({ type, symbol, expiry } = {}) {
        if (type === "MCX") return this._mcxFetchExpiryDates(symbol);
        const data = await this._nseRequest({ type, symbol, expiry });
        return data?.records?.expiryDates || [];
    }

    async fetchFormattedOptionChain({ type, symbol, expiry } = {}) {
        if (type === "MCX") return this._mcxFetchFormattedOptionChain({ symbol, expiry });
        const data = await this._nseRequest({ type, symbol, expiry });
        return (data?.records?.data || []).map((item) => ({
            strikePrice: item.strikePrice,
            expiryDate:  item.expiryDates,
            CE:          item.CE || null,
            PE:          item.PE || null,
        }));
    }

    // Legacy helpers
    async fetchOptionChainData(p)  { return this._nseRequest(p); }
    async fetchStrikeData(p)       { return (await this.fetchOptionChainData(p))?.records?.data || []; }
    async fetchBySymbolAndExpiry(p){ return this.fetchOptionChainData(p); }

    // ─── MCX: Expiry Dates ────────────────────────────────────────────────────
    /**
     * Fetch MCX expiry dates using the direct API endpoint.
     * Falls back to GetOptionChain method if API fails.
     */
    async _mcxFetchExpiryDates(symbol) {
        const key = symbol.toUpperCase();

        if (_mcxExpiryCache[key]) {
            console.log("[MCX] expiry cache hit:", key, _mcxExpiryCache[key]);
            return _mcxExpiryCache[key];
        }

        try {
            // Try direct API first
            console.log("[MCX] Attempting to fetch expiries via direct API, symbol:", key);
            const result = await getMCXExpiriesForSymbol(key);
            
            _mcxExpiryCache[key] = result.expiries;
            return result.expiries;

        } catch (apiErr) {
            console.warn("[MCX] Direct API failed, falling back to GetOptionChain:", apiErr.message);
            
            // Fallback: GetOptionChain with empty Expiry
            try {
                const res = await fetch(MCX_OPTION_CHAIN_URL, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Accept: "application/json, text/plain, */*",
                    },
                    // Send empty Expiry — MCX returns all expiries' data
                    body: JSON.stringify({ Commodity: key, Expiry: "" }),
                });

                if (!res.ok) throw new Error(`MCX GetOptionChain HTTP ${res.status}`);

                const raw = await res.json();
                console.log("[MCX] raw expiry response summary:", raw?.d?.Summary);

                const rows = raw?.d?.Data || raw?.d?.data || raw?.Data || [];

                if (!Array.isArray(rows) || rows.length === 0) {
                    console.warn("[MCX] No rows returned for expiry fetch, using fallback");
                    return this._mcxFallbackExpiries(key);
                }

                // Extract unique non-null ExpiryDate values and sort them
                const seen = new Set();
                const dates = [];

                for (const row of rows) {
                    const d = row.ExpiryDate || row.expiryDate;
                    if (d && !seen.has(d)) {
                        seen.add(d);
                        dates.push(d);
                    }
                }

                // If ExpiryDate is null on all rows (MCX sometimes does this),
                // the Summary.AsOn gives us the current expiry — use that
                if (dates.length === 0 && raw?.d?.Summary) {
                    console.warn("[MCX] All ExpiryDate fields null, using fallback");
                    return this._mcxFallbackExpiries(key);
                }

                const sorted = dates.sort();
                _mcxExpiryCache[key] = sorted;
                console.log("[MCX] expiries found via GetOptionChain:", sorted);
                return sorted;

            } catch (err) {
                console.error("[MCX] GetOptionChain fallback also failed:", err);
                return this._mcxFallbackExpiries(key);
            }
        }
    }

    /**
     * Fallback: generate near-term MCX expiry strings when API fails.
     * MCX expiry format: "14MAY2026", "16JUN2026" etc.
     * We generate the next 3 months' expiry-like labels so the UI
     * doesn't stay stuck on "Loading expiry dates..."
     *
     * NOTE: These are approximate — user should verify with MCX.
     * Once the proxy is working correctly, the real API dates will be used.
     */
    _mcxFallbackExpiries(symbol) {
        const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
        const now = new Date();
        const result = [];

        for (let i = 0; i < 3; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
            // MCX typically expires on 15th (crude) or last Thursday — use 15th as approx
            const day = String(15).padStart(2, "0");
            const mon = months[d.getMonth()];
            const yr  = d.getFullYear();
            result.push(`${day}${mon}${yr}`);
        }

        console.warn("[MCX] Using fallback expiries:", result);
        return result;
    }

    // ─── MCX: Option Chain ────────────────────────────────────────────────────
    /**
     * POST /api/mcx/option-chain
     * Proxied → POST https://www.mcxindia.com/backpage.aspx/GetOptionChain
     * body: { "Commodity": "CRUDEOIL", "Expiry": "14MAY2026" }
     */
    async _mcxFetchFormattedOptionChain({ symbol, expiry } = {}) {
        if (!symbol || !expiry) {
            console.warn("[MCX] fetchFormattedOptionChain: missing symbol or expiry");
            return [];
        }

        try {
            const body = JSON.stringify({
                Commodity: symbol.toUpperCase(),
                Expiry:    expiry,
            });

            console.log("[MCX] POST option chain", body);

            const res = await fetch(MCX_OPTION_CHAIN_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json, text/plain, */*",
                },
                body,
            });

            if (!res.ok) throw new Error(`MCX option chain HTTP ${res.status}`);

            const raw = await res.json();

            const rows =
                raw?.d?.Data ||
                raw?.d?.data ||
                raw?.Data    ||
                raw?.data    ||
                [];

            if (!Array.isArray(rows) || rows.length === 0) {
                console.warn("[MCX] No option chain rows:", raw);
                return [];
            }

            console.log(`[MCX] Got ${rows.length} rows for ${symbol} ${expiry}`);
            return rows.map((item) => this._normalizeMCXRow(item));

        } catch (err) {
            console.error("[MCX] _mcxFetchFormattedOptionChain error:", err);
            return [];
        }
    }

    /**
     * Map flat MCX row → NSE-style OptionChainRow that OptionChainTable reads
     *
     * MCX flat keys:  CE_StrikePrice, CE_OpenInterest, CE_ChangeInOI,
     *                 CE_Volume, CE_LTP, CE_AskPrice, CE_BidPrice,
     *                 PE_OpenInterest, PE_ChangeInOI, PE_Volume, PE_LTP,
     *                 PE_AskPrice, PE_BidPrice, UnderlyingValue
     *
     * NSE nested keys that OptionChainTable expects:
     *   CE.openInterest, CE.changeinOpenInterest, CE.totalTradedVolume,
     *   CE.lastPrice, CE.underlyingValue  (same for PE)
     */
    _normalizeMCXRow(item) {
        const n = (v) => Number(v ?? 0);
        const underlyingValue = n(item.UnderlyingValue);

        return {
            strikePrice: n(item.CE_StrikePrice),
            expiryDate:  item.ExpiryDate || "",
            CE: {
                openInterest:         n(item.CE_OpenInterest),
                changeinOpenInterest: n(item.CE_ChangeInOI),
                totalTradedVolume:    n(item.CE_Volume),
                lastPrice:            n(item.CE_LTP),
                underlyingValue,
                askPrice:             n(item.CE_AskPrice),
                bidPrice:             n(item.CE_BidPrice),
                netChange:            n(item.CE_NetChange),
                absoluteChange:       n(item.CE_AbsoluteChange),
            },
            PE: {
                openInterest:         n(item.PE_OpenInterest),
                changeinOpenInterest: n(item.PE_ChangeInOI),
                totalTradedVolume:    n(item.PE_Volume),
                lastPrice:            n(item.PE_LTP),
                underlyingValue,
                askPrice:             n(item.PE_AskPrice),
                bidPrice:             n(item.PE_BidPrice),
                netChange:            n(item.PE_NetChange),
                absoluteChange:       n(item.PE_AbsoluteChange),
            },
        };
    }
}

export default new OptionChainService();
export { getMCXExpiriesForSymbol, getExpiriesArray };