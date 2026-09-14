/* ============================================================
   Receiptly — js/currency.js
   ------------------------------------------------------------
   ONE shared currency system used by both the Admin panel and
   the User dashboard. Nothing else in the app should define its
   own list of currencies or its own exchange-rate logic — every
   page that needs a symbol, a currency list, or a converted
   amount goes through window.Currency.

   WHAT LIVES WHERE
   -----------------
   - Admin's "Default Currency" (admin/admin-settings.html) is the
     BASE / SYSTEM currency: the currency subscription prices are
     set in. Stored at receiptly_platform_settings.defaultCurrency
     (global, not per-account — matches existing behavior).
   - Each user's own preferred currency lives on their business
     profile (DB.getProfile().currency, per-account via Scope) —
     this is the existing "Currency" field already used for
     receipts/expenses/dashboard totals via App.money(). We reuse
     it rather than adding a second, competing setting.

   EXCHANGE RATES
   --------------
   Rates are fetched live from a free, keyless API
   (open.er-api.com, with exchangerate-api.com as a fallback) and
   cached in localStorage per base currency for a few hours so we
   aren't hammering the network on every page view. There is no
   hardcoded exchange rate anywhere in this file — if a fetch has
   never succeeded and no cache exists, conversion returns null
   and callers should show the base amount only.
   ============================================================ */

(function (global) {
  "use strict";

  // Keep this list in sync with the <select id="defaultCurrency">
  // options in admin/admin-settings.html — same currencies, one
  // definition, no drift between admin and user pickers.
  var CURRENCIES = [
    { code: "NGN", symbol: "₦", name: "Nigerian Naira" },
    { code: "USD", symbol: "$", name: "US Dollar" },
    { code: "GBP", symbol: "£", name: "British Pound" },
    { code: "EUR", symbol: "€", name: "Euro" },
    { code: "GHS", symbol: "₵", name: "Ghanaian Cedi" },
    { code: "KES", symbol: "KSh", name: "Kenyan Shilling" },
    { code: "ZAR", symbol: "R", name: "South African Rand" }
  ];

  var RATE_CACHE_PREFIX = "receiptly_exchange_rates_";
  var RATE_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours
  var PLATFORM_SETTINGS_KEY = "receiptly_platform_settings";

  // Representative flag emoji for each supported currency — used to
  // decorate the currency picker (e.g. in Settings) the same way the
  // country picker on Register is decorated.
  var CURRENCY_FLAGS = {
    NGN: "🇳🇬",
    USD: "🇺🇸",
    GBP: "🇬🇧",
    EUR: "🇪🇺",
    GHS: "🇬🇭",
    KES: "🇰🇪",
    ZAR: "🇿🇦"
  };

  function flagForCurrency(code) {
    if (!code) return "";
    return CURRENCY_FLAGS[String(code).trim().toUpperCase()] || "";
  }

  // Country → currency map used by the Register page's country picker
  // (js/currency.js is the single source of truth so nothing else in
  // the app needs its own copy of this list). Countries that don't use
  // one of the currencies above fall back to USD, the most broadly
  // useful default for an unsupported local currency.
  var COUNTRIES = [
    { name: "Algeria", flag: "🇩🇿", currency: "USD" },
    { name: "Angola", flag: "🇦🇴", currency: "USD" },
    { name: "Argentina", flag: "🇦🇷", currency: "USD" },
    { name: "Australia", flag: "🇦🇺", currency: "USD" },
    { name: "Austria", flag: "🇦🇹", currency: "EUR" },
    { name: "Bangladesh", flag: "🇧🇩", currency: "USD" },
    { name: "Belgium", flag: "🇧🇪", currency: "EUR" },
    { name: "Benin", flag: "🇧🇯", currency: "USD" },
    { name: "Botswana", flag: "🇧🇼", currency: "USD" },
    { name: "Brazil", flag: "🇧🇷", currency: "USD" },
    { name: "Burkina Faso", flag: "🇧🇫", currency: "USD" },
    { name: "Cameroon", flag: "🇨🇲", currency: "USD" },
    { name: "Canada", flag: "🇨🇦", currency: "USD" },
    { name: "Chad", flag: "🇹🇩", currency: "USD" },
    { name: "Chile", flag: "🇨🇱", currency: "USD" },
    { name: "China", flag: "🇨🇳", currency: "USD" },
    { name: "Colombia", flag: "🇨🇴", currency: "USD" },
    { name: "Croatia", flag: "🇭🇷", currency: "EUR" },
    { name: "Cyprus", flag: "🇨🇾", currency: "EUR" },
    { name: "Denmark", flag: "🇩🇰", currency: "USD" },
    { name: "DR Congo", flag: "🇨🇩", currency: "USD" },
    { name: "Egypt", flag: "🇪🇬", currency: "USD" },
    { name: "Estonia", flag: "🇪🇪", currency: "EUR" },
    { name: "Ethiopia", flag: "🇪🇹", currency: "USD" },
    { name: "Finland", flag: "🇫🇮", currency: "EUR" },
    { name: "France", flag: "🇫🇷", currency: "EUR" },
    { name: "Gabon", flag: "🇬🇦", currency: "USD" },
    { name: "Germany", flag: "🇩🇪", currency: "EUR" },
    { name: "Ghana", flag: "🇬🇭", currency: "GHS" },
    { name: "Greece", flag: "🇬🇷", currency: "EUR" },
    { name: "India", flag: "🇮🇳", currency: "USD" },
    { name: "Indonesia", flag: "🇮🇩", currency: "USD" },
    { name: "Ireland", flag: "🇮🇪", currency: "EUR" },
    { name: "Italy", flag: "🇮🇹", currency: "EUR" },
    { name: "Ivory Coast", flag: "🇨🇮", currency: "USD" },
    { name: "Jamaica", flag: "🇯🇲", currency: "USD" },
    { name: "Japan", flag: "🇯🇵", currency: "USD" },
    { name: "Kenya", flag: "🇰🇪", currency: "KES" },
    { name: "Latvia", flag: "🇱🇻", currency: "EUR" },
    { name: "Liberia", flag: "🇱🇷", currency: "USD" },
    { name: "Libya", flag: "🇱🇾", currency: "USD" },
    { name: "Lithuania", flag: "🇱🇹", currency: "EUR" },
    { name: "Luxembourg", flag: "🇱🇺", currency: "EUR" },
    { name: "Malawi", flag: "🇲🇼", currency: "USD" },
    { name: "Malaysia", flag: "🇲🇾", currency: "USD" },
    { name: "Mali", flag: "🇲🇱", currency: "USD" },
    { name: "Malta", flag: "🇲🇹", currency: "EUR" },
    { name: "Mexico", flag: "🇲🇽", currency: "USD" },
    { name: "Morocco", flag: "🇲🇦", currency: "USD" },
    { name: "Mozambique", flag: "🇲🇿", currency: "USD" },
    { name: "Namibia", flag: "🇳🇦", currency: "USD" },
    { name: "Netherlands", flag: "🇳🇱", currency: "EUR" },
    { name: "New Zealand", flag: "🇳🇿", currency: "USD" },
    { name: "Niger", flag: "🇳🇪", currency: "USD" },
    { name: "Nigeria", flag: "🇳🇬", currency: "NGN" },
    { name: "Norway", flag: "🇳🇴", currency: "USD" },
    { name: "Pakistan", flag: "🇵🇰", currency: "USD" },
    { name: "Peru", flag: "🇵🇪", currency: "USD" },
    { name: "Philippines", flag: "🇵🇭", currency: "USD" },
    { name: "Poland", flag: "🇵🇱", currency: "USD" },
    { name: "Portugal", flag: "🇵🇹", currency: "EUR" },
    { name: "Rwanda", flag: "🇷🇼", currency: "USD" },
    { name: "Saudi Arabia", flag: "🇸🇦", currency: "USD" },
    { name: "Senegal", flag: "🇸🇳", currency: "USD" },
    { name: "Sierra Leone", flag: "🇸🇱", currency: "USD" },
    { name: "Singapore", flag: "🇸🇬", currency: "USD" },
    { name: "Slovakia", flag: "🇸🇰", currency: "EUR" },
    { name: "Slovenia", flag: "🇸🇮", currency: "EUR" },
    { name: "Somalia", flag: "🇸🇴", currency: "USD" },
    { name: "South Africa", flag: "🇿🇦", currency: "ZAR" },
    { name: "South Korea", flag: "🇰🇷", currency: "USD" },
    { name: "Spain", flag: "🇪🇸", currency: "EUR" },
    { name: "Sri Lanka", flag: "🇱🇰", currency: "USD" },
    { name: "Sudan", flag: "🇸🇩", currency: "USD" },
    { name: "Sweden", flag: "🇸🇪", currency: "USD" },
    { name: "Switzerland", flag: "🇨🇭", currency: "USD" },
    { name: "Tanzania", flag: "🇹🇿", currency: "USD" },
    { name: "Thailand", flag: "🇹🇭", currency: "USD" },
    { name: "Togo", flag: "🇹🇬", currency: "USD" },
    { name: "Trinidad and Tobago", flag: "🇹🇹", currency: "USD" },
    { name: "Tunisia", flag: "🇹🇳", currency: "USD" },
    { name: "Turkey", flag: "🇹🇷", currency: "USD" },
    { name: "Uganda", flag: "🇺🇬", currency: "USD" },
    { name: "Ukraine", flag: "🇺🇦", currency: "USD" },
    { name: "United Arab Emirates", flag: "🇦🇪", currency: "USD" },
    { name: "United Kingdom", flag: "🇬🇧", currency: "GBP" },
    { name: "United States", flag: "🇺🇸", currency: "USD" },
    { name: "Vietnam", flag: "🇻🇳", currency: "USD" },
    { name: "Zambia", flag: "🇿🇲", currency: "USD" },
    { name: "Zimbabwe", flag: "🇿🇼", currency: "USD" },
    { name: "Other / Not listed", flag: "🌍", currency: "USD" }
  ];

  function listCountries() {
    return COUNTRIES.slice();
  }

  // Resolves a country name (as stored on the profile/registration
  // form) to the currency code new accounts from that country should
  // default to. Unknown countries fall back to USD.
  function currencyForCountry(countryName) {
    if (!countryName) return "USD";
    var needle = String(countryName).trim().toLowerCase();
    for (var i = 0; i < COUNTRIES.length; i++) {
      if (COUNTRIES[i].name.toLowerCase() === needle) return COUNTRIES[i].currency;
    }
    return "USD";
  }

  function list() {
    return CURRENCIES.slice();
  }

  function findByCode(code) {
    if (!code) return null;
    var upper = String(code).trim().toUpperCase();
    for (var i = 0; i < CURRENCIES.length; i++) {
      if (CURRENCIES[i].code === upper) return CURRENCIES[i];
    }
    return null;
  }

  // Accepts either a currency code ("NGN") or, for backward
  // compatibility with data saved before this module existed, a
  // raw symbol that was typed directly into the old free-text
  // "Currency symbol" field. Codes resolve to their symbol;
  // anything else is returned as-is so existing accounts keep
  // showing whatever they already had.
  function getSymbol(codeOrSymbol) {
    if (!codeOrSymbol) return "₦";
    var found = findByCode(codeOrSymbol);
    return found ? found.symbol : codeOrSymbol;
  }

  // Reverse lookup, used once when migrating an old raw-symbol
  // value into a proper code for the new dropdown.
  function codeFromSymbol(symbol) {
    if (!symbol) return null;
    for (var i = 0; i < CURRENCIES.length; i++) {
      if (CURRENCIES[i].symbol === symbol) return CURRENCIES[i].code;
    }
    return null;
  }

  function safeParse(raw, fallback) {
    if (!raw) return fallback;
    try {
      var v = JSON.parse(raw);
      return v === null || v === undefined ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  /* ---------- platform (admin/base) settings ---------- */
  function getPlatformSettings() {
    return safeParse(localStorage.getItem(PLATFORM_SETTINGS_KEY), {});
  }

  function getPlatformCurrency() {
    var settings = getPlatformSettings();
    return (settings && settings.defaultCurrency) || "NGN";
  }

  // Admin-set base prices for paid plans, e.g. { Normal: 2500, Pro: 6000 }
  // in the platform's base currency. Falls back to the historical
  // defaults so behavior is unchanged until an admin explicitly
  // sets their own prices.
  function getPlanPrices() {
    var settings = getPlatformSettings();
    var prices = (settings && settings.planPrices) || {};
    return {
      Normal: Number(prices.Normal) > 0 ? Number(prices.Normal) : 2500,
      Pro: Number(prices.Pro) > 0 ? Number(prices.Pro) : 6000
    };
  }

  /* ---------- per-user preferred currency ---------- */
  // Resolves the currency CODE a given account should be shown
  // amounts in. Reads the same field App.money() already reads
  // (DB.getProfile().currency), so there is exactly one place a
  // user's currency choice lives.
  function getUserCurrencyCode() {
    try {
      if (typeof DB !== "undefined" && DB.getProfile) {
        var raw = DB.getProfile().currency;
        if (raw) {
          var found = findByCode(raw);
          if (found) return found.code;
          var mapped = codeFromSymbol(raw);
          if (mapped) return mapped;
        }
      }
    } catch (e) {}
    return getPlatformCurrency();
  }

  /* ---------- exchange rates (live, cached — never hardcoded) ---------- */
  function cacheKey(base) {
    return RATE_CACHE_PREFIX + String(base).toUpperCase();
  }

  function readCache(base) {
    return safeParse(localStorage.getItem(cacheKey(base)), null);
  }

  function writeCache(base, rates) {
    try {
      localStorage.setItem(cacheKey(base), JSON.stringify({
        rates: rates,
        fetchedAt: Date.now()
      }));
    } catch (e) {
      // Non-fatal — worst case we re-fetch next time instead of
      // using a cache. Never let a caching failure break the app.
      console.error("Currency: failed to cache exchange rates", e);
    }
  }

  function isFresh(cache) {
    return !!(cache && cache.rates && (Date.now() - cache.fetchedAt) < RATE_CACHE_MAX_AGE_MS);
  }

  function fetchLiveRates(base) {
    var primary = "https://open.er-api.com/v6/latest/" + encodeURIComponent(base);
    var fallback = "https://api.exchangerate-api.com/v4/latest/" + encodeURIComponent(base);

    function tryFallback() {
      return fetch(fallback).then(function (res) {
        if (!res.ok) throw new Error("fallback rate lookup failed");
        return res.json();
      }).then(function (data) {
        if (!data || !data.rates) throw new Error("fallback rate lookup returned no rates");
        return data.rates;
      });
    }

    return fetch(primary).then(function (res) {
      if (!res.ok) throw new Error("rate lookup failed");
      return res.json();
    }).then(function (data) {
      if (!data || data.result === "error" || !data.rates) throw new Error("rate lookup returned no rates");
      return data.rates;
    }).catch(function () {
      return tryFallback();
    });
  }

  // Returns a Promise<number|null> — the multiplier to turn an
  // amount in `base` into `target`. Uses a fresh cache if we have
  // one, otherwise fetches live and caches the result. If the
  // network fetch fails and we only have a stale (or no) cache,
  // resolves with the stale rate if any exists, else null — the
  // caller is expected to just show the base-currency amount in
  // that case rather than a fabricated number.
  function getRate(base, target) {
    base = String(base || "NGN").toUpperCase();
    target = String(target || base).toUpperCase();
    if (base === target) return Promise.resolve(1);

    var cache = readCache(base);
    if (isFresh(cache) && cache.rates[target]) {
      return Promise.resolve(cache.rates[target]);
    }

    return fetchLiveRates(base).then(function (rates) {
      writeCache(base, rates);
      return rates[target] || (cache && cache.rates && cache.rates[target]) || null;
    }).catch(function (e) {
      console.error("Currency: exchange rate fetch failed", e);
      return (cache && cache.rates && cache.rates[target]) || null;
    });
  }

  // Returns a Promise<number|null> — `amount` converted from
  // `from` to `to`. null means "couldn't get a live or cached
  // rate", not "the rate is 1" — never silently substitutes a
  // made-up number.
  function convert(amount, from, to) {
    var n = Number(amount) || 0;
    return getRate(from, to).then(function (rate) {
      return rate === null || rate === undefined ? null : n * rate;
    });
  }

  function format(amount, codeOrSymbol) {
    var n = Number(amount) || 0;
    return getSymbol(codeOrSymbol) + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  global.Currency = {
    list: list,
    findByCode: findByCode,
    getSymbol: getSymbol,
    codeFromSymbol: codeFromSymbol,
    flagForCurrency: flagForCurrency,
    listCountries: listCountries,
    currencyForCountry: currencyForCountry,
    getPlatformCurrency: getPlatformCurrency,
    getPlanPrices: getPlanPrices,
    getUserCurrencyCode: getUserCurrencyCode,
    getRate: getRate,
    convert: convert,
    format: format
  };
})(window);
