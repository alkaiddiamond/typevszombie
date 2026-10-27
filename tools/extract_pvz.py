"""Extract a local PopCap PAK and produce an inventory without altering it."""
import argparse
import hashlib
import json
import struct
from collections import Counter
from pathlib import Path, PureWindowsPath


def extract(source: Path, destination: Path):
    original = source.read_bytes()
    data = original.translate(bytes(i ^ 0xF7 for i in range(256)))
    if data[:8] != bytes.fromhex("c04ac0ba00000000"):
        raise ValueError("Unsupported PAK header")
    position = 8
    entries = []
    names = set()
    while True:
        flag = data[position]
        position += 1
        if flag & 0x80:
            break
        length = data[position]
        position += 1
        raw_name = data[position:position + length]
        try:
            name = raw_name.decode("utf-8")
        except UnicodeDecodeError:
            name = raw_name.decode("gbk")
        position += length
        size, timestamp = struct.unpack_from("<IQ", data, position)
        position += 12
        relative = PureWindowsPath(name)
        if relative.is_absolute() or relative.drive or any(p in ("..", ".") for p in relative.parts):
            raise ValueError(f"Unsafe archive path: {name}")
        normalized = relative.as_posix()
        if normalized.casefold() in names:
            raise ValueError(f"Duplicate path: {name}")
        names.add(normalized.casefold())
        entries.append({"path": normalized, "bytes": size})
    if position + sum(e["bytes"] for e in entries) != len(data):
        raise ValueError("Archive size does not match its catalog")
    root = destination.resolve()
    # Validate all destinations before writing any asset.
    for entry in entries:
        target = (root / entry["path"]).resolve()
        if not target.is_relative_to(root):
            raise ValueError(f"Path escapes output: {target}")
        if target.exists():
            raise FileExistsError(target)
    for entry in entries:
        target = root / entry["path"]
        target.parent.mkdir(parents=True, exist_ok=True)
        payload = data[position:position + entry["bytes"]]
        target.write_bytes(payload)
        if target.read_bytes() != payload:
            raise IOError(f"Verification failed: {target}")
        entry["sha256"] = hashlib.sha256(payload).hexdigest()
        position += entry["bytes"]
    report = {
        "source": str(source),
        "source_sha256": hashlib.sha256(original).hexdigest(),
        "total_files": len(entries),
        "extensions": dict(Counter(Path(e["path"]).suffix for e in entries)),
        "files": entries,
    }
    root.parent.mkdir(parents=True, exist_ok=True)
    (root.parent / "inventory.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    if hashlib.sha256(source.read_bytes()).hexdigest() != report["source_sha256"]:
        raise IOError("Source changed during extraction")
    print(json.dumps({k: v for k, v in report.items() if k != "files"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    extract(args.source, args.destination)
