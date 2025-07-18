import requests
import pandas as pd

def fetch_data():
    """
    Fetches data from the ENA API and saves it as a JSON file.
    """
    url = "https://www.ebi.ac.uk/ena/portal/api/search"
    params = {
        "result": "read_run",
        "query": "tax_tree(2) AND (instrument_platform=\"ONT\" OR instrument_platform=\"PACBIO_SMRT\")",
        "fields": "study_accession,sample_accession,run_accession,scientific_name,instrument_platform,read_count,base_count,first_public",
        "format": "tsv",
        "limit": 0  # Fetch all records
    }

    try:
        response = requests.get(url, params=params)
        response.raise_for_status()

        df = pd.read_csv(pd.io.common.StringIO(response.text), sep='\\t')

        # Standardize instrument_platform
        df['instrument_platform'] = df['instrument_platform'].replace({
            'ONT': 'Oxford Nanopore',
            'PACBIO_SMRT': 'PacBio'
        })

        # Ensure first_public is a valid date
        df['first_public'] = pd.to_datetime(df['first_public'], errors='coerce')

        # Handle potential missing values
        df.dropna(subset=['first_public'], inplace=True)

        # Take a subset of 100 samples
        df_subset = df.head(100)

        # Save to JSON
        df_subset.to_json("public/dashboard_data.json", orient="records")

        print("Data fetched and saved successfully.")

    except requests.exceptions.RequestException as e:
        print(f"Error fetching data: {e}")
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    fetch_data()
