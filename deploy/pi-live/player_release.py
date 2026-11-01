#!/usr/bin/env python3
"""Build signed player bundles and stage verified bundles; never activate them.

Requires the system OpenSSL CLI. Private keys are build-time inputs only.
The trusted public key must be supplied independently of a candidate bundle.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import tempfile

FILES = ("opencourt-player", "player.html")
MAX_FILE = 2 * 1024 * 1024
MAX_MANIFEST = 16 * 1024


def regular_bytes(path, limit):
    if path.is_symlink() or not path.is_file():
        raise ValueError(f"Expected regular file: {path.name}")
    with path.open("rb") as stream:
        data = stream.read(limit + 1)
    if len(data) > limit:
        raise ValueError(f"File too large: {path.name}")
    return data


def no_duplicate_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate manifest key")
        result[key] = value
    return result


def validate_manifest(data, architecture):
    manifest = json.loads(data, object_pairs_hook=no_duplicate_keys)
    if not isinstance(manifest, dict) or set(manifest) != {
        "schemaVersion", "release", "architecture", "files"
    }:
        raise ValueError("Invalid manifest fields")
    if type(manifest["schemaVersion"]) is not int or manifest["schemaVersion"] != 1:
        raise ValueError("Unsupported manifest version")
    if not isinstance(manifest["release"], str) or not re.fullmatch(
        r"[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}", manifest["release"]
    ):
        raise ValueError("Invalid release identifier")
    if manifest["architecture"] != architecture:
        raise ValueError("Unsupported release architecture")
    if not isinstance(manifest["files"], dict) or set(manifest["files"]) != set(FILES):
        raise ValueError("Invalid release file allowlist")
    for entry in manifest["files"].values():
        if not isinstance(entry, dict) or set(entry) != {"size", "sha256"}:
            raise ValueError("Invalid file entry")
        if type(entry["size"]) is not int or not 0 < entry["size"] <= MAX_FILE:
            raise ValueError("Invalid file size")
        if not isinstance(entry["sha256"], str) or not re.fullmatch(r"[0-9a-f]{64}", entry["sha256"]):
            raise ValueError("Invalid file digest")
    return manifest


def openssl(*args):
    subprocess.run(["openssl", *map(str, args)], check=True,
                   stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def durable_write(path, data, mode=0o644):
    with path.open("xb") as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    path.chmod(mode)


def sync_directory(path):
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def build(source, destination, release, key, architecture="aarch64"):
    contents = {name: regular_bytes(source / name, MAX_FILE) for name in FILES}
    manifest = {"schemaVersion": 1, "release": release, "architecture": architecture,
                "files": {name: {"size": len(data), "sha256": hashlib.sha256(data).hexdigest()}
                          for name, data in contents.items()}}
    encoded = (json.dumps(manifest, sort_keys=True, separators=(",", ":")) + "\n").encode()
    validate_manifest(encoded, architecture)
    destination.mkdir(parents=True, exist_ok=False)
    try:
        for name, data in contents.items():
            durable_write(destination / name, data, 0o755 if name == "opencourt-player" else 0o644)
        durable_write(destination / "manifest.json", encoded)
        openssl("dgst", "-sha256", "-sign", key, "-out", destination / "manifest.sig",
                destination / "manifest.json")
    except BaseException:
        shutil.rmtree(destination)
        raise
    return manifest


def stage(bundle, releases, public_key, architecture=None):
    architecture = architecture or platform.machine()
    if bundle.is_symlink() or not bundle.is_dir():
        raise ValueError("Expected regular bundle directory")
    if {item.name for item in bundle.iterdir()} != {*FILES, "manifest.json", "manifest.sig"}:
        raise ValueError("Unexpected release bundle files")
    # Verify the exact bytes we parse, independently of changes to the input directory.
    encoded = regular_bytes(bundle / "manifest.json", MAX_MANIFEST)
    signature = regular_bytes(bundle / "manifest.sig", 1024)
    with tempfile.TemporaryDirectory(prefix="opencourt-signature-") as scratch:
        scratch = Path(scratch)
        durable_write(scratch / "manifest.json", encoded)
        durable_write(scratch / "manifest.sig", signature)
        openssl("dgst", "-sha256", "-verify", public_key, "-signature",
                scratch / "manifest.sig", scratch / "manifest.json")
    manifest = validate_manifest(encoded, architecture)
    releases.mkdir(parents=True, exist_ok=True)
    target = releases / manifest["release"]
    if target.exists() or target.is_symlink():
        raise ValueError("Release already exists; immutable releases cannot be overwritten")
    required = sum(item["size"] for item in manifest["files"].values()) + 16 * 1024 * 1024
    if shutil.disk_usage(releases).free < required:
        raise ValueError("Insufficient staging storage")
    temporary = Path(tempfile.mkdtemp(prefix=".staging-", dir=releases))
    try:
        for name, entry in manifest["files"].items():
            data = regular_bytes(bundle / name, MAX_FILE)
            if len(data) != entry["size"] or hashlib.sha256(data).hexdigest() != entry["sha256"]:
                raise ValueError(f"Release integrity check failed: {name}")
            durable_write(temporary / name, data, 0o755 if name == "opencourt-player" else 0o644)
        durable_write(temporary / "manifest.json", encoded)
        durable_write(temporary / "manifest.sig", signature)
        sync_directory(temporary)
        temporary.rename(target)
        sync_directory(releases)
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)
    return target


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    package = commands.add_parser("build")
    package.add_argument("--source", type=Path, required=True)
    package.add_argument("--output", type=Path, required=True)
    package.add_argument("--release", required=True)
    package.add_argument("--private-key", type=Path, required=True)
    package.add_argument("--architecture", default="aarch64")
    verify = commands.add_parser("stage")
    verify.add_argument("--bundle", type=Path, required=True)
    verify.add_argument("--releases", type=Path, required=True)
    verify.add_argument("--public-key", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "build":
        build(args.source, args.output, args.release, args.private_key, args.architecture)
        print(f"Built release {args.release}")
    else:
        result = stage(args.bundle, args.releases, args.public_key)
        print(f"Verified and staged {result.name}; active player unchanged")


if __name__ == "__main__":
    main()
