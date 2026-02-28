import os
import json
import gzip
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
from collections import Counter
from datetime import datetime

# Consistent colors for WGS and MGx across plots
COLOR_WGS = "#1f77b4"
COLOR_MGX = "#ff7f0e"


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


def load_json_gz(path):
    """Load and return data from a gzipped JSON file."""
    if not os.path.exists(path):
        return []
    try:
        with gzip.open(path, 'rt', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error reading {path}: {e}", flush=True)
        return []


def generate_plot(csv_file, output_image):
    """Generates a line plot from the historical data with dual y-axes for hybrid visibility."""
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

    has_hybrid = ("hybrid_wgs" in df.columns or "hybrid_mgx" in df.columns)
    # Check if any hybrid values are non-zero
    has_hybrid_data = has_hybrid and (
        (df.get("hybrid_wgs", pd.Series([0])).max() > 0) or
        (df.get("hybrid_mgx", pd.Series([0])).max() > 0)
    )

    fig, ax1 = plt.subplots(figsize=(10, 6))

    # Primary y-axis: WGS and MGx
    l1, = ax1.plot(df["date"], df["wgs_samples"], marker='o', linestyle='-',
                   color=COLOR_WGS, label="WGS Samples", linewidth=2)
    l2, = ax1.plot(df["date"], df["mgx_samples"], marker='o', linestyle='-',
                   color=COLOR_MGX, label="MGx Samples", linewidth=2)
    ax1.set_xlabel("Date")
    ax1.set_ylabel("Number of Samples (WGS / MGx)", color='black')
    ax1.tick_params(axis='x', rotation=90)
    ax1.grid(True, alpha=0.3)

    lines = [l1, l2]

    # Secondary y-axis: Hybrid counts (much smaller scale)
    if has_hybrid_data:
        ax2 = ax1.twinx()
        if "hybrid_wgs" in df.columns:
            l3, = ax2.plot(df["date"], df["hybrid_wgs"], marker='s', linestyle=':',
                           color=COLOR_WGS, label="Hybrid WGS", alpha=0.85,
                           linewidth=2, markersize=7)
            lines.append(l3)
        if "hybrid_mgx" in df.columns:
            l4, = ax2.plot(df["date"], df["hybrid_mgx"], marker='s', linestyle=':',
                           color=COLOR_MGX, label="Hybrid MGx", alpha=0.85,
                           linewidth=2, markersize=7)
            lines.append(l4)
        ax2.set_ylabel("Number of Hybrid Samples", color='gray')
        ax2.tick_params(axis='y', labelcolor='gray')

    plt.title("Number of Samples Over Time")
    labels = [l.get_label() for l in lines]
    ax1.legend(lines, labels, loc='upper left')
    fig.tight_layout()

    plt.savefig(output_image, dpi=150)
    plt.close()
    print(f"✅ Plot saved to {output_image}", flush=True)


def generate_organism_bubble_plot(wgs_file, mgx_file, output_image):
    """Generates a bubble plot showing top 10 organisms in WGS and top 10 in MGx data."""
    wgs_data = load_json_gz(wgs_file)
    mgx_data = load_json_gz(mgx_file)

    if not wgs_data and not mgx_data:
        print("Warning: No data for organism bubble plot.", flush=True)
        return

    # Count organisms
    wgs_counts = Counter(r['scientific_name'] for r in wgs_data if r.get('scientific_name'))
    mgx_counts = Counter(r['scientific_name'] for r in mgx_data if r.get('scientific_name'))

    top_wgs = wgs_counts.most_common(10)
    top_mgx = mgx_counts.most_common(10)

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(16, 7))

    # Shared bubble sizing: use sqrt scaling for better visual proportionality
    global_max = max(
        top_wgs[0][1] if top_wgs else 1,
        top_mgx[0][1] if top_mgx else 1
    )
    max_bubble = 1500  # max bubble area in points^2

    def bubble_size(count):
        return max((count / global_max) * max_bubble, 40)

    # --- WGS panel ---
    wgs_orgs = [org for org, _ in top_wgs]
    wgs_top_counts = [cnt for _, cnt in top_wgs]
    y_pos = list(range(len(wgs_orgs)))

    ax1.scatter(
        [0.5] * len(wgs_orgs), y_pos,
        s=[bubble_size(c) for c in wgs_top_counts],
        color=COLOR_WGS, alpha=0.75, edgecolors='white', linewidth=1.5,
        zorder=3
    )
    for i, cnt in enumerate(wgs_top_counts):
        ax1.annotate(f"{cnt:,}", (0.5, i), ha='center', va='center',
                     fontsize=8, fontweight='bold', color='white', zorder=4)

    ax1.set_yticks(y_pos)
    ax1.set_yticklabels(wgs_orgs, fontsize=10, style='italic')
    ax1.set_xticks([])
    ax1.set_xlim(-0.3, 1.3)
    ax1.invert_yaxis()
    ax1.set_title("Top 10 WGS Organisms", fontsize=13, fontweight='bold', color=COLOR_WGS)
    ax1.spines['top'].set_visible(False)
    ax1.spines['right'].set_visible(False)
    ax1.spines['bottom'].set_visible(False)
    ax1.grid(axis='y', alpha=0.2, linestyle='--')

    # --- MGx panel ---
    mgx_orgs = [org for org, _ in top_mgx]
    mgx_top_counts = [cnt for _, cnt in top_mgx]
    y_pos2 = list(range(len(mgx_orgs)))

    ax2.scatter(
        [0.5] * len(mgx_orgs), y_pos2,
        s=[bubble_size(c) for c in mgx_top_counts],
        color=COLOR_MGX, alpha=0.75, edgecolors='white', linewidth=1.5,
        zorder=3
    )
    for i, cnt in enumerate(mgx_top_counts):
        ax2.annotate(f"{cnt:,}", (0.5, i), ha='center', va='center',
                     fontsize=8, fontweight='bold', color='white', zorder=4)

    ax2.set_yticks(y_pos2)
    ax2.set_yticklabels(mgx_orgs, fontsize=10, style='italic')
    ax2.set_xticks([])
    ax2.set_xlim(-0.3, 1.3)
    ax2.invert_yaxis()
    ax2.set_title("Top 10 MGx Organisms", fontsize=13, fontweight='bold', color=COLOR_MGX)
    ax2.spines['top'].set_visible(False)
    ax2.spines['right'].set_visible(False)
    ax2.spines['bottom'].set_visible(False)
    ax2.grid(axis='y', alpha=0.2, linestyle='--')

    fig.suptitle("Top Organisms by Sample Count", fontsize=15, fontweight='bold', y=0.98)
    plt.tight_layout()
    plt.savefig(output_image, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"✅ Organism bubble plot saved to {output_image}", flush=True)


def main():
    csv_file = "genome-dashboard/sample_counts.csv"
    output_image = "genome-dashboard/assets/sample_plot.png"
    organism_plot = "genome-dashboard/assets/organism_bubble_plot.png"
    wgs_file = "genome-dashboard/data_bacteria.json.gz"
    mgx_file = "genome-dashboard/data_metagenome.json.gz"
    hybrid_wgs_file = "genome-dashboard/hybrid_wgs.json.gz"
    hybrid_mgx_file = "genome-dashboard/hybrid_mgx.json.gz"

    # Load existing data
    df_existing = pd.DataFrame(columns=['run_id', 'date', 'wgs_samples', 'mgx_samples',
                                        'hybrid_wgs', 'hybrid_mgx'])
    if os.path.exists(csv_file) and os.path.getsize(csv_file) > 0:
        try:
            df_existing = pd.read_csv(csv_file)
        except pd.errors.EmptyDataError:
            pass

    # Ensure hybrid columns exist in old data
    for col in ['hybrid_wgs', 'hybrid_mgx']:
        if col not in df_existing.columns:
            df_existing[col] = 0

    # Count current samples
    print("Counting samples from local files...", flush=True)
    wgs_count = count_samples(wgs_file)
    mgx_count = count_samples(mgx_file)
    hybrid_wgs_count = count_samples(hybrid_wgs_file)
    hybrid_mgx_count = count_samples(hybrid_mgx_file)
    print(f"Found {wgs_count} WGS samples, {mgx_count} MGx samples, "
          f"{hybrid_wgs_count} hybrid WGS, {hybrid_mgx_count} hybrid MGx.", flush=True)

    if wgs_count > 0 or mgx_count > 0:
        current_date = datetime.now().strftime("%Y-%m-%d")
        run_id = os.environ.get("GITHUB_RUN_ID", "")

        new_row = {
            "date": current_date,
            "wgs_samples": wgs_count,
            "mgx_samples": mgx_count,
            "hybrid_wgs": hybrid_wgs_count,
            "hybrid_mgx": hybrid_mgx_count,
            "run_id": run_id
        }

        # Append new data
        df_new = pd.DataFrame([new_row])
        df_combined = pd.concat([df_existing, df_new], ignore_index=True)

        # Deduplicate: keep the last entry for each date
        df_combined['date'] = pd.to_datetime(df_combined['date'])
        df_combined = df_combined.sort_values(by="date")

        df_combined['date_str'] = df_combined['date'].dt.strftime("%Y-%m-%d")
        df_final = df_combined.drop_duplicates(subset='date_str', keep='last')
        df_final = df_final.drop(columns=['date_str'])

        # Write back to CSV
        df_final = df_final.sort_values(by="date")
        df_final['date'] = df_final['date'].dt.strftime("%Y-%m-%d")

        # Ensure hybrid columns are integer
        for col in ['hybrid_wgs', 'hybrid_mgx']:
            df_final[col] = df_final[col].fillna(0).astype(int)

        df_final.to_csv(csv_file, index=False)
        print(f"✅ {csv_file} updated.", flush=True)
    else:
        print("No new data found (counts are 0).", flush=True)

    # Generate the sample growth plot
    generate_plot(csv_file, output_image)

    # Generate the organism bubble plot
    generate_organism_bubble_plot(wgs_file, mgx_file, organism_plot)


if __name__ == "__main__":
    main()
