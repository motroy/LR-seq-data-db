
1. Project Scaffolding & Initial Setup
This prompt establishes the project's foundation, including the file structure and core technologies.
> Prompt 1:
> "Generate the complete file structure for a static website project that will be hosted on GitHub Pages. The project is an interactive data dashboard. For the frontend, use Svelte and for data visualization, use D3.js.
> Create the following initial files:
>  * package.json: Include dependencies for svelte, vite, d3, and pico.css (for simple styling).
>  * vite.config.js: Configure it for a Svelte project.
>  * src/App.svelte: A basic "Hello World" Svelte component.
>  * src/main.js: The entry point to mount the Svelte app.
>  * index.html: The main HTML file with a root element for the Svelte app.
>  * .gitignore: A standard file for a Node.js project.
>  * scripts/: An empty directory for data processing scripts.
>  * public/: An empty directory for static assets, including the final data file."
> 
2. Data Acquisition Script
This prompt focuses on creating the Python script to fetch the necessary metadata from public databases.
> Prompt 2:
> "Write a Python script named scripts/fetch_data.py. This script will query the ENA (European Nucleotide Archive) API to find all public bacterial genome and metagenome datasets sequenced with 'Oxford Nanopore' or 'PacBio' technologies.
> The script must:
>  * Use the requests library to query the ENA Portal API's search endpoint.
>  * Construct a query to search for records where tax_tree(2) (bacteria) is true AND instrument_platform is 'ONT' or 'PACBIO_SMRT'. The result type should be read_run.
>  * Request the following fields in tsv format: study_accession, sample_accession, run_accession, scientific_name, instrument_platform, read_count, base_count, and first_public.
>  * Use pandas to load the TSV response into a DataFrame.
>  * Clean the data:
>    * Standardize the instrument_platform column to simple 'Oxford Nanopore' and 'PacBio' values.
>    * Ensure the first_public column is a valid date.
>    * Handle any potential missing values.
>  * Save the cleaned DataFrame to public/dashboard_data.json using the orient='records' format."
> 
3. Frontend Dashboard Development
These prompts build the user-facing dashboard components.
> Prompt 3.1: Layout and Data Loading
> "Modify src/App.svelte to create the dashboard layout.
>  * Use a simple CSS grid for the layout with a header, a sidebar for filters, and a main content area. Style it using pico.css.
>  * In the script section, use onMount and fetch to load the dashboard_data.json file into a local variable.
>  * Display a loading message while the data is being fetched and an error message if the fetch fails."

> Prompt 3.2: Interactive Data Table
> "Create a new Svelte component named src/components/DataTable.svelte.
>  * This component should accept the loaded sequence data as a prop.
>  * Render an HTML <table> showing key data fields like Run Accession, Organism, Platform, and Publication Date.
>  * Add input fields above the table to allow users to search by organism name and filter by platform. The table should reactively update as the user types or selects a filter."

> Prompt 3.3: Data Visualizations
> "Create a new Svelte component named src/components/DataCharts.svelte.
>  * This component should accept the filtered data as a prop.
>  * Using D3.js, create two SVG-based charts:
>    * A bar chart showing the number of datasets per year.
>    * A pie chart showing the proportion of datasets from 'Oxford Nanopore' vs. 'PacBio'.
>  * Ensure the charts are reactive and automatically update whenever the filtered data prop changes."

> Prompt 3.4: Assembling the Dashboard
> "Update src/App.svelte to integrate the new components.
>  * Import DataTable.svelte and DataCharts.svelte.
>  * Implement the filtering logic. Create stores or state variables for the filters (e.g., search term, platform selection).
>  * Pass the full dataset to the DataTable and the filtering controls.
>  * Pass the filtered data to both the DataTable and the DataCharts components so that everything updates in sync."

4. Automation and Deployment
This prompt sets up GitHub Actions to automate data updates and deployment to GitHub Pages.
> Prompt 4:
> "Create a GitHub Actions workflow file at .github/workflows/deploy.yml. This workflow should automate the entire process of updating the data and deploying the website.
> The workflow should have two triggers: on: push to the main branch and a schedule: cron to run weekly.
> The job should consist of the following steps:
>  * Checkout the repository code.
>  * Set up Python, install dependencies from a requirements.txt file (you'll need pandas and requests), and run the scripts/fetch_data.py script to generate the dashboard_data.json file.
>  * Set up Node.js and install npm dependencies using npm install.
>  * Build the Svelte app using npm run build. This will create a dist directory.
>  * Configure Git to commit and push on behalf of an action.
>  * Commit and push the newly generated public/dashboard_data.json file back to the main branch if it has changed.
>  * Use the actions/deploy-pages@v4 action to deploy the contents of the dist directory to GitHub Pages."

5. Documentation
The final prompt creates the user-facing documentation for the project.
> Prompt 5:
> "Generate a comprehensive README.md file for this GitHub project. The file must include the following sections:
>  * Project Title and Description: A brief overview of the interactive dashboard.
>  * Live Demo: A placeholder link to the GitHub Pages URL.
>  * Features: A bulleted list of features (e.g., SRA/ENA data, interactive charts, filtering, automated updates).
>  * How It Works: A short explanation of the data pipeline (GitHub Action -> Python Script -> JSON -> Svelte Dashboard).
>  * Local Development: Step-by-step instructions on how to clone the repository, install dependencies (npm install and pip install), and run the development server locally (npm run dev)."
> 
