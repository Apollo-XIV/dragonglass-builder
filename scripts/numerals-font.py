"""
Builds the spell level font: Source Serif 4 cut down to the glyphs a spell level
needs, I, V and X for the levels and ◆ for a cantrip, and printed as the
@font-face rule at the top of styles.css.

Source Serif 4 is under the SIL Open Font License with the Reserved Font Name
"Source", and a subset is a modified version, so it is renamed Dragonglass
Numerals. The copyright and licence records are kept as Adobe wrote them; the
full licence is fonts/OFL.txt.

    python3 -m venv venv && venv/bin/pip install fonttools brotli
    gh release download 4.005R -R adobe-fonts/source-serif -p 'source-serif-4.005_WOFF2.zip'
    unzip source-serif-4.005_WOFF2.zip
    venv/bin/python scripts/numerals-font.py \
      source-serif-4.005_WOFF2/VAR/SourceSerif4Variable-Roman.ttf.woff2
"""

import base64
import io
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

GLYPHS = "IVX◆"

# Copyright, trademark, licence description and licence URL.
KEEP = {0, 7, 13, 14}


def main(source: str) -> None:
    font = TTFont(source)

    options = subset.Options()
    options.layout_features = []
    options.flavor = "woff2"
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=[ord(c) for c in GLYPHS])
    subsetter.subset(font)

    for record in font["name"].names:
        if record.nameID in KEEP:
            continue
        text = record.toUnicode()
        renamed = text.replace("SourceSerif4", "DragonglassNumerals").replace("Source Serif 4", "Dragonglass Numerals")
        if renamed != text:
            record.string = renamed

    out = io.BytesIO()
    font.flavor = "woff2"
    font.save(out)
    data = base64.b64encode(out.getvalue()).decode("ascii")

    print(
        "@font-face {\n"
        '  font-family: "Dragonglass Numerals";\n'
        "  font-style: normal;\n"
        "  font-weight: 200 900;\n"
        "  font-display: block;\n"
        f'  src: url("data:font/woff2;base64,{data}") format("woff2");\n'
        "}"
    )


if __name__ == "__main__":
    main(sys.argv[1])
