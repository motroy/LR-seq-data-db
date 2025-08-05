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
  const organismFilter = document.getElementById("organism-filter");
  const techFilter = document.getElementById("tech-filter");
  const ampliconFilter = document.getElementById("amplicon-filter");

  let allData = [];

  async function loadGzippedJSON(url) {
    const response = await fetch(url);
    const compressed = new Uint8Array(await response.arrayBuffer());
    const decompressed = fflate.decompressSync(compressed);
    const jsonString = new TextDecoder().decode(decompressed);
    return JSON.parse(jsonString);
  }

  async function loadData(source) {
    loadingOverlay.style.display = "flex";
    const url = source === 'bacteria' ? 'data_bacteria.json.gz' : 'data_metagenome.json.gz';
    try {
      allData = await loadGzippedJSON(url);
      table.setData(allData);
      summarize(allData);
      createBoxPlot(allData, "reads-plot", "read_count", "Number of Reads per Organism");
      createBoxPlot(allData, "bases-plot", "base_count", "Number of Bases per Organism");
      document.getElementById("plots").classList.remove("hidden");
      document.getElementById("genome-table").classList.remove("hidden");
    } catch (err) {
      console.error("Failed to load gzip JSON:", err);
    } finally {
      loadingOverlay.style.display = "none";
    }
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
