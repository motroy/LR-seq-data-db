import requests
import json
import random
import time

def fetch_ena(platform, size=500, tax_id="2"):
    print(f"🔍 Fetching {platform} samples from ENA...")

    ena_url = "https://www.ebi.ac.uk/ena/portal/api/search"
    query = f'instrument_platform="{platform}" AND tax_tree({tax_id})'
    fields = "accession,scientific_name,instrument_platform,study_accession,read_count,base_count"
    params = {
        "result": "read_run",
        "query": query,
        "fields": fields,
        "format": "json",
        "limit": size
    }
    #url = "https://www.ebi.ac.uk/ena/portal/api/search"
    #params = {
    #    "result": "read_run",
    #    "query": "tax_tree(2) AND (instrument_platform=\"ONT\" OR instrument_platform=\"PACBIO_SMRT\")",
    #    "fields": "study_accession,sample_accession,run_accession,scientific_name,instrument_platform,read_count,base_count,first_public",
    #    "format": "tsv",
    #    "limit": 0  # Fetch all records
    #}

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
            "source": "ENA"
        })
    return results

def main():
    nanopore_data = fetch_ena("OXFORD_NANOPORE", 1000)
    pacbio_data = fetch_ena("PACBIO_SMRT", 1000)

    combined = nanopore_data + pacbio_data
    random.shuffle(combined)

    chunk_size = 1000
    for i in range(0, len(combined), chunk_size):
        chunk = combined[i:i + chunk_size]
        with open(f"genome-dashboard/assets/data/chunks/chunk_{i // chunk_size + 1}.json", "w", encoding="utf-8") as f:
            json.dump(chunk, f, indent=2)

    print(f"✅ Saved {len(combined)} samples to {len(range(0, len(combined), chunk_size))} chunks")

if __name__ == "__main__":
    main()