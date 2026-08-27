#!/usr/bin/env python3
"""Bundle Crosspup into two single-file builds.

    dist/index.html     standalone page, open it in a browser
    dist/artifact.html  the same page without the document skeleton,
                        for publishing as a Claude Artifact

Both inline the sprites and the level pack, so neither needs any other file.

    python3 tools/build.py
"""

import base64
import glob
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src")
DIST = os.path.join(ROOT, "dist")

FONTS = (
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
    '<link href="https://fonts.googleapis.com/css2?'
    'family=Fredoka:wght@500;600;700&family=Nunito:wght@400;600;700;800'
    '&display=swap" rel="stylesheet">'
)

SKELETON = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Crosspup - a puzzle where every row, column and yard gets exactly one pup, and no two pups may touch.">
<meta name="theme-color" content="#1f7ad4">
<link rel="icon" href="data:image/png;base64,%(icon)s">
%(head)s
</head>
<body>
%(body)s
</body>
</html>
"""


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding="utf-8") as fh:
        return fh.read()


def sprites():
    files = sorted(
        glob.glob(os.path.join(ROOT, "assets", "pups", "pup-*.png")),
        key=lambda p: int(os.path.basename(p).split("-")[1]),
    )
    if len(files) != 12:
        raise SystemExit("expected 12 sprites in assets/pups, found %d" % len(files))
    out = []
    for path in files:
        with open(path, "rb") as fh:
            out.append(base64.b64encode(fh.read()).decode("ascii"))
    return out


def main():
    pups = sprites()
    levels = read("src", "levels.txt").strip()
    if "`" in levels or "${" in levels:
        raise SystemExit("level pack contains characters that would break the template literal")

    app = read("src", "app.js")
    for token, value in (
        ("/*__PUP_SRC__*/", ",\n".join('"data:image/png;base64,%s"' % b for b in pups)),
        ("/*__LEVELS__*/", levels),
    ):
        if token not in app:
            raise SystemExit("placeholder %s missing from src/app.js" % token)
        app = app.replace(token, value)

    head = "<title>Crosspup</title>\n%s\n<style>\n%s</style>" % (FONTS, read("src", "style.css"))
    body = "%s\n<script>\n%s\n%s</script>\n" % (
        read("src", "page.html"), read("src", "engine.js"), app
    )

    os.makedirs(DIST, exist_ok=True)
    with open(os.path.join(DIST, "artifact.html"), "w", encoding="utf-8") as fh:
        fh.write(head + "\n" + body)
    with open(os.path.join(DIST, "index.html"), "w", encoding="utf-8") as fh:
        fh.write(SKELETON % {"icon": pups[0], "head": head, "body": body})

    for name in ("index.html", "artifact.html"):
        size = os.path.getsize(os.path.join(DIST, name)) / 1024
        print("dist/%-14s %6.1f KB" % (name, size))
    print("%d levels, %d sprites" % (len(levels.splitlines()), len(pups)))


if __name__ == "__main__":
    main()
