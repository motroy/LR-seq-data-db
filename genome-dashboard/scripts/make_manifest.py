#!/usr/bin/env python3
"""Write manifest.json describing how and when the data files were produced.

Run after the data files are regenerated. In GitHub Actions the commit SHA and
workflow run URL are read from the standard environment variables.
"""
import argparse
import gzip
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

ENA_URL = "https://www.ebi.ac.uk/ena/portal/api/search"
LONG_READ = ["OXFORD_NANOPORE", "PACBIO_SMRT"]
SHORT_READ = ["ILLUMINA", "ION_TORRENT", "BGISEQ", "LS454", "COMPLETE_GENOMICS"]

FILES = {
    "data_bacteria.json.gz": {
        "description": "Long-read bacterial runs (WGS dashboard)",
        "script": "genome-dashboard/extract_ena_genomes.py",
        "query": 'instrument_platform="{platform}" AND tax_tree(2)',
        "platforms": LONG_READ,
    },
    "data_metagenome.json.gz": {
        "description": "Long-read metagenomic runs (MGx dashboard)",
        "script": "genome-dashboard/extract_ena_genomes.py",
        "query": 'instrument_platform="{platform}" AND tax_tree(408169)',
        "platforms": LONG_READ,
    },
    "hybrid_wgs.json.gz": {
        "description": "Biosamples with both long- and short-read runs (WGS)",
        "script": "genome-dashboard/scripts/find_hybrid_samples.py",
        "query": 'instrument_platform="{platform}" AND tax_tree(2)',
        "platforms": LONG_READ + SHORT_READ,
    },
    "hybrid_mgx.json.gz": {
        "description": "Biosamples with both long- and short-read runs (MGx)",
        "script": "genome-dashboard/scripts/find_hybrid_samples.py",
        "query": 'instrument_platform="{platform}" AND tax_tree(408169)',
        "platforms": LONG_READ + SHORT_READ,
    },
    "sample_counts.csv": {
        "description": "Weekly totals appended by generate_plot.py",
        "script": "genome-dashboard/generate_plot.py",
    },
}


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def record_count(path):
    if path.suffix != ".gz":
        return None
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        return len(json.load(fh))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--data-dir", default="genome-dashboard")
    p.add_argument("--output", default=None, help="default: <data-dir>/manifest.json")
    a = p.parse_args()
    data_dir = Path(a.data_dir)

    server = os.environ.get("GITHUB_SERVER_URL", "https://github.com")
    repo = os.environ.get("GITHUB_REPOSITORY")
    run_id = os.environ.get("GITHUB_RUN_ID")
    manifest = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "repository": f"{server}/{repo}" if repo else None,
        "commit": os.environ.get("GITHUB_SHA"),
        "workflow_run": f"{server}/{repo}/actions/runs/{run_id}" if repo and run_id else None,
        "upstream": {
            "name": "European Nucleotide Archive (ENA) Portal API",
            "endpoint": ENA_URL,
            "result": "read_run",
            "note": "Data is retrieved live at generation time; ENA content changes over time.",
        },
        "files": {},
    }
    for name, meta in FILES.items():
        path = data_dir / name
        if not path.exists():
            continue
        entry = {k: v for k, v in meta.items() if k not in ("query", "platforms")}
        if "query" in meta:
            entry["ena_queries"] = [meta["query"].format(platform=x) for x in meta["platforms"]]
        entry["records"] = record_count(path)
        entry["bytes"] = path.stat().st_size
        entry["sha256"] = sha256(path)
        manifest["files"][name] = entry

    out = Path(a.output) if a.output else data_dir / "manifest.json"
    out.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
