import os
import requests
import zipfile
import io
import pandas as pd
import matplotlib.pyplot as plt
import re
from datetime import datetime
from collections import defaultdict

def get_workflow_runs(repo, workflow_name, token, since_date=None):
    """Gets the list of all runs for a specific workflow since a given date, handling pagination."""
    runs = []
    url = f"https://api.github.com/repos/{repo}/actions/workflows/{workflow_name}/runs"
    print(f"Fetching workflow runs from: {url}", flush=True)
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json"
    }
    params = {"status": "success", "per_page": 100}
    if since_date:
        params["created"] = f">={since_date.strftime('%Y-%m-%d')}"

    while url:
        response = requests.get(url, headers=headers, params=params)
        response.raise_for_status()
        runs.extend(response.json()["workflow_runs"])

        if 'next' in response.links:
            url = response.links['next']['url']
            params = None
        else:
            url = None

    return runs

def download_log_archive(run_id, repo, token):
    """Downloads the log archive for a specific workflow run."""
    url = f"https://api.github.com/repos/{repo}/actions/runs/{run_id}/logs"
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json"
    }
    response = requests.get(url, headers=headers, allow_redirects=True)
    response.raise_for_status()
    return response.content

def parse_sample_count_from_log(log_content, pattern):
    """Parses the log content to find the sample count and the full line."""
    match = re.search(pattern, log_content)
    if match:
        return int(match.group(1)), match.group(0)
    return 0, None

def generate_plot(csv_file, output_image):
    """Generates a line plot from the historical data."""
    if not os.path.exists(csv_file) or os.path.getsize(csv_file) == 0:
        print(f"Warning: {csv_file} is missing or empty. Creating a 'No data' plot.", flush=True)
        plt.figure(figsize=(10, 6))
        plt.text(0.5, 0.5, "No data available", ha='center', va='center', fontsize=20)
        plt.xticks([])
        plt.yticks([])
        plt.savefig(output_image)
        print(f"✅ 'No data' plot saved to {output_image}", flush=True)
        return

    df = pd.read_csv(csv_file)
    if df.empty:
        print(f"Warning: {csv_file} is empty. Creating a 'No data' plot.", flush=True)
        plt.figure(figsize=(10, 6))
        plt.text(0.5, 0.5, "No data available", ha='center', va='center', fontsize=20)
        plt.xticks([])
        plt.yticks([])
        plt.savefig(output_image)
        print(f"✅ 'No data' plot saved to {output_image}", flush=True)
        return

    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values(by="date")

    plt.figure(figsize=(10, 6))
    plt.plot(df["date"], df["wgs_samples"], marker='o', linestyle='-', label="WGS Samples")
    plt.plot(df["date"], df["mgx_samples"], marker='o', linestyle='-', label="MGx Samples")

    plt.title("Number of Samples Over Time")
    plt.xlabel("Date")
    plt.ylabel("Number of Samples")
    plt.grid(True)
    plt.legend()
    plt.tight_layout()

    plt.savefig(output_image)
    print(f"✅ Plot saved to {output_image}", flush=True)

def main():
    repo = os.environ.get("GITHUB_REPOSITORY")
    token = os.environ.get("GITHUB_TOKEN")
    workflow_name = "update_samples.yml"
    csv_file = "genome-dashboard/sample_counts.csv"
    output_image = "genome-dashboard/assets/sample_plot.png"

    # Load existing data
    processed_run_ids = set()
    latest_date = None
    df_existing = pd.DataFrame(columns=['run_id', 'date', 'wgs_samples', 'mgx_samples'])
    if os.path.exists(csv_file) and os.path.getsize(csv_file) > 0:
        try:
            df_existing = pd.read_csv(csv_file)
            if 'run_id' in df_existing.columns:
                processed_run_ids = set(df_existing['run_id'])
            if 'date' in df_existing.columns and not df_existing['date'].empty:
                latest_date = pd.to_datetime(df_existing['date']).max()
        except pd.errors.EmptyDataError:
            pass # df_existing remains empty

    if repo and token:
        print("🔄 Fetching workflow runs...", flush=True)
        runs = get_workflow_runs(repo, workflow_name, token, since_date=latest_date)
        print(f"Found {len(runs)} workflow runs since {latest_date or 'the beginning'}.", flush=True)

        new_data = defaultdict(lambda: {"wgs_samples": 0, "mgx_samples": 0})

        wgs_log_pattern = re.compile(r".*Run WGS data extraction\.txt$")
        mgx_log_pattern = re.compile(r".*Run MGx data extraction\.txt$")
        wgs_count_pattern = re.compile(r"✅ Saved (\d+) samples to genome-dashboard/data.json.gz")
        mgx_count_pattern = re.compile(r"✅ Saved (\d+) samples to genome-dashboard/data_metagenome.json.gz")

        runs_to_process = [run for run in runs if run['id'] not in processed_run_ids]
        print(f"Found {len(runs_to_process)} new, unique runs to process.", flush=True)

        for run in runs_to_process:
            print(f"📄 Processing run {run['id']} from {run['created_at']}", flush=True)

            log_archive = download_log_archive(run["id"], repo, token)
            with zipfile.ZipFile(io.BytesIO(log_archive)) as z:
                print(f"  Log files in archive for run {run['id']}: {z.namelist()}", flush=True)
                for filename in z.namelist():
                    log_content = z.read(filename).decode("utf-8", errors='ignore')

                    if wgs_log_pattern.match(filename):
                        count, line = parse_sample_count_from_log(log_content, wgs_count_pattern)
                        if line:
                            print(f"  - Found: {line}", flush=True)
                            new_data[run['id']]['wgs_samples'] = count

                    elif mgx_log_pattern.match(filename):
                        count, line = parse_sample_count_from_log(log_content, mgx_count_pattern)
                        if line:
                            print(f"  - Found: {line}", flush=True)
                            new_data[run['id']]['mgx_samples'] = count

            new_data[run['id']]['date'] = datetime.strptime(run["created_at"], "%Y-%m-%dT%H:%M:%SZ").strftime("%Y-%m-%d")

        if new_data:
            print(f"Adding {len(new_data)} new data points to {csv_file}.", flush=True)
            data_list = [
                {"run_id": run_id, "date": data["date"], "wgs_samples": data["wgs_samples"], "mgx_samples": data["mgx_samples"]}
                for run_id, data in new_data.items()
            ]
            df_new = pd.DataFrame(data_list)

            # Combine old and new data
            df_combined = pd.concat([df_existing, df_new], ignore_index=True)
            df_combined['date'] = pd.to_datetime(df_combined['date'])

            # Sort by run_id to ensure 'last' is well-defined
            df_combined = df_combined.sort_values(by="run_id")

            # Filter for runs with at least one non-zero count
            mask = (df_combined['wgs_samples'] > 0) | (df_combined['mgx_samples'] > 0)
            df_nonzero = df_combined[mask]

            # From the non-zero runs, for each date, keep the last one
            df_final = df_nonzero.drop_duplicates(subset='date', keep='last')

            df_final = df_final.sort_values(by="date").reset_index(drop=True)
            df_final.to_csv(csv_file, index=False)
            print(f"✅ {csv_file} updated.", flush=True)
        else:
            print("No new data to add to the CSV file.", flush=True)

    # Always generate the plot from the CSV
    generate_plot(csv_file, output_image)

if __name__ == "__main__":
    main()
