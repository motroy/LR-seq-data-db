import os
import json

chunks_dir = "genome-dashboard/assets"
files_json_path = os.path.join(chunks_dir, "files.json")

chunk_files = [f for f in os.listdir(chunks_dir) if f.endswith(".json") and f != "files.json"]

with open(files_json_path, "w") as f:
    json.dump(chunk_files, f)

print(f"Successfully generated {files_json_path}")
