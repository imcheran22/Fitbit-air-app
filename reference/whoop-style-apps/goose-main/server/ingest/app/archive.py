"""Raw batch archival: newline-delimited frame hex, zstd-compressed, content-addressed.
Pure filesystem — no DB. One file per batch under <root>/<device>/<day>/<batch>.zst."""
import hashlib
import os
import re

import zstandard

_SAFE_ID = re.compile(r'^[A-Za-z0-9_-]+$')


def _validate_path_component(value: str, name: str) -> None:
    """Reject values that could cause path traversal or unexpected filesystem behaviour."""
    if not value:
        raise ValueError(f"{name} must not be empty")
    if not _SAFE_ID.match(value):
        raise ValueError(
            f"{name} contains characters outside the allowed set [A-Za-z0-9_-]: {value!r}"
        )


def write_raw_batch(root: str, device_id: str, batch_id: str, day: str,
                    frames: list[bytes]) -> dict:
    """Write frames (as newline-delimited hex) to a zstd file. Returns metadata for the
    raw_batches index: file_path, sha256, byte_size, packet_count."""
    _validate_path_component(device_id, "device_id")
    _validate_path_component(batch_id, "batch_id")
    out_dir = os.path.join(root, device_id, day)
    os.makedirs(out_dir, exist_ok=True)
    file_path = os.path.join(out_dir, f"{batch_id}.zst")
    payload = ("\n".join(f.hex() for f in frames)).encode()
    compressed = zstandard.ZstdCompressor(level=10).compress(payload)
    # atomic-ish write
    tmp = file_path + ".tmp"
    with open(tmp, "wb") as fh:
        fh.write(compressed)
    os.replace(tmp, file_path)
    return {
        "file_path": file_path,
        "sha256": hashlib.sha256(compressed).hexdigest(),
        "byte_size": len(compressed),
        "packet_count": len(frames),
    }
