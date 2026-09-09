import {
  initTheme, onThemeChange, tokens, plotlyBase, PLOTLY_CONFIG,
  fetchLatestCounts, renderUpdated, fmtInt, fmtDate,
} from "./common.js";

initTheme();

const SERIES = {
  samples: [
    { key: "wgs_samples", name: "WGS samples", color: "wgs" },
    { key: "mgx_samples", name: "MGx samples", color: "mgx" },
  ],
  hybrid: [
    { key: "hybrid_wgs", name: "Hybrid WGS biosamples", color: "hyb" },
    { key: "hybrid_mgx", name: "Hybrid MGx biosamples", color: "c4" },
  ],
};

let rows = [];
let activeSeries = "samples";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function renderStats() {
  if (!rows.length) return;
  const latest = rows[rows.length - 1];
  const prev = rows.length > 1 ? rows[rows.length - 2] : null;

  document.querySelectorAll("[data-stat]").forEach((el) => {
    el.textContent = fmtInt(num(latest[el.dataset.stat]));
  });
  document.querySelectorAll("[data-count]").forEach((el) => {
    const v = num(latest[el.dataset.count]);
    el.textContent = v === null ? "" : `${fmtInt(v)} records`;
  });
  document.querySelectorAll("[data-delta]").forEach((el) => {
    const key = el.dataset.delta;
    const cur = num(latest[key]);
    const before = prev ? num(prev[key]) : null;
    if (cur === null || before === null) { el.textContent = ""; return; }
    const diff = cur - before;
    if (diff > 0) {
      el.innerHTML = `<span class="up">▲ +${fmtInt(diff)}</span> since ${fmtDate(prev.date)}`;
    } else if (diff === 0) {
      el.innerHTML = `<span class="flat">No change</span> since ${fmtDate(prev.date)}`;
    } else {
      el.innerHTML = `<span class="flat">▼ ${fmtInt(diff)}</span> since ${fmtDate(prev.date)}`;
    }
  });
}

function renderChart() {
  const el = document.getElementById("growth-chart");
  if (!el || !window.Plotly) return;
  const t = tokens();
  const defs = SERIES[activeSeries];

  // Hybrid detection started later than the sample history; drop leading zero rows.
  let data = rows;
  if (activeSeries === "hybrid") {
    const firstIdx = rows.findIndex((r) => defs.some((d) => (num(r[d.key]) || 0) > 0));
    data = firstIdx >= 0 ? rows.slice(firstIdx) : [];
  }

  const traces = defs.map((d) => ({
    type: "scatter",
    mode: "lines+markers",
    name: d.name,
    x: data.map((r) => r.date),
    y: data.map((r) => num(r[d.key])),
    line: { color: t[d.color], width: 2.5, shape: "spline", smoothing: 0.6 },
    marker: { color: t[d.color], size: 6 },
    hovertemplate: "%{y:,} · %{x|%d %b %Y}<extra>" + d.name + "</extra>",
  }));

  const layout = {
    ...plotlyBase(t),
    hovermode: "x unified",
    xaxis: { ...plotlyBase(t).xaxis, type: "date", title: { text: "" } },
    yaxis: {
      ...plotlyBase(t).yaxis,
      title: { text: activeSeries === "hybrid" ? "Biosamples" : "Samples", font: { color: t.text3 } },
      rangemode: "tozero",
      tickformat: ",",
    },
    margin: { t: 40, r: 16, b: 48, l: 64 },
  };

  if (!data.length) {
    layout.annotations = [{ text: "No data yet", showarrow: false, font: { color: t.text3, size: 14 } }];
  }

  Plotly.react(el, traces, layout, PLOTLY_CONFIG);
}

function whenPlotlyReady(fn) {
  if (window.Plotly) { fn(); return; }
  const s = document.querySelector('script[src*="plotly"]');
  if (s) s.addEventListener("load", fn, { once: true });
  else fn();
}

document.querySelectorAll(".segmented [data-series]").forEach((btn) => {
  btn.addEventListener("click", () => {
    activeSeries = btn.dataset.series;
    document.querySelectorAll(".segmented [data-series]").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    renderChart();
  });
});

onThemeChange(() => renderChart());

(async () => {
  rows = (await fetchLatestCounts()) || [];
  renderUpdated(rows);
  renderStats();
  whenPlotlyReady(renderChart);
})();
