#!/usr/bin/env python3
"""Bundle Crosspup into two single-file builds.

    dist/index.html     standalone page, open it in a browser
    dist/artifact.html  same content without the document skeleton,
                        for publishing as a Claude Artifact

Both inline the nine sprites as data URIs, so neither needs any other file.

    python3 tools/build.py
"""

import base64
import glob
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src", "index.html")
PUPS = os.path.join(ROOT, "assets", "pups")
DIST = os.path.join(ROOT, "dist")

SKELETON = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Crosspup - a sudoku where the digits are dogs.">
<meta name="theme-color" content="#1f7ad4">
<link rel="icon" href="data:image/png;base64,%(icon)s">
%(head)s</head>
<body>
%(body)s</body>
</html>
"""


def main():
    files = sorted(glob.glob(os.path.join(PUPS, "pup-*.png")),
                   key=lambda p: int(os.path.basename(p).split("-")[1]))
    if len(files) != 9:
        raise SystemExit("expected 9 sprites in assets/pups, found %d" % len(files))

    uris, icon = [], None
    for path in files:
        with open(path, "rb") as fh:
            b64 = base64.b64encode(fh.read()).decode("ascii")
        if icon is None:
            icon = b64
        uris.append('"data:image/png;base64,%s"' % b64)

    page = open(SRC, encoding="utf-8").read()
    if "/*__PUP_SRC__*/" not in page:
        raise SystemExit("sprite placeholder missing from src/index.html")
    page = page.replace("/*__PUP_SRC__*/", ",\n".join(uris))

    os.makedirs(DIST, exist_ok=True)

    artifact = os.path.join(DIST, "artifact.html")
    with open(artifact, "w", encoding="utf-8") as fh:
        fh.write(page)

    # split the head-ish bits (title/fonts/style) from the rest for the skeleton
    cut = page.index("<div class=\"wrap\">")
    with open(os.path.join(DIST, "index.html"), "w", encoding="utf-8") as fh:
        fh.write(SKELETON % {"icon": icon, "head": page[:cut], "body": page[cut:]})

    for name in ("index.html", "artifact.html"):
        size = os.path.getsize(os.path.join(DIST, name)) / 1024
        print("dist/%-14s %6.1f KB" % (name, size))


if __name__ == "__main__":
    main()
