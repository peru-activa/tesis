import argparse
import html
import json
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[2]
OUTPUT_DIR = ROOT / "docs" / "entregas" / "evidencia-r5"
DEFAULT_RESULTS = OUTPUT_DIR / "r5-resultados-algoritmo.json"
DEFAULT_OUTPUT = OUTPUT_DIR / "r5-validacion-comparativa-peru-activa.pdf"

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
styles.add(ParagraphStyle(name="SummaryR5", fontName="Times-Roman", fontSize=9, leading=11, textColor=TEXT))
styles.add(ParagraphStyle(name="SummaryStrongR5", fontName="Times-Bold", fontSize=9, leading=11, textColor=BLACK))

POLO_TYPE_LABELS = {
    "cotton_advertising": "polos publicitarios",
    "cotton_basic": "polos básicos",
    "collared": "polos camiseros",
    "sports": "polos deportivos",
    "stretch": "polos de licra",
}

PROCESS_LABELS = {
    "fabric_sourcing": "compra de tela",
    "patternmaking": "molde",
    "design": "diseño",
    "transfer_printing": "impresión",
    "sublimation": "calandra y sublimado",
    "cutting": "corte",
    "embroidery": "bordado",
    "sewing": "costura",
    "printing": "estampado",
    "vinyl": "vinil",
    "notions": "avíos",
    "ironing": "planchado",
    "finishing": "limpieza final",
    "quality_control": "control de calidad",
    "delivery": "entrega",
}

PROCESS_PHASES = {
    "fabric_sourcing": 0,
    "patternmaking": 1,
    "design": 1,
    "transfer_printing": 1,
    "sublimation": 1,
    "cutting": 1,
    "embroidery": 2,
    "sewing": 3,
    "printing": 3,
    "vinyl": 3,
    "notions": 3,
    "ironing": 3,
    "finishing": 3,
    "quality_control": 3,
    "delivery": 3,
}

PROCESS_ORDER = {
    process: index
    for index, process in enumerate(
        [
            "fabric_sourcing",
            "patternmaking",
            "design",
            "transfer_printing",
            "sublimation",
            "cutting",
            "embroidery",
            "sewing",
            "printing",
            "vinyl",
            "notions",
            "ironing",
            "finishing",
            "quality_control",
            "delivery",
        ]
    )
}

def p(text, style="BodyR5"):
    return Paragraph(text, styles[style])


def short_workshop(name):
    return name.split(" ·", 1)[0]


def deadline_label(item):
    original = item["input"].get("originalLeadTime")
    if original:
        label = original.replace("calendario desde", "desde")
        if item["input"].get("leadTimeScope") == "complete_order":
            label += " (pedido completo)"
        return label
    return "No indicado"


def calculated_time_label(item):
    days = item["genetic"].get("calculatedLeadTimeDays")
    if days is None:
        projected = item["genetic"].get("projectedLeadTimeDays")
        if projected is not None:
            return f"{projected} días (fuera del plazo)"
        return "No calculable"
    return f"{days} día{'s' if days != 1 else ''}"


def received_deadline_days(item):
    original = item["input"].get("originalLeadTime")
    if not original:
        return None
    if "semana" in original.lower():
        match = re.search(r"\d+", original)
        return (int(match.group()) if match else 1) * 7
    match = re.search(r"\d+", original)
    if match:
        return int(match.group())
    return None


def margin_label(item):
    received = received_deadline_days(item)
    calculated = item["genetic"].get("calculatedLeadTimeDays")
    if calculated is None:
        calculated = item["genetic"].get("projectedLeadTimeDays")
    if received is None or calculated is None:
        return "No aplica"
    margin = received - calculated
    return f"{margin} día{'s' if abs(margin) != 1 else ''}"


def customization_label(item):
    source = item["input"]
    main = source["customization"]
    additional = source.get("additionalCustomizations", [])
    applications = source.get("embroideryApplicationsPerGarment", 1)
    labels = []
    if main == "printing":
        labels.append("Estampado")
    elif main == "sublimation":
        labels.append("Sublimado")
    elif main == "embroidery":
        labels.append(f"{applications} bordado{'s' if applications != 1 else ''} por polo")
    if "embroidery" in additional:
        labels.append(f"{applications} bordado{'s' if applications != 1 else ''} por polo")
    if "vinyl" in additional:
        labels.append("Vinil")
    return " y ".join(labels) if labels else "No especificada"


def case_input(item):
    source = item["input"]
    order = f"{source['quantity']} {POLO_TYPE_LABELS[source['poloType']]}"
    material = source["material"]
    alternatives = source.get("materialAlternatives", [])
    if len(alternatives) > 1:
        material = f"{material} (alternativas: {' / '.join(alternatives)})"
    return (
        f"<b>{html.escape(order)}</b><br/>"
        f"Tela: {html.escape(material)}<br/>"
        f"Personalización: {html.escape(customization_label(item))}"
    )


def process_events(item):
    result = item["genetic"]
    allocations = result["allocation"]
    allocation_by_workshop = {entry["workshop"]: entry for entry in allocations}
    raw = result.get("workflow", [])
    if raw:
        events = [
            {
                "workshop": step["workshop"],
                "process": step["process"],
                "quantity": allocation_by_workshop[step["workshop"]]["quantity"],
            }
            for step in raw
        ]
    else:
        events = [
            {"workshop": allocation["workshop"], "process": process, "quantity": allocation["quantity"]}
            for allocation in allocations
            for process in allocation["processes"]
        ]
    return sorted(
        events,
        key=lambda event: (
            PROCESS_PHASES.get(event["process"], 9),
            PROCESS_ORDER.get(event["process"], 99),
            event["workshop"],
        ),
    )


def proposal_text(item):
    if not item["genetic"]["feasible"]:
        supply = item["input"].get("fabricSupply", {})
        projected = item["genetic"].get("projectedLeadTimeDays")
        if supply.get("category") == "imported":
            total = f"; tiempo total conservador: {projected} días" if projected is not None else ""
            return (
                "<b>Sin asignación dentro del plazo</b>: la tela está fuera del catálogo inmediato y requiere "
                f"entre {supply.get('minimumLeadTimeDays')} y {supply.get('maximumLeadTimeDays')} días de abastecimiento{total}."
            )
        reasons = ", ".join(item.get("rejectionReasons", [])) or "sin ruta factible"
        return f"Sin asignación: {html.escape(reasons)}"

    events = process_events(item)
    phases = []
    if item["input"]["fabricBuyer"] == "peru_activa":
        phases.append("<b>Perú Activa</b>: compra de tela")

    total_quantity = item["input"]["quantity"]
    applications = item["input"].get("embroideryApplicationsPerGarment", 1)
    for phase in range(4):
        phase_events = [event for event in events if PROCESS_PHASES.get(event["process"], 9) == phase]
        grouped = {}
        for event in phase_events:
            grouped.setdefault(event["workshop"], {"quantity": event["quantity"], "processes": []})
            if event["process"] not in grouped[event["workshop"]]["processes"]:
                grouped[event["workshop"]]["processes"].append(event["process"])
        segments = []
        for workshop, group in grouped.items():
            process_labels = [PROCESS_LABELS.get(value, value) for value in group["processes"]]
            details = " → ".join(process_labels)
            suffix = ""
            if len(grouped) > 1 and group["quantity"] != total_quantity:
                suffix = f" ({group['quantity']} polos)"
            if "embroidery" in group["processes"]:
                suffix = f" ({group['quantity'] * applications} bordados)"
            segments.append(f"<b>{html.escape(short_workshop(workshop))}</b>: {html.escape(details + suffix)}")
        if segments:
            phases.append(" + ".join(segments))

    route = " → ".join(phases)
    alternatives = item["input"].get("materialAlternatives", [])
    if len(alternatives) > 1:
        route = f"<b>{html.escape(' o '.join(alternatives))}</b>: {route}"
    return route


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


def manual_example_answer(item):
    allocations = item["genetic"]["allocation"]
    if not allocations:
        supply = item["input"].get("fabricSupply", {})
        reason = "Pedido sin asignación factible dentro del plazo."
        if supply.get("category") == "imported":
            reason = (
                "Plazo: la tela requiere entre "
                f"{supply.get('minimumLeadTimeDays')} y {supply.get('maximumLeadTimeDays')} días de abastecimiento."
            )
        return (
            "Taller(es): —<br/>[X] Sin asignación factible",
            "[ ] Sí<br/>[X] No",
            html.escape(reason),
        )
    workshops = " + ".join(dict.fromkeys(short_workshop(entry["workshop"]) for entry in allocations))
    return (
        f"Taller(es): <b>{html.escape(workshops)}</b><br/>"
        "[ ] Sin asignación factible",
        "[ ] Sí<br/>[X] No",
        "Sin conflicto previsto.",
    )


def manual_table(items, example_filled=False):
    headers = ["Caso", "Pedido", "Plazo recibido del cliente", "Decisión manual de Perú Activa", "¿Habría conflicto?", "Razón u observación"]
    rows = [[p(value, "HeaderR5") for value in headers]]
    for item in items:
        if example_filled:
            decision, conflict, reason = manual_example_answer(item)
        else:
            decision = "Taller(es): __________________________<br/>[ ] Sin asignación factible"
            conflict = "[ ] Sí<br/>[ ] No"
            reason = "[ ] Especialidad  [ ] Capacidad<br/>[ ] Disponibilidad  [ ] Plazo<br/>Otra: __________________________"
        rows.append([
            p(item["caseId"], "CaseR5"),
            p(case_input(item)),
            p(html.escape(deadline_label(item))),
            p(decision, "NoteR5"),
            p(conflict, "NoteR5"),
            p(reason, "NoteR5"),
        ])
    return styled_table(rows, [10*mm, 62*mm, 31*mm, 72*mm, 28*mm, 74*mm])


def algorithm_table(items, example_filled=False):
    headers = [
        "Caso",
        "Pedido",
        "Plazo recibido del cliente",
        "Tiempo calculado por el algoritmo",
        "Margen",
        "Propuesta automática",
        "¿Correcta?",
        "Razón o corrección",
    ]
    rows = [[p(value, "HeaderR5") for value in headers]]
    for item in items:
        correctness = "[X] Sí<br/>[ ] No" if example_filled else "[ ] Sí<br/>[ ] No"
        review = (
            "[X] Especialidad  [X] Capacidad<br/>[X] Disponibilidad  [X] Plazo<br/>Corrección: ninguna"
            if example_filled
            else "[ ] Especialidad  [ ] Capacidad<br/>[ ] Disponibilidad  [ ] Plazo<br/>Corrección: ____________________"
        )
        rows.append([
            p(item["caseId"], "CaseR5"),
            p(case_input(item)),
            p(html.escape(deadline_label(item))),
            p(html.escape(calculated_time_label(item))),
            p(html.escape(margin_label(item))),
            p(proposal_text(item), "FlowR5"),
            p(correctness, "NoteR5"),
            p(review, "NoteR5"),
        ])
    return styled_table(rows, [10*mm, 46*mm, 30*mm, 23*mm, 18*mm, 80*mm, 20*mm, 50*mm])


def signature_block(example_filled=False):
    if example_filled:
        values = [
            "Revisado por: EJEMPLO SIMULADO",
            "Fecha: 03 / 09 / 2026",
            "Firma o conformidad: NO APLICA",
        ]
    else:
        values = [
            "Revisado por: __________________________",
            "Fecha: ____ / ____ / 2026",
            "Firma o conformidad: __________________________",
        ]
    return Table(
        [[
            p(values[0], "NoteR5"),
            p(values[1], "NoteR5"),
            p(values[2], "NoteR5"),
        ]],
        colWidths=[100*mm, 70*mm, 107*mm],
        style=TableStyle([
            ("BOX", (0,0), (-1,-1), 0.65, BLACK),
            ("LEFTPADDING", (0,0), (-1,-1), 6),
            ("RIGHTPADDING", (0,0), (-1,-1), 6),
            ("TOPPADDING", (0,0), (-1,-1), 6),
            ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ]),
    )


def final_result_page(data, example_filled=False):
    summary = data["summary"]
    cases = summary["independentHistoricalCases"]
    technical_result = (
        f"{cases}/{cases} casos procesados<br/>"
        f"{summary['feasibleByBoth']} factibles · {summary['rejectedByBoth']} rechazos"
    )
    technical_status = "CUMPLE técnicamente" if cases == 20 else "REVISAR"
    headers = ["Indicador", "Cómo se obtiene", "Meta para considerar logrado", "Resultado final", "¿Cumple?"]
    rows = [[p(value, "HeaderR5") for value in headers]]
    if example_filled:
        human_results = {
            "agreement": ("Correctas: <b>20 / 20</b><br/>Resultado: <b>100 %</b>", "[X] Sí   [ ] No<br/>[ ] Pendiente"),
            "validity": ("Válidas: <b>20 / 20</b><br/>Resultado: <b>100 %</b>", "[X] Sí   [ ] No<br/>[ ] Pendiente"),
            "reduction": ("Manual: <b>0</b><br/>Automático: <b>0</b><br/>Reducción: <b>No aplica</b>", "[ ] Sí   [ ] No<br/>[X] No aplica"),
        }
    else:
        human_results = {
            "agreement": ("Correctas: ____ / 20<br/>Resultado: ______ %", "[ ] Sí   [ ] No<br/>[ ] Pendiente"),
            "validity": ("Válidas: ____ / 20<br/>Resultado: ______ %", "[ ] Sí   [ ] No<br/>[ ] Pendiente"),
            "reduction": ("Manual: ____<br/>Automático: ____<br/>Reducción: ______ %", "[ ] Sí   [ ] No<br/>[ ] No aplica"),
        }

    rows.extend([
        [
            p("Ejecución reproducible", "SummaryStrongR5"),
            p("Casos H01-H20 ejecutados por la línea base y el algoritmo genético.", "SummaryR5"),
            p("20 de 20 casos procesados", "SummaryR5"),
            p(technical_result, "SummaryR5"),
            p(technical_status, "SummaryStrongR5"),
        ],
        [
            p("Coincidencia con Perú Activa", "SummaryStrongR5"),
            p("Propuestas marcadas como correctas ÷ 20 × 100.", "SummaryR5"),
            p("Al menos 19 de 20 (95 %)", "SummaryR5"),
            p(human_results["agreement"][0], "SummaryR5"),
            p(human_results["agreement"][1], "SummaryR5"),
        ],
        [
            p("Asignaciones válidas", "SummaryStrongR5"),
            p("Propuestas sin conflicto de especialidad, capacidad, disponibilidad ni plazo ÷ 20 × 100.", "SummaryR5"),
            p("20 de 20 (100 %)", "SummaryR5"),
            p(human_results["validity"][0], "SummaryR5"),
            p(human_results["validity"][1], "SummaryR5"),
        ],
        [
            p("Reducción de conflictos", "SummaryStrongR5"),
            p("(Conflictos manuales - conflictos automáticos) ÷ conflictos manuales × 100.", "SummaryR5"),
            p("Al menos 60 %", "SummaryR5"),
            p(human_results["reduction"][0], "SummaryR5"),
            p(human_results["reduction"][1], "SummaryR5"),
        ],
    ])
    result_table = Table(rows, colWidths=[43*mm, 73*mm, 47*mm, 61*mm, 53*mm], repeatRows=1)
    result_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E8E8E8")),
        ("BOX", (0, 0), (-1, -1), 0.9, BLACK),
        ("INNERGRID", (0, 0), (-1, -1), 0.45, GRID),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))

    if example_filled:
        conclusion_text = (
            "<b>Conclusión de R5 - EJEMPLO SIMULADO</b><br/><br/>"
            "[ ] Validado: cumple todas las metas. &nbsp;&nbsp;&nbsp; "
            "[ ] Requiere correcciones. &nbsp;&nbsp;&nbsp; "
            "[X] Inconcluso: no hubo conflictos manuales para calcular la reducción.<br/><br/>"
            "Observación final: coincidencia y validez alcanzaron 100 %; la reducción de conflictos no es calculable con cero conflictos manuales.<br/><br/>"
            "Responsable: EJEMPLO SIMULADO &nbsp;&nbsp; Fecha: 03 / 09 / 2026 &nbsp;&nbsp; Firma: NO APLICA"
        )
    else:
        conclusion_text = (
            "<b>Conclusión de R5</b><br/><br/>"
            "[ ] Validado: cumple todas las metas. &nbsp;&nbsp;&nbsp; "
            "[ ] Requiere correcciones. &nbsp;&nbsp;&nbsp; "
            "[ ] Inconcluso: no hubo conflictos manuales para calcular la reducción.<br/><br/>"
            "Observación final: ____________________________________________________________________________________<br/><br/>"
            "Responsable de Perú Activa: ______________________________ &nbsp;&nbsp; Fecha: ____ / ____ / 2026 &nbsp;&nbsp; Firma: ____________________"
        )

    conclusion = Table(
        [[p(
            conclusion_text,
            "SummaryR5",
        )]],
        colWidths=[277*mm],
        style=TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.9, BLACK),
            ("LEFTPADDING", (0, 0), (-1, -1), 9),
            ("RIGHTPADDING", (0, 0), (-1, -1), 9),
            ("TOPPADDING", (0, 0), (-1, -1), 9),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
        ]),
    )

    if example_filled:
        example_text = (
            "<b>Cómo leer este ejemplo:</b> Perú Activa eligió rutas manuales válidas en los veinte casos y el algoritmo también produjo veinte propuestas válidas. "
            "Como el proceso manual no dejó conflictos, no existe una base distinta de cero para calcular su reducción."
        )
    else:
        example_text = (
            "<b>Regla de lectura:</b> 19 propuestas correctas de 20 equivalen a 95 % y 20 asignaciones válidas de 20 equivalen a 100 %. "
            "Si no hubo conflictos manuales, la reducción no se calcula y debe marcarse «No aplica»."
        )

    example = Table(
        [[p(
            example_text,
            "SummaryR5",
        )]],
        colWidths=[277*mm],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F2F2F2")),
            ("BOX", (0, 0), (-1, -1), 0.6, GRID),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ]),
    )

    final_lead = (
        "Esta página muestra cómo quedaría el cierre en un escenario ideal pero plausible. "
        "Los valores son simulados y deberán sustituirse por las marcas reales de Perú Activa."
        if example_filled
        else "Complete esta página únicamente después de responder los veinte casos. La ejecución técnica ya está registrada; "
             "los indicadores humanos deben calcularse con las marcas reales de Perú Activa."
    )

    return [
        p("Resultado final: ¿se logró?" + (" - EJEMPLO SIMULADO" if example_filled else ""), "TitleR5"),
        Spacer(1, 1.5*mm),
        p(final_lead, "LeadR5"),
        Spacer(1, 4*mm),
        result_table,
        Spacer(1, 5*mm),
        conclusion,
        Spacer(1, 5*mm),
        example,
        Spacer(1, 4*mm),
        p(
            "La ejecución de 20 casos demuestra el funcionamiento técnico, pero R5 se considera validado únicamente cuando "
            "Perú Activa completa la evaluación y las metas humanas indicadas resultan satisfechas.",
            "LeadR5",
        ),
    ]


def build_story(data, example_filled=False):
    story = []
    rows = [{**row, "evaluatedAt": data["evaluatedAt"]} for row in data["rows"]]
    summary = data["summary"]
    for step in (1, 2):
        chunks = (rows[:10], rows[10:])
        for page, chunk in enumerate(chunks, start=1):
            if step == 1:
                title = "Paso 1: decisión manual sin ver el algoritmo"
                lead = (
                    "Complete primero las páginas 1 y 2. Indique el taller o los talleres que Perú Activa habría elegido y si la decisión manual habría generado algún conflicto. "
                    "No consulte las páginas 3 y 4 hasta terminar los veinte casos."
                )
                table = manual_table(chunk, example_filled)
            else:
                title = "Paso 2: evaluación de la propuesta automática"
                lead = (
                    "Después de completar el Paso 1, compare cada decisión con la propuesta calculada y marque si es correcta. "
                    f"La ejecución {html.escape(data['datasetVersion'])}, semilla {data['seed']}, obtuvo "
                    f"{summary['feasibleByBoth']} planes factibles y {summary['rejectedByBoth']} rechazos. "
                    "Si el cliente no indicó plazo, el margen figura como no aplicable."
                )
                table = algorithm_table(chunk, example_filled)
            if example_filled:
                title += " - EJEMPLO SIMULADO"
                lead = "<b>Documento de muestra. No constituye una respuesta ni validación real de Perú Activa.</b> " + lead
            story.extend([p(title, "TitleR5"), Spacer(1, 1.5*mm), p(lead, "LeadR5"), Spacer(1, 2.5*mm), table])
            if page == 2:
                story.extend([Spacer(1, 2.5*mm), signature_block(example_filled)])
            if not (step == 2 and page == 2):
                story.append(PageBreak())
    story.append(PageBreak())
    story.extend(final_result_page(data, example_filled))
    return story


def load_results(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    ids = [row["caseId"] for row in data.get("rows", [])]
    expected = [f"H{index:02d}" for index in range(1, 21)]
    if ids != expected:
        raise ValueError(f"Se esperaban H01-H20 en orden; se obtuvo {ids}")
    if data.get("iovValidated") is not False:
        raise ValueError("El instrumento previo al veredicto no puede declarar el IOV validado.")
    summary = data["summary"]
    if summary["independentHistoricalCases"] != 20:
        raise ValueError("La salida no contiene veinte casos históricos.")
    for row in data["rows"]:
        if row["genetic"]["feasible"] and not row["genetic"]["allocation"]:
            raise ValueError(f"{row['caseId']} es factible pero no contiene asignación.")
    return data


def build(results_path, output_path, example_filled=False):
    data = load_results(results_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    frame = Frame(
        LEFT,
        BOTTOM,
        PAGE_W-LEFT-RIGHT,
        PAGE_H-TOP-BOTTOM,
        leftPadding=0,
        rightPadding=0,
        topPadding=0,
        bottomPadding=0,
        id="r5",
    )
    doc = BaseDocTemplate(
        str(output_path),
        pagesize=PAGE_SIZE,
        leftMargin=LEFT,
        rightMargin=RIGHT,
        topMargin=TOP,
        bottomMargin=BOTTOM,
        title="R5 - Validación comparativa de Perú Activa",
        author="Revisión 2026-2",
        subject=(
            "Ejemplo simulado de llenado; no constituye validación real"
            if example_filled
            else "Instrumento anonimizado generado desde la salida del algoritmo"
        ),
        invariant=1,
    )
    doc.addPageTemplates([PageTemplate(id="r5", frames=[frame])])
    doc.build(build_story(data, example_filled))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Genera el instrumento único R5 desde la salida JSON del algoritmo.")
    parser.add_argument("--results", type=Path, default=DEFAULT_RESULTS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--example-filled", action="store_true", help="Genera una muestra completamente llenada y marcada como simulada.")
    args = parser.parse_args()
    build(args.results, args.output, args.example_filled)
    print(args.output)
