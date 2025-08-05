import requests
import json
import random
import time
import gzip
import argparse

def fetch_ena(platform, tax_id, size=500):
    print(f"🔍 Fetching {platform} samples from ENA for tax ID {tax_id}...")

    ena_url = "https://www.ebi.ac.uk/ena/portal/api/search"
    query = f'instrument_platform="{platform}" AND tax_tree({tax_id})'
    fields = "accession,scientific_name,instrument_platform,study_accession,read_count,base_count,library_strategy"
    params = {
        "result": "read_run",
        "query": query,
        "fields": fields,
        "format": "json",
        "limit": size
    }

    for attempt in range(3):
        try:
            response = requests.get(ena_url, params=params, timeout=20)
            response.raise_for_status()
            data = response.json()
            break
        except requests.exceptions.RequestException as err:
            print(f"⚠️ Attempt {attempt+1} failed: {err}")
            time.sleep(5)
    else:
        print(f"❌ Failed to retrieve data for {platform}")
        return []

    results = []
    for item in data:
        results.append({
            "sample_id": item.get("accession"),
            "scientific_name": item.get("scientific_name", "Unknown"),
            "instrument_platform": item.get("instrument_platform", platform),
            "study_accession": item.get("study_accession", "NA"),
            "read_count": int(item.get("read_count", 0)),
            "base_count": int(item.get("base_count", 0)),
            "library_strategy": item.get("library_strategy", "Unknown"),
            "source": "ENA"
        })
    return results

def main():
    parser = argparse.ArgumentParser(description="Fetch genome data from ENA.")
    parser.add_argument("--tax-id", default="2", help="Taxonomy ID to fetch.")
    parser.add_argument("--output", default="genome-dashboard/data.json.gz", help="Output file path.")
    args = parser.parse_args()

    nanopore_data = fetch_ena("OXFORD_NANOPORE", args.tax_id, 1000000)
    pacbio_data = fetch_ena("PACBIO_SMRT", args.tax_id, 1000000)

    combined = nanopore_data + pacbio_data
    with gzip.open(args.output, 'w') as fout:
        fout.write(json.dumps(combined).encode('utf-8'))

    print(f"✅ Saved {len(combined)} samples to {args.output}")

if __name__ == "__main__":
    main()
