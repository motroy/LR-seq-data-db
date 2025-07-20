fetch("assets/data/sample_data.json")
  .then(res => res.json())
  .then(data => {
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
