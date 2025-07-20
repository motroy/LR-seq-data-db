import requests
import json

def fetch_ena_data():
    """
    Fetches data from the ENA API and saves it to a JSON file.
    """
    url = "https://www.ebi.ac.uk/ena/portal/api/search"
    params = {
        "result": "read_run",
        "query": "instrument_platform=\"OXFORD_NANOPORE\" OR instrument_platform=\"PACBIO_SMRT\"",
        "fields": "study_accession,sample_accession,experiment_accession,run_accession,tax_id,scientific_name,instrument_platform,instrument_model,read_count,library_source",
        "format": "json",
        "limit": 1000
    }

    response = requests.get(url, params=params)
    response.raise_for_status()  # Raise an exception for bad status codes

    data = response.json()

    with open("ena_data.json", "w") as f:
        json.dump(data, f, indent=4)

    print("Data fetched successfully and saved to ena_data.json")

if __name__ == "__main__":
    fetch_ena_data()
