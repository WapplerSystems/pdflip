"""Builds demos/assets/sample.pdf: 16 pages with outline, internal and external links and
searchable text, so every feature of the viewer can be tried without third-party files."""
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

W, H = A4
colors = ["#0b5cad", "#2e7d32", "#b23c17", "#6a1b9a", "#00838f", "#ad1457", "#455a64", "#ef6c00"]
chapters = ["Einleitung", "Material", "Werkzeuge", "Gestaltung", "Produktion", "Versand", "Pflege", "Anhang"]
lorem = ("Die Brunnen werden aus einem Stück Naturstein gefertigt. Jeder Stein ist ein Unikat, "
         "Maserung und Farbe variieren. Quellsteine eignen sich für Garten und Terrasse. "
         "Über eine Pumpe läuft das Wasser im Kreislauf, der Verbrauch bleibt gering.")

path = "demos/assets/sample.pdf"
c = canvas.Canvas(path, pagesize=A4)
c.setTitle("pdflip Beispielkatalog")
c.setAuthor("pdflip")
pages = 16
for n in range(1, pages + 1):
    chapter = (n - 1) // 2
    color = HexColor(colors[chapter % len(colors)])
    if n == 1:
        c.setFillColor(HexColor("#0d2b45")); c.rect(0, 0, W, H, fill=1, stroke=0)
        c.setFillColor(white); c.setFont("Helvetica-Bold", 44)
        c.drawCentredString(W / 2, H * 0.62, "pdflip")
        c.setFont("Helvetica", 20); c.drawCentredString(W / 2, H * 0.55, "Beispielkatalog")
        c.setFont("Helvetica", 12); c.drawCentredString(W / 2, 80, "Open-Source PDF Flip Book")
    elif n == pages:
        c.setFillColor(HexColor("#0d2b45")); c.rect(0, 0, W, H, fill=1, stroke=0)
        c.setFillColor(white); c.setFont("Helvetica", 14)
        c.drawCentredString(W / 2, H / 2, "Rückseite – vielen Dank fürs Blättern")
        c.drawCentredString(W / 2, H / 2 - 30, "github.com/WapplerSystems/pdflip")
        c.linkURL("https://github.com/WapplerSystems/pdflip", (W / 2 - 140, H / 2 - 40, W / 2 + 140, H / 2 - 20))
    else:
        c.setFillColor(color); c.rect(0, H - 140, W, 140, fill=1, stroke=0)
        c.setFillColor(white); c.setFont("Helvetica-Bold", 30)
        c.drawString(50, H - 90, f"{chapters[chapter]}")
        c.setFont("Helvetica", 12); c.drawString(50, H - 120, f"Kapitel {chapter + 1} · Seite {n}")
        c.setFillColor(HexColor("#1f2328")); c.setFont("Helvetica", 11)
        y = H - 190
        for i in range(14):
            c.drawString(50, y, (lorem[(i * 23) % 60:] + " " + lorem)[:95]); y -= 18
        c.setFillColor(color); c.circle(W / 2, 230, 90, fill=1, stroke=0)
        c.setFillColor(white); c.setFont("Helvetica-Bold", 60); c.drawCentredString(W / 2, 210, str(n))
        if n == 2:
            c.setFillColor(HexColor("#0b5cad")); c.setFont("Helvetica", 12)
            for i, title in enumerate(chapters):
                target = 2 + i * 2
                yy = 110 - i * 0 if False else 120 - (i % 4) * 18
                xx = 50 if i < 4 else 300
                c.drawString(xx, yy, f"→ {title} (S. {target})")
                c.linkRect("", f"p{target}", (xx, yy - 4, xx + 200, yy + 12), relative=0)
    c.bookmarkPage(f"p{n}")
    if n == 1:
        c.addOutlineEntry("Titel", "p1", level=0)
    elif n % 2 == 0 and n < pages:
        c.addOutlineEntry(chapters[chapter], f"p{n}", level=0)
        c.addOutlineEntry(f"Details Seite {n + 1}", f"p{n + 1}", level=1) if n + 1 < pages else None
    c.showPage()
c.showOutline()
c.save()
print("written", path)
