/**
 * Long-run annual market history used by the engine's `historical` market model.
 *
 * WHAT THIS SERIES IS
 * -------------------
 * One row per calendar year, 1900–2024 (125 years):
 *
 * - `equityReturn` — nominal *total* return (price change plus reinvested
 *   dividends) of a broad US large-cap index. 1928 onwards follows the widely
 *   republished S&P 500 total-return series (the "Damodaran / NYU Stern annual
 *   returns" dataset, itself built on S&P and Shiller data); 1900–1927 follows
 *   the Cowles Commission / Shiller reconstruction of the same market, which is
 *   what every long-run study (Dimson-Marsh-Staunton, Siegel) splices onto.
 * - `bondReturn` — nominal total return of a constant-maturity 10-year US
 *   Treasury (coupon plus price change). Same sources; pre-1928 uses long-term
 *   US government bond yields, which is the best available proxy for that era.
 * - `inflation` — US CPI-U, December-to-December for the modern era and annual
 *   average for the early decades (the CPI itself only starts in 1913; earlier
 *   values come from the standard back-cast price indices).
 *
 * ACCURACY AND INTENT
 * -------------------
 * Values are rounded to 0.1 percentage points and are transcribed from those
 * published series rather than recomputed from raw price data, so individual
 * years can differ from a given vendor's table in the last digit, and the
 * 1900–1927 block is the least precise (sources genuinely disagree there by
 * more than a rounding step). They are intended to reproduce the *sequence* of
 * booms, crashes, inflation shocks and rate regimes that determine retirement
 * outcomes — the 1929–32 collapse, the 1946 inflation spike, the 1966–82 grind,
 * 2000–02, 2008, 2022 — not to serve as a data source for return attribution.
 *
 * A US series is used deliberately: it is the only market with a continuous,
 * public, century-long total-return record for both stocks and bonds. It is
 * also the most survivor-biased one on earth, so a plan that only just survives
 * the historical mode is not conservatively financed.
 *
 * This is a plain module (no fetch, no fs), so it works offline, in Jest, and
 * inside the simulation web worker.
 */

export interface HistoricalMarketYear {
  /** Calendar year the returns belong to. */
  year: number
  /** Nominal total return of the equity sleeve, as a fraction (0.12 = +12%). */
  equityReturn: number
  /** Nominal total return of the bond sleeve, as a fraction. */
  bondReturn: number
  /** Consumer price inflation over the year, as a fraction. */
  inflation: number
}

export const HISTORICAL_MARKET_YEARS: readonly HistoricalMarketYear[] = [
  { year: 1900, equityReturn: 0.21, bondReturn: 0.05, inflation: 0.012 },
  { year: 1901, equityReturn: 0.159, bondReturn: 0.035, inflation: 0.012 },
  { year: 1902, equityReturn: 0.025, bondReturn: 0.02, inflation: 0.012 },
  { year: 1903, equityReturn: -0.139, bondReturn: 0.025, inflation: 0.023 },
  { year: 1904, equityReturn: 0.306, bondReturn: 0.04, inflation: 0.011 },
  { year: 1905, equityReturn: 0.216, bondReturn: 0.02, inflation: -0.011 },
  { year: 1906, equityReturn: 0.032, bondReturn: 0.005, inflation: 0.022 },
  { year: 1907, equityReturn: -0.287, bondReturn: 0.01, inflation: 0.043 },
  { year: 1908, equityReturn: 0.425, bondReturn: 0.05, inflation: -0.021 },
  { year: 1909, equityReturn: 0.15, bondReturn: 0.02, inflation: -0.011 },
  { year: 1910, equityReturn: -0.042, bondReturn: 0.03, inflation: 0.044 },
  { year: 1911, equityReturn: 0.054, bondReturn: 0.035, inflation: 0.0 },
  { year: 1912, equityReturn: 0.056, bondReturn: 0.025, inflation: 0.021 },
  { year: 1913, equityReturn: -0.069, bondReturn: 0.015, inflation: 0.021 },
  { year: 1914, equityReturn: -0.045, bondReturn: 0.03, inflation: 0.01 },
  { year: 1915, equityReturn: 0.263, bondReturn: 0.025, inflation: 0.01 },
  { year: 1916, equityReturn: 0.093, bondReturn: 0.02, inflation: 0.079 },
  { year: 1917, equityReturn: -0.258, bondReturn: -0.05, inflation: 0.174 },
  { year: 1918, equityReturn: 0.173, bondReturn: 0.01, inflation: 0.18 },
  { year: 1919, equityReturn: 0.178, bondReturn: -0.015, inflation: 0.146 },
  { year: 1920, equityReturn: -0.145, bondReturn: 0.02, inflation: 0.156 },
  { year: 1921, equityReturn: 0.132, bondReturn: 0.12, inflation: -0.105 },
  { year: 1922, equityReturn: 0.265, bondReturn: 0.07, inflation: -0.061 },
  { year: 1923, equityReturn: 0.031, bondReturn: 0.03, inflation: 0.018 },
  { year: 1924, equityReturn: 0.267, bondReturn: 0.06, inflation: 0.0 },
  { year: 1925, equityReturn: 0.263, bondReturn: 0.04, inflation: 0.023 },
  { year: 1926, equityReturn: 0.111, bondReturn: 0.07, inflation: 0.011 },
  { year: 1927, equityReturn: 0.371, bondReturn: 0.085, inflation: -0.017 },
  { year: 1928, equityReturn: 0.438, bondReturn: 0.008, inflation: -0.012 },
  { year: 1929, equityReturn: -0.083, bondReturn: 0.042, inflation: 0.006 },
  { year: 1930, equityReturn: -0.251, bondReturn: 0.045, inflation: -0.064 },
  { year: 1931, equityReturn: -0.438, bondReturn: -0.026, inflation: -0.093 },
  { year: 1932, equityReturn: -0.086, bondReturn: 0.088, inflation: -0.103 },
  { year: 1933, equityReturn: 0.5, bondReturn: 0.019, inflation: 0.008 },
  { year: 1934, equityReturn: -0.012, bondReturn: 0.08, inflation: 0.015 },
  { year: 1935, equityReturn: 0.467, bondReturn: 0.045, inflation: 0.03 },
  { year: 1936, equityReturn: 0.319, bondReturn: 0.05, inflation: 0.014 },
  { year: 1937, equityReturn: -0.353, bondReturn: 0.014, inflation: 0.029 },
  { year: 1938, equityReturn: 0.293, bondReturn: 0.042, inflation: -0.028 },
  { year: 1939, equityReturn: -0.011, bondReturn: 0.044, inflation: 0.0 },
  { year: 1940, equityReturn: -0.107, bondReturn: 0.054, inflation: 0.007 },
  { year: 1941, equityReturn: -0.128, bondReturn: -0.02, inflation: 0.099 },
  { year: 1942, equityReturn: 0.192, bondReturn: 0.023, inflation: 0.09 },
  { year: 1943, equityReturn: 0.251, bondReturn: 0.025, inflation: 0.03 },
  { year: 1944, equityReturn: 0.19, bondReturn: 0.026, inflation: 0.023 },
  { year: 1945, equityReturn: 0.358, bondReturn: 0.038, inflation: 0.022 },
  { year: 1946, equityReturn: -0.084, bondReturn: 0.031, inflation: 0.181 },
  { year: 1947, equityReturn: 0.052, bondReturn: 0.009, inflation: 0.088 },
  { year: 1948, equityReturn: 0.057, bondReturn: 0.02, inflation: 0.03 },
  { year: 1949, equityReturn: 0.183, bondReturn: 0.047, inflation: -0.021 },
  { year: 1950, equityReturn: 0.308, bondReturn: 0.004, inflation: 0.059 },
  { year: 1951, equityReturn: 0.237, bondReturn: -0.003, inflation: 0.06 },
  { year: 1952, equityReturn: 0.182, bondReturn: 0.023, inflation: 0.008 },
  { year: 1953, equityReturn: -0.012, bondReturn: 0.041, inflation: 0.007 },
  { year: 1954, equityReturn: 0.526, bondReturn: 0.033, inflation: -0.007 },
  { year: 1955, equityReturn: 0.326, bondReturn: -0.013, inflation: 0.004 },
  { year: 1956, equityReturn: 0.074, bondReturn: -0.023, inflation: 0.03 },
  { year: 1957, equityReturn: -0.105, bondReturn: 0.068, inflation: 0.029 },
  { year: 1958, equityReturn: 0.437, bondReturn: -0.021, inflation: 0.018 },
  { year: 1959, equityReturn: 0.121, bondReturn: -0.027, inflation: 0.017 },
  { year: 1960, equityReturn: 0.003, bondReturn: 0.116, inflation: 0.014 },
  { year: 1961, equityReturn: 0.266, bondReturn: 0.021, inflation: 0.007 },
  { year: 1962, equityReturn: -0.088, bondReturn: 0.057, inflation: 0.013 },
  { year: 1963, equityReturn: 0.226, bondReturn: 0.017, inflation: 0.016 },
  { year: 1964, equityReturn: 0.164, bondReturn: 0.037, inflation: 0.01 },
  { year: 1965, equityReturn: 0.124, bondReturn: 0.007, inflation: 0.019 },
  { year: 1966, equityReturn: -0.1, bondReturn: 0.029, inflation: 0.035 },
  { year: 1967, equityReturn: 0.238, bondReturn: -0.016, inflation: 0.03 },
  { year: 1968, equityReturn: 0.108, bondReturn: 0.033, inflation: 0.047 },
  { year: 1969, equityReturn: -0.082, bondReturn: -0.05, inflation: 0.062 },
  { year: 1970, equityReturn: 0.036, bondReturn: 0.168, inflation: 0.056 },
  { year: 1971, equityReturn: 0.142, bondReturn: 0.098, inflation: 0.033 },
  { year: 1972, equityReturn: 0.188, bondReturn: 0.028, inflation: 0.034 },
  { year: 1973, equityReturn: -0.143, bondReturn: 0.037, inflation: 0.087 },
  { year: 1974, equityReturn: -0.259, bondReturn: 0.02, inflation: 0.123 },
  { year: 1975, equityReturn: 0.37, bondReturn: 0.036, inflation: 0.069 },
  { year: 1976, equityReturn: 0.238, bondReturn: 0.16, inflation: 0.049 },
  { year: 1977, equityReturn: -0.07, bondReturn: 0.013, inflation: 0.067 },
  { year: 1978, equityReturn: 0.065, bondReturn: -0.008, inflation: 0.09 },
  { year: 1979, equityReturn: 0.185, bondReturn: 0.007, inflation: 0.133 },
  { year: 1980, equityReturn: 0.317, bondReturn: -0.03, inflation: 0.125 },
  { year: 1981, equityReturn: -0.047, bondReturn: 0.082, inflation: 0.089 },
  { year: 1982, equityReturn: 0.204, bondReturn: 0.328, inflation: 0.038 },
  { year: 1983, equityReturn: 0.223, bondReturn: 0.032, inflation: 0.038 },
  { year: 1984, equityReturn: 0.062, bondReturn: 0.137, inflation: 0.039 },
  { year: 1985, equityReturn: 0.312, bondReturn: 0.257, inflation: 0.038 },
  { year: 1986, equityReturn: 0.185, bondReturn: 0.243, inflation: 0.011 },
  { year: 1987, equityReturn: 0.058, bondReturn: -0.05, inflation: 0.044 },
  { year: 1988, equityReturn: 0.165, bondReturn: 0.082, inflation: 0.044 },
  { year: 1989, equityReturn: 0.315, bondReturn: 0.177, inflation: 0.046 },
  { year: 1990, equityReturn: -0.031, bondReturn: 0.062, inflation: 0.061 },
  { year: 1991, equityReturn: 0.302, bondReturn: 0.15, inflation: 0.031 },
  { year: 1992, equityReturn: 0.075, bondReturn: 0.094, inflation: 0.029 },
  { year: 1993, equityReturn: 0.1, bondReturn: 0.142, inflation: 0.027 },
  { year: 1994, equityReturn: 0.013, bondReturn: -0.08, inflation: 0.027 },
  { year: 1995, equityReturn: 0.372, bondReturn: 0.235, inflation: 0.025 },
  { year: 1996, equityReturn: 0.227, bondReturn: 0.014, inflation: 0.033 },
  { year: 1997, equityReturn: 0.331, bondReturn: 0.099, inflation: 0.017 },
  { year: 1998, equityReturn: 0.283, bondReturn: 0.149, inflation: 0.016 },
  { year: 1999, equityReturn: 0.209, bondReturn: -0.082, inflation: 0.027 },
  { year: 2000, equityReturn: -0.09, bondReturn: 0.167, inflation: 0.034 },
  { year: 2001, equityReturn: -0.119, bondReturn: 0.056, inflation: 0.016 },
  { year: 2002, equityReturn: -0.22, bondReturn: 0.151, inflation: 0.024 },
  { year: 2003, equityReturn: 0.284, bondReturn: 0.004, inflation: 0.019 },
  { year: 2004, equityReturn: 0.107, bondReturn: 0.045, inflation: 0.033 },
  { year: 2005, equityReturn: 0.048, bondReturn: 0.029, inflation: 0.034 },
  { year: 2006, equityReturn: 0.156, bondReturn: 0.02, inflation: 0.025 },
  { year: 2007, equityReturn: 0.055, bondReturn: 0.102, inflation: 0.041 },
  { year: 2008, equityReturn: -0.366, bondReturn: 0.201, inflation: 0.001 },
  { year: 2009, equityReturn: 0.259, bondReturn: -0.111, inflation: 0.027 },
  { year: 2010, equityReturn: 0.148, bondReturn: 0.085, inflation: 0.015 },
  { year: 2011, equityReturn: 0.021, bondReturn: 0.16, inflation: 0.03 },
  { year: 2012, equityReturn: 0.159, bondReturn: 0.03, inflation: 0.017 },
  { year: 2013, equityReturn: 0.322, bondReturn: -0.091, inflation: 0.015 },
  { year: 2014, equityReturn: 0.135, bondReturn: 0.108, inflation: 0.008 },
  { year: 2015, equityReturn: 0.014, bondReturn: 0.013, inflation: 0.007 },
  { year: 2016, equityReturn: 0.118, bondReturn: 0.007, inflation: 0.021 },
  { year: 2017, equityReturn: 0.216, bondReturn: 0.028, inflation: 0.021 },
  { year: 2018, equityReturn: -0.042, bondReturn: 0.0, inflation: 0.019 },
  { year: 2019, equityReturn: 0.312, bondReturn: 0.096, inflation: 0.023 },
  { year: 2020, equityReturn: 0.18, bondReturn: 0.113, inflation: 0.014 },
  { year: 2021, equityReturn: 0.285, bondReturn: -0.044, inflation: 0.07 },
  { year: 2022, equityReturn: -0.18, bondReturn: -0.178, inflation: 0.065 },
  { year: 2023, equityReturn: 0.261, bondReturn: 0.039, inflation: 0.034 },
  { year: 2024, equityReturn: 0.25, bondReturn: -0.017, inflation: 0.029 },
] as const

/** Number of start years available — one simulated path per entry. */
export const HISTORICAL_PATH_COUNT = HISTORICAL_MARKET_YEARS.length

/** First and last calendar year covered, for UI copy. */
export const HISTORICAL_FIRST_YEAR = HISTORICAL_MARKET_YEARS[0].year
export const HISTORICAL_LAST_YEAR = HISTORICAL_MARKET_YEARS[HISTORICAL_PATH_COUNT - 1].year
