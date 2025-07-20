fetch("assets/data/sample_data.json")
  .then(res => res.json())
  .then(data => {
    const table = new Tabulator("#genome-table", {
      data,
      layout: "fitDataFill",
      responsiveLayout: true,
      columns: [
        { title: "Sample ID", field: "sample_id" },
        { title: "Organism", field: "organism" },
        { title: "Technology", field: "tech" },
        { title: "Study", field: "study" },
        { title: "Source DB", field: "source" },
      ],
      columnDefaults: { headerFilter: true },
      height: "600px",
    });

    document.getElementById("organism-filter").addEventListener("input", e => {
      table.setFilter("organism", "like", e.target.value);
    });

    document.getElementById("tech-filter").addEventListener("change", e => {
      const val = e.target.value;
      table.setFilter("tech", val ? "=" : null, val);
    });
  });
