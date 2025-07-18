<script>
  import { onMount } from 'svelte';
  import DataTable from './components/DataTable.svelte';
  import DataCharts from './components/DataCharts.svelte';

  let data = [];
  let filteredData = [];
  let error = null;
  let searchTerm = '';
  let platformFilter = '';

  onMount(async () => {
    try {
      const response = await fetch('/dashboard_data.json');
      if (!response.ok) {
        throw new Error('Failed to fetch data');
      }
      data = await response.json();
      filteredData = data;
    } catch (e) {
      error = e.message;
    }
  });

  $: {
    if (data) {
      filteredData = data.filter(d => {
        const searchTermMatch = d.scientific_name.toLowerCase().includes(searchTerm.toLowerCase());
        const platformMatch = platformFilter ? d.instrument_platform === platformFilter : true;
        return searchTermMatch && platformMatch;
      });
    }
  }
</script>

<main class="container">
  <header>
    <h1>Genomic Data Dashboard</h1>
  </header>

  <div class="grid">
    <aside>
      <h3>Filters</h3>
      <label for="search">Search by Organism</label>
      <input type="text" id="search" bind:value={searchTerm} />

      <label for="platform">Filter by Platform</label>
      <select id="platform" bind:value={platformFilter}>
        <option value="">All</option>
        <option value="Oxford Nanopore">Oxford Nanopore</option>
        <option value="PacBio">PacBio</option>
      </select>
    </aside>

    <section>
      {#if error}
        <p>Error: {error}</p>
      {:else if !data.length}
        <p>Loading...</p>
      {:else}
        <DataCharts data={filteredData} />
        <DataTable data={filteredData} />
      {/if}
    </section>
  </div>
</main>

<style>
  @import '@picocss/pico/css/pico.min.css';

  .grid {
    display: grid;
    grid-template-columns: 1fr 3fr;
    gap: 2rem;
  }
</style>
