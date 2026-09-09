import {
  initTheme, setActiveNav, createLoader, loadGzippedJSON, debounce, fmtInt, escapeHtml,
  columnVisibilityMenu, whenTableBuilt, downloadTSV, downloadText, fetchLatestCounts, renderUpdated, yieldToMain,
} from "./common.js";

initTheme();
setActiveNav("hybrid");

const DATASETS = {
  wgs: { label: "WGS", title: "Hybrid WGS biosamples", file: "hybrid_wgs.json.gz", exportName: "hybrid_wgs" },
  mgx: { label: "MGx", title: "Hybrid MGx biosamples", file: "hybrid_mgx.json.gz", exportName: "hybrid_mgx" },
};

// Maps filter values to keywords matched against instrument model / platform strings.
const TECH_KEYWORDS = {
  "nanopore": ["nanopore", "minion", "gridion", "promethion", "mk1c", "p2 solo"],
  "pacbio": ["pacbio", "sequel", "revio", "onso"],
  "illumina": ["illumina", "hiseq", "miseq", "novaseq", "nextseq", "miniseq", "iseq"],
  "bgi": ["bgiseq", "dnbseq", "mgi"],
  "ion torrent": ["ion torrent", "pgm", "proton", "chef"],
};

const params = new URLSearchParams(window.location.search);
let activeType = params.get("type") === "mgx" ? "mgx" : "wgs";

const loader = createLoader();
const els = {
  title: document.getElementById("dashboard-title"),
  biosample: document.getElementById("biosample-filter"),
  organism: document.getElementById("organism-filter"),
  longTech: document.getElementById("long-tech-filter"),
  shortTech: document.getElementById("short-tech-filter"),
  reset: document.getElementById("reset-filters"),
  count: document.getElementById("result-count"),
  tableCount: document.getElementById("table-count"),
  stats: document.getElementById("stats"),
  selectedBtn: document.getElementById("download-selected-txt"),
  selectedLabel: document.getElementById("selected-label"),
  tabs: document.querySelectorAll("#type-tabs [data-type]"),
};

let allData = [];
let filteredData = [];

/* ------------------------------------------------------------
   Table
   ------------------------------------------------------------ */

const linkList = (value, urlFor) => (value || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((id) => `<a href="${urlFor(id)}" target="_blank" rel="noopener">${escapeHtml(id)}</a>`)
  .join(", ");

const table = new Tabulator("#hybrid-table", {
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
  selectableRows: true,
  selectableRowsPersistence: true,
  placeholder: "No biosamples match the current filters",
  columnDefaults: { headerMenu: columnVisibilityMenu, tooltip: true, resizable: "header" },
  columns: [
    {
      formatter: "rowSelection", titleFormatter: "rowSelection",
      hozAlign: "center", headerHozAlign: "center", headerSort: false, width: 40, resizable: false, headerMenu: false, responsive: 0,
      cellClick: (e, cell) => cell.getRow().toggleSelect(),
    },
    {
      title: "BioSample", field: "biosample", width: 140, responsive: 0,
      formatter: (c) => `<a href="https://www.ncbi.nlm.nih.gov/biosample/${encodeURIComponent(c.getValue())}" target="_blank" rel="noopener">${escapeHtml(c.getValue())}</a>`,
    },
    { title: "Organism", field: "scientific_name", minWidth: 140, responsive: 0, formatter: (c) => `<em>${escapeHtml(c.getValue())}</em>` },
    { title: "Long-read instruments", field: "long_instruments", minWidth: 160, responsive: 1 },
    { title: "Short-read instruments", field: "short_instruments", minWidth: 160, responsive: 2 },
    { title: "LR runs", field: "long_run_count", sorter: "number", hozAlign: "right", width: 100, cssClass: "num", responsive: 3 },
    { title: "SR runs", field: "short_run_count", sorter: "number", hozAlign: "right", width: 100, cssClass: "num", responsive: 4 },
    { title: "Studies", field: "study_accessions", minWidth: 140, responsive: 5, formatter: (c) => linkList(c.getValue(), (id) => `https://www.ncbi.nlm.nih.gov/sra/?term=${encodeURIComponent(id)}`) },
    { title: "PubMed", field: "pubmed_ids", width: 130, responsive: 6, formatter: (c) => linkList(c.getValue(), (id) => `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(id)}/`) },
  ],
});

table.on("rowSelectionChanged", (data) => {
  const n = data.length;
  els.selectedBtn.disabled = n === 0;
  els.selectedLabel.textContent = n ? `${fmtInt(n)} selected ID${n === 1 ? "" : "s"}` : "Selected IDs";
});

table.on("dataFiltered", (filters, rows) => {
  filteredData = rows.map((r) => r.getData());
  updateCounts();
  summarize(filteredData);
});

/* ------------------------------------------------------------
   Data shaping
   ------------------------------------------------------------ */

function uniqueJoin(list, key) {
  return [...new Set((list || []).map((r) => r[key]).filter(Boolean))].join(", ");
}

function flattenRecord(record) {
  const long = record.long_reads || [];
  const short = record.short_reads || [];
  return {
    biosample: record.biosample || "",
    scientific_name: record.scientific_name || "",
    pubmed_ids: (record.pubmed_ids || []).join(", "),
    long_instruments: uniqueJoin(long, "instrument_model"),
    short_instruments: uniqueJoin(short, "instrument_model"),
    long_platforms: uniqueJoin(long, "instrument_platform"),
    short_platforms: uniqueJoin(short, "instrument_platform"),
    long_run_count: long.length,
    short_run_count: short.length,
    study_accessions: [...new Set(record.study_accession || [])].join(", "),
  };
}

function matchesTech(instruments, platforms, filterVal) {
  if (!filterVal) return true;
  const haystack = `${instruments || ""} ${platforms || ""}`.toLowerCase();
  const keywords = TECH_KEYWORDS[filterVal] || [filterVal];
  return keywords.some((k) => haystack.includes(k));
}

/* ------------------------------------------------------------
   Filters
   ------------------------------------------------------------ */

function applyFilters() {
  const biosample = els.biosample.value.trim().toLowerCase();
  const organism = els.organism.value.trim().toLowerCase();
  const longVal = els.longTech.value;
  const shortVal = els.shortTech.value;

  if (!biosample && !organism && !longVal && !shortVal) {
    table.clearFilter(true);
    return;
  }
  table.setFilter((row) =>
    (!biosample || row.biosample.toLowerCase().includes(biosample)) &&
    (!organism || row.scientific_name.toLowerCase().includes(organism)) &&
    matchesTech(row.long_instruments, row.long_platforms, longVal) &&
    matchesTech(row.short_instruments, row.short_platforms, shortVal)
  );
}

function resetFilters(refresh = true) {
  els.biosample.value = "";
  els.organism.value = "";
  els.longTech.value = "";
  els.shortTech.value = "";
  if (refresh) table.clearFilter(true);
}

els.biosample.addEventListener("input", debounce(applyFilters, 250));
els.organism.addEventListener("input", debounce(applyFilters, 250));
els.longTech.addEventListener("change", applyFilters);
els.shortTech.addEventListener("change", applyFilters);
els.reset.addEventListener("click", () => resetFilters());

function updateCounts() {
  const shown = filteredData.length;
  const total = allData.length;
  els.count.innerHTML = shown === total
    ? `<strong>${fmtInt(total)}</strong> biosamples`
    : `<strong>${fmtInt(shown)}</strong> of ${fmtInt(total)} biosamples`;
  els.tableCount.textContent = shown === total ? "" : `${fmtInt(shown)} of ${fmtInt(total)}`;
}

/* ------------------------------------------------------------
   Stats
   ------------------------------------------------------------ */

function summarize(data) {
  const total = data.length;
  let nano = 0, pacbio = 0, illumina = 0, bgi = 0, longRuns = 0, shortRuns = 0;
  const organisms = new Map();
  for (const d of data) {
    longRuns += d.long_run_count;
    shortRuns += d.short_run_count;
    organisms.set(d.scientific_name, (organisms.get(d.scientific_name) || 0) + 1);
    if (matchesTech(d.long_instruments, d.long_platforms, "nanopore")) nano++;
    if (matchesTech(d.long_instruments, d.long_platforms, "pacbio")) pacbio++;
    if (matchesTech(d.short_instruments, d.short_platforms, "illumina")) illumina++;
    if (matchesTech(d.short_instruments, d.short_platforms, "bgi")) bgi++;
  }
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
    card("accent-1", fmtInt(total), "Hybrid biosamples"),
    card("accent-2", fmtInt(nano), `With Nanopore · ${share(nano)}`, share(nano)),
    card("accent-3", fmtInt(pacbio), `With PacBio · ${share(pacbio)}`, share(pacbio)),
    card("accent-4", fmtInt(illumina), `With Illumina · ${share(illumina)}`, share(illumina)),
    card("accent-4", fmtInt(bgi), `With BGI / DNBSEQ · ${share(bgi)}`, share(bgi)),
    card("accent-2", fmtInt(longRuns), "Long-read runs"),
    card("accent-3", fmtInt(shortRuns), "Short-read runs"),
    `<div class="stat-card top-organisms">
       <div class="stat-label">Top organisms</div>
       <ul class="top-organisms-list">${pills || '<li style="cursor:default">No biosamples</li>'}</ul>
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
   Dataset switching + loading
   ------------------------------------------------------------ */

function applyTypeToPage() {
  const ds = DATASETS[activeType];
  document.title = `${ds.title} · LR-seq Data`;
  els.title.textContent = ds.title;
  els.tabs.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.type === activeType)));
}

async function loadDataset() {
  const ds = DATASETS[activeType];
  applyTypeToPage();
  loader.show();
  els.selectedBtn.disabled = true;
  try {
    const raw = await loadGzippedJSON(ds.file, loader);
    await whenTableBuilt(table);
    await yieldToMain();
    loader.update(88, "Rendering table…", `${fmtInt(raw.length)} biosamples`);
    allData = raw.map(flattenRecord);
    resetFilters(false);
    table.clearFilter(true);
    table.deselectRow();
    await table.setData(allData);
    if (!filteredData.length && allData.length) {
      filteredData = allData.slice();
      updateCounts();
      summarize(filteredData);
    }
    loader.update(100, "Done", "");
    await loader.hide();
  } catch (err) {
    console.error("Failed to load hybrid data:", err);
    loader.fail(err && err.message ? err.message : String(err), loadDataset);
    els.stats.innerHTML = `
      <div class="empty-state">
        <p>No hybrid biosample data is available yet for <strong>${ds.label}</strong>.</p>
        <p>Run <code>find_hybrid_samples.py --type ${activeType}</code> to generate <code>${ds.file}</code>.</p>
      </div>`;
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

els.selectedBtn.addEventListener("click", () => {
  const selected = table.getSelectedData();
  if (!selected.length) return;
  downloadText(`${DATASETS[activeType].exportName}_selected_biosamples.txt`, selected.map((d) => d.biosample).join("\n") + "\n");
});
document.getElementById("download-tsv").addEventListener("click", () => {
  downloadTSV(table, `${DATASETS[activeType].exportName}_biosamples.tsv`);
});
document.getElementById("download-xlsx").addEventListener("click", () => {
  table.download("xlsx", `${DATASETS[activeType].exportName}_biosamples.xlsx`, { sheetName: "Hybrid biosamples" });
});

/* ------------------------------------------------------------
   Boot
   ------------------------------------------------------------ */

fetchLatestCounts().then(renderUpdated);
loadDataset();
