<script>
  export let data;
</script>

<table>
  <thead>
    <tr>
      <th>Run Accession</th>
      <th>Organism</th>
      <th>Platform</th>
      <th>Publication Date</th>
    </tr>
  </thead>
  <tbody>
    {#each data as row}
      <tr>
        <td>{row.run_accession}</td>
        <td>{row.scientific_name}</td>
        <td>{row.instrument_platform}</td>
        <td>{new Date(row.first_public).toLocaleDateString()}</td>
      </tr>
    {/each}
  </tbody>
</table>
