#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

import matplotlib.pyplot as plt
from PIL import Image


def ecdf(samples):
    ordered = sorted(samples)
    count = len(ordered)
    return ordered, [(index + 1) * 100 / count for index in range(count)]


def main():
    parser = argparse.ArgumentParser(description="Genera la ECDF de latencias de R4.")
    parser.add_argument(
        "--input",
        default="docs/entregas/evidencia-r4/postman/reporte-postman-r4.json",
    )
    parser.add_argument(
        "--output-dir",
        default="docs/entregas/evidencia-r4/figures",
    )
    args = parser.parse_args()

    report = json.loads(Path(args.input).read_text(encoding="utf-8"))
    verification = report["verification"]
    limit_ms = verification["latencyLimitMs"]
    series = [
        (
            "Consulta ejecutada en AWS",
            verification["serverQuery"]["samplesMs"],
            "#1B365D",
        ),
        (
            "Respuesta HTTP observada desde el ejecutor",
            verification["externalHttpResponse"]["samplesMs"],
            "#8A3B12",
        ),
    ]

    plt.rcParams.update(
        {
            "font.family": "serif",
            "font.size": 11,
            "axes.edgecolor": "#444444",
            "axes.linewidth": 0.8,
        }
    )
    figure, axes = plt.subplots(2, 1, figsize=(8.1, 5.6), sharex=True)

    for axis, (label, samples, color) in zip(axes, series, strict=True):
        x_values, y_values = ecdf(samples)
        axis.step(x_values, y_values, where="post", color=color, linewidth=2.0)
        axis.axvline(
            limit_ms,
            color="#555555",
            linewidth=1.2,
            linestyle="--",
            label=f"Límite del IOV: {limit_ms} ms",
        )
        axis.set_title(label, loc="left", fontsize=11, fontweight="normal")
        axis.set_ylabel("Porcentaje acumulado (%)")
        axis.set_ylim(0, 102)
        axis.set_xlim(0, limit_ms * 1.04)
        axis.grid(axis="y", color="#D7D7D7", linewidth=0.6)
        axis.legend(loc="lower right", frameon=False, fontsize=9)
        axis.text(
            0.99,
            0.16,
            f"n = {len(samples)} · máximo = {max(samples):.3f} ms",
            transform=axis.transAxes,
            ha="right",
            va="bottom",
            fontsize=9,
            color="#333333",
        )

    axes[-1].set_xlabel("Latencia (ms)")
    figure.tight_layout(h_pad=1.1)

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    png_path = output_dir / "ecdf-latencias-r4.png"
    pdf_path = output_dir / "ecdf-latencias-r4.pdf"
    figure.savefig(png_path, dpi=300, bbox_inches="tight", facecolor="white")
    figure.savefig(
        pdf_path,
        bbox_inches="tight",
        facecolor="white",
        metadata={
            "Title": "Distribución acumulada de latencias de R4",
            "Author": "Kevin Navarro y Luis Flores",
        },
    )
    plt.close(figure)

    with Image.open(png_path) as image:
        image.convert("RGB").save(png_path, format="PNG", optimize=True)

    print(png_path)
    print(pdf_path)


if __name__ == "__main__":
    main()
