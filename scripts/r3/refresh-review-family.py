"""Refresh a recovered family against the pinned catalog, preserving all other review targets."""
import argparse
import base64
import gzip
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

from review_document import prepare

HERE = Path(__file__).resolve().parent
UI = HERE.parents[1] / "src/server/r3-ui"
FAMILIES = {
    "account": {"login", "signup", "password", "otp", "terms"},
    "business": {"business", "proof", "signature"},
    "navigation": {"passes", "search", "profile", "drawer"},
}


def digest(text):
    return hashlib.sha256(text.encode()).hexdigest()


def load_module(path):
    values = {}
    for line in path.read_text().splitlines():
        if line.startswith("export const "):
            name, encoded = line[len("export const "):].split("=", 1)
            values[name] = json.loads(encoded.rstrip(";"))
    return values


def write_module(path, values):
    banner = [line for line in path.read_text().splitlines() if line.startswith("//")]
    for key, value in values.items():
        encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        banner.append(f"export const {key}={encoded};")
    path.write_text("\n".join(banner) + "\n")


def refresh(source, family, catalog_file):
    runtime_file = catalog_file.with_name("runtime.gen.mjs")
    catalog = load_module(catalog_file)
    runtime = load_module(runtime_file)
    script_file = HERE / "authored" / (family + ".js")
    style = script_file.with_suffix(".css").read_text()
    core = (source / "src/core.js").read_text()
    if not runtime["runtimes"]["business"].startswith(core + "\n"):
        raise ValueError("Private source core.js does not match the pinned core runtime.")
    # Both runtime and generated shapes use the same reviewed source file.
    family_script = core + "\n" + script_file.read_text()
    with tempfile.TemporaryDirectory() as temporary:
        result = Path(temporary) / "frames.json"
        subprocess.run(["node", str(HERE / "compile-catalog.mjs"), str(source), str(result),
                        family, str(script_file)], check=True)
        frames = {row["id"]: row for row in json.loads(result.read_text())
                  if row["screen"] in FAMILIES[family]}
    target_rows = [row for row in catalog["catalog"] if row["screen"] in FAMILIES[family]]
    if set(frames) != {row["id"] for row in target_rows}:
        raise ValueError("Recovered variants/states differ from the pinned family.")
    frame_function = runtime["frameCode"].removeprefix("function ")
    script_hash = digest(frame_function + family_script)
    data_keys = ("detail hour minute on pass-id search-detail site sort suggestion tag view".split()
                 if family == "navigation" else ())
    runtime_key = family
    if family == "account":
        # Keep all existing login/empty targets and their current runtime available:
        # this is the family that already contains a verified OWNER pin.
        target_rows = [r for r in target_rows if (r["screen"],r["state"]) != ("login","empty")]
        data_keys = ("opt-choice",)
        runtime_key = "accountFeedback"
    for row in target_rows:
        active = frames[row["id"]]
        # Include current styles in the scoped body. The immutable shared stylesheet and
        # previous bodies retain their identities for all existing reviews.
        body = prepare("<style>" + style + "</style>" + active["body"], row["screen"], row["state"], extra_data=data_keys)
        body_hash = digest(body)
        catalog["frames"][body_hash] = base64.b64encode(
            gzip.compress(body.encode(), mtime=0)).decode()
        row["current"] = body_hash
        row["runtimeFamily"] = runtime_key
        row["authoredChange"] = row["previous"] != body_hash
        row["hashes"] = {width: digest("|".join((row["id"], "current", body_hash,
            catalog["cssHash"], width, script_hash))) for width in row["hashes"]}
    used = {row[side] for row in catalog["catalog"] for side in ("current", "previous")}
    catalog["frames"] = {key: packed for key, packed in catalog["frames"].items() if key in used}
    runtime["runtimes"][runtime_key] = family_script
    write_module(catalog_file, catalog)
    write_module(runtime_file, runtime)
    print(json.dumps({"family": family, "updated": len(target_rows), "states": len(frames)}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True, help="Private QA_PROJECT directory")
    parser.add_argument("--family", choices=FAMILIES, required=True)
    parser.add_argument("--catalog", type=Path, default=UI / "catalog.gen.mjs")
    options = parser.parse_args()
    refresh(options.source.resolve(), options.family, options.catalog.resolve())
