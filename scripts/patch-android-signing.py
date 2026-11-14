# Bat ky ban release trong file Gradle do Tauri sinh ra.
#
# Ly do: `npx tauri android init` chi sinh `src-tauri/gen/android/app/build.gradle.kts`
# mau, KHONG tu noi signing config (tai lieu ky Android cua Tauri yeu cau sua tay).
# Chi ghi `keystore.properties` thi Gradle khong doc, ban release van ra file
# `app-universal-release-unsigned.apk` (chay Actions #6, 14/11/2026, gap dung loi
# nhu chay #1: buoc doi ten `cp .../app-universal-release.apk` chet vi khong co file).
#
# Script nay chay sau buoc giai ma keystore trong workflow, truoc buoc build.
# Idempotent: chay lai lan nua thi bao da sua roi, khong sua them.
# Neu khong co `keystore.properties` (may dev chua co keystore), build van chay
# nhu cu (ra ban unsigned) chu khong vo cau hinh Gradle.
#
# Script cung tang versionCode (bien moi truong TAURI_VERSION_CODE, workflow
# truyen so lan chay GITHUB_RUN_NUMBER): template mac dinh versionCode = 1
# cho moi ban build, dien thoai se tu choi cai de ban moi len ban cu khi
# versionCode khong tang. Ghi vao src-tauri/gen/android/app/tauri.properties
# vi template doc versionCode tu file nay.
import os
import re
import sys
from pathlib import Path

GRADLE = Path("src-tauri/gen/android/app/build.gradle.kts")
TAURI_PROPS = Path("src-tauri/gen/android/app/tauri.properties")

LOAD_BLOCK = """val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}
"""

SIGNING_BLOCK = """    signingConfigs {
        if (keystorePropertiesFile.exists()) {
            create("release") {
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
                storeFile = file(keystoreProperties["storeFile"] as String)
                storePassword = keystoreProperties["storePassword"] as String
            }
        }
    }
"""


def find_idx(lines, pattern, what):
    for i, line in enumerate(lines):
        if re.match(pattern, line):
            return i
    raise SystemExit(
        f"Khong tim thay {what} trong build.gradle.kts — template Tauri doi dang, can xem lai script."
    )


def bump_version_code() -> int:
    code = os.environ.get("TAURI_VERSION_CODE", "").strip()
    if not code:
        return 0
    if not code.isdigit():
        print(f"TAURI_VERSION_CODE khong hop le: {code!r}")
        return 1
    key = "tauri.android.versionCode="
    lines = TAURI_PROPS.read_text(encoding="utf-8").splitlines() if TAURI_PROPS.exists() else []
    replaced = False
    out = []
    for line in lines:
        if line.startswith(key):
            out.append(key + code)
            replaced = True
        else:
            out.append(line)
    if not replaced:
        out.append(key + code)
    TAURI_PROPS.parent.mkdir(parents=True, exist_ok=True)
    TAURI_PROPS.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"versionCode = {code}")
    return 0


def main() -> int:
    if not GRADLE.exists():
        print(f"Khong thay {GRADLE}, chua chay `tauri android init`?")
        return 1
    text = GRADLE.read_text(encoding="utf-8")
    if "keystoreProperties" in text:
        print("build.gradle.kts da co signing, khong sua them.")
    else:
        lines = text.splitlines(keepends=True)

        # 0. Import dung kieu tai lieu Tauri. CHI them import nao con thieu:
        #    template cua Tauri 2.12.4 da co san `import java.util.Properties` o dong 1
        #    (dung de nap tauri.properties), them trung la Gradle bao
        #    "Conflicting import: imported name 'Properties' is ambiguous"
        #    (lan chay #8, run 3bff6dac, 14/11/2026).
        missing = []
        if "import java.io.FileInputStream" not in text:
            missing.append("import java.io.FileInputStream")
        if "import java.util.Properties" not in text:
            missing.append("import java.util.Properties")
        if missing:
            lines[0:0] = ["\n".join(missing) + "\n\n"]

        # 1. Nap keystore.properties truoc khoi android { ... }.
        android_idx = find_idx(lines, r"^android\s*\{", "khoi `android {`")
        lines[android_idx:android_idx] = [LOAD_BLOCK + "\n"]

        # 2. Them signingConfigs ngay truoc khoi buildTypes { ... } (nam trong android).
        build_types_idx = find_idx(lines, r"^\s*buildTypes\s*\{", "khoi `buildTypes {`")
        lines[build_types_idx:build_types_idx] = [SIGNING_BLOCK]

        # 3. Trong getByName("release") { ... }, chi signingConfig vua tao.
        text = "".join(lines)
        m = re.search(r'(getByName\("release"\)\s*\{\n)', text)
        if not m:
            print("Khong tim thay getByName(\"release\") trong build.gradle.kts.")
            return 1
        indent = " " * 12
        inject = (
            m.group(1)
            + indent
            + 'if (keystorePropertiesFile.exists()) {\n'
            + indent
            + '    signingConfig = signingConfigs.getByName("release")\n'
            + indent
            + "}\n"
        )
        text = text[: m.start()] + inject + text[m.end():]

        GRADLE.write_text(text, encoding="utf-8")
        print("Da bat ky release trong build.gradle.kts.")
    return bump_version_code()


if __name__ == "__main__":
    raise SystemExit(main())
