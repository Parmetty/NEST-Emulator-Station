"""Prepare console photos for the dark Nest backdrop.

- PNGs from Wikimedia often already carry a real alpha channel -> use it.
- JPEGs are shot on white seamless -> flood-fill the white from the corners.
Then: grayscale, fade curve, slight cool tint, soft edge, WebP out.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'assets')
OUT = os.path.join(SRC, 'processed')
os.makedirs(OUT, exist_ok=True)

MAX_SIDE = 1500


def alpha_from_channel(im: Image.Image) -> Image.Image:
    a = im.getchannel('A')
    # composite over white so semi-transparent edges stay neutral, not black
    white = Image.new('RGB', im.size, (255, 255, 255))
    white.paste(im.convert('RGB'), mask=a)
    return white, a


def alpha_from_white_bg(im: Image.Image) -> Image.Image:
    rgb = im.convert('RGB')
    w, h = rgb.size
    arr = np.asarray(rgb).astype(np.int16)
    light = (arr.min(axis=2) >= 232).astype(np.uint8) * 255
    mask = Image.fromarray(light, mode='L').copy()  # fromarray buffers are read-only
    for corner in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        if mask.getpixel(corner) == 255:
            ImageDraw.floodfill(mask, corner, 128, thresh=24)
    bg = mask.point(lambda v: 255 if v == 128 else 0)
    return rgb, bg.point(lambda v: 0 if v else 255)


def cutout(path: str) -> Image.Image:
    im = Image.open(path)
    has_alpha = 'A' in im.getbands() and np.asarray(im.getchannel('A')).min() < 250
    if has_alpha:
        rgb, alpha = alpha_from_channel(im)
    else:
        rgb, alpha = alpha_from_white_bg(im)
    alpha = alpha.filter(ImageFilter.GaussianBlur(1.0)).point(lambda v: 0 if v < 55 else v)
    alpha = alpha.filter(ImageFilter.MinFilter(3))  # eat the light fringe

    gray = rgb.convert('L')
    lut = [int(round(255 * (0.10 + 0.80 * (i / 255.0) ** 1.06))) for i in range(256)]
    gray = gray.point(lut)
    return Image.merge('RGBA', (
        gray.point(lambda v: int(v * 0.965)),
        gray.point(lambda v: int(v * 0.985)),
        gray,
        alpha,
    ))


def main():
    ids = sys.argv[1:] or ['gba', 'fc', 'sfc', 'n64', 'ngc', 'wii', 'wiiu']
    for sid in ids:
        src = next((os.path.join(SRC, f'{sid}.{e}') for e in ('png', 'jpg')
                    if os.path.exists(os.path.join(SRC, f'{sid}.{e}'))), None)
        if not src:
            print(f'skip {sid}: no source')
            continue
        im = Image.open(src).convert('RGBA')
        w, h = im.size
        if max(w, h) > MAX_SIDE:
            k = MAX_SIDE / max(w, h)
            im = im.resize((int(w * k), int(h * k)), Image.LANCZOS)
            tmp = os.path.join(OUT, f'_{sid}_tmp.png')
            im.save(tmp)
            src = tmp
        out = cutout(src)
        if src.endswith('_tmp.png'):
            os.remove(src)
        dst = os.path.join(OUT, f'{sid}.webp')
        out.save(dst, 'WEBP', quality=88, method=6)
        a = np.asarray(out)[:, :, 3]
        bbox = out.getbbox()
        print(f'{sid:5} {w}x{h} -> {out.size[0]}x{out.size[1]}  '
              f'transp={100.0 * (a == 0).mean():5.1f}%  bbox={bbox}  '
              f'{os.path.getsize(dst) // 1024} KB')


if __name__ == '__main__':
    main()
