from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import BaseDocTemplate, Frame, PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parents[2]
OUTPUT_DIR = ROOT / "docs" / "entregas" / "evidencia-r5"
MANUAL_OUTPUT = OUTPUT_DIR / "r5-validacion-paso-1-decision-manual.pdf"
ALGORITHM_OUTPUT = OUTPUT_DIR / "r5-validacion-paso-2-propuesta-algoritmo.pdf"

BLACK = colors.black
GRID = colors.HexColor("#8A8A8A")
TEXT = colors.black
MUTED = colors.HexColor("#333333")
WHITE = colors.white

PAGE_SIZE = landscape(A4)
PAGE_W, PAGE_H = PAGE_SIZE
LEFT = 10 * mm
RIGHT = 10 * mm
TOP = 10 * mm
BOTTOM = 10 * mm

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="TitleR5", fontName="Times-Bold", fontSize=18, leading=21, textColor=BLACK))
styles.add(ParagraphStyle(name="LeadR5", fontName="Times-Roman", fontSize=9, leading=11, textColor=MUTED))
styles.add(ParagraphStyle(name="BodyR5", fontName="Times-Roman", fontSize=7.4, leading=8.8, textColor=TEXT))
styles.add(ParagraphStyle(name="HeaderR5", fontName="Times-Bold", fontSize=7.2, leading=8.6, textColor=BLACK))
styles.add(ParagraphStyle(name="CaseR5", fontName="Times-Bold", fontSize=8.5, leading=9.5, textColor=BLACK))
styles.add(ParagraphStyle(name="FlowR5", fontName="Times-Roman", fontSize=7.1, leading=8.5, textColor=TEXT))
styles.add(ParagraphStyle(name="NoteR5", fontName="Times-Roman", fontSize=7.3, leading=8.8, textColor=TEXT))


CASES = [
    ("H01", "50 polos publicitarios", "Algodón jersey 30/1", "Estampado", "5 días de producción", "Taller A: compra de tela → diseño → corte → costura → estampado → limpieza final"),
    ("H02", "300 polos deportivos", "Poliéster", "Estampado", "12 días calendario", "Sin asignación: ‘poliéster’ no identifica una calidad compatible con los productores registrados"),
    ("H03", "180 polos publicitarios", "Algodón pyme", "Estampado", "5 días, incluida muestra", "Taller A: compra de tela → diseño → corte → costura → estampado → limpieza final"),
    ("H04", "4000 polos deportivos", "Hydrotech", "Sublimado", "10 días calendario", "Sin asignación: la cantidad excede la capacidad registrada dentro del plazo"),
    ("H05", "100 polos básicos", "Algodón 30/1", "Estampado", "10 días calendario", "Taller A: compra de tela → diseño → corte → costura → estampado → limpieza final"),
    ("H06", "188 polos deportivos", "Dry Fit", "Estampado", "15 días desde muestra", "Taller B: compra de tela → diseño → corte → costura → estampado → limpieza final"),
    ("H07", "110 polos camiseros", "Franela 20/1, 60/40", "4 bordados por polo", "20 días calendario", "Perú Activa: compra de tela → Taller A: diseño y corte → Taller G: 440 bordados → Taller A: costura y limpieza"),
    ("H08", "25 polos básicos", "Algodón reactivo 20/1", "1 bordado por polo", "7 días calendario", "Taller A: compra de tela, diseño y corte → Taller F: 25 bordados → Taller A: costura y limpieza"),
    ("H09", "50 polos deportivos", "Inter Dryer Dry Fit", "Sublimado", "25 días desde aprobación", "Perú Activa: compra de tela → Taller D: diseño, impresión, calandra y corte → Taller B: costura y limpieza"),
    ("H10", "100 polos deportivos", "Dry Fit Premium", "No especificada", "10 días (provisional)", "Taller B: compra de tela → diseño → corte → costura → limpieza final; personalización no especificada"),
    ("H11", "167 polos camiseros", "Algodón", "2 bordados por polo", "7 días calendario", "Taller A: compra de tela, diseño y corte → Taller G: 334 bordados → Taller A: costura y limpieza"),
    ("H12", "1000 polos camiseros", "Piqué de algodón 24/1", "No especificada", "20 días calendario", "Perú Activa: compra de tela → Taller A: diseño → corte → costura → limpieza final"),
    ("H13", "100 polos camiseros", "Piqué de algodón 24/1", "2 bordados por polo", "5 días calendario", "Taller A: compra de tela, diseño y corte → Taller G: 200 bordados → Taller A: costura y limpieza"),
    ("H14", "116 polos camiseros", "Jacquard", "2 bordados por polo", "10 días", "Sin asignación: no existe productor camisero registrado para Jacquard"),
    ("H15", "2731 polos camiseros", "Interlock 59 % pima/41 % poliéster", "1 bordado por polo", "20 días calendario", "Perú Activa: compra de tela → Taller A: diseño y corte → Taller G: 2731 bordados → Taller A: costura y limpieza"),
    ("H16", "50 polos deportivos", "Hydrotech", "Sublimado y bordado", "10 días (provisional)", "Perú Activa: compra de tela → Taller D: diseño, impresión, calandra y corte → Taller F: bordado → Taller B: costura y limpieza"),
    ("H17", "60 polos deportivos", "Dry Fit de poliéster", "Sublimado", "10 días (provisional)", "Taller B: compra de tela → Taller D: diseño, impresión, calandra y corte → Taller B: costura y limpieza"),
    ("H18", "30 polos deportivos", "Microfibra deportiva", "Sublimado", "10 días hábiles", "Taller B: compra de tela → Taller D: diseño, impresión, calandra y corte → Taller B: costura y limpieza"),
    ("H19", "178 polos camiseros", "Piqué Lacoste reactivo", "No especificada", "10 días (provisional)", "Taller A: compra de tela → diseño → corte → costura → limpieza final; personalización no especificada"),
    ("H20", "410 polos deportivos", "Poly Tricot", "No especificada", "10 días (provisional)", "Perú Activa: compra de tela → Taller B: diseño → corte → costura → limpieza final; personalización no especificada"),
]


def p(text, style="BodyR5"):
    return Paragraph(text, styles[style])


def case_input(item):
    return f"<b>{item[1]}</b><br/>Tela: {item[2]}<br/>Personalización: {item[3]}"


def styled_table(rows, widths):
    table = Table(rows, colWidths=widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), WHITE),
        ("BOX", (0, 0), (-1, -1), 0.8, BLACK),
        ("LINEBELOW", (0, 0), (-1, 0), 1.0, BLACK),
        ("INNERGRID", (0, 0), (-1, -1), 0.35, GRID),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (0, 1), (0, -1), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 1), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 5),
        ("BACKGROUND", (0, 1), (-1, -1), WHITE),
    ]))
    return table


def manual_table(items):
    headers = ["Caso", "Pedido", "Plazo", "Decisión manual de Perú Activa", "¿Habría conflicto?", "Razón u observación"]
    rows = [[p(value, "HeaderR5") for value in headers]]
    for item in items:
        rows.append([
            p(item[0], "CaseR5"), p(case_input(item)), p(item[4]),
            p("Taller(es): __________________________<br/>Proceso: ____________________________<br/>[ ] Sin asignación factible", "NoteR5"),
            p("[ ] Sí<br/>[ ] No", "NoteR5"),
            p("[ ] Especialidad  [ ] Capacidad<br/>[ ] Disponibilidad  [ ] Plazo<br/>Otra: __________________________", "NoteR5"),
        ])
    return styled_table(rows, [10*mm, 62*mm, 31*mm, 72*mm, 28*mm, 74*mm])


def algorithm_table(items):
    headers = ["Caso", "Pedido", "Plazo", "Propuesta automática", "¿Correcta?", "Razón o corrección"]
    rows = [[p(value, "HeaderR5") for value in headers]]
    for item in items:
        rows.append([
            p(item[0], "CaseR5"), p(case_input(item)), p(item[4]), p(item[5], "FlowR5"),
            p("[ ] Sí<br/>[ ] No", "NoteR5"),
            p("[ ] Especialidad  [ ] Capacidad<br/>[ ] Disponibilidad  [ ] Plazo<br/>Corrección: ____________________", "NoteR5"),
        ])
    return styled_table(rows, [10*mm, 55*mm, 28*mm, 96*mm, 22*mm, 66*mm])


def build_story(step):
    story = []
    for page, chunk in enumerate((CASES[:10], CASES[10:]), start=1):
        if step == 1:
            title = "Paso 1: decisión manual sin ver el algoritmo"
            lead = "Complete primero este documento. Indique el taller o ruta que Perú Activa habría elegido y si el proceso manual habría generado algún conflicto. No consulte el Paso 2 hasta terminar los veinte casos."
            table = manual_table(chunk)
        else:
            title = "Paso 2: evaluación de la propuesta automática"
            lead = "Después de completar el Paso 1, compare cada decisión con la propuesta calculada. Marque si es correcta; explique solamente los errores o cambios necesarios. El algoritmo obtuvo 17 planes factibles y 3 rechazos."
            table = algorithm_table(chunk)
        story.extend([p(title, "TitleR5"), Spacer(1, 1.5*mm), p(lead, "LeadR5"), Spacer(1, 2.5*mm), table])
        if page == 2:
            story.extend([
                Spacer(1, 2.5*mm),
                Table([[p("Revisado por: __________________________", "NoteR5"), p("Fecha: ____ / ____ / 2026", "NoteR5"), p("Firma o conformidad: __________________________", "NoteR5")]], colWidths=[100*mm, 70*mm, 107*mm], style=TableStyle([
                    ("BOX", (0,0), (-1,-1), 0.65, BLACK), ("LEFTPADDING", (0,0), (-1,-1), 6),
                    ("RIGHTPADDING", (0,0), (-1,-1), 6), ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6),
                ])),
            ])
        else:
            story.append(PageBreak())
    return story


def build(path, step):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    frame = Frame(LEFT, BOTTOM, PAGE_W-LEFT-RIGHT, PAGE_H-TOP-BOTTOM, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0, id="r5")
    doc = BaseDocTemplate(
        str(path),
        pagesize=PAGE_SIZE,
        leftMargin=LEFT,
        rightMargin=RIGHT,
        topMargin=TOP,
        bottomMargin=BOTTOM,
        title=f"R5 - Validación paso {step}",
        author="Revisión 2026-2",
        subject="Instrumento anonimizado para Perú Activa",
        invariant=1,
    )
    doc.addPageTemplates([PageTemplate(id="r5", frames=[frame])])
    doc.build(build_story(step))


if __name__ == "__main__":
    build(MANUAL_OUTPUT, 1)
    build(ALGORITHM_OUTPUT, 2)
    print(MANUAL_OUTPUT)
    print(ALGORITHM_OUTPUT)
