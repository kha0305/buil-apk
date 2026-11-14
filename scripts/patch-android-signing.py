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
import re
import sys
from pathlib import Path

GRADLE = Path("src-tauri/gen/android/app/build.gradle.kts")

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


def main() -> int:
    if not GRADLE.exists():
        print(f"Khong thay {GRADLE}, chua chay `tauri android init`?")
        return 1
    text = GRADLE.read_text(encoding="utf-8")
    if "keystoreProperties" in text:
        print("build.gradle.kts da co signing, khong sua them.")
        return 0

    lines = text.splitlines(keepends=True)

    # 0. Import dung kieu tai lieu Tauri (khong dung ten day du java.util.* /
    #    java.io.* vi trong Gradle Kotlin DSL `java` bi hieu nham thanh
    #    extension cua plugin java -> loi "Unresolved reference 'util'/'io'"
    #    o lan chay #7, run c9a5985a, 14/11/2026).
    imports = "import java.io.FileInputStream\nimport java.util.Properties\n"
    if "import java.io.FileInputStream" not in text:
        lines[0:0] = [imports + "\n"]

    # 1. Nap keystore.properties truoc khoi android { ... }.
    android_idx = next(i for i, l in enumerate(lines) if re.match(r"^android\s*\{", l))
    lines[android_idx:android_idx] = [LOAD_BLOCK + "\n"]

    # 2. Them signingConfigs ngay truoc khoi buildTypes { ... } (nam trong android).
    build_types_idx = next(i for i, l in enumerate(lines) if re.match(r"^\s*buildTypes\s*\{", l))
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
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
