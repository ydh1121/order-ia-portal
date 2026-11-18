"""Regenerate scoped account, navigation and onboarding changes without resetting previously reviewed variants."""
import argparse
import importlib.util
import shutil
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("review_family", HERE / "refresh-review-family.py")
family = importlib.util.module_from_spec(spec)
spec.loader.exec_module(family)

def refresh_panels(source):
    original_catalog = family.UI / "catalog.gen.mjs"
    original_runtime = family.UI / "runtime.gen.mjs"
    data = family.load_module(original_catalog)
    runtime = family.load_module(original_runtime)
    before = runtime["runtimes"].copy()
    core = (source / "src/core.js").read_text()
    with tempfile.TemporaryDirectory() as tmp:
        catalog_copy = Path(tmp) / original_catalog.name
        shutil.copyfile(original_catalog, catalog_copy)
        shutil.copyfile(original_runtime, Path(tmp) / original_runtime.name)
        for source_family in ("onboarding", "navigation"):
            family.refresh(source, source_family, catalog_copy)
        built = family.load_module(catalog_copy)
        rows = {row["id"]:row for row in built["catalog"]}
        for row in data["catalog"]:
            if row["screen"] in ("profile", "onboarding"):
                current = rows[row["id"]]["current"]
                data["frames"][current] = built["frames"][current]
                row["current"] = current
                row["authoredChange"] = True

    updated = {}
    for source_family, key in (("account","accountFeedback"),("navigation","navigation"),("onboarding","onboarding")):
        revised = core + "\n" + (HERE / "authored" / (source_family+".js")).read_text()
        previous = before[key]
        for variant, bundle in before.items():
            if variant == key or bundle.startswith(previous+";"):
                updated[variant] = revised + bundle[len(previous):]
    runtime["runtimes"].update(updated)
    for row in data["catalog"]:
        key = row.get("runtimeFamily")
        if key not in updated:
            continue
        fingerprint = family.digest(runtime["frameCode"].removeprefix("function ")+runtime["runtimes"][key])
        row["hashes"] = {w:family.digest("|".join((row["id"],"current",row["current"],data["cssHash"],w,fingerprint))) for w in row["hashes"]}
    used = {row[k] for row in data["catalog"] for k in ("previous","current")}
    data["frames"] = {k:v for k,v in data["frames"].items() if k in used}
    family.write_module(original_catalog,data)
    family.write_module(original_runtime,runtime)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    refresh_panels(parser.parse_args().source.resolve())
