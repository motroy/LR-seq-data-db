import os
import json
import gzip
import numpy as np
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


class BubbleChart:
    """Packed bubble chart using collision-based packing.

    Based on matplotlib gallery example:
    https://matplotlib.org/stable/gallery/misc/packed_bubbles.html
    """

    def __init__(self, area, bubble_spacing=0):
        area = np.asarray(area, dtype=float)
        r = np.sqrt(area / np.pi)

        self.bubble_spacing = bubble_spacing
        self.bubbles = np.ones((len(area), 4))
        self.bubbles[:, 2] = r
        self.bubbles[:, 3] = area
        self.maxstep = 2 * self.bubbles[:, 2].max() + self.bubble_spacing
        self.step_dist = self.maxstep / 2

        length = np.ceil(np.sqrt(len(self.bubbles)))
        grid = np.arange(length) * self.maxstep
        gx, gy = np.meshgrid(grid, grid)
        self.bubbles[:, 0] = gx.flatten()[:len(self.bubbles)]
        self.bubbles[:, 1] = gy.flatten()[:len(self.bubbles)]

        self.com = self.center_of_mass()

    def center_of_mass(self):
        return np.average(self.bubbles[:, :2], axis=0, weights=self.bubbles[:, 3])

    def center_distance(self, bubble, bubbles):
        return np.hypot(bubble[0] - bubbles[:, 0], bubble[1] - bubbles[:, 1])

    def outline_distance(self, bubble, bubbles):
        center_distance = self.center_distance(bubble, bubbles)
        return center_distance - bubble[2] - bubbles[:, 2] - self.bubble_spacing

    def check_collisions(self, bubble, bubbles):
        distance = self.outline_distance(bubble, bubbles)
        return len(distance[distance < 0])

    def collides_with(self, bubble, bubbles):
        distance = self.outline_distance(bubble, bubbles)
        return np.argmin(distance, keepdims=True)

    def collapse(self, n_iterations=50):
        for _i in range(n_iterations):
            moves = 0
            for i in range(len(self.bubbles)):
                rest_bub = np.delete(self.bubbles, i, 0)
                dir_vec = self.com - self.bubbles[i, :2]
                dir_vec = dir_vec / np.sqrt(dir_vec.dot(dir_vec))
                new_point = self.bubbles[i, :2] + dir_vec * self.step_dist
                new_bubble = np.append(new_point, self.bubbles[i, 2:4])

                if not self.check_collisions(new_bubble, rest_bub):
                    self.bubbles[i, :] = new_bubble
                    self.com = self.center_of_mass()
                    moves += 1
                else:
                    for colliding in self.collides_with(new_bubble, rest_bub):
                        dir_vec = rest_bub[colliding, :2] - self.bubbles[i, :2]
                        dir_vec = dir_vec / np.sqrt(dir_vec.dot(dir_vec))
                        orth = np.array([dir_vec[1], -dir_vec[0]])
                        new_point1 = self.bubbles[i, :2] + orth * self.step_dist
                        new_point2 = self.bubbles[i, :2] - orth * self.step_dist
                        dist1 = self.center_distance(self.com, np.array([new_point1]))
                        dist2 = self.center_distance(self.com, np.array([new_point2]))
                        new_point = new_point1 if dist1 < dist2 else new_point2
                        new_bubble = np.append(new_point, self.bubbles[i, 2:4])
                        if not self.check_collisions(new_bubble, rest_bub):
                            self.bubbles[i, :] = new_bubble
                            self.com = self.center_of_mass()

            if moves / len(self.bubbles) < 0.1:
                self.step_dist = self.step_dist / 2

    def plot(self, ax, labels, colors):
        for i in range(len(self.bubbles)):
            circ = plt.Circle(
                self.bubbles[i, :2], self.bubbles[i, 2],
                facecolor=colors[i], alpha=0.8, edgecolor='white', linewidth=1.5)
            ax.add_patch(circ)
            # Multi-line label: organism name + count
            r = self.bubbles[i, 2]
            fontsize = max(6, min(10, r * 0.55))
            ax.text(*self.bubbles[i, :2], labels[i],
                    horizontalalignment='center', verticalalignment='center',
                    fontsize=fontsize, fontweight='bold', color='white',
                    wrap=True)


def _format_bubble_label(name, count):
    """Format organism name and count for bubble label, wrapping long names."""
    # Shorten very long names
    if len(name) > 20:
        parts = name.split()
        if len(parts) >= 2:
            name = parts[0][:1] + '. ' + ' '.join(parts[1:])
    return f"{name}\n{count:,}"


def generate_organism_bubble_plot(wgs_file, mgx_file, output_image):
    """Generates a packed bubble chart showing top 10 organisms in WGS and MGx data."""
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

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(18, 9),
                                    subplot_kw=dict(aspect="equal"))

    # --- WGS packed bubbles ---
    if top_wgs:
        wgs_areas = [cnt for _, cnt in top_wgs]
        wgs_labels = [_format_bubble_label(org, cnt) for org, cnt in top_wgs]
        wgs_colors = [COLOR_WGS] * len(top_wgs)

        bc_wgs = BubbleChart(area=wgs_areas, bubble_spacing=0.1)
        bc_wgs.collapse()
        bc_wgs.plot(ax1, wgs_labels, wgs_colors)
        ax1.axis("off")
        ax1.relim()
        ax1.autoscale_view()

    ax1.set_title("Top 10 WGS Organisms", fontsize=14, fontweight='bold',
                  color=COLOR_WGS, pad=15)

    # --- MGx packed bubbles ---
    if top_mgx:
        mgx_areas = [cnt for _, cnt in top_mgx]
        mgx_labels = [_format_bubble_label(org, cnt) for org, cnt in top_mgx]
        mgx_colors = [COLOR_MGX] * len(top_mgx)

        bc_mgx = BubbleChart(area=mgx_areas, bubble_spacing=0.1)
        bc_mgx.collapse()
        bc_mgx.plot(ax2, mgx_labels, mgx_colors)
        ax2.axis("off")
        ax2.relim()
        ax2.autoscale_view()

    ax2.set_title("Top 10 MGx Organisms", fontsize=14, fontweight='bold',
                  color=COLOR_MGX, pad=15)

    fig.suptitle("Top Organisms by Sample Count", fontsize=16, fontweight='bold', y=0.97)
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
