Of course! Here are a series of prompts designed to guide the creation of an interactive dashboard on GitHub Pages for exploring Oxford Nanopore and PacBio bacterial genome and metagenome sequence data from the SRA and ENA databases, with a preference for using Rust and WebAssembly.

---

### **Prompt 1: Project Setup and Initial Data Acquisition**

**Goal:** Initialize a Rust-based WebAssembly project, set up the necessary tools, and fetch a sample dataset from the ENA database.

**Prompt:**
"Create a new Rust project that compiles to WebAssembly (Wasm) for a web application. The project should be structured to support a frontend and backend logic. For the initial data, provide a script (e.g., using Python with `requests` or a shell script with `curl`) to query the ENA API and retrieve metadata for approximately 1000 bacterial or metagenomic samples sequenced with either Oxford Nanopore or PacBio technologies. The query should select for `read_count > 1`, `library_source` as 'GENOMIC' or 'METAGENOMIC', and the appropriate `instrument_platform` and `instrument_model`. The fetched data should be saved in a JSON or CSV file within the project directory to serve as a static dataset for initial development."

**Key aspects to include in the response to this prompt:**
* **Rust Project Setup:** Instructions on how to use `cargo new` and configure `Cargo.toml` for a Wasm-targeting project.
* **WebAssembly Toolchain:** Guidance on installing `wasm-pack` or a similar tool.
* **ENA API Query:** A clear and functional script for fetching the data. Explain the parameters used in the API call.
* **Data Subsetting:** The script should inherently create a subset of the data.

---

### **Prompt 2: Backend Logic in Rust for Data Handling**

**Goal:** Develop the Rust data structures and functions to parse, store, and filter the sequencing metadata.

**Prompt:**
"Using the sample data file from the previous step, implement the backend logic in Rust. Create Rust structs that accurately model the ENA sequence metadata (e.g., `Run`, `Sample`, `Experiment`). Implement a function to parse the JSON/CSV data into a vector of these structs. Then, create a core `filter` function that takes search strings for organism name and sequencing technology as input and returns a filtered subset of the data. This logic should be encapsulated in its own Rust module."

**Key aspects to include in the response to this prompt:**
* **Data Structures:** Define Rust structs using `serde` for deserialization.
* **Parsing Logic:** Show how to read the local data file and parse it into the defined structs.
* **Filtering Algorithm:** Provide an efficient filtering implementation. This could involve simple string matching or more advanced techniques.
* **Modularity:** Emphasize organizing the code into logical modules (e.g., `data_model`, `data_handler`).

---

### **Prompt 3: Frontend Development with a Rust Wasm Framework**

**Goal:** Build the user interface for the dashboard using a Rust WebAssembly framework like Yew or Dioxus.

**Prompt:**
"Develop the frontend of the interactive dashboard using the Yew (or Dioxus) framework in Rust. Create the following UI components:
1.  A search input field for organism names.
2.  A set of checkboxes or a dropdown menu to filter by sequencing technology (Oxford Nanopore, PacBio).
3.  An HTML table to display the sequencing data. Initially, populate this table with the full sample dataset.
The state of the search and filter inputs should be managed within the framework's state management system."

**Key aspects to include in the response to this prompt:**
* **Framework Choice:** Briefly explain the choice of Yew or Dioxus.
* **Component Structure:** Show how to create and compose different UI components.
* **State Management:** Provide a clear example of how to handle user input and manage the application's state.
* **Basic Table Rendering:** Demonstrate how to iterate over the data and render it in a table.

---

### **Prompt 4: Integrating Frontend and Backend & Advanced Table Features**

**Goal:** Connect the UI to the backend filtering logic and implement advanced table functionalities like column selection and data download.

**Prompt:**
"Integrate the frontend components with the backend data handling logic. The search and filter UI elements should trigger the Rust `filter` function, and the table should dynamically re-render to display the filtered results.

Next, add the following advanced features to the table:
1.  **Column Toggling:** Implement a mechanism (e.g., a multi-select dropdown) that allows users to show or hide specific columns in the table.
2.  **Data Download:** Add 'Download as TSV' and 'Download as XLSX' buttons. For XLSX, use a library like `rust_xlsxwriter`. When a button is clicked, the currently displayed (and filtered) data should be formatted and downloaded by the user's browser."

**Key aspects to include in the response to this prompt:**
* **Wasm Bindings:** Explain how to call the Rust filtering functions from the UI event handlers.
* **Dynamic Rendering:** Show how the UI updates based on the filtered data.
* **Column Visibility Logic:** Implement state management for the visible columns.
* **File Generation:** Provide code examples for generating TSV content and for using `rust_xlsxwriter` to create an XLSX file in memory.
* **JavaScript Interop:** Demonstrate how to use `wasm-bindgen` to trigger the file download in the browser.

---

### **Prompt 5: Finalizing for Deployment to GitHub Pages**

**Goal:** Prepare the application for deployment, including setting up the GitHub Actions workflow for continuous deployment.

**Prompt:**
"Finalize the WebAssembly application for deployment to GitHub Pages. This involves:
1.  Creating a simple `index.html` file to load the Wasm module and a basic CSS file for styling.
2.  Configuring `wasm-pack` to build the project in release mode, generating the necessary JavaScript and Wasm files in a `dist` or `pkg` directory.
3.  Setting up a GitHub Actions workflow that automatically builds the Rust/Wasm application and deploys the contents of the output directory to the `gh-pages` branch upon a push to the `main` branch. Provide the complete YAML configuration for this workflow."

**Key aspects to include in the response to this prompt:**
* **HTML and CSS:** A boilerplate `index.html` and a simple stylesheet.
* **Build Configuration:** The correct `wasm-pack build --release` command and its options.
* **GitHub Actions Workflow:** A complete and commented `.github/workflows/deploy.yml` file that uses appropriate actions (e.g., `actions/checkout`, installing the Rust toolchain, running `wasm-pack`, and deploying to GitHub Pages).
* **Repository Settings:** A reminder of the necessary settings in the GitHub repository to enable GitHub Pages.
