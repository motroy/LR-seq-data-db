# LR-seq-data-db

**Live site:** https://motroy.github.io/LR-seq-data-db/genome-dashboard/

A weekly-refreshed catalogue of long-read (Oxford Nanopore and PacBio) sequencing
runs for bacterial whole-genome (WGS) and metagenomic (MGx) samples in the
European Nucleotide Archive, plus biosamples that also have matching short-read
data ("hybrid" biosamples) for hybrid assembly workflows.

## Site

The site is a static, dependency-free (no build step) set of pages under
`genome-dashboard/`, deployed to GitHub Pages by `.github/workflows/deploy.yml`.

| Page | What it shows |
| --- | --- |
| `index.html` | Overview: live headline counts and week-on-week change, an interactive growth chart built from `sample_counts.csv`, the top-organisms figure, and links to the dashboards. |
| `dashboard.html?type=wgs` / `?type=mgx` | Run-level table for long-read WGS or MGx samples with organism / technology / library filters, summary tiles, per-organism read and base distributions, and TSV / XLSX export. |
| `hybrid.html?type=wgs` / `?type=mgx` | Biosamples with both short- and long-read runs, with row selection to download a BioSample ID list, plus TSV / XLSX export. |

Shared pieces:

- `assets/styles.css` – token-based design system with light and dark themes
  (follows the OS preference; the header toggle overrides it and is remembered).
- `scripts/common.js` – theme handling, gzip-JSON loading in a Web Worker with
  progress reporting, Plotly/Tabulator helpers, formatting utilities.
- `scripts/landing.js`, `scripts/dashboard.js`, `scripts/hybrid.js` – page logic.

Third-party libraries are loaded from pinned CDN versions: Tabulator 6,
Plotly.js 3, SheetJS (XLSX export) and fflate (gzip decompression).

### Previewing locally

The pages fetch data files, so serve the folder over HTTP rather than opening
the files directly:

```bash
cd genome-dashboard
python3 -m http.server 8000
# then open http://localhost:8000/
```

## Command-line queries

`genome-dashboard/scripts/query.py` filters the data files without a browser:

```bash
cd genome-dashboard
python3 scripts/query.py runs --type wgs --organism "Escherichia coli" --platform OXFORD_NANOPORE
python3 scripts/query.py runs --type wgs --count-by scientific_name --limit 10
python3 scripts/query.py hybrid --type wgs --long-platform PACBIO_SMRT --short-platform ILLUMINA --count
```

Run with `-h` for all filters; output formats are `tsv` (default), `csv` and `json`.

## Data provenance and reuse

- **Source:** all records come from the [European Nucleotide Archive (ENA) Portal API](https://www.ebi.ac.uk/ena/portal/api/) (`read_run` results). The `source` field on each run records this. The hybrid files are also built from ENA queries, filtered by instrument platform.
- **Scope:** bacteria are `tax_tree(2)` and metagenomes `tax_tree(408169)`; long-read platforms are `OXFORD_NANOPORE` and `PACBIO_SMRT`; short-read platforms are `ILLUMINA`, `ION_TORRENT`, `BGISEQ`, `LS454` and `COMPLETE_GENOMICS`.
- **Snapshots:** the data is fetched live each week and the files are overwritten, so counts change as ENA changes. Earlier versions are only in git history.
- **`genome-dashboard/manifest.json`:** written by `scripts/make_manifest.py` on every refresh. It records the generation time, commit SHA, workflow run URL, the ENA queries used, and the record count, size and SHA-256 of each data file. Use it to check a downloaded file (`sha256sum`) and to cite the exact snapshot. It is served alongside the data on the site.
- **Licence and citation:** the code is MIT-licensed (see `LICENSE`). The records themselves are ENA/INSDC data, which is openly reusable; please cite ENA and the underlying studies (`study_accession`) when using them.

## Data pipeline

`.github/workflows/update_samples.yml` runs every Sunday (and on demand) and:

1. `extract_ena_genomes.py` queries the ENA Portal API for bacterial
   (`data_bacteria.json.gz`) and metagenomic (`data_metagenome.json.gz`)
   long-read runs.
2. `scripts/find_hybrid_samples.py` queries ENA by instrument platform to find biosamples with
   additional short-read runs and writes `hybrid_wgs.json.gz` /
   `hybrid_mgx.json.gz`.
3. `generate_plot.py` appends the new totals to `sample_counts.csv` and
   regenerates `assets/sample_plot.png` and `assets/organism_bubble_plot.png`.
4. `scripts/make_manifest.py` writes `manifest.json` (provenance and checksums).
5. The updated data, manifest and figures are committed, which triggers the Pages deploy.

`sample_counts.csv` is the source for the overview page's headline numbers and
growth chart; `sample_plot.png` is kept as a no-JavaScript fallback.
