fetch("sample_data.json")
  .then(res => res.json())
  .then(data => {
    summarize(data);

    const table = new Tabulator("#genome-table", {
      data,
      layout: "fitColumns",
      responsiveLayout: "hide",
      pagination: "local",
      paginationSize: 25,
      movableColumns: true,
      columns: [
        { title: "Sample ID", field: "sample_id", headerMenu: true },
        { title: "Organism", field: "organism", headerMenu: true },
        { title: "Technology", field: "tech", headerMenu: true },
        { title: "Study", field: "study", headerMenu: true },
        { title: "Source DB", field: "source", headerMenu: true }
      ],
      height: "600px"
    });

    document.getElementById("organism-filter").addEventListener("input", e => {
      table.setFilter("organism", "like", e.target.value);
    });

    document.getElementById("tech-filter").addEventListener("change", e => {
      const val = e.target.value;
      table.setFilter("tech", val ? "=" : null, val);
    });
  });

function summarize(data) {
  const organisms = {};
  const techCounts = { "Oxford Nanopore": 0, "PacBio": 0 };

  data.forEach(item => {
    organisms[item.organism] = (organisms[item.organism] || 0) + 1;
    if (techCounts[item.tech] !== undefined) techCounts[item.tech]++;
  });

  const topOrganisms = Object.entries(organisms)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  document.getElementById("stats").innerHTML = `
    <h3>📈 Summary Stats</h3>
    <p><strong>Total Samples:</strong> ${data.length}</p>
    <p><strong>Oxford Nanopore:</strong> ${techCounts["Oxford Nanopore"]}</p>
    <p><strong>PacBio:</strong> ${techCounts["PacBio"]}</p>
    <p><strong>Top Organisms:</strong><br>${topOrganisms.map(([org, count]) => `${org} (${count})`).join('<br>')}</p>
  `;
}
