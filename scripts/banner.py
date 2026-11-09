"""Compose assets/banner.png: character logo, title, mark logo.

Usage: python3 scripts/banner.py   (needs Pillow and macOS's Avenir Next font)
"""

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
FONT = "/System/Library/Fonts/Avenir Next.ttc"
FONT_BOLD = 0

BG = (254, 252, 245)
NAVY = (22, 38, 78)
PINK = (222, 104, 148)

HEIGHT = 480
LOGO = 400
PAD = 56
GAP = 64
RADIUS = 40
TITLE = (("kokoro", PINK), ("-kanban", NAVY))
TITLE_SIZE = 132


def clean(im: Image.Image, tolerance: int = 14) -> Image.Image:
    """Snap near-background pixels to BG so the logos sit seamlessly on the banner."""
    im = im.convert("RGB")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b = px[x, y]
            if abs(r - BG[0]) <= tolerance and abs(g - BG[1]) <= tolerance and abs(b - BG[2]) <= tolerance:
                px[x, y] = BG
    return im


def fit(path: Path) -> Image.Image:
    im = clean(Image.open(path))
    diff = ImageChops.difference(im, Image.new("RGB", im.size, BG))
    left, top, right, bottom = diff.getbbox() or (0, 0, im.width, im.height)
    side = max(right - left, bottom - top) + 48
    cx, cy = (left + right) // 2, (top + bottom) // 2
    square = Image.new("RGB", (side, side), BG)
    square.paste(im.crop((cx - side // 2, cy - side // 2, cx + side // 2, cy + side // 2)), (0, 0))
    return square.resize((LOGO, LOGO), Image.Resampling.LANCZOS)


def main() -> None:
    font = ImageFont.truetype(FONT, TITLE_SIZE, index=FONT_BOLD)
    widths = [font.getlength(text) for text, _ in TITLE]
    title_w = int(sum(widths))
    width = PAD + LOGO + GAP + title_w + GAP + LOGO + PAD

    banner = Image.new("RGB", (width, HEIGHT), BG)
    top = (HEIGHT - LOGO) // 2
    banner.paste(fit(ASSETS / "logo.png"), (PAD, top))
    banner.paste(fit(ASSETS / "mark.png"), (width - PAD - LOGO, top))

    draw = ImageDraw.Draw(banner)
    x = PAD + LOGO + GAP
    ascent, descent = font.getmetrics()
    y = (HEIGHT - (ascent + descent)) // 2
    for (text, color), w in zip(TITLE, widths):
        draw.text((x, y), text, font=font, fill=color)
        x += w

    mask = Image.new("L", banner.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, width - 1, HEIGHT - 1), RADIUS, fill=255)
    out = banner.convert("RGBA")
    out.putalpha(mask)
    out.save(ASSETS / "banner.png", optimize=True)
    print(f"wrote {ASSETS / 'banner.png'} ({width}x{HEIGHT})")


if __name__ == "__main__":
    main()
