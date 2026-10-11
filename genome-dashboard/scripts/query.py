#!/usr/bin/env python3
"""Query the gzipped JSON data files from the command line.

Examples:
  query.py runs --type wgs --organism "Escherichia coli" --platform OXFORD_NANOPORE
  query.py runs --type mgx --study PRJEB47876 --format json
  query.py runs --type wgs --count-by scientific_name --limit 10
  query.py hybrid --type wgs --long-platform PACBIO_SMRT --short-platform ILLUMINA
  query.py hybrid --type mgx --organism metagenome --count
"""
import argparse
import csv
import gzip
import json
import sys
from collections import Counter
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent
RUN_FILES = {"wgs": "data_bacteria.json.gz", "mgx": "data_metagenome.json.gz"}
HYBRID_FILES = {"wgs": "hybrid_wgs.json.gz", "mgx": "hybrid_mgx.json.gz"}
RUN_COLUMNS = ["sample_id", "sample_accession", "scientific_name", "instrument_platform",
               "instrument_model", "study_accession", "read_count", "base_count",
               "library_strategy", "source"]
HYBRID_COLUMNS = ["biosample", "scientific_name", "study_accession", "long_reads",
                  "short_reads", "pubmed_ids"]


def load(name):
    with gzip.open(DATA_DIR / name, "rt", encoding="utf-8") as fh:
        return json.load(fh)


def contains(value, needle):
    return needle.lower() in (value or "").lower()


def filter_runs(rows, a):
    for r in rows:
        if a.organism and not contains(r.get("scientific_name"), a.organism):
            continue
        if a.platform and r.get("instrument_platform") != a.platform:
            continue
        if a.model and not contains(r.get("instrument_model"), a.model):
            continue
        if a.study and r.get("study_accession") != a.study:
            continue
        if a.sample and a.sample not in (r.get("sample_id"), r.get("sample_accession")):
            continue
        if a.min_bases is not None and (r.get("base_count") or 0) < a.min_bases:
            continue
        yield r


def filter_hybrid(rows, a):
    for r in rows:
        if a.organism and not contains(r.get("scientific_name"), a.organism):
            continue
        if a.sample and r.get("biosample") != a.sample:
            continue
        if a.study and a.study not in (r.get("study_accession") or []):
            continue
        if a.long_platform and not any(x.get("instrument_platform") == a.long_platform
                                       for x in r.get("long_reads", [])):
            continue
        if a.short_platform and not any(x.get("instrument_platform") == a.short_platform
                                        for x in r.get("short_reads", [])):
            continue
        yield r


def cell(v):
    if isinstance(v, list):
        if v and isinstance(v[0], dict):
            return ",".join(x.get("run_accession", "") for x in v)
        return ",".join(map(str, v))
    return "" if v is None else v


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("table", choices=["runs", "hybrid"], help="runs = long-read runs; hybrid = biosamples with short+long reads")
    p.add_argument("--type", choices=["wgs", "mgx"], required=True)
    p.add_argument("--organism", help="case-insensitive substring of scientific_name")
    p.add_argument("--platform", choices=["OXFORD_NANOPORE", "PACBIO_SMRT"], help="runs only")
    p.add_argument("--model", help="runs only: substring of instrument_model")
    p.add_argument("--study", help="study accession")
    p.add_argument("--sample", help="run/sample accession (runs) or biosample (hybrid)")
    p.add_argument("--min-bases", type=int, help="runs only: minimum base_count")
    p.add_argument("--long-platform", help="hybrid only: required long-read platform")
    p.add_argument("--short-platform", help="hybrid only: required short-read platform (e.g. ILLUMINA)")
    p.add_argument("--count", action="store_true", help="print only the number of matches")
    p.add_argument("--count-by", metavar="FIELD", help="print counts grouped by FIELD")
    p.add_argument("--limit", type=int, help="max rows to output")
    p.add_argument("--format", choices=["tsv", "csv", "json"], default="tsv")
    a = p.parse_args()

    if a.table == "runs":
        rows, cols = filter_runs(load(RUN_FILES[a.type]), a), RUN_COLUMNS
    else:
        rows, cols = filter_hybrid(load(HYBRID_FILES[a.type]), a), HYBRID_COLUMNS

    if a.count:
        print(sum(1 for _ in rows))
        return
    if a.count_by:
        counts = Counter(str(cell(r.get(a.count_by))) for r in rows)
        for k, c in counts.most_common(a.limit):
            print(f"{c}\t{k}")
        return

    rows = list(rows)[: a.limit]
    if a.format == "json":
        json.dump(rows, sys.stdout, indent=2)
        print()
        return
    w = csv.writer(sys.stdout, delimiter="\t" if a.format == "tsv" else ",", lineterminator="\n")
    w.writerow(cols)
    for r in rows:
        w.writerow([cell(r.get(c)) for c in cols])


if __name__ == "__main__":
    try:
        main()
    except BrokenPipeError:
        pass
