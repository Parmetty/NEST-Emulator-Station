#!/usr/bin/env python3
"""Turn a console photo into transparent console art (webp).

Used for the console wall images under src/renderer/public/consoles.
The source photo should show the device on a plain background.

Usage:
  python tools/make-console-art.py --src photo.jpg --out src/renderer/public/consoles/psv.webp
  python tools/make-console-art.py --src psv.jpg --out psv.webp --height 822 --rect 0.01,0.30,0.98,0.50

--rect is x,y,w,h as fractions of the image (GrabCut seed box).
Requires: pillow, numpy, opencv-python-headless (pip install ...).
Without OpenCV it falls back to a corner colour-key + rounded mask.
"""
import argparse
import sys

from PIL import Image, ImageDraw, ImageFilter


def grabcut_cutout(src: str, rect: tuple[float, float, float, float]) -> Image.Image:
    import cv2
    import numpy as np

    img = cv2.imread(src)
    if img is None:
        raise SystemExit("cannot read " + src)
    h, w = img.shape[:2]
    x, y, rw, rh = rect
    seed = (int(w * x), int(h * y), int(w * rw), int(h * rh))
    mask = np.zeros((h, w), np.uint8)
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(img, mask, seed, bgd, fgd, 8, cv2.GC_INIT_WITH_RECT)
    alpha = np.where((mask == 2) | (mask == 0), 0, 255).astype("uint8")
    kernel = np.ones((5, 5), np.uint8)
    alpha = cv2.morphologyEx(alpha, cv2.MORPH_CLOSE, kernel, iterations=2)
    alpha = cv2.morphologyEx(alpha, cv2.MORPH_OPEN, kernel, iterations=1)
    out = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGBA))
    out.putalpha(Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(1.0)))
    return out


def fallback_cutout(src: str) -> Image.Image:
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    px = im.load()
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    br = sum(c[0] for c in corners) / 4.0
    bg = sum(c[1] for c in corners) / 4.0
    bb = sum(c[2] for c in corners) / 4.0
    for yy in range(h):
        for xx in range(w):
            r, g, b, a = px[xx, yy]
            d = abs(r - br) + abs(g - bg) + abs(b - bb)
            if d < 100:
                px[xx, yy] = (r, g, b, 0)
            elif d < 160:
                px[xx, yy] = (r, g, b, 120)
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((1, 1, w - 2, h - 2), radius=int(h * 0.28), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(1.0))
    im.putalpha(Image.composite(im.getchannel("A"), Image.new("L", (w, h), 0), mask))
    return im


def main() -> int:
    parser = argparse.ArgumentParser(description="cut a console photo into transparent webp art")
    parser.add_argument("--src", required=True, help="source photo (jpg/png)")
    parser.add_argument("--out", required=True, help="output .webp path")
    parser.add_argument("--height", type=int, default=822, help="output height in pixels (default 822)")
    parser.add_argument(
        "--rect",
        default="0.01,0.30,0.98,0.50",
        help="GrabCut seed box as x,y,w,h fractions (default 0.01,0.30,0.98,0.50)",
    )
    args = parser.parse_args()
    rect = tuple(float(v) for v in args.rect.split(","))
    if len(rect) != 4:
        raise SystemExit("--rect needs four comma-separated numbers")
    try:
        im = grabcut_cutout(args.src, rect)
    except Exception as exc:  # cv2 missing or failed
        print("grabcut unavailable (%s); using colour-key fallback" % exc, file=sys.stderr)
        im = fallback_cutout(args.src)
    im = im.crop(im.getbbox())
    ratio = args.height / im.size[1]
    im = im.resize((max(1, int(im.size[0] * ratio)), args.height), Image.LANCZOS)
    im.save(args.out, "WEBP", quality=92, method=6)
    print("wrote %s (%s)" % (args.out, im.size))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
