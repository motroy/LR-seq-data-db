#!/usr/bin/env python3
"""Fail if a freshly generated data file looks truncated.

Each gzipped JSON data file is compared with the version committed at a git ref
(default HEAD). The check fails if a file is empty or has lost more than
--max-drop of its records. Run it before committing refreshed data.
"""
import argparse
import gzip
import json
import subprocess
import sys
from pathlib import Path

FILES = ["data_bacteria.json.gz", "data_metagenome.json.gz",
         "hybrid_wgs.json.gz", "hybrid_mgx.json.gz"]


def count_bytes(raw):
    return len(json.loads(gzip.decompress(raw)))


def previous_count(ref, path):
    res = subprocess.run(["git", "show", f"{ref}:{path}"], capture_output=True)
    if res.returncode != 0:
        return None  # file not tracked at ref (first run)
    return count_bytes(res.stdout)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--data-dir", default="genome-dashboard")
    p.add_argument("--ref", default="HEAD", help="git ref holding the previous data")
    p.add_argument("--max-drop", type=float, default=0.10,
                   help="largest allowed fractional drop in records (default 0.10)")
    a = p.parse_args()

    failed = False
    for name in FILES:
        path = Path(a.data_dir) / name
        new = count_bytes(path.read_bytes())
        old = previous_count(a.ref, path.as_posix())
        if new == 0:
            status = "FAIL (empty)"
        elif old and new < old * (1 - a.max_drop):
            status = f"FAIL (dropped {1 - new / old:.0%})"
        else:
            status = "ok"
        failed |= status != "ok"
        print(f"{name}: {old if old is not None else 'n/a'} -> {new}  {status}")

    if failed:
        sys.exit("Data check failed: refusing to publish suspiciously small data files.")


if __name__ == "__main__":
    main()
