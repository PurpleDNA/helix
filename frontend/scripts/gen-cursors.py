"""Generate standard-shaped arrow + pointing-hand cursors in the Helix palette.

Pure-python rasteriser: shapes are defined analytically in 1x CSS-pixel space,
sampled on a supersampled grid, outlined by a chamfer distance transform
(round joins, so the arrow tip doesn't miter-blow past the hotspot), then
box-downsampled to anti-aliased RGBA and written as PNG.
"""

import math
import struct
import zlib

FILL = (157, 191, 120)  # --helix-moss
LINE = (39, 46, 66)  # --helix-night
OUTLINE = 1.15  # outline half-width, 1x px


# ---------------------------------------------------------------- primitives


def seg_dist(px, py, x0, y0, x1, y1):
    dx, dy = x1 - x0, y1 - y0
    L2 = dx * dx + dy * dy
    t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((px - x0) * dx + (py - y0) * dy) / L2))
    qx, qy = x0 + t * dx, y0 + t * dy
    return math.hypot(px - qx, py - qy)


def capsule(x0, y0, x1, y1, r):
    return lambda px, py: seg_dist(px, py, x0, y0, x1, y1) <= r


def roundrect(x0, y0, x1, y1, r):
    ix0, iy0, ix1, iy1 = x0 + r, y0 + r, x1 - r, y1 - r

    def f(px, py):
        cx = min(max(px, ix0), ix1)
        cy = min(max(py, iy0), iy1)
        return math.hypot(px - cx, py - cy) <= r

    return f


def polygon(pts):
    def f(px, py):
        inside = False
        n = len(pts)
        for i in range(n):
            x0, y0 = pts[i]
            x1, y1 = pts[(i + 1) % n]
            if (y0 > py) != (y1 > py):
                xx = x0 + (py - y0) * (x1 - x0) / (y1 - y0)
                if px < xx:
                    inside = not inside
        return inside

    return f


def union(*shapes):
    return lambda px, py: any(s(px, py) for s in shapes)


# ---------------------------------------------------------------- rasteriser


def mask_of(shape, W, H, scale, ss):
    """Boolean grid, sampled at pixel centres of the supersampled lattice."""
    gw, gh = W * ss, H * ss
    step = 1.0 / (ss * scale)
    half = step / 2.0
    grid = bytearray(gw * gh)
    for gy in range(gh):
        py = gy * step + half
        row = gy * gw
        for gx in range(gw):
            if shape(gx * step + half, py):
                grid[row + gx] = 1
    return grid, gw, gh


def dilate(grid, gw, gh, radius_px, scale, ss):
    """Pixels within `radius_px` (1x units) of the mask, via 3-4 chamfer DT."""
    INF = 1 << 28
    lim = radius_px * scale * ss * 3.0
    d = [0 if v else INF for v in grid]
    for y in range(gh):
        base = y * gw
        for x in range(gw):
            i = base + x
            if d[i] == 0:
                continue
            best = d[i]
            if x > 0:
                best = min(best, d[i - 1] + 3)
            if y > 0:
                best = min(best, d[i - gw] + 3)
                if x > 0:
                    best = min(best, d[i - gw - 1] + 4)
                if x < gw - 1:
                    best = min(best, d[i - gw + 1] + 4)
            d[i] = best
    for y in range(gh - 1, -1, -1):
        base = y * gw
        for x in range(gw - 1, -1, -1):
            i = base + x
            if d[i] == 0:
                continue
            best = d[i]
            if x < gw - 1:
                best = min(best, d[i + 1] + 3)
            if y < gh - 1:
                best = min(best, d[i + gw] + 3)
                if x > 0:
                    best = min(best, d[i + gw - 1] + 4)
                if x < gw - 1:
                    best = min(best, d[i + gw + 1] + 4)
            d[i] = best
    return bytearray(1 if v <= lim else 0 for v in d)


def render(shape, seps, W, H, scale, path):
    """Fill + outline + separator creases -> downsampled RGBA PNG."""
    ss = max(1, int(round(8 / scale)))
    W, H = W * scale, H * scale
    fill, gw, gh = mask_of(shape, W, H, scale, ss)
    body = dilate(fill, gw, gh, OUTLINE, scale, ss)
    crease = (
        mask_of(union(*seps), W, H, scale, ss)[0] if seps else bytearray(gw * gh)
    )

    px = bytearray()
    n = ss * ss
    for y in range(H):
        px.append(0)  # PNG filter: none
        for x in range(W):
            sr = sg = sb = cnt = 0
            for sy in range(ss):
                row = (y * ss + sy) * gw + x * ss
                for sx in range(ss):
                    i = row + sx
                    if not body[i]:
                        continue
                    c = FILL if (fill[i] and not crease[i]) else LINE
                    sr += c[0]
                    sg += c[1]
                    sb += c[2]
                    cnt += 1
            if cnt:
                px += bytes((sr // cnt, sg // cnt, sb // cnt, round(cnt * 255 / n)))
            else:
                px += b"\0\0\0\0"

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes(px), 9))
        + chunk(b"IEND", b"")
    )
    open(path, "wb").write(png)
    print(f"{path}  {W}x{H}")


# ---------------------------------------------------------------- the shapes

# Classic arrow: vertical left edge, ~34deg head, canvas 12x23, hotspot 1 1.
ARROW = polygon(
    [
        (1.4, 1.4),  # tip
        (1.4, 17.5),  # left edge
        (5.0, 14.3),  # notch
        (7.1, 20.5),  # tail, outer
        (9.5, 19.4),  # tail, inner
        (7.3, 13.5),
        (9.4, 13.2),  # widest point of the head
    ]
)

# Pointing hand: index up, three folded fingers stepping down, thumb bump.
# Canvas 21x23, fingertip (and hotspot) at 6 1.
DX = 0.8
HAND = union(
    capsule(6.0 + DX, 3.4, 6.0 + DX, 13.0, 2.10),  # index
    capsule(9.6 + DX, 8.6, 9.6 + DX, 13.0, 1.90),  # folded 2
    capsule(12.9 + DX, 9.3, 12.9 + DX, 13.0, 1.85),  # folded 3
    capsule(16.0 + DX, 10.3, 16.0 + DX, 13.0, 1.75),  # folded 4
    capsule(4.6 + DX, 12.2, 2.3 + DX, 15.2, 1.95),  # thumb
    roundrect(3.9 + DX, 11.0, 17.75 + DX, 21.0, 2.60),  # palm
)
CREASES = [
    capsule(7.90 + DX, 7.3, 7.90 + DX, 12.4, 0.42),
    capsule(11.27 + DX, 7.9, 11.27 + DX, 12.7, 0.42),
    capsule(14.50 + DX, 9.0, 14.50 + DX, 13.0, 0.42),
]

OUT = "/home/purpledna/projects/helix/frontend/public/cursors/"
render(ARROW, [], 12, 23, 1, OUT + "arrow.png")
render(ARROW, [], 12, 23, 2, OUT + "arrow@2x.png")
render(HAND, CREASES, 21, 23, 1, OUT + "pointer.png")
render(HAND, CREASES, 21, 23, 2, OUT + "pointer@2x.png")
