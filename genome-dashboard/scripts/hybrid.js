document.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  let activeType = urlParams.get('type') === 'mgx' ? 'mgx' : 'wgs';

  const loadingOverlay = document.getElementById("loading-overlay");
  const progressBar = document.getElementById("progress-bar");
  const loadingStage = document.getElementById("loading-stage");
  const loadingDetail = document.getElementById("loading-detail");
  const biosampleFilter = document.getElementById("biosample-filter");
  const longTechFilter = document.getElementById("long-tech-filter");
  const shortTechFilter = document.getElementById("short-tech-filter");
  const downloadSelectedBtn = document.getElementById("download-selected-txt");

  let allData = [];

  // ---- Tab switching ----
  const tabs = document.querySelectorAll(".hybrid-tab");
  tabs.forEach(tab => {
    if (tab.dataset.type === activeType) tab.classList.add("active");
    else tab.classList.remove("active");

    tab.addEventListener("click", () => {
      if (tab.dataset.type === activeType) return;
      activeType = tab.dataset.type;
      tabs.forEach(t => t.classList.toggle("active", t.dataset.type === activeType));
      // Update URL without reload
      const url = new URL(window.location);
      url.searchParams.set('type', activeType);
      window.history.replaceState({}, '', url);
      // Reset filters
      biosampleFilter.value = '';
      longTechFilter.value = '';
      shortTechFilter.value = '';
      loadData(activeType);
    });
  });

  // ---- Tabulator table ----
  const table = new Tabulator("#hybrid-table", {
    data: [],
    layout: "fitColumns",
    responsiveLayout: "hide",
    pagination: "local",
    paginationSize: 25,
    movableColumns: true,
    selectable: true,
    columns: [
      {
        formatter: "rowSelection",
        titleFormatter: "rowSelection",
        hozAlign: "center",
        headerHozAlign: "center",
        width: 40,
        headerSort: false
      },
      {
        title: "BioSample ID",
        field: "biosample",
        headerMenu: true,
        formatter: function(cell) {
          const val = cell.getValue();
          return `<a href="https://www.ncbi.nlm.nih.gov/biosample/${val}" target="_blank" rel="noopener" style="color:var(--color-accent)">${val}</a>`;
        }
      },
      { title: "Long-Read Instruments", field: "long_instruments", headerMenu: true },
      { title: "Short-Read Instruments", field: "short_instruments", headerMenu: true },
      { title: "Long-Read Runs", field: "long_run_count", headerMenu: true, hozAlign: "right", width: 130 },
      { title: "Short-Read Runs", field: "short_run_count", headerMenu: true, hozAlign: "right", width: 130 },
      {
        title: "Studies",
        field: "study_accessions",
        headerMenu: true,
        formatter: function(cell) {
          const studies = cell.getValue() || '';
          return studies.split(',').map(s => {
            const t = s.trim();
            if (!t) return '';
            return `<a href="https://www.ncbi.nlm.nih.gov/sra/?term=${t}" target="_blank" rel="noopener" style="color:var(--color-accent)">${t}</a>`;
          }).join(', ');
        }
      }
    ],
    height: "600px"
  });

  // Update download-selected button state when selection changes
  table.on("rowSelectionChanged", function(data, rows) {
    downloadSelectedBtn.disabled = rows.length === 0;
  });

  // Re-summarize when filters change rows
  table.on("dataFiltered", function(filters, rows) {
    const filteredData = rows.map(row => row.getData());
    summarize(filteredData);
  });

  // ---- Progress helpers ----
  function updateProgress(percent, stage, detail) {
    const p = Math.round(percent);
    progressBar.style.width = p + "%";
    progressBar.textContent = p + "%";
    progressBar.setAttribute("aria-valuenow", p);
    if (stage) loadingStage.textContent = stage;
    if (detail !== undefined) loadingDetail.textContent = detail;
  }

  function yieldToMain() {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  function debounce(fn, ms) {
    let timer;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  // ---- Web Worker for gzip decompression ----
  function createDataWorker() {
    const workerCode = `
      importScripts("https://cdn.jsdelivr.net/npm/fflate@0.7.4/umd/index.js");
      self.onmessage = async function(e) {
        const { url } = e.data;
        try {
          const response = await fetch(url);
          const contentLength = response.headers.get("Content-Length");
          const total = contentLength ? parseInt(contentLength, 10) : 0;
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
              self.postMessage({ type: "download-progress", received, total });
            }
            const full = new Uint8Array(received);
            let offset = 0;
            for (const chunk of chunks) { full.set(chunk, offset); offset += chunk.length; }
            compressed = full;
          } else {
            compressed = new Uint8Array(await response.arrayBuffer());
          }
          self.postMessage({ type: "stage", stage: "decompress" });
          const decompressed = fflate.decompressSync(compressed);
          self.postMessage({ type: "stage", stage: "parse" });
          const data = JSON.parse(new TextDecoder().decode(decompressed));
          self.postMessage({ type: "done", data });
        } catch (err) {
          self.postMessage({ type: "error", message: err.message });
        }
      };
    `;
    const blob = new Blob([workerCode], { type: "application/javascript" });
    return new Worker(URL.createObjectURL(blob));
  }

  function loadGzippedJSON(url) {
    return new Promise((resolve, reject) => {
      const worker = createDataWorker();
      worker.onmessage = function(e) {
        const msg = e.data;
        switch (msg.type) {
          case "download-progress": {
            const pct = (msg.received / msg.total) * 50;
            const mb = (msg.received / (1024 * 1024)).toFixed(1);
            const totalMb = (msg.total / (1024 * 1024)).toFixed(1);
            updateProgress(pct, "Downloading data...", `${mb} / ${totalMb} MB`);
            break;
          }
          case "stage":
            if (msg.stage === "decompress") updateProgress(55, "Decompressing...", "");
            else if (msg.stage === "parse") updateProgress(75, "Parsing data...", "");
            break;
          case "done":
            updateProgress(85, "Parsing data...", `${msg.data.length.toLocaleString()} records loaded`);
            worker.terminate();
            resolve(msg.data);
            break;
          case "error":
            worker.terminate();
            reject(new Error(msg.message));
            break;
        }
      };
      worker.onerror = function(err) { worker.terminate(); reject(err); };
      updateProgress(0, "Downloading data...", "");
      const absoluteUrl = new URL(url, window.location.href).href;
      worker.postMessage({ url: absoluteUrl });
    });
  }

  async function loadGzippedJSONFallback(url) {
    updateProgress(0, "Downloading data...", "");
    const response = await fetch(url);
    const contentLength = response.headers.get("Content-Length");
    const total = contentLength ? parseInt(contentLength, 10) : 0;
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
        updateProgress((received / total) * 50, "Downloading data...", `${(received / (1024*1024)).toFixed(1)} / ${(total / (1024*1024)).toFixed(1)} MB`);
      }
      const full = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) { full.set(chunk, offset); offset += chunk.length; }
      compressed = full;
    } else {
      updateProgress(25, "Downloading data...", "");
      compressed = new Uint8Array(await response.arrayBuffer());
    }
    updateProgress(50, "Downloading data...", "Complete");
    await yieldToMain();
    updateProgress(55, "Decompressing...", "");
    const decompressed = fflate.decompressSync(compressed);
    await yieldToMain();
    updateProgress(75, "Parsing data...", "");
    const data = JSON.parse(new TextDecoder().decode(decompressed));
    updateProgress(85, "Parsing data...", `${data.length.toLocaleString()} records loaded`);
    return data;
  }

  // ---- Technology keyword map for filter matching ----
  // Maps filter option values to lists of keywords to match against instrument model/platform strings.
  const TECH_KEYWORDS = {
    'nanopore':   ['nanopore', 'minion', 'gridion', 'promethion', 'mk1c', 'p2 solo'],
    'pacbio':     ['pacbio', 'sequel', 'revio', 'onso'],
    'illumina':   ['illumina', 'hiseq', 'miseq', 'novaseq', 'nextseq', 'miniseq', 'iseq'],
    'bgi':        ['bgiseq', 'dnbseq', 'mgi'],
    'ion torrent': ['ion torrent', 'pgm', 'proton', 'chef'],
  };

  function matchesTechFilter(instrumentStr, platformStr, filterVal) {
    if (!filterVal) return true;
    const key = filterVal.toLowerCase();
    const combined = ((instrumentStr || '') + ' ' + (platformStr || '')).toLowerCase();
    const keywords = TECH_KEYWORDS[key] || [key];
    return keywords.some(k => combined.includes(k));
  }

  // ---- Flatten raw hybrid record for table display ----
  function flattenRecord(record) {
    const longInstruments = [...new Set((record.long_reads || []).map(r => r.instrument_model).filter(Boolean))].join(', ');
    const shortInstruments = [...new Set((record.short_reads || []).map(r => r.instrument_model).filter(Boolean))].join(', ');
    const longPlatforms = [...new Set((record.long_reads || []).map(r => r.instrument_platform).filter(Boolean))].join(', ');
    const shortPlatforms = [...new Set((record.short_reads || []).map(r => r.instrument_platform).filter(Boolean))].join(', ');
    const studyAccessions = [...new Set(record.study_accession || [])].join(', ');
    return {
      biosample: record.biosample || '',
      long_instruments: longInstruments,
      short_instruments: shortInstruments,
      long_platforms: longPlatforms,
      short_platforms: shortPlatforms,
      long_run_count: (record.long_reads || []).length,
      short_run_count: (record.short_reads || []).length,
      study_accessions: studyAccessions,
      // Keep raw for filtering
      _long_reads: record.long_reads || [],
      _short_reads: record.short_reads || []
    };
  }

  // ---- Load and display data ----
  async function loadData(type) {
    loadingOverlay.style.display = "flex";
    updateProgress(0, "Loading data...", "");
    document.getElementById("hybrid-table").classList.add("hidden");
    downloadSelectedBtn.disabled = true;
    table.clearData();

    const url = type === 'wgs' ? 'hybrid_wgs.json.gz' : 'hybrid_mgx.json.gz';
    try {
      let raw;
      try {
        raw = await loadGzippedJSON(url);
      } catch (workerErr) {
        console.warn("Web Worker failed, using fallback:", workerErr);
        raw = await loadGzippedJSONFallback(url);
      }

      allData = raw.map(flattenRecord);

      await yieldToMain();
      updateProgress(87, "Rendering table...", `${allData.length.toLocaleString()} biosamples`);
      table.setData(allData);
      updateProgress(92, "Rendering table...", "Complete");

      await yieldToMain();
      updateProgress(100, "Done!", "");
      summarize(allData);
      document.getElementById("hybrid-table").classList.remove("hidden");
    } catch (err) {
      console.error("Failed to load hybrid data:", err);
      updateProgress(0, "Error loading data", err.message || "Unknown error. The hybrid data file may not exist yet — run the hybrid detection script first.");
      await new Promise(resolve => setTimeout(resolve, 500));
      loadingOverlay.style.display = "none";
      document.getElementById("stats").innerHTML = `
        <div class="hybrid-empty-state">
          <p>No hybrid biosample data available yet for <strong>${type.toUpperCase()}</strong>.</p>
          <p>Run <code>find_hybrid_samples.py --type ${type}</code> to generate the data file.</p>
        </div>
      `;
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 300));
    loadingOverlay.style.display = "none";
  }

  // ---- Filtering ----
  function updateFilters() {
    const biosampleVal = biosampleFilter.value.trim().toLowerCase();
    const longVal = longTechFilter.value;
    const shortVal = shortTechFilter.value;

    let filtered = allData;

    if (biosampleVal) {
      filtered = filtered.filter(d => d.biosample.toLowerCase().includes(biosampleVal));
    }
    if (longVal) {
      filtered = filtered.filter(d => matchesTechFilter(d.long_instruments, d.long_platforms, longVal));
    }
    if (shortVal) {
      filtered = filtered.filter(d => matchesTechFilter(d.short_instruments, d.short_platforms, shortVal));
    }

    table.setData(filtered);
    summarize(filtered);
    downloadSelectedBtn.disabled = true;
  }

  biosampleFilter.addEventListener("input", debounce(updateFilters, 300));
  longTechFilter.addEventListener("change", updateFilters);
  shortTechFilter.addEventListener("change", updateFilters);

  // ---- Stats summary ----
  function summarize(data) {
    const total = data.length;
    let nanoCount = 0, pacbioCount = 0, illuminaCount = 0, bgiCount = 0;
    let totalLongRuns = 0, totalShortRuns = 0;

    data.forEach(d => {
      totalLongRuns += d.long_run_count;
      totalShortRuns += d.short_run_count;
      const li = (d.long_instruments || '').toUpperCase();
      const si = (d.short_instruments || '').toUpperCase();
      if (li.includes('NANOPORE') || li.includes('MINION') || li.includes('GRIDION') || li.includes('PROMETHION')) nanoCount++;
      if (li.includes('PACBIO') || li.includes('SEQUEL')) pacbioCount++;
      if (si.includes('ILLUMINA') || si.includes('HISEQ') || si.includes('MISEQ') || si.includes('NOVASEQ') || si.includes('NEXTSEQ')) illuminaCount++;
      if (si.includes('BGISEQ') || si.includes('DNBSEQ') || si.includes('MGI')) bgiCount++;
    });

    document.getElementById("stats").innerHTML = `
      <div class="stat-card accent-1">
        <div class="stat-value">${total.toLocaleString()}</div>
        <div class="stat-label">Hybrid Biosamples</div>
      </div>
      <div class="stat-card accent-2">
        <div class="stat-value">${nanoCount.toLocaleString()}</div>
        <div class="stat-label">With Nanopore</div>
      </div>
      <div class="stat-card accent-3">
        <div class="stat-value">${pacbioCount.toLocaleString()}</div>
        <div class="stat-label">With PacBio</div>
      </div>
      <div class="stat-card accent-4">
        <div class="stat-value">${illuminaCount.toLocaleString()}</div>
        <div class="stat-label">With Illumina</div>
      </div>
      <div class="stat-card accent-2">
        <div class="stat-value">${totalLongRuns.toLocaleString()}</div>
        <div class="stat-label">Total Long-Read Runs</div>
      </div>
      <div class="stat-card accent-3">
        <div class="stat-value">${totalShortRuns.toLocaleString()}</div>
        <div class="stat-label">Total Short-Read Runs</div>
      </div>
    `;
  }

  // ---- Download handlers ----

  // Download selected biosample IDs as plain text
  downloadSelectedBtn.addEventListener("click", () => {
    const selected = table.getSelectedData();
    if (!selected.length) return;
    const ids = selected.map(d => d.biosample).join('\n');
    const blob = new Blob([ids + '\n'], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hybrid_${activeType}_selected_biosamples.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // Export all visible rows as TSV
  document.getElementById("download-tsv").addEventListener("click", () => {
    table.download("tsv", `hybrid_${activeType}_data.tsv`);
  });

  // Export all visible rows as XLSX
  document.getElementById("download-xlsx").addEventListener("click", () => {
    table.download("xlsx", `hybrid_${activeType}_data.xlsx`, { sheetName: "Hybrid Biosamples" });
  });

  // Initial load
  loadData(activeType);
});
