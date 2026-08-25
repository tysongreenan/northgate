#!/usr/bin/env python3
"""Solid Northgate mark: forest square + cream gate. No extra deps."""

import struct
import zlib
from pathlib import Path

FOREST = (27, 61, 47, 255)
CREAM = (244, 239, 228, 255)


def write_png(path, size, rgba_at):
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            raw.extend(rgba_at(x, y, size))
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)

    def chunk(tag, data):
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )


def draw(x, y, size):
    margin = max(1, size // 16)
    radius = max(2, size // 6)
    # rounded-rect background
    if not inside_round_rect(x, y, size, margin, radius):
        return (0, 0, 0, 0)

    # gate: two posts + lintel + small gap
    post_w = max(2, size // 6)
    inset = margin + max(2, size // 5)
    top = margin + max(2, size // 5)
    bot = size - margin - max(1, size // 10)
    lintel_h = max(2, size // 7)
    left = inset
    right = size - inset - post_w

    on_left = left <= x < left + post_w and top <= y < bot
    on_right = right <= x < right + post_w and top <= y < bot
    on_lintel = left <= x < right + post_w and top <= y < top + lintel_h
    if on_left or on_right or on_lintel:
        return CREAM
    return FOREST


def inside_round_rect(x, y, size, margin, radius):
    left = margin
    right = size - 1 - margin
    top = margin
    bot = size - 1 - margin
    if x < left or x > right or y < top or y > bot:
        return False
    corners = (
        (left + radius, top + radius, x < left + radius and y < top + radius),
        (right - radius, top + radius, x > right - radius and y < top + radius),
        (left + radius, bot - radius, x < left + radius and y > bot - radius),
        (right - radius, bot - radius, x > right - radius and y > bot - radius),
    )
    for cx, cy, active in corners:
        if active and (x - cx) ** 2 + (y - cy) ** 2 > radius ** 2:
            return False
    return True


def main():
    out = Path(__file__).resolve().parents[1] / "icons"
    out.mkdir(exist_ok=True)
    for size in (16, 32, 128):
        write_png(out / f"icon{size}.png", size, draw)
        print("wrote", out / f"icon{size}.png")


if __name__ == "__main__":
    main()
