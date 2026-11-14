#!/usr/bin/env python3
"""Ghi de icon mac dinh cua template Tauri trong du an Android bang icon app that.

Nguyen nhan (da kiem chung tu ma nguon tauri-cli 2.12.4):
`tauri android init` chi copy template, va file mipmap trong template la icon
xoay Tauri mac dinh. Khong buoc nao cua init/build doc
`src-tauri/icons/icon.png` de thay the chung — chi lenh `npx tauri icon`
moi sinh icon Android, ma lenh do ghi ra `src-tauri/icons/mipmap-*`
chu khong phai thu muc res cua du an Android. Ket qua: APK nao build ra
cung mang icon mac dinh du icon.png da doi.

Script nay chay trong CI sau buoc `tauri android init`, truoc khi Gradle
build: cat 15 file PNG (5 mat do x ic_launcher / ic_launcher_round /
ic_launcher_foreground) trong `src-tauri/gen/android/app/src/main/res`
tu `src-tauri/icons/icon.png`, theo dung kich thuoc va cach cat goc nhu ham
`android()` trong `src/icon.rs` cua tauri-cli (regular: bo goc 8,33%;
round: cat tron, le 4%; foreground: khong cat).

Dung:  python3 scripts/fix-android-icons.py [--root <thu muc goc repo>]
Thoat 1 neu thieu icon.png hoac thu muc res cua du an Android.
"""

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

# (ten mat do, co icon thuong/tron, co foreground) — giong tauri-cli icon.rs
DENSITIES = [
    ("mdpi", 48, 108),
    ("hdpi", 72, 162),
    ("xhdpi", 96, 216),
    ("xxhdpi", 144, 324),
    ("xxxhdpi", 192, 432),
]


def rounded_mask(size: int, margin: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle(
        [margin, margin, size - margin - 1, size - margin - 1],
        radius=radius,
        fill=255,
    )
    return mask


def circle_mask(size: int, margin: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse([margin, margin, size - margin - 1, size - margin - 1], fill=255)
    return mask


def apply_mask(image: Image.Image, mask: Image.Image) -> Image.Image:
    """Giu lai anh o vung mask trang, trong suot o vung mask den."""
    blank = Image.new("RGBA", image.size, (0, 0, 0, 0))
    return Image.composite(image, blank, mask)


def fix_icons(root: Path) -> int:
    src = root / "src-tauri" / "icons" / "icon.png"
    if not src.is_file():
        print(f"Loi: khong thay {src}")
        return 1
    res = root / "src-tauri" / "gen" / "android" / "app" / "src" / "main" / "res"
    if not res.is_dir():
        print(f"Loi: khong thay {res} — chay `tauri android init` truoc")
        return 1

    icon = Image.open(src).convert("RGBA")
    if icon.size[0] != icon.size[1]:
        print(f"Loi: icon.png phai la hinh vuong, hien la {icon.size}")
        return 1

    for density, size, fg_size in DENSITIES:
        folder = res / f"mipmap-{density}"
        folder.mkdir(parents=True, exist_ok=True)

        # Foreground (adaptive icon): day du, khong cat goc.
        icon.resize((fg_size, fg_size), Image.LANCZOS).save(
            folder / "ic_launcher_foreground.png"
        )

        # Icon thuong: bo goc tron, ban kinh 8,33% co icon.
        radius = round(size * 0.0833)
        regular = apply_mask(
            icon.resize((size, size), Image.LANCZOS),
            rounded_mask(size, radius, radius),
        )
        regular.save(folder / "ic_launcher.png")

        # Icon tron: cat tron, le vao 4% co icon.
        margin = round(size * 0.04)
        rounded = apply_mask(
            icon.resize((size, size), Image.LANCZOS),
            circle_mask(size, margin),
        )
        rounded.save(folder / "ic_launcher_round.png")

        print(f"mipmap-{density}: ic_launcher {size}px, foreground {fg_size}px")

    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".")
    args = parser.parse_args()
    sys.exit(fix_icons(Path(args.root).resolve()))
