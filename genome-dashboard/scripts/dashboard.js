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

  async function loadGzippedJSON(url) {
    // Stage 1: Fetch with progress (0–50%)
    updateProgress(0, "Downloading data...", "");
    const response = await fetch(url);
    const contentLength = response.headers.get("Content-Length");
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    let compressed;
    if (total && response.body) {
      // Stream the response to track download progress
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
      // Fallback: no content-length or no readable stream
      updateProgress(25, "Downloading data...", "");
      compressed = new Uint8Array(await response.arrayBuffer());
    }
    updateProgress(50, "Downloading data...", "Complete");

    // Stage 2: Decompress (50–70%)
    await yieldToMain();
    updateProgress(55, "Decompressing...", "");
    const decompressed = fflate.decompressSync(compressed);
    updateProgress(70, "Decompressing...", "Complete");

    // Stage 3: Parse JSON (70–85%)
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
      allData = await loadGzippedJSON(url);

      // Stage 4: Render table (85–92%)
      await yieldToMain();
      updateProgress(87, "Rendering table...", `${allData.length.toLocaleString()} rows`);
      table.setData(allData);
      updateProgress(92, "Rendering table...", "Complete");

      // Stage 5: Generate plots and stats (92–100%)
      await yieldToMain();
      updateProgress(94, "Generating plots...", "");
      summarize(allData);
      updateProgress(97, "Generating plots...", "");
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

  organismFilter.addEventListener("input", updateFilters);
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

  createBoxPlot(data, "reads-plot", "read_count", "Number of Reads per Organism");
  createBoxPlot(data, "bases-plot", "base_count", "Number of Bases per Organism");
}

function createBoxPlot(data, elementId, field, title) {
  const plotData = [{
    type: 'box',
    x: data.map(d => d.scientific_name),
    y: data.map(d => d[field]),
    boxpoints: 'all',
    jitter: 0.5,
    pointpos: -1.8,
    customdata: data.map(d => d.instrument_platform),
    transforms: [{
      type: 'groupby',
      groups: data.map(d => d.instrument_platform),
    }]
  }];

  const layout = {
    title,
    yaxis: {
      title: field === 'read_count' ? 'Number of Reads' : 'Number of Bases'
    }
  };

  Plotly.newPlot(elementId, plotData, layout);
}
