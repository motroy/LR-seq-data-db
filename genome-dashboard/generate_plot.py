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
    """Generates a line plot from the historical data, including hybrid sample counts."""
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
    plt.plot(df["date"], df["wgs_samples"], marker='o', linestyle='-',
             color=COLOR_WGS, label="WGS Samples")
    plt.plot(df["date"], df["mgx_samples"], marker='o', linestyle='-',
             color=COLOR_MGX, label="MGx Samples")

    # Plot hybrid sample lines (dotted, same colors) if columns exist
    if "hybrid_wgs" in df.columns:
        plt.plot(df["date"], df["hybrid_wgs"], marker='s', linestyle=':',
                 color=COLOR_WGS, label="Hybrid WGS", alpha=0.8)
    if "hybrid_mgx" in df.columns:
        plt.plot(df["date"], df["hybrid_mgx"], marker='s', linestyle=':',
                 color=COLOR_MGX, label="Hybrid MGx", alpha=0.8)

    plt.title("Number of Samples Over Time")
    plt.xlabel("Date")
    plt.ylabel("Number of Samples")
    plt.xticks(rotation='vertical')
    plt.grid(True)
    plt.legend()
    plt.tight_layout()

    plt.savefig(output_image, dpi=150)
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

    # Collect all unique organisms across both top lists
    all_organisms = []
    seen = set()
    for org, _ in top_wgs:
        if org not in seen:
            all_organisms.append(org)
            seen.add(org)
    for org, _ in top_mgx:
        if org not in seen:
            all_organisms.append(org)
            seen.add(org)

    # Build data for both categories per organism
    wgs_vals = [wgs_counts.get(org, 0) for org in all_organisms]
    mgx_vals = [mgx_counts.get(org, 0) for org in all_organisms]

    # Determine which top list each organism belongs to
    wgs_top_set = {org for org, _ in top_wgs}
    mgx_top_set = {org for org, _ in top_mgx}

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(18, 8))

    # --- WGS panel (top 10 WGS organisms) ---
    wgs_orgs = [org for org, _ in top_wgs]
    wgs_top_counts = [cnt for _, cnt in top_wgs]
    # Also show their MGx counts for context
    wgs_mgx_counts = [mgx_counts.get(org, 0) for org in wgs_orgs]

    y_pos = list(range(len(wgs_orgs)))

    # Scale bubble sizes
    max_count = max(max(wgs_top_counts), max(wgs_mgx_counts)) if wgs_mgx_counts else max(wgs_top_counts)
    scale = 800 / max_count if max_count > 0 else 1

    ax1.scatter(
        [1] * len(wgs_orgs), y_pos,
        s=[c * scale for c in wgs_top_counts],
        color=COLOR_WGS, alpha=0.7, edgecolors='white', linewidth=0.5,
        label="WGS"
    )
    ax1.scatter(
        [2] * len(wgs_orgs), y_pos,
        s=[c * scale for c in wgs_mgx_counts],
        color=COLOR_MGX, alpha=0.7, edgecolors='white', linewidth=0.5,
        label="MGx"
    )

    # Add count labels
    for i, (wc, mc) in enumerate(zip(wgs_top_counts, wgs_mgx_counts)):
        ax1.annotate(f"{wc:,}", (1, i), textcoords="offset points",
                     xytext=(0, -5), ha='center', fontsize=7, color='black')
        if mc > 0:
            ax1.annotate(f"{mc:,}", (2, i), textcoords="offset points",
                         xytext=(0, -5), ha='center', fontsize=7, color='black')

    ax1.set_yticks(y_pos)
    ax1.set_yticklabels(wgs_orgs, fontsize=9)
    ax1.set_xticks([1, 2])
    ax1.set_xticklabels(["WGS", "MGx"])
    ax1.set_xlim(0.3, 2.7)
    ax1.invert_yaxis()
    ax1.set_title("Top 10 WGS Organisms", fontsize=12, fontweight='bold')
    ax1.legend(loc='lower right', fontsize=8)
    ax1.grid(axis='x', alpha=0.3)

    # --- MGx panel (top 10 MGx organisms) ---
    mgx_orgs = [org for org, _ in top_mgx]
    mgx_top_counts = [cnt for _, cnt in top_mgx]
    mgx_wgs_counts = [wgs_counts.get(org, 0) for org in mgx_orgs]

    y_pos2 = list(range(len(mgx_orgs)))

    max_count2 = max(max(mgx_top_counts), max(mgx_wgs_counts)) if mgx_wgs_counts else max(mgx_top_counts)
    scale2 = 800 / max_count2 if max_count2 > 0 else 1

    ax2.scatter(
        [1] * len(mgx_orgs), y_pos2,
        s=[c * scale2 for c in mgx_wgs_counts],
        color=COLOR_WGS, alpha=0.7, edgecolors='white', linewidth=0.5,
        label="WGS"
    )
    ax2.scatter(
        [2] * len(mgx_orgs), y_pos2,
        s=[c * scale2 for c in mgx_top_counts],
        color=COLOR_MGX, alpha=0.7, edgecolors='white', linewidth=0.5,
        label="MGx"
    )

    for i, (wc, mc) in enumerate(zip(mgx_wgs_counts, mgx_top_counts)):
        if wc > 0:
            ax2.annotate(f"{wc:,}", (1, i), textcoords="offset points",
                         xytext=(0, -5), ha='center', fontsize=7, color='black')
        ax2.annotate(f"{mc:,}", (2, i), textcoords="offset points",
                     xytext=(0, -5), ha='center', fontsize=7, color='black')

    ax2.set_yticks(y_pos2)
    ax2.set_yticklabels(mgx_orgs, fontsize=9)
    ax2.set_xticks([1, 2])
    ax2.set_xticklabels(["WGS", "MGx"])
    ax2.set_xlim(0.3, 2.7)
    ax2.invert_yaxis()
    ax2.set_title("Top 10 MGx Organisms", fontsize=12, fontweight='bold')
    ax2.legend(loc='lower right', fontsize=8)
    ax2.grid(axis='x', alpha=0.3)

    fig.suptitle("Top Organisms by Sample Count", fontsize=14, fontweight='bold', y=0.98)
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
