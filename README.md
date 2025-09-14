# LR-seq-data-db
https://motroy.github.io/LR-seq-data-db/genome-dashboard/

## Overview

This repository contains a simple dashboard to visualize long-read sequencing data from the ENA.
The data is updated weekly via a GitHub Action.

### Landing Page Plot

The landing page shows a plot of the number of WGS and MGx samples over time. This data is generated from the history of the data update workflow runs.
The historical data is stored in `genome-dashboard/sample_counts.csv`.
