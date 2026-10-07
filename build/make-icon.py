#!/usr/bin/env python3
"""Generates the Waikiki app icon (PNG + ICO) with no third-party dependencies.

Usage: python3 build/make-icon.py
Writes src/Waikiki.App/Resources/waikiki.png (1024) and waikiki.ico (16..256).
macOS .icns is produced from the PNG by build/build-macos.sh (sips + iconutil).
"""
import math, os, struct, zlib

OUT = os.path.join(os.path.dirname(__file__), "..", "src", "Waikiki.App", "Resources")

def lerp(a, b, t):
    return a + (b - a) * t

def render(size, ss):
    """Rounded-square gradient with a white play triangle, anti-aliased by ss x ss supersampling."""
    n = size * ss
    radius = 0.225  # corner radius as a fraction of the size
    c1, c2 = (108, 92, 231), (0, 184, 217)
    # Play triangle (fractions of the size), nudged right for optical centering.
    ax, ay, bx, by, cx, cy = 0.38, 0.28, 0.38, 0.72, 0.74, 0.50
    def in_tri(px, py):
        d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by)
        d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy)
        d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay)
        neg = d1 < 0 or d2 < 0 or d3 < 0
        pos = d1 > 0 or d2 > 0 or d3 > 0
        return not (neg and pos)
    def in_round(px, py):
        qx, qy = abs(px - 0.5) - (0.5 - radius), abs(py - 0.5) - (0.5 - radius)
        if qx <= 0 or qy <= 0:
            return abs(px - 0.5) <= 0.5 and abs(py - 0.5) <= 0.5
        return qx * qx + qy * qy <= radius * radius
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            r = g = b = a = 0.0
            for sy in range(ss):
                for sx in range(ss):
                    px, py = (x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size
                    if not in_round(px, py):
                        continue
                    if in_tri(px, py):
                        cr, cg, cb = 255, 255, 255
                    else:
                        t = (px + py) / 2
                        cr, cg, cb = lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)
                    r += cr; g += cg; b += cb; a += 1
            cnt = ss * ss
            if a:
                row += bytes((int(r / a), int(g / a), int(b / a), int(255 * a / cnt)))
            else:
                row += bytes((0, 0, 0, 0))
        rows.append(bytes(row))
    return rows

def png_bytes(size, ss):
    raw = b"".join(b"\x00" + r for r in render(size, ss))
    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))

def ico_bytes(sizes):
    images = [(s, png_bytes(s, 4)) for s in sizes]
    header = struct.pack("<HHH", 0, 1, len(images))
    offset = 6 + 16 * len(images)
    entries, blobs = b"", b""
    for s, data in images:
        entries += struct.pack("<BBBBHHII", s % 256, s % 256, 0, 0, 1, 32, len(data), offset)
        offset += len(data)
        blobs += data
    return header + entries + blobs

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "waikiki.png"), "wb") as f:
        f.write(png_bytes(1024, 2))
    with open(os.path.join(OUT, "waikiki.ico"), "wb") as f:
        f.write(ico_bytes([16, 32, 48, 64, 128, 256]))
    print("wrote", os.path.normpath(OUT))
