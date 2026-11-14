#!/usr/bin/env python3
"""Cài nhắc hẹn native (AlarmManager) vào dự án Android vừa `tauri android init`.

Chép vào `src-tauri/gen/android` (không sửa tay thư mục này — CI sinh lại
mỗi lần chạy nên script phải chạy sau bước init, trước bước Gradle build):
- âm chuông `src-tauri/notification/chuong-vua-nhe.wav` -> `res/raw/`
- icon notepad trắng `ic_notepad` -> `drawable-<mật độ>/` (chỉ 1 icon,
  không có large icon — kha chốt 2 icon là thừa)
- `ReminderHelper.kt` + `ReminderReceiver.kt` -> `java/<package>/`
  (đổi dòng package theo identifier trong tauri.conf.json)
- 2 quyền + receiver vào `AndroidManifest.xml`

Chạy 2 lần cho kết quả y nhau: file chép đè giống hệt, khối manifest chỉ
chèn khi chưa có marker. Thiếu file nguồn hoặc thiếu cây Android thì thoát
1 và báo rõ, không âm thầm bỏ qua.

Dùng:  python3 scripts/patch-android-notification.py [--root <thư mục gốc repo>]
"""

import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

# (tên mật độ, cỡ icon nhỏ theo chuẩn Android)
DENSITIES = [
    ("mdpi", 24),
    ("hdpi", 36),
    ("xhdpi", 48),
    ("xxhdpi", 72),
    ("xxxhdpi", 96),
]

SOUND_SRC = "chuong-vua-nhe.wav"
SOUND_RES = "chuong_vua_nhe.wav"
CHANNEL_ID = "nhac-hen"
PERMISSION_MARKER = "<!-- nhac-hen: quyen POST_NOTIFICATIONS + SCHEDULE_EXACT_ALARM -->"
RECEIVER_MARKER = "<!-- nhac-hen: receiver nhac hen -->"


def doc_ghi_chu_trang(size: int) -> Image.Image:
    """Trang sổ trắng trên nền trong suốt, góc gấp + 3 dòng kẻ.

    Icon thông báo Android phải là silhouette trắng: vùng trắng là hình,
    vùng trong suốt là nền. Vẽ bằng mask (đừng tô màu trong suốt trực tiếp
    lên ảnh — Pillow sẽ hòa trộn mà không xóa).
    """
    le = max(2, size // 12)
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    # Trang giấy bo góc.
    draw.rounded_rectangle([2, 2, size - 3, size - 3], radius=le, fill=255)
    # Góc gấp trên-phải: cắt tam giác.
    goc = size // 4
    draw.polygon([(size - 3 - goc, 2), (size - 3, 2), (size - 3, 2 + goc)], fill=0)
    # Ba dòng kẻ ngang (khe trong suốt).
    day = max(1, size // 16)
    for ty in (0.38, 0.55, 0.72):
        y0 = round(size * ty)
        draw.rectangle([round(size * 0.20), y0, round(size * 0.80), y0 + day - 1], fill=0)
    trang = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    trong = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    return Image.composite(trang, trong, mask)


def chep_kotlin(nguon: Path, dich: Path, package: str) -> None:
    """Chép file Kotlin, đổi dòng package theo identifier thật."""
    dong = nguon.read_text(encoding="utf-8").split("\n")
    for i, d in enumerate(dong):
        if d.startswith("package "):
            dong[i] = f"package {package}"
            break
    else:
        print(f"Lỗi: {nguon} không có dòng package")
        sys.exit(1)
    dich.parent.mkdir(parents=True, exist_ok=True)
    dich.write_text("\n".join(dong), encoding="utf-8")


def va_manifest(manifest: Path) -> None:
    """Chèn quyền + receiver nếu chưa có (nhận biết bằng marker)."""
    text = manifest.read_text(encoding="utf-8")
    if PERMISSION_MARKER not in text:
        khoi = (
            f"    {PERMISSION_MARKER}\n"
            '    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n'
            '    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />\n'
        )
        vi_tri = text.find("<application")
        if vi_tri < 0:
            print(f"Lỗi: {manifest} không có thẻ <application>")
            sys.exit(1)
        text = text[:vi_tri] + khoi + text[vi_tri:]
        print("AndroidManifest: đã thêm POST_NOTIFICATIONS + SCHEDULE_EXACT_ALARM")
    if RECEIVER_MARKER not in text:
        khoi = (
            f"        {RECEIVER_MARKER}\n"
            '        <receiver android:name=".ReminderReceiver" android:exported="false" />\n'
        )
        vi_tri = text.find("</application>")
        if vi_tri < 0:
            print(f"Lỗi: {manifest} không có thẻ </application>")
            sys.exit(1)
        text = text[:vi_tri] + khoi + text[vi_tri:]
        print("AndroidManifest: đã thêm receiver ReminderReceiver")
    manifest.write_text(text, encoding="utf-8")


def patch(root: Path) -> int:
    conf = root / "src-tauri" / "tauri.conf.json"
    if not conf.is_file():
        print(f"Lỗi: không thấy {conf}")
        return 1
    try:
        package = json.loads(conf.read_text(encoding="utf-8"))["identifier"]
    except (KeyError, ValueError) as e:
        print(f"Lỗi: không đọc được identifier trong {conf}: {e}")
        return 1
    if not package or "/" in package or " " in package:
        print(f"Lỗi: identifier không hợp lệ trong {conf}: {package!r}")
        return 1

    nguon_dir = root / "src-tauri" / "notification"
    for ten in ("ReminderHelper.kt", "ReminderReceiver.kt", SOUND_SRC):
        if not (nguon_dir / ten).is_file():
            print(f"Lỗi: không thấy {nguon_dir / ten}")
            return 1
    wav = nguon_dir / SOUND_SRC
    if wav.read_bytes()[:4] != b"RIFF":
        print(f"Lỗi: {wav} không phải file WAV (thiếu đầu RIFF)")
        return 1

    main = root / "src-tauri" / "gen" / "android" / "app" / "src" / "main"
    manifest = main / "AndroidManifest.xml"
    res = main / "res"
    if not manifest.is_file() or not res.is_dir():
        print(f"Lỗi: không thấy {manifest} — chạy `tauri android init` trước")
        return 1

    # Âm chuông: tên resource chỉ cho chữ thường + gạch dưới.
    raw = res / "raw"
    raw.mkdir(parents=True, exist_ok=True)
    (raw / SOUND_RES).write_bytes(wav.read_bytes())
    print(f"res/raw/{SOUND_RES}: {wav.stat().st_size} byte")

    # Icon notepad trắng, 1 icon duy nhất.
    for ten_mat_do, co in DENSITIES:
        thu_muc = res / f"drawable-{ten_mat_do}"
        thu_muc.mkdir(parents=True, exist_ok=True)
        doc_ghi_chu_trang(co).save(thu_muc / "ic_notepad.png")
        print(f"drawable-{ten_mat_do}: ic_notepad {co}px")

    # Receiver + helper, package theo identifier thật.
    java_dir = main / "java" / Path(*package.split("."))
    chep_kotlin(nguon_dir / "ReminderHelper.kt", java_dir / "ReminderHelper.kt", package)
    chep_kotlin(nguon_dir / "ReminderReceiver.kt", java_dir / "ReminderReceiver.kt", package)
    print(f"java/{package.replace('.', '/')}: ReminderHelper.kt + ReminderReceiver.kt")

    va_manifest(manifest)
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".")
    args = parser.parse_args()
    sys.exit(patch(Path(args.root).resolve()))
