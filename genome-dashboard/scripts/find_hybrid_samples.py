#!/usr/bin/env python3
"""
Find BioSamples with both long-read and short-read data using the ENA Portal API.

Instead of querying SRA study-by-study (slow), this script issues a small number
of bulk ENA API requests — one per instrument platform — and does the intersection
in memory.  For ~12 k studies the old pysradb approach took hours; this takes
a few minutes.
"""

import gzip
import json
import logging
import time
import argparse
import os
import requests
from collections import defaultdict

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("find_hybrid_samples.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

ENA_API_URL = "https://www.ebi.ac.uk/ena/portal/api/search"

LONG_READ_PLATFORMS = ["OXFORD_NANOPORE", "PACBIO_SMRT"]

# All ENA short-read platform codes
SHORT_READ_PLATFORMS = ["ILLUMINA", "ION_TORRENT", "BGISEQ", "LS454", "COMPLETE_GENOMICS"]

FETCH_FIELDS = "accession,sample_accession,instrument_platform,instrument_model,study_accession,library_strategy"


def fetch_ena_platform(platform: str, tax_id: str, retries: int = 3) -> list:
    """
    Fetch all runs for a single ENA instrument_platform + taxonomy in one request.
    Returns a list of dicts with the requested fields.
    """
    params = {
        "result": "read_run",
        "query": f'instrument_platform="{platform}" AND tax_tree({tax_id})',
        "fields": FETCH_FIELDS,
        "format": "json",
        "limit": 1_000_000,
    }
    for attempt in range(retries):
        try:
            resp = requests.get(ENA_API_URL, params=params, timeout=120)
            resp.raise_for_status()
            data = resp.json()
            logger.info(f"  {platform}: {len(data):,} runs fetched")
            return data
        except Exception as exc:
            wait = 5 * (attempt + 1)
            logger.warning(f"  {platform} attempt {attempt + 1} failed: {exc}. Retrying in {wait}s...")
            time.sleep(wait)
    logger.error(f"  {platform}: all {retries} attempts failed — skipping.")
    return []


def index_by_sample(runs: list) -> dict:
    """Return {sample_accession: [run_dict, ...]} for non-empty sample accessions."""
    by_sample = defaultdict(list)
    for run in runs:
        sa = (run.get("sample_accession") or "").strip()
        if sa and sa.upper() not in ("", "N/A", "NONE"):
            by_sample[sa].append(run)
    return by_sample


def build_run_info(run: dict) -> dict:
    return {
        "run_accession": run.get("accession", ""),
        "instrument_model": run.get("instrument_model", ""),
        "study_accession": run.get("study_accession", ""),
    }


def main():
    parser = argparse.ArgumentParser(
        description="Find hybrid BioSamples (both long- and short-read) via ENA Portal API."
    )
    parser.add_argument(
        "--type",
        choices=["wgs", "mgx"],
        default="mgx",
        help="'wgs' → bacteria (tax 2), 'mgx' → metagenomes (tax 408169). Default: mgx.",
    )
    parser.add_argument(
        "--output-dir",
        default=".",
        help="Directory for the output .json.gz file. Default: current directory.",
    )
    args = parser.parse_args()

    tax_id = "2" if args.type == "wgs" else "408169"
    output_file = os.path.join(args.output_dir, f"hybrid_{args.type}.json.gz")

    start = time.time()

    # ------------------------------------------------------------------ #
    # 1. Fetch all long-read runs from ENA                                 #
    # ------------------------------------------------------------------ #
    logger.info(f"Fetching long-read runs for tax_id={tax_id}...")
    long_runs: list = []
    for platform in LONG_READ_PLATFORMS:
        long_runs.extend(fetch_ena_platform(platform, tax_id))

    long_by_sample = index_by_sample(long_runs)
    logger.info(f"Long-read: {len(long_runs):,} runs across {len(long_by_sample):,} unique biosamples")

    if not long_by_sample:
        logger.error("No long-read data retrieved — aborting.")
        return

    # ------------------------------------------------------------------ #
    # 2. Fetch all short-read runs from ENA                                #
    # ------------------------------------------------------------------ #
    logger.info(f"Fetching short-read runs for tax_id={tax_id}...")
    short_runs: list = []
    for platform in SHORT_READ_PLATFORMS:
        short_runs.extend(fetch_ena_platform(platform, tax_id))

    short_by_sample = index_by_sample(short_runs)
    logger.info(f"Short-read: {len(short_runs):,} runs across {len(short_by_sample):,} unique biosamples")

    # ------------------------------------------------------------------ #
    # 3. Intersect by sample_accession                                     #
    # ------------------------------------------------------------------ #
    hybrid_samples = sorted(set(long_by_sample) & set(short_by_sample))
    logger.info(f"Hybrid biosamples (long ∩ short): {len(hybrid_samples):,}")

    results = []
    for sample in hybrid_samples:
        lr = long_by_sample[sample]
        sr = short_by_sample[sample]
        study_accs = list({r.get("study_accession", "") for r in lr + sr} - {""})
        results.append({
            "biosample": sample,
            "long_reads": [build_run_info(r) for r in lr],
            "short_reads": [build_run_info(r) for r in sr],
            "study_accession": study_accs,
        })

    # ------------------------------------------------------------------ #
    # 4. Save                                                              #
    # ------------------------------------------------------------------ #
    try:
        with gzip.open(output_file, "wt", encoding="utf-8") as f:
            json.dump(results, f)
        logger.info(f"Results saved to {output_file}")
    except Exception as exc:
        logger.error(f"Error saving results: {exc}")

    elapsed = time.time() - start
    logger.info(f"Done in {elapsed:.1f}s — {len(results):,} hybrid biosamples written.")


if __name__ == "__main__":
    main()
