<script>
  import { onMount } from 'svelte';

  let dashboardUrl = 'dashboard/dashboard.html';

</script>

<main class="container">
  <header>
    <h1>Genomic Data Dashboard</h1>
  </header>

  <iframe src={dashboardUrl} width="100%" height="800px" frameborder="0"></iframe>
</main>

<style>
  @import '@picocss/pico/css/pico.min.css';
</style>
