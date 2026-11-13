"""Rebuild the small, synthetic acceptance documents. No personal data."""
from pathlib import Path
from reportlab.pdfgen.canvas import Canvas
from pptx import Presentation
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent
pdf = Canvas(str(root / "lecture-12-pages.pdf"), pagesize=(595, 842), invariant=1)
for number in range(1, 13):
    pdf.drawString(50, 790, f"Nexora QA lecture - page {number}")
    pdf.drawString(50, 760, "The orbital period of the fictional planet Nexora is 42 days.")
    pdf.drawString(50, 735, f"Unique page marker: NEXORA-PAGE-{number:02}")
    pdf.showPage()
pdf.save()

deck = Presentation()
for number in range(1, 13):
    slide = deck.slides.add_slide(deck.slide_layouts[1])
    slide.shapes.title.text = f"Nexora QA slide {number}"
    slide.placeholders[1].text = (
        "The fictional Nexora mission has 7 research stations.\n"
        f"Unique slide marker: NEXORA-SLIDE-{number:02}"
    )
deck.save(str(root / "lecture-12-slides.pptx"))

for name, color in (("red", "#d44d4d"), ("green", "#37a46d"), ("blue", "#397de0")):
    image = Image.new("RGB", (320, 180), color)
    ImageDraw.Draw(image).text((20, 20), f"Nexora QA: {name}", fill="white")
    image.save(root / f"sample-{name}.png")

scan = Canvas(str(root / "scan-no-text.pdf"), pagesize=(595, 842), invariant=1)
scan.drawImage(str(root / "sample-blue.png"), 50, 500, width=320, height=180)
scan.showPage()
scan.save()

assert len(deck.slides) == 12
assert all((root / name).stat().st_size > 0 for name in (
    "lecture-12-pages.pdf", "lecture-12-slides.pptx", "scan-no-text.pdf",
    "sample-red.png", "sample-green.png", "sample-blue.png",
))
