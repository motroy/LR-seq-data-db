<script>
  import { onMount } from 'svelte';
  import * as d3 from 'd3';

  export let data;

  let barChartContainer;
  let pieChartContainer;

  $: if (data && barChartContainer && pieChartContainer) {
    drawCharts();
  }

  onMount(() => {
    drawCharts();
  });

  function drawCharts() {
    drawBarChart();
    drawPieChart();
  }

  function drawBarChart() {
    d3.select(barChartContainer).select("svg").remove();

    const yearlyData = d3.rollup(data, v => v.length, d => new Date(d.first_public).getFullYear());
    const chartData = Array.from(yearlyData, ([key, value]) => ({ year: key, count: value })).sort((a, b) => a.year - b.year);

    const margin = { top: 20, right: 20, bottom: 30, left: 40 };
    const width = 500 - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;

    const svg = d3.select(barChartContainer)
      .append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand()
      .range([0, width])
      .padding(0.1)
      .domain(chartData.map(d => d.year));

    const y = d3.scaleLinear()
      .range([height, 0])
      .domain([0, d3.max(chartData, d => d.count)]);

    svg.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x));

    svg.append("g")
      .call(d3.axisLeft(y));

    svg.selectAll(".bar")
      .data(chartData)
      .enter().append("rect")
      .attr("class", "bar")
      .attr("x", d => x(d.year))
      .attr("width", x.bandwidth())
      .attr("y", d => y(d.count))
      .attr("height", d => height - y(d.count));
  }

  function drawPieChart() {
    d3.select(pieChartContainer).select("svg").remove();

    const platformData = d3.rollup(data, v => v.length, d => d.instrument_platform);
    const chartData = Array.from(platformData, ([key, value]) => ({ platform: key, count: value }));

    const width = 300;
    const height = 300;
    const margin = 20;
    const radius = Math.min(width, height) / 2 - margin;

    const svg = d3.select(pieChartContainer)
      .append("svg")
      .attr("width", width)
      .attr("height", height)
      .append("g")
      .attr("transform", `translate(${width / 2},${height / 2})`);

    const color = d3.scaleOrdinal()
      .domain(chartData.map(d => d.platform))
      .range(d3.schemeCategory10);

    const pie = d3.pie()
      .value(d => d.count);

    const data_ready = pie(chartData);

    svg.selectAll('whatever')
      .data(data_ready)
      .enter()
      .append('path')
      .attr('d', d3.arc()
        .innerRadius(0)
        .outerRadius(radius)
      )
      .attr('fill', d => color(d.data.platform))
      .attr("stroke", "black")
      .style("stroke-width", "2px")
      .style("opacity", 0.7);

    svg.selectAll('whatever')
      .data(data_ready)
      .enter()
      .append('text')
      .text(d => d.data.platform)
      .attr("transform", d => `translate(${d3.arc().innerRadius(0).outerRadius(radius).centroid(d)})`)
      .style("text-anchor", "middle")
      .style("font-size", 15);
  }
</script>

<div class="charts-grid">
  <div bind:this={barChartContainer}>
    <h3>Datasets per Year</h3>
  </div>
  <div bind:this={pieChartContainer}>
    <h3>Platform Proportion</h3>
  </div>
</div>

<style>
  .charts-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
  }
</style>
