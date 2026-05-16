"""Generate cute octopus icons for OsakaPocket PWA."""
from PIL import Image, ImageDraw, ImageFilter
import os
import math

OUTDIR = os.path.join(os.path.dirname(__file__), "..", "icons")
os.makedirs(OUTDIR, exist_ok=True)

# Colors
BG_TOP = (255, 138, 163)      # light pink
BG_BOT = (255, 91, 107)       # warm red
BODY = (255, 245, 230)        # cream
EYE = (40, 25, 15)             # near-black brown
BLUSH = (255, 140, 165, 200)  # soft pink
MOUTH = (90, 50, 30)


def draw_octopus(size: int, maskable: bool = False) -> Image.Image:
    """Render the icon at `size` x `size`. Maskable = full bleed (no rounded corners)."""
    SCALE = 4
    S = size * SCALE
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # ---- Background: paint full vertical gradient, then mask to rounded square ----
    bg = Image.new("RGBA", (S, S), (0, 0, 0, 255))
    bgd = ImageDraw.Draw(bg)
    for y in range(S):
        t = y / max(1, S - 1)
        r = int(BG_TOP[0] * (1 - t) + BG_BOT[0] * t)
        g = int(BG_TOP[1] * (1 - t) + BG_BOT[1] * t)
        b = int(BG_TOP[2] * (1 - t) + BG_BOT[2] * t)
        bgd.line([(0, y), (S, y)], fill=(r, g, b, 255))
    if not maskable:
        radius = int(S * 0.22)
        mask = Image.new("L", (S, S), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, S, S), radius=radius, fill=255)
        bg.putalpha(mask)
    img = Image.alpha_composite(img, bg)
    d = ImageDraw.Draw(img)

    # ---- Octopus body ----
    # For maskable, shrink to fit the safe zone (~80% center)
    safe = 0.78 if maskable else 1.0
    cx = S // 2
    cy = int(S * 0.50)
    body_r = int(S * 0.27 * safe)
    body_left = cx - body_r
    body_right = cx + body_r
    body_top = cy - body_r
    skirt_bottom = cy + int(body_r * 0.45)

    # Top dome (semicircle)
    d.pieslice((body_left, body_top, body_right, cy + body_r),
               start=180, end=360, fill=BODY)
    # Skirt rectangle
    d.rectangle((body_left, cy, body_right, skirt_bottom), fill=BODY)
    # Tentacle bumps along bottom edge
    n = 5
    tw = (body_right - body_left) / n
    for i in range(n):
        tx = body_left + int(tw * (i + 0.5))
        r = int(tw / 2)
        d.ellipse((tx - r, skirt_bottom - r, tx + r, skirt_bottom + r), fill=BODY)

    # ---- Eyes ----
    eye_y = cy - int(body_r * 0.15)
    eye_dx = int(body_r * 0.40)
    ew = int(S * 0.028 * safe)
    eh = int(S * 0.040 * safe)
    d.ellipse((cx - eye_dx - ew, eye_y - eh, cx - eye_dx + ew, eye_y + eh), fill=EYE)
    d.ellipse((cx + eye_dx - ew, eye_y - eh, cx + eye_dx + ew, eye_y + eh), fill=EYE)
    # Sparkles (top-left of each pupil)
    sp = max(3, int(S * 0.011 * safe))
    d.ellipse((cx - eye_dx - sp, eye_y - eh + sp,
               cx - eye_dx + sp, eye_y - eh + sp * 3), fill=(255, 255, 255))
    d.ellipse((cx + eye_dx + int(sp * 0.2), eye_y - eh + sp,
               cx + eye_dx + sp * 2, eye_y - eh + sp * 3), fill=(255, 255, 255))

    # ---- Blush (blurred pink ovals) ----
    blush_layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bd = ImageDraw.Draw(blush_layer)
    bly = cy + int(body_r * 0.10)
    bldx = int(body_r * 0.70)
    blw = int(S * 0.045 * safe)
    blh = int(S * 0.022 * safe)
    bd.ellipse((cx - bldx - blw, bly - blh, cx - bldx + blw, bly + blh), fill=BLUSH)
    bd.ellipse((cx + bldx - blw, bly - blh, cx + bldx + blw, bly + blh), fill=BLUSH)
    blush_layer = blush_layer.filter(ImageFilter.GaussianBlur(radius=int(S * 0.006)))
    img = Image.alpha_composite(img, blush_layer)
    d = ImageDraw.Draw(img)

    # ---- Mouth (small smile) ----
    my = cy + int(body_r * 0.08)
    mw = int(S * 0.025 * safe)
    mh = int(S * 0.018 * safe)
    d.arc((cx - mw, my - mh, cx + mw, my + mh * 2),
          start=15, end=165, fill=MOUTH, width=max(3, int(S * 0.012 * safe)))

    # Final downscale for AA
    return img.resize((size, size), Image.LANCZOS)


targets = [
    ("icon-192.png", 192, False),
    ("icon-512.png", 512, False),
    ("apple-touch-icon.png", 180, False),
    ("icon-maskable-512.png", 512, True),
    ("favicon-32.png", 32, False),
]

for name, size, maskable in targets:
    out = os.path.join(OUTDIR, name)
    draw_octopus(size, maskable).save(out, "PNG", optimize=True)
    print(f"OK  {name:28s} {size}x{size}{' (maskable)' if maskable else ''}")

print("\nAll icons generated in", os.path.realpath(OUTDIR))
