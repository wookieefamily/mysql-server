#!/usr/bin/env python3
"""Generate the twelve Crosspup sprites from a single source puppy render.

The source puppy wears a blue sweater. Fur sits around hue 15-30 deg, the
sweater around hue 190-215 with high saturation, so the sweater can be
isolated by hue and recoloured on its own. Each pup is the same good dog in
a different jumper - one per region colour on the board.

    python3 tools/make_pups.py <source.png> [outdir]
"""

import colorsys
import os
import sys
from PIL import Image

PUPS = [
    # name, hue (deg) or None, saturation multiplier, value gain, value lift
    ("blueberry", 214, 1.00, 1.00, 0.00),
    ("cherry",      2, 1.00, 1.00, 0.00),
    ("clover",    140, 0.95, 0.92, 0.00),
    ("honey",      45, 1.00, 1.05, 0.06),
    ("plum",      282, 0.92, 0.95, 0.00),
    ("bubblegum", 330, 0.85, 1.05, 0.04),
    ("mint",      168, 0.85, 1.02, 0.04),
    ("sky",       196, 0.50, 1.14, 0.12),
    ("lime",       92, 0.92, 1.00, 0.02),
    ("indigo",    250, 1.00, 0.70, 0.00),
    ("coral",      14, 0.70, 1.10, 0.08),
    ("slate",     210, 0.26, 0.62, 0.00),
]

WORK = 256   # recolour resolution
OUT = 128    # sprite resolution


def ramp(value, lo, hi):
    """0 below lo, 1 above hi, smooth in between."""
    if value <= lo:
        return 0.0
    if value >= hi:
        return 1.0
    t = (value - lo) / (hi - lo)
    return t * t * (3 - 2 * t)


def sweater_weight(h_deg, s):
    """How much a pixel belongs to the sweater, 0..1."""
    if h_deg < 168 or h_deg > 258:
        return 0.0
    hue_w = min(ramp(h_deg, 168, 186), 1.0 - ramp(h_deg, 238, 258))
    return hue_w * ramp(s, 0.22, 0.42)


def square_crop(im):
    """Trim transparent margins, then pad back out to a centred square."""
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    side = int(max(im.size) * 1.04)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    return canvas


def recolour(base, hue, sat_mul, val_mul, val_lift):
    out = base.copy()
    px = out.load()
    w, h = out.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            hh, ss, vv = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            weight = sweater_weight(hh * 360, ss)
            if weight <= 0.0:
                continue
            nh = hh if hue is None else hue / 360.0
            ns = min(1.0, ss * sat_mul)
            nv = min(1.0, vv * val_mul + val_lift)
            nr, ng, nb = colorsys.hsv_to_rgb(nh, ns, nv)
            px[x, y] = (
                round(r + (nr * 255 - r) * weight),
                round(g + (ng * 255 - g) * weight),
                round(b + (nb * 255 - b) * weight),
                a,
            )
    return out


def main():
    src = sys.argv[1]
    outdir = sys.argv[2] if len(sys.argv) > 2 else "assets/pups"
    os.makedirs(outdir, exist_ok=True)

    base = square_crop(Image.open(src).convert("RGBA"))
    base = base.resize((WORK, WORK), Image.LANCZOS)

    for i, (name, hue, sat_mul, val_mul, val_lift) in enumerate(PUPS, start=1):
        sprite = recolour(base, hue, sat_mul, val_mul, val_lift)
        sprite = sprite.resize((OUT, OUT), Image.LANCZOS)
        path = os.path.join(outdir, "pup-%d-%s.png" % (i, name))
        sprite.save(path, optimize=True)
        print("%s  %5.1f KB" % (path, os.path.getsize(path) / 1024))


if __name__ == "__main__":
    main()
