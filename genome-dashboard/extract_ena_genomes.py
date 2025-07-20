import requests
import json
import random

def fetch_ena_samples(tech="Oxford Nanopore", size=500):
    print(f"🔍 Searching ENA for {tech} bacterial samples...")
    ena_url = "https://www.ebi.ac.uk/ena/portal/api/search"
    query = f'platform="{tech}" AND tax_tree(bacteria)'
    fields = "accession,scientific_name,platform,study_accession"
    params = {
        "result": "read_run",
        "query": query,
        "fields": fields,
        "format": "json",
        "limit": size
    }
    response = requests.get(ena_url, params=params)
    response.raise_for_status()
    data = response.json()
    results = []

    for item in data:
        results.append({
            "sample_id": item.get("accession"),
            "organism": item.get("scientific_name", "Unknown"),
            "tech": item.get("platform", tech),
            "study": item.get("study_accession", "NA"),
            "source": "ENA"
        })
    return results

def main():
    nanopore_data = fetch_ena_samples("Oxford Nanopore", size=500)
    pacbio_data = fetch_ena_samples("PacBio", size=500)

    all_data = nanopore_data + pacbio_data
    random.shuffle(all_data)

    with open("sample_data.json", "w") as f:
        json.dump(all_data, f, indent=2)
    print(f"✅ Saved {len(all_data)} ENA samples to sample_data.json")

if __name__ == "__main__":
    main()
