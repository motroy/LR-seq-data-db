import {
  initTheme, onThemeChange, setActiveNav, tokens, plotlyBase, PLOTLY_CONFIG,
  createLoader, loadGzippedJSON, debounce, fmtInt, escapeHtml,
  columnVisibilityMenu, whenTableBuilt, downloadTSV, fetchLatestCounts, renderUpdated, yieldToMain,
} from "./common.js";

initTheme();

const DATASETS = {
  wgs: {
    label: "WGS",
    title: "Whole-genome sequencing samples",
    desc: "Bacterial whole-genome sequencing runs on Oxford Nanopore and PacBio platforms.",
    file: "data_bacteria.json.gz",
    exportName: "lr_wgs_samples",
  },
  mgx: {
    label: "MGx",
    title: "Metagenome sequencing samples",
    desc: "Metagenomic sequencing runs on Oxford Nanopore and PacBio platforms.",
    file: "data_metagenome.json.gz",
    exportName: "lr_mgx_samples",
  },
};

const TOP_N_ORGANISMS_PLOT = 20;
const TOP_N_ORGANISMS_PLOT_MOBILE = 10;
const isNarrow = () => window.matchMedia("(max-width: 640px)").matches;
const topN = () => (isNarrow() ? TOP_N_ORGANISMS_PLOT_MOBILE : TOP_N_ORGANISMS_PLOT);

const params = new URLSearchParams(window.location.search);
let activeType = params.get("type") === "mgx" ? "mgx" : "wgs";

const loader = createLoader();
const els = {
  title: document.getElementById("dashboard-title"),
  desc: document.getElementById("dashboard-desc"),
  organism: document.getElementById("organism-filter"),
  tech: document.getElementById("tech-filter"),
  amplicon: document.getElementById("amplicon-filter"),
  reset: document.getElementById("reset-filters"),
  count: document.getElementById("result-count"),
  tableCount: document.getElementById("table-count"),
  stats: document.getElementById("stats"),
  plots: document.getElementById("plots"),
  tabs: document.querySelectorAll("#type-tabs [data-type]"),
};

let allData = [];
let filteredData = [];

/* ------------------------------------------------------------
   Table
   ------------------------------------------------------------ */

const enaLink = (id) => `<a href="https://www.ebi.ac.uk/ena/browser/view/${encodeURIComponent(id)}" target="_blank" rel="noopener">${escapeHtml(id)}</a>`;

const numberFormatter = (cell) => fmtInt(cell.getValue());

const techFormatter = (cell) => {
  const v = cell.getValue() || "";
  if (v === "OXFORD_NANOPORE") return '<span class="pill pill--ont">Nanopore</span>';
  if (v === "PACBIO_SMRT") return '<span class="pill pill--pb">PacBio</span>';
  return `<span class="pill">${escapeHtml(v)}</span>`;
};

const table = new Tabulator("#genome-table", {
  data: [],
  layout: "fitColumns",
  responsiveLayout: "collapse",
  responsiveLayoutCollapseStartOpen: false,
  height: "640px",
  pagination: true,
  paginationSize: 25,
  paginationSizeSelector: [25, 50, 100, 250],
  paginationCounter: "rows",
  movableColumns: true,
  placeholder: "No samples match the current filters",
  columnDefaults: { headerMenu: columnVisibilityMenu, tooltip: true, resizable: "header" },
  columns: [
    // `responsive` sets hide priority on narrow screens: 0 = never hidden, higher = hidden first.
    { title: "Run", field: "sample_id", formatter: (c) => enaLink(c.getValue()), width: 130, minWidth: 110, responsive: 0 },
    { title: "Organism", field: "scientific_name", formatter: (c) => `<em>${escapeHtml(c.getValue())}</em>`, minWidth: 150, responsive: 0 },
    { title: "Technology", field: "instrument_platform", formatter: techFormatter, width: 120, hozAlign: "center", responsive: 1 },
    { title: "Instrument", field: "instrument_model", minWidth: 130, responsive: 4 },
    { title: "Library", field: "library_strategy", width: 120, responsive: 5 },
    { title: "Reads", field: "read_count", formatter: numberFormatter, sorter: "number", hozAlign: "right", width: 120, cssClass: "num", responsive: 2 },
    { title: "Bases", field: "base_count", formatter: numberFormatter, sorter: "number", hozAlign: "right", width: 150, cssClass: "num", responsive: 3 },
    { title: "Study", field: "study_accession", formatter: (c) => enaLink(c.getValue()), width: 130, responsive: 6 },
    { title: "Sample", field: "sample_accession", formatter: (c) => enaLink(c.getValue()), width: 140, visible: false },
    { title: "Source", field: "source", width: 90, visible: false },
  ],
});

table.on("dataFiltered", (filters, rows) => {
  filteredData = rows.map((r) => r.getData());
  updateCounts();
  summarize(filteredData);
  renderPlots(filteredData);
});

/* ------------------------------------------------------------
   Filters
   ------------------------------------------------------------ */

function applyFilters() {
  const filters = [];
  const organism = els.organism.value.trim();
  if (organism) filters.push({ field: "scientific_name", type: "like", value: organism });
  if (els.tech.value) filters.push({ field: "instrument_platform", type: "=", value: els.tech.value });
  if (els.amplicon.value === "AMPLICON") filters.push({ field: "library_strategy", type: "=", value: "AMPLICON" });
  else if (els.amplicon.value === "NON_AMPLICON") filters.push({ field: "library_strategy", type: "!=", value: "AMPLICON" });
  table.setFilter(filters);
}

function resetFilters(refresh = true) {
  els.organism.value = "";
  els.tech.value = "";
  els.amplicon.value = "";
  if (refresh) table.clearFilter(true);
}

els.organism.addEventListener("input", debounce(applyFilters, 250));
els.tech.addEventListener("change", applyFilters);
els.amplicon.addEventListener("change", applyFilters);
els.reset.addEventListener("click", () => resetFilters());

function updateCounts() {
  const shown = filteredData.length;
  const total = allData.length;
  els.count.innerHTML = shown === total
    ? `<strong>${fmtInt(total)}</strong> samples`
    : `<strong>${fmtInt(shown)}</strong> of ${fmtInt(total)} samples`;
  els.tableCount.textContent = shown === total ? "" : `${fmtInt(shown)} of ${fmtInt(total)}`;
}

/* ------------------------------------------------------------
   Stats
   ------------------------------------------------------------ */

function summarize(data) {
  const organisms = new Map();
  let ont = 0, pacbio = 0, amplicon = 0;
  for (const d of data) {
    organisms.set(d.scientific_name, (organisms.get(d.scientific_name) || 0) + 1);
    if (d.instrument_platform === "OXFORD_NANOPORE") ont++;
    else if (d.instrument_platform === "PACBIO_SMRT") pacbio++;
    if (d.library_strategy === "AMPLICON") amplicon++;
  }
  const total = data.length;
  const share = (n) => total ? ((n / total) * 100).toFixed(0) + "%" : "0%";

  const top = [...organisms.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const pills = top.map(([org, n]) =>
    `<li data-organism="${escapeHtml(org)}" title="Filter by ${escapeHtml(org)}"><em>${escapeHtml(org)}</em><span class="org-count">${fmtInt(n)}</span></li>`
  ).join("");

  const card = (cls, value, label, shareVal) => `
    <div class="stat-card ${cls}">
      <div class="stat-value">${value}</div>
      <div class="stat-label">${label}</div>
      ${shareVal !== undefined ? `<div class="stat-share" aria-hidden="true"><span style="--share:${shareVal}"></span></div>` : ""}
    </div>`;

  els.stats.innerHTML = [
    card("accent-1", fmtInt(total), "Samples"),
    card("accent-2", fmtInt(ont), `Nanopore · ${share(ont)}`, share(ont)),
    card("accent-3", fmtInt(pacbio), `PacBio · ${share(pacbio)}`, share(pacbio)),
    card("accent-4", fmtInt(amplicon), `Amplicon · ${share(amplicon)}`, share(amplicon)),
    card("accent-2", fmtInt(total - amplicon), `Non-amplicon · ${share(total - amplicon)}`, share(total - amplicon)),
    card("accent-1", fmtInt(organisms.size), "Distinct organisms"),
    `<div class="stat-card top-organisms">
       <div class="stat-label">Top organisms</div>
       <ul class="top-organisms-list">${pills || '<li style="cursor:default">No samples</li>'}</ul>
     </div>`,
  ].join("");
}

els.stats.addEventListener("click", (e) => {
  const li = e.target.closest("li[data-organism]");
  if (!li) return;
  els.organism.value = li.dataset.organism;
  applyFilters();
  els.organism.focus();
});

/* ------------------------------------------------------------
   Plots
   ------------------------------------------------------------ */

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

function computeBoxTraces(data, field, t) {
  // Restrict to the most frequent organisms so the chart stays readable.
  const counts = new Map();
  for (const d of data) counts.set(d.scientific_name, (counts.get(d.scientific_name) || 0) + 1);
  const topOrgs = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN()).map(([o]) => o);
  const topSet = new Set(topOrgs);

  const groups = { OXFORD_NANOPORE: new Map(), PACBIO_SMRT: new Map() };
  for (const d of data) {
    if (!topSet.has(d.scientific_name)) continue;
    const g = groups[d.instrument_platform];
    if (!g) continue;
    const v = Number(d[field]);
    if (!Number.isFinite(v) || v <= 0) continue;
    if (!g.has(d.scientific_name)) g.set(d.scientific_name, []);
    g.get(d.scientific_name).push(v);
  }

  const meta = {
    OXFORD_NANOPORE: { name: "Oxford Nanopore", color: t.c2 },
    PACBIO_SMRT: { name: "PacBio", color: t.c3 },
  };

  const traces = [];
  for (const [tech, orgs] of Object.entries(groups)) {
    const x = [], q1 = [], median = [], q3 = [], lowerfence = [], upperfence = [], text = [];
    for (const org of topOrgs) {
      const values = orgs.get(org);
      if (!values || !values.length) continue;
      values.sort((a, b) => a - b);
      const a = quantile(values, 0.25), m = quantile(values, 0.5), b = quantile(values, 0.75);
      const iqr = b - a;
      x.push(org);
      q1.push(a); median.push(m); q3.push(b);
      lowerfence.push(Math.max(values[0], a - 1.5 * iqr));
      upperfence.push(Math.min(values[values.length - 1], b + 1.5 * iqr));
      text.push(`n = ${fmtInt(values.length)}`);
    }
    if (!x.length) continue;
    traces.push({
      type: "box",
      name: meta[tech].name,
      x, q1, median, q3, lowerfence, upperfence, text,
      marker: { color: meta[tech].color },
      line: { color: meta[tech].color, width: 1.5 },
      fillcolor: meta[tech].color + "33",
      hoverinfo: "x+y+name+text",
    });
  }
  return traces;
}

function renderBoxPlot(data, elementId, field, title, yLabel) {
  const t = tokens();
  const narrow = isNarrow();
  const traces = computeBoxTraces(data, field, t);
  const base = plotlyBase(t);
  const layout = {
    ...base,
    title: { text: title, x: 0.02, xanchor: "left", font: { family: t.font, size: narrow ? 13 : 14, color: t.text } },
    boxmode: "group",
    xaxis: { ...base.xaxis, tickangle: narrow ? -60 : -40, tickfont: { size: narrow ? 9 : 10, color: t.text2 }, automargin: true },
    yaxis: { ...base.yaxis, type: "log", title: { text: yLabel, font: { color: t.text3 } }, tickformat: "~s" },
    legend: { orientation: "h", x: 1, xanchor: "right", y: narrow ? 1.2 : 1.14, font: { color: t.text2, size: narrow ? 11 : 12 } },
    margin: narrow ? { t: 64, r: 8, b: 90, l: 48 } : { t: 56, r: 12, b: 110, l: 60 },
    height: narrow ? 380 : 420,
  };
  if (!traces.length) {
    layout.annotations = [{ text: "No data for the current filters", showarrow: false, font: { color: t.text3, size: 13 } }];
  }
  // The modebar overlaps the title on phones; touch users rarely need it.
  Plotly.react(elementId, traces, layout, { ...PLOTLY_CONFIG, displayModeBar: !narrow });
}

function renderPlots(data) {
  // Plotly falls back to a fixed 700px width if it measures a hidden container, so wait until visible.
  if (!window.Plotly || els.plots.classList.contains("hidden")) return;
  renderBoxPlot(data, "reads-plot", "read_count", `Reads per run · top ${topN()} organisms`, "Reads (log scale)");
  renderBoxPlot(data, "bases-plot", "base_count", `Bases per run · top ${topN()} organisms`, "Bases (log scale)");
}

onThemeChange(() => { if (allData.length) renderPlots(filteredData); });

// Keep charts sized to their cards when the layout (not just the window) changes.
if ("ResizeObserver" in window) {
  const resizePlots = debounce(() => {
    for (const id of ["reads-plot", "bases-plot"]) {
      const el = document.getElementById(id);
      if (el && el._fullLayout && window.Plotly) Plotly.Plots.resize(el);
    }
  }, 120);
  new ResizeObserver(resizePlots).observe(els.plots);
}

/* ------------------------------------------------------------
   Dataset switching + loading
   ------------------------------------------------------------ */

function applyTypeToPage() {
  const ds = DATASETS[activeType];
  document.title = `${ds.label} samples · LR-seq Data`;
  els.title.textContent = ds.title;
  els.desc.textContent = ds.desc;
  els.tabs.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.type === activeType)));
  setActiveNav(activeType);
}

async function loadDataset() {
  const ds = DATASETS[activeType];
  applyTypeToPage();
  loader.show();
  els.plots.classList.add("hidden");
  try {
    const data = await loadGzippedJSON(ds.file, loader);
    await whenTableBuilt(table);
    await yieldToMain();
    loader.update(88, "Rendering table…", `${fmtInt(data.length)} rows`);
    allData = data;
    resetFilters(false);
    table.clearFilter(true);
    // Unhide the chart cards before rendering so Plotly measures their real width.
    els.plots.classList.remove("hidden");
    await table.setData(allData);
    await yieldToMain();
    loader.update(96, "Drawing charts…", "");
    // dataFiltered fires from setData and paints stats/plots; make sure they exist even if it didn't.
    if (!filteredData.length && allData.length) {
      filteredData = allData.slice();
      updateCounts();
      summarize(filteredData);
      renderPlots(filteredData);
    }
    loader.update(100, "Done", "");
    await loader.hide();
  } catch (err) {
    console.error("Failed to load dataset:", err);
    loader.fail(err && err.message ? err.message : String(err), loadDataset);
  }
}

els.tabs.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.type === activeType) return;
    activeType = btn.dataset.type;
    const url = new URL(window.location);
    url.searchParams.set("type", activeType);
    window.history.replaceState({}, "", url);
    loadDataset();
  });
});

/* ------------------------------------------------------------
   Exports
   ------------------------------------------------------------ */

document.getElementById("download-tsv").addEventListener("click", () => {
  downloadTSV(table, `${DATASETS[activeType].exportName}.tsv`);
});
document.getElementById("download-xlsx").addEventListener("click", () => {
  table.download("xlsx", `${DATASETS[activeType].exportName}.xlsx`, { sheetName: `${DATASETS[activeType].label} samples` });
});

/* ------------------------------------------------------------
   Boot
   ------------------------------------------------------------ */

fetchLatestCounts().then(renderUpdated);
loadDataset();
