import os
import requests
import zipfile
import io
import pandas as pd
import matplotlib.pyplot as plt
import re
from datetime import datetime
from collections import defaultdict

def get_workflow_runs(repo, workflow_name, token):
    """Gets the list of all runs for a specific workflow, handling pagination."""
    runs = []
    url = f"https://api.github.com/repos/{repo}/actions/workflows/{workflow_name}/runs"
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json"
    }
    params = {"status": "success", "per_page": 100}

    while url:
        response = requests.get(url, headers=headers, params=params)
        response.raise_for_status()
        runs.extend(response.json()["workflow_runs"])

        if 'next' in response.links:
            url = response.links['next']['url']
            # params should not be passed in subsequent calls as they are part of the 'next' URL
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
        return int(match.group(1)), match.group(0) # return count and full line
    return 0, None

def generate_plot(csv_file, output_image):
    """Generates a line plot from the historical data."""
    if not os.path.exists(csv_file):
        print(f"Warning: {csv_file} not found. Skipping plot generation.")
        return

    df = pd.read_csv(csv_file)
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
    print(f"✅ Plot saved to {output_image}")

def main():
    repo = os.environ.get("GITHUB_REPOSITORY")
    token = os.environ.get("GITHUB_TOKEN")
    workflow_name = "update_samples.yml"
    csv_file = "genome-dashboard/sample_counts.csv"
    output_image = "genome-dashboard/assets/sample_plot.png"

    if not repo or not token:
        print("GITHUB_REPOSITORY and GITHUB_TOKEN environment variables are required.")
        print("📦 Generating plot from existing CSV for local testing if it exists.")
        generate_plot(csv_file, output_image)
        return

    print("🔄 Fetching workflow runs...")
    runs = get_workflow_runs(repo, workflow_name, token)

    # Using a defaultdict to store counts for each date
    historical_data = defaultdict(lambda: {"wgs_samples": 0, "mgx_samples": 0})

    wgs_log_pattern = re.compile(r".*Run WGS data extraction\.txt$")
    mgx_log_pattern = re.compile(r".*Run MGx data extraction\.txt$")

    wgs_count_pattern = re.compile(r"✅ Saved (\d+) samples to genome-dashboard/data.json.gz")
    mgx_count_pattern = re.compile(r"✅ Saved (\d+) samples to genome-dashboard/data_metagenome.json.gz")

    for run in runs:
        print(f"📄 Processing run {run['id']} from {run['created_at']}")
        run_date = datetime.strptime(run["created_at"], "%Y-%m-%dT%H:%M:%SZ").date()

        log_archive = download_log_archive(run["id"], repo, token)

        with zipfile.ZipFile(io.BytesIO(log_archive)) as z:
            for filename in z.namelist():
                log_content = z.read(filename).decode("utf-8", errors='ignore')

                if wgs_log_pattern.match(filename):
                    count, line = parse_sample_count_from_log(log_content, wgs_count_pattern)
                    if line:
                        print(f"  - Found: {line}")
                        historical_data[run_date]["wgs_samples"] = count

                elif mgx_log_pattern.match(filename):
                    count, line = parse_sample_count_from_log(log_content, mgx_count_pattern)
                    if line:
                        print(f"  - Found: {line}")
                        historical_data[run_date]["mgx_samples"] = count

    if not historical_data:
        print("No successful workflow runs found to generate historical data.")
        return

    # Convert the defaultdict to a list of dictionaries
    data_list = [
        {"date": date, "wgs_samples": data["wgs_samples"], "mgx_samples": data["mgx_samples"]}
        for date, data in historical_data.items()
    ]

    # Create a DataFrame and save to CSV
    df = pd.DataFrame(data_list)
    df = df.sort_values(by="date")
    df.to_csv(csv_file, index=False)
    print(f"✅ Historical data saved to {csv_file}")

    # Generate and save the plot
    generate_plot(csv_file, output_image)

if __name__ == "__main__":
    main()
