import os
import json
import gzip
import pandas as pd
import matplotlib.pyplot as plt
from datetime import datetime

def count_samples(json_gz_path):
    """Counts the number of samples in a gzipped JSON file."""
    if not os.path.exists(json_gz_path):
        print(f"Warning: {json_gz_path} not found.", flush=True)
        return 0

    try:
        with gzip.open(json_gz_path, 'r') as f:
            data = json.load(f)
            return len(data)
    except Exception as e:
        print(f"Error reading {json_gz_path}: {e}", flush=True)
        return 0

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
    plt.xticks(rotation='vertical')
    plt.grid(True)
    plt.legend()
    plt.tight_layout()

    plt.savefig(output_image)
    print(f"✅ Plot saved to {output_image}", flush=True)

def main():
    csv_file = "genome-dashboard/sample_counts.csv"
    output_image = "genome-dashboard/assets/sample_plot.png"
    wgs_file = "genome-dashboard/data_bacteria.json.gz"
    mgx_file = "genome-dashboard/data_metagenome.json.gz"

    # Load existing data
    df_existing = pd.DataFrame(columns=['run_id', 'date', 'wgs_samples', 'mgx_samples'])
    if os.path.exists(csv_file) and os.path.getsize(csv_file) > 0:
        try:
            df_existing = pd.read_csv(csv_file)
        except pd.errors.EmptyDataError:
            pass

    # Count current samples
    print("Counting samples from local files...", flush=True)
    wgs_count = count_samples(wgs_file)
    mgx_count = count_samples(mgx_file)
    print(f"Found {wgs_count} WGS samples and {mgx_count} MGx samples.", flush=True)

    if wgs_count > 0 or mgx_count > 0:
        current_date = datetime.now().strftime("%Y-%m-%d")
        run_id = os.environ.get("GITHUB_RUN_ID", "")

        new_row = {
            "date": current_date,
            "wgs_samples": wgs_count,
            "mgx_samples": mgx_count,
            "run_id": run_id
        }

        # Append new data
        df_new = pd.DataFrame([new_row])
        df_combined = pd.concat([df_existing, df_new], ignore_index=True)

        # Deduplicate: keep the last entry for each date
        # (Assuming the latest run on the same day is the one we want)
        df_combined['date'] = pd.to_datetime(df_combined['date'])
        df_combined = df_combined.sort_values(by="date")

        # We convert back to string for consistent comparison/deduplication if needed,
        # but pandas drop_duplicates works on datetime objects too.
        # However, to match the CSV format which writes YYYY-MM-DD, let's normalize.
        df_combined['date_str'] = df_combined['date'].dt.strftime("%Y-%m-%d")
        df_final = df_combined.drop_duplicates(subset='date_str', keep='last')
        df_final = df_final.drop(columns=['date_str'])

        # Write back to CSV
        # Sort again just to be sure
        df_final = df_final.sort_values(by="date")
        # Ensure date format in CSV is YYYY-MM-DD
        df_final['date'] = df_final['date'].dt.strftime("%Y-%m-%d")

        df_final.to_csv(csv_file, index=False)
        print(f"✅ {csv_file} updated.", flush=True)
    else:
        print("No new data found (counts are 0).", flush=True)

    # Always generate the plot from the CSV
    generate_plot(csv_file, output_image)

if __name__ == "__main__":
    main()
