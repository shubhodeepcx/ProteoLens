"""Download the AutoDock Vina 1.2.7 binary for this machine into backend/bin/.

    cd backend && python scripts/install_vina.py

`pip install vina` builds from source against Boost and publishes no wheel for
current Python, so the docking service runs the official release binary
instead. It finds it in backend/bin/ (or wherever VINA_BINARY points).
"""

from __future__ import annotations

import platform
import stat
import subprocess
import sys
import urllib.request
from pathlib import Path

VERSION = "1.2.7"
RELEASE = f"https://github.com/ccsb-scripps/AutoDock-Vina/releases/download/v{VERSION}"
ASSETS = {
    ("Linux", "x86_64"): f"vina_{VERSION}_linux_x86_64",
    ("Linux", "aarch64"): f"vina_{VERSION}_linux_aarch64",
    ("Darwin", "x86_64"): f"vina_{VERSION}_mac_x86_64",
    ("Darwin", "arm64"): f"vina_{VERSION}_mac_aarch64",
    ("Windows", "AMD64"): f"vina_{VERSION}_win.exe",
}
BIN_DIR = Path(__file__).resolve().parents[1] / "bin"


def main() -> int:
    key = (platform.system(), platform.machine())
    asset = ASSETS.get(key)
    if asset is None:
        print(f"No Vina {VERSION} release for {key[0]} {key[1]}; build it from source.")
        return 1
    target = BIN_DIR / ("vina.exe" if key[0] == "Windows" else "vina")
    BIN_DIR.mkdir(exist_ok=True)
    print(f"Downloading {asset} ...")
    with urllib.request.urlopen(f"{RELEASE}/{asset}", timeout=120) as response:
        target.write_bytes(response.read())
    target.chmod(target.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    out = subprocess.run([str(target), "--version"], capture_output=True, text=True, check=False)
    print(f"Installed {target}: {(out.stdout or out.stderr).strip()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
