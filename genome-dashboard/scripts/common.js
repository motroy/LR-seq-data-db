/* ============================================================
   Shared utilities for the LR-seq dashboards.
   ES module — imported by landing.js, dashboard.js, hybrid.js.
   ============================================================ */

export const REPO_URL = "https://github.com/motroy/LR-seq-data-db";
export const FFLATE_URL = "https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js";

const THEME_KEY = "lrseq-theme";

/* ------------------------------------------------------------
   Theme
   ------------------------------------------------------------ */

export function getTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export function setTheme(theme, persist = true) {
  document.documentElement.setAttribute("data-theme", theme);
  if (persist) {
    try { localStorage.setItem(THEME_KEY, theme); } catch (_) { /* ignore */ }
  }
  document.dispatchEvent(new CustomEvent("themechange", { detail: { theme } }));
}

export function initTheme() {
  // The <html data-theme> attribute is set by an inline script before paint;
  // here we wire up the toggle button and follow OS changes when no explicit choice exists.
  const toggle = document.querySelector(".theme-toggle");
  if (toggle) {
    const label = () => toggle.setAttribute("aria-label", getTheme() === "dark" ? "Switch to light mode" : "Switch to dark mode");
    label();
    toggle.addEventListener("click", () => {
      setTheme(getTheme() === "dark" ? "light" : "dark");
      label();
    });
  }
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored !== "light" && stored !== "dark") {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
        setTheme(e.matches ? "dark" : "light", false);
      });
    }
  } catch (_) { /* ignore */ }
}

export function onThemeChange(fn) {
  document.addEventListener("themechange", (e) => fn(e.detail.theme));
}

/** Read the current design tokens so charts match the page theme. */
export function tokens() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name) => cs.getPropertyValue(name).trim();
  return {
    theme: getTheme(),
    text: v("--text"),
    text2: v("--text-2"),
    text3: v("--text-3"),
    border: v("--border"),
    surface: v("--surface"),
    accent: v("--accent"),
    wgs: v("--wgs"),
    mgx: v("--mgx"),
    hyb: v("--hyb"),
    c1: v("--c1"), c2: v("--c2"), c3: v("--c3"), c4: v("--c4"),
    font: v("--font") || "Inter, sans-serif",
  };
}

/** Base Plotly layout shared by all charts. */
export function plotlyBase(t = tokens()) {
  return {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: t.font, size: 12, color: t.text2 },
    margin: { t: 48, r: 20, b: 56, l: 64 },
    hoverlabel: {
      bgcolor: t.surface,
      bordercolor: t.border,
      font: { family: t.font, color: t.text, size: 12 },
    },
    legend: { orientation: "h", x: 0, y: 1.12, font: { color: t.text2 } },
    xaxis: { gridcolor: t.border, zerolinecolor: t.border, linecolor: t.border, tickcolor: t.border, automargin: true },
    yaxis: { gridcolor: t.border, zerolinecolor: t.border, linecolor: t.border, tickcolor: t.border, automargin: true },
  };
}

export const PLOTLY_CONFIG = {
  responsive: true,
  displaylogo: false,
  modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d", "toggleSpikelines"],
  toImageButtonOptions: { format: "png", scale: 2 },
};

/* ------------------------------------------------------------
   Navigation
   ------------------------------------------------------------ */

/** Mark the active primary-nav link (links carry data-nav="wgs|mgx|hybrid|home"). */
export function setActiveNav(key) {
  document.querySelectorAll(".site-nav a[data-nav]").forEach((a) => {
    if (a.dataset.nav === key) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

/* ------------------------------------------------------------
   Small helpers
   ------------------------------------------------------------ */

export function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

export const fmtInt = (n) => (n === null || n === undefined || Number.isNaN(n)) ? "–" : Number(n).toLocaleString("en-US");

export function fmtCompact(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + " T";
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + " G";
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + " M";
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + " k";
  return String(n);
}

export function fmtDate(iso) {
  if (!iso) return "–";
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const yieldToMain = () => new Promise((r) => setTimeout(r, 0));

/** Parse a small CSV file (no quoted fields) into an array of objects. */
export function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row = {};
    header.forEach((h, i) => { row[h] = (cells[i] ?? "").trim(); });
    return row;
  });
}

/** Trigger a client-side text download. */
export function downloadText(filename, text, mime = "text/plain") {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ------------------------------------------------------------
   Loading overlay
   ------------------------------------------------------------ */

export function createLoader() {
  const overlay = document.getElementById("loading-overlay");
  const bar = document.getElementById("progress-bar");
  const stage = document.getElementById("loading-stage");
  const detail = document.getElementById("loading-detail");
  const retry = document.getElementById("loading-retry");
  let onRetry = null;

  if (retry) retry.addEventListener("click", () => { if (onRetry) onRetry(); });

  return {
    show() {
      overlay.classList.remove("is-error");
      overlay.style.display = "flex";
      this.update(0, "Loading data…", "");
    },
    update(percent, stageText, detailText) {
      const p = Math.max(0, Math.min(100, Math.round(percent)));
      bar.style.width = p + "%";
      bar.setAttribute("aria-valuenow", String(p));
      if (stageText) stage.textContent = stageText;
      if (detailText !== undefined) detail.textContent = detailText;
    },
    async hide(delay = 250) {
      await new Promise((r) => setTimeout(r, delay));
      overlay.style.display = "none";
    },
    fail(message, retryFn) {
      onRetry = retryFn || null;
      overlay.classList.add("is-error");
      this.update(0, "Couldn't load data", message || "Unknown error");
    },
  };
}

/* ------------------------------------------------------------
   Gzipped JSON loading (worker with main-thread fallback)
   ------------------------------------------------------------ */

const WORKER_SOURCE = `
  importScripts(${JSON.stringify(FFLATE_URL)});
  self.onmessage = async function (e) {
    const { url } = e.data;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("HTTP " + response.status + " while fetching " + url);
      const total = parseInt(response.headers.get("Content-Length") || "0", 10);
      let compressed;
      if (total && response.body) {
        const reader = response.body.getReader();
        const chunks = [];
        let received = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.length;
          self.postMessage({ type: "download", received, total });
        }
        compressed = new Uint8Array(received);
        let offset = 0;
        for (const c of chunks) { compressed.set(c, offset); offset += c.length; }
      } else {
        compressed = new Uint8Array(await response.arrayBuffer());
      }
      self.postMessage({ type: "stage", stage: "decompress" });
      const decompressed = fflate.decompressSync(compressed);
      self.postMessage({ type: "stage", stage: "parse" });
      const data = JSON.parse(new TextDecoder().decode(decompressed));
      self.postMessage({ type: "done", data });
    } catch (err) {
      self.postMessage({ type: "error", message: err && err.message ? err.message : String(err) });
    }
  };
`;

function reportDownload(loader, received, total) {
  const mb = (received / 1048576).toFixed(1);
  const totalMb = (total / 1048576).toFixed(1);
  loader.update((received / total) * 50, "Downloading data…", `${mb} / ${totalMb} MB`);
}

function loadViaWorker(url, loader) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      const blob = new Blob([WORKER_SOURCE], { type: "application/javascript" });
      worker = new Worker(URL.createObjectURL(blob));
    } catch (err) {
      reject(err);
      return;
    }
    worker.onmessage = (e) => {
      const msg = e.data;
      switch (msg.type) {
        case "download": reportDownload(loader, msg.received, msg.total); break;
        case "stage":
          if (msg.stage === "decompress") loader.update(55, "Decompressing…", "");
          else loader.update(75, "Parsing data…", "");
          break;
        case "done":
          loader.update(85, "Parsing data…", `${fmtInt(msg.data.length)} records loaded`);
          worker.terminate();
          resolve(msg.data);
          break;
        case "error":
          worker.terminate();
          reject(new Error(msg.message));
          break;
      }
    };
    worker.onerror = (err) => { worker.terminate(); reject(err); };
    loader.update(0, "Downloading data…", "");
    worker.postMessage({ url: new URL(url, window.location.href).href });
  });
}

async function loadOnMainThread(url, loader) {
  loader.update(0, "Downloading data…", "");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} while fetching ${url}`);
  const total = parseInt(response.headers.get("Content-Length") || "0", 10);
  let compressed;
  if (total && response.body) {
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      reportDownload(loader, received, total);
    }
    compressed = new Uint8Array(received);
    let offset = 0;
    for (const c of chunks) { compressed.set(c, offset); offset += c.length; }
  } else {
    loader.update(25, "Downloading data…", "");
    compressed = new Uint8Array(await response.arrayBuffer());
  }
  await yieldToMain();
  loader.update(55, "Decompressing…", "");
  const decompressed = window.fflate.decompressSync(compressed);
  await yieldToMain();
  loader.update(75, "Parsing data…", "");
  const data = JSON.parse(new TextDecoder().decode(decompressed));
  loader.update(85, "Parsing data…", `${fmtInt(data.length)} records loaded`);
  return data;
}

/** Fetch + gunzip + parse a JSON file, reporting progress to the loader. */
export async function loadGzippedJSON(url, loader) {
  try {
    return await loadViaWorker(url, loader);
  } catch (workerErr) {
    console.warn("Web Worker path failed, falling back to main thread:", workerErr);
    return loadOnMainThread(url, loader);
  }
}

/* ------------------------------------------------------------
   Tabulator helpers
   ------------------------------------------------------------ */

/** Header menu that lets users show/hide columns. */
export function columnVisibilityMenu() {
  const menu = [];
  const columns = this.getColumns();
  for (const column of columns) {
    if (!column.getDefinition().title) continue;
    const icon = document.createElement("span");
    icon.textContent = column.isVisible() ? "☑" : "☐";
    icon.style.marginRight = "0.4rem";
    const label = document.createElement("span");
    label.appendChild(icon);
    label.appendChild(document.createTextNode(column.getDefinition().title));
    menu.push({
      label,
      action(e) {
        e.stopPropagation();
        column.toggle();
        icon.textContent = column.isVisible() ? "☑" : "☐";
      },
    });
  }
  return menu;
}

/** Wait until a Tabulator instance has finished building. */
export function whenTableBuilt(table) {
  return new Promise((resolve) => {
    if (table.initialized) resolve();
    else table.on("tableBuilt", resolve);
  });
}

/**
 * Download the visible columns of all rows that pass the active filters as plain TSV.
 * (Tabulator's CSV exporter quotes every field, which many TSV consumers dislike.)
 */
export function downloadTSV(table, filename) {
  const cols = table.getColumns().filter((c) => c.isVisible() && c.getField());
  const clean = (v) => String(v ?? "").replace(/[\t\r\n]+/g, " ");
  const header = cols.map((c) => clean(c.getDefinition().title)).join("\t");
  const lines = table.getData("active").map((row) => cols.map((c) => clean(row[c.getField()])).join("\t"));
  downloadText(filename, [header, ...lines].join("\n") + "\n", "text/tab-separated-values");
}

/** Read the last-updated date from sample_counts.csv (null if unavailable). */
export async function fetchLatestCounts() {
  try {
    const res = await fetch("sample_counts.csv", { cache: "no-cache" });
    if (!res.ok) return null;
    const rows = parseCSV(await res.text()).filter((r) => r.date);
    rows.sort((a, b) => a.date.localeCompare(b.date));
    return rows;
  } catch (_) {
    return null;
  }
}

/** Fill any [data-updated] element with the latest data date. */
export function renderUpdated(rows) {
  const latest = rows && rows.length ? rows[rows.length - 1].date : null;
  document.querySelectorAll("[data-updated]").forEach((el) => {
    el.textContent = latest ? fmtDate(latest) : "unknown";
  });
}
