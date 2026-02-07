document.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const dataType = urlParams.get('type') || 'wgs'; // Default to wgs

  const dashboardTitle = document.getElementById("dashboard-title");
  if (dataType === 'wgs') {
    document.title = "WGS Dashboard";
    dashboardTitle.textContent = 'WGS Dashboard';
  } else if (dataType === 'mgx') {
    document.title = "MGx Dashboard";
    dashboardTitle.textContent = 'MGx Dashboard';
  }

  const table = new Tabulator("#genome-table", {
    data: [],
    layout: "fitColumns",
    responsiveLayout: "hide",
    pagination: "local",
    paginationSize: 25,
    movableColumns: true,
    columns: [
      { title: "Sample ID", field: "sample_id", headerMenu: true },
      { title: "Organism", field: "scientific_name", headerMenu: true },
      { title: "Technology", field: "instrument_platform", headerMenu: true },
      { title: "Reads", field: "read_count", headerMenu: true },
      { title: "Bases", field: "base_count", headerMenu: true },
      { title: "Study", field: "study_accession", headerMenu: true },
      { title: "Source DB", field: "source", headerMenu: true }
    ],
    height: "600px"
  });

  const loadingOverlay = document.getElementById("loading-overlay");
  const progressBar = document.getElementById("progress-bar");
  const loadingStage = document.getElementById("loading-stage");
  const loadingDetail = document.getElementById("loading-detail");
  const organismFilter = document.getElementById("organism-filter");
  const techFilter = document.getElementById("tech-filter");
  const ampliconFilter = document.getElementById("amplicon-filter");

  let allData = [];

  function updateProgress(percent, stage, detail) {
    const p = Math.round(percent);
    progressBar.style.width = p + "%";
    progressBar.textContent = p + "%";
    progressBar.setAttribute("aria-valuenow", p);
    if (stage) loadingStage.textContent = stage;
    if (detail !== undefined) loadingDetail.textContent = detail;
  }

  // Allow the browser to repaint between heavy synchronous steps
  function yieldToMain() {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  // Debounce helper — delays fn execution until pause in calls
  function debounce(fn, ms) {
    let timer;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  // ---- Web Worker for off-main-thread decompression + parsing ----
  function createDataWorker() {
    const workerCode = `
      importScripts("https://cdn.jsdelivr.net/npm/fflate@0.7.4/umd/index.js");

      self.onmessage = async function(e) {
        const { url } = e.data;
        try {
          // Fetch with progress
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
            for (const chunk of chunks) {
              full.set(chunk, offset);
              offset += chunk.length;
            }
            compressed = full;
          } else {
            compressed = new Uint8Array(await response.arrayBuffer());
          }

          // Decompress
          self.postMessage({ type: "stage", stage: "decompress" });
          const decompressed = fflate.decompressSync(compressed);

          // Parse
          self.postMessage({ type: "stage", stage: "parse" });
          const jsonString = new TextDecoder().decode(decompressed);
          const data = JSON.parse(jsonString);

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
            if (msg.stage === "decompress") {
              updateProgress(55, "Decompressing...", "");
            } else if (msg.stage === "parse") {
              updateProgress(75, "Parsing data...", "");
            }
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
      worker.onerror = function(err) {
        worker.terminate();
        reject(err);
      };
      updateProgress(0, "Downloading data...", "");
      // Resolve relative URL to absolute since Blob workers have a different base URL
      const absoluteUrl = new URL(url, window.location.href).href;
      worker.postMessage({ url: absoluteUrl });
    });
  }

  // Fallback for environments where inline workers are blocked
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
        const pct = (received / total) * 50;
        const mb = (received / (1024 * 1024)).toFixed(1);
        const totalMb = (total / (1024 * 1024)).toFixed(1);
        updateProgress(pct, "Downloading data...", `${mb} / ${totalMb} MB`);
      }
      const full = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) {
        full.set(chunk, offset);
        offset += chunk.length;
      }
      compressed = full;
    } else {
      updateProgress(25, "Downloading data...", "");
      compressed = new Uint8Array(await response.arrayBuffer());
    }
    updateProgress(50, "Downloading data...", "Complete");

    await yieldToMain();
    updateProgress(55, "Decompressing...", "");
    const decompressed = fflate.decompressSync(compressed);
    updateProgress(70, "Decompressing...", "Complete");

    await yieldToMain();
    updateProgress(75, "Parsing data...", "");
    const jsonString = new TextDecoder().decode(decompressed);
    updateProgress(80, "Parsing data...", "");
    const data = JSON.parse(jsonString);
    updateProgress(85, "Parsing data...", `${data.length.toLocaleString()} records loaded`);
    return data;
  }

  async function loadData(source) {
    loadingOverlay.style.display = "flex";
    updateProgress(0, "Loading data...", "");
    const url = source === 'bacteria' ? 'data_bacteria.json.gz' : 'data_metagenome.json.gz';
    try {
      try {
        allData = await loadGzippedJSON(url);
      } catch (workerErr) {
        console.warn("Web Worker failed, using main-thread fallback:", workerErr);
        allData = await loadGzippedJSONFallback(url);
      }

      // Stage 4: Render table (85–92%)
      await yieldToMain();
      updateProgress(87, "Rendering table...", `${allData.length.toLocaleString()} rows`);
      table.setData(allData);
      updateProgress(92, "Rendering table...", "Complete");

      // Stage 5: Generate plots and stats (92–100%)
      await yieldToMain();
      updateProgress(94, "Generating plots...", "");
      summarize(allData);
      createBoxPlot(allData, "reads-plot", "read_count", "Number of Reads per Organism");
      createBoxPlot(allData, "bases-plot", "base_count", "Number of Bases per Organism");
      updateProgress(100, "Done!", "");

      document.getElementById("plots").classList.remove("hidden");
      document.getElementById("genome-table").classList.remove("hidden");
    } catch (err) {
      console.error("Failed to load gzip JSON:", err);
      updateProgress(0, "Error loading data", err.message || "Unknown error");
      return;
    }
    // Brief pause so the user sees 100% before hiding the overlay
    await new Promise(resolve => setTimeout(resolve, 300));
    loadingOverlay.style.display = "none";
  }

  function updateFilters() {
    const filters = [];
    const organismVal = organismFilter.value;
    const techVal = techFilter.value;
    const ampliconVal = ampliconFilter.value;

    if (organismVal) {
      filters.push({ field: "scientific_name", type: "like", value: organismVal });
    }

    if (techVal) {
      filters.push({ field: "instrument_platform", type: "=", value: techVal });
    }

    if (ampliconVal) {
      if (ampliconVal === 'AMPLICON') {
        filters.push({ field: "library_strategy", type: "=", value: "AMPLICON" });
      } else if (ampliconVal === 'NON_AMPLICON') {
        filters.push({ field: "library_strategy", type: "!=", value: "AMPLICON" });
      }
    }

    table.setFilter(filters);
  }

  // Debounce organism input (300ms) to avoid thrashing on every keystroke
  organismFilter.addEventListener("input", debounce(updateFilters, 300));
  techFilter.addEventListener("change", updateFilters);
  ampliconFilter.addEventListener("change", updateFilters);

  table.on("dataFiltered", function(filters, rows) {
    const filteredData = rows.map(row => row.getData());
    summarize(filteredData);
    createBoxPlot(filteredData, "reads-plot", "read_count", "Number of Reads per Organism");
    createBoxPlot(filteredData, "bases-plot", "base_count", "Number of Bases per Organism");
  });

  const initialSource = dataType === 'wgs' ? 'bacteria' : 'metagenome';
  loadData(initialSource);

  document.getElementById("download-tsv").addEventListener("click", () => table.download("tsv", "data.tsv"));
  document.getElementById("download-xlsx").addEventListener("click", () => table.download("xlsx", "data.xlsx", { sheetName: "My Data" }));
});

function summarize(data) {
  const organisms = {};
  const techCounts = { "OXFORD_NANOPORE": 0, "PACBIO_SMRT": 0 };
  let ampliconCount = 0;
  let nonAmpliconCount = 0;

  data.forEach(item => {
    organisms[item.scientific_name] = (organisms[item.scientific_name] || 0) + 1;
    if (techCounts[item.instrument_platform] !== undefined) techCounts[item.instrument_platform]++;
    if (item.library_strategy === 'AMPLICON') {
      ampliconCount++;
    } else {
      nonAmpliconCount++;
    }
  });

  const topOrganisms = Object.entries(organisms)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  document.getElementById("stats").innerHTML = `
    <h3>📈 Summary Stats</h3>
    <p><strong>Total Samples:</strong> ${data.length}</p>
    <p><strong>Oxford Nanopore:</strong> ${techCounts["OXFORD_NANOPORE"]}</p>
    <p><strong>PacBio:</strong> ${techCounts["PACBIO_SMRT"]}</p>
    <p><strong>Amplicon:</strong> ${ampliconCount}</p>
    <p><strong>Non-Amplicon:</strong> ${nonAmpliconCount}</p>
    <p><strong>Top Organisms:</strong><br>${topOrganisms.map(([org, count]) => `${org} (${count})`).join('<br>')}</p>
  `;
}

// Pre-aggregate box plot statistics to avoid passing 100K+ raw points to Plotly
function computeBoxTraces(data, field) {
  // Group values by organism + technology
  const groups = {};
  for (const d of data) {
    const key = d.instrument_platform;
    if (!groups[key]) groups[key] = {};
    if (!groups[key][d.scientific_name]) groups[key][d.scientific_name] = [];
    groups[key][d.scientific_name].push(d[field]);
  }

  const traces = [];
  for (const [tech, organisms] of Object.entries(groups)) {
    const x = [];
    const q1 = [], median = [], q3 = [], lowerfence = [], upperfence = [];

    for (const [orgName, values] of Object.entries(organisms)) {
      values.sort((a, b) => a - b);
      const n = values.length;
      if (n === 0) continue;

      const med = values[Math.floor(n / 2)];
      const q1Val = values[Math.floor(n * 0.25)];
      const q3Val = values[Math.floor(n * 0.75)];
      const iqr = q3Val - q1Val;
      const lf = q1Val - 1.5 * iqr;
      const uf = q3Val + 1.5 * iqr;

      x.push(orgName);
      q1.push(q1Val);
      median.push(med);
      q3.push(q3Val);
      lowerfence.push(Math.max(values[0], lf));
      upperfence.push(Math.min(values[n - 1], uf));
    }

    traces.push({
      type: 'box',
      name: tech,
      x,
      q1, median, q3, lowerfence, upperfence,
      boxpoints: 'outliers',
      jitter: 0.3,
      pointpos: -1.5,
    });
  }
  return traces;
}

function createBoxPlot(data, elementId, field, title) {
  const traces = computeBoxTraces(data, field);

  const layout = {
    title,
    yaxis: {
      title: field === 'read_count' ? 'Number of Reads' : 'Number of Bases'
    }
  };

  // Use Plotly.react for efficient updates when the plot already exists
  Plotly.react(elementId, traces, layout);
}
