#!/usr/bin/env python3
"""Importa Painel_Casa_do_Trabalhador.xlsx -> data/painel.db (SQLite)."""

from __future__ import annotations

import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from pathlib import Path

import db

ROOT = Path(__file__).resolve().parent
XLSX = ROOT / "Painel_Casa_do_Trabalhador.xlsx"

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

FRENTE_TO_BLOCO = {
    "Infraestrutura": "reforma",
    "Restauro e Patrimônio Histórico": "restauro",
    "Equipamentos e Mobiliário": "aquisicao",
    "Comunicação Institucional": "comunicacao",
    "Evento de Inauguração": "inauguracao",
    "Parcerias Institucionais": "parcerias",
    "Implantação dos Serviços": "mudanca",
    "Gestão Patrimonial": "patrimonio",
    "Gestão Contratual e Financeira": "financeiro",
    "Tecnologia e Infraestrutura Operacional": "ti",
}

BLOCO_LABELS = db.BLOCO_LABELS

EXTRA_ITEMS = [
    {
        "id": "101",
        "frente": "Evento de Inauguração",
        "entrega": "Reunião FONSET",
        "inicio": "",
        "nup": "",
        "responsavel": "Luan",
        "parceiros": "FONSET",
        "prioridade": "Alta",
        "prazo": "",
        "status": "Não iniciado",
        "pct": "",
        "proxima": "Agendar e confirmar pauta com FONSET",
        "obs": "Item incluído a partir do escopo de monitoramento do gerente",
    },
    {
        "id": "102",
        "frente": "Evento de Inauguração",
        "entrega": "Black Friday (27/11)",
        "inicio": "",
        "nup": "",
        "responsavel": "Luan",
        "parceiros": "",
        "prioridade": "Média",
        "prazo": "2026-11-27",
        "status": "Não iniciado",
        "pct": "",
        "proxima": "Alinhar programação e logística do dia 27/11",
        "obs": "Item incluído a partir do escopo de monitoramento do gerente",
    },
    {
        "id": "103",
        "frente": "Parcerias Institucionais",
        "entrega": "Parceria SESC/SENAC",
        "inicio": "",
        "nup": "",
        "responsavel": "Karol",
        "parceiros": "SESC/SENAC",
        "prioridade": "Média",
        "prazo": "",
        "status": "Não iniciado",
        "pct": "",
        "proxima": "Articular escopo conjunto SESC/SENAC além do restaurante",
        "obs": "Complementa itens SESC já existentes na planilha",
    },
]


def excel_serial_to_iso(value: str) -> str:
    if value is None or value == "":
        return ""
    try:
        serial = float(value)
        dt = datetime(1899, 12, 30) + timedelta(days=serial)
        return dt.strftime("%Y-%m-%d")
    except (TypeError, ValueError):
        text = str(value).strip()
        for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
            try:
                return datetime.strptime(text, fmt).strftime("%Y-%m-%d")
            except ValueError:
                continue
        return text


def col_letters(ref: str) -> str:
    return "".join(ch for ch in ref if ch.isalpha())


def shared_strings(zf: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []
    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    out: list[str] = []
    for si in root.findall("m:si", NS):
        texts = [
            t.text or ""
            for t in si.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t")
        ]
        out.append("".join(texts))
    return out


def sheet_path(zf: zipfile.ZipFile) -> str:
    wb = ET.fromstring(zf.read("xl/workbook.xml"))
    sheets = wb.findall("m:sheets/m:sheet", NS)
    if not sheets:
        raise RuntimeError("Nenhuma aba encontrada no workbook")
    rid = sheets[0].attrib.get(f"{REL_NS}id")
    rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    for rel in rels:
        if rel.attrib.get("Id") == rid:
            target = rel.attrib["Target"]
            return target if target.startswith("xl/") else f"xl/{target}"
    return "xl/worksheets/sheet1.xml"


def cell_value(cell: ET.Element, strings: list[str]) -> str:
    t = cell.attrib.get("t")
    v = cell.find("m:v", NS)
    if v is None or v.text is None:
        is_el = cell.find("m:is", NS)
        if is_el is not None:
            texts = [
                t_el.text or ""
                for t_el in is_el.iter(
                    "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t"
                )
            ]
            return "".join(texts)
        return ""
    val = v.text
    if t == "s" and val.isdigit():
        return strings[int(val)]
    return val


def normalize_status(status: str) -> str:
    s = (status or "").strip()
    aliases = {
        "Concluido": "Concluído",
        "Não Iniciado": "Não iniciado",
        "Nao iniciado": "Não iniciado",
        "Aguardando Terceiros": "Aguardando terceiros",
    }
    return aliases.get(s, s)


def normalize_prioridade(p: str) -> str:
    p = (p or "").strip()
    aliases = {"Critica": "Crítica", "Media": "Média", "Alta": "Alta", "Baixa": "Baixa"}
    return aliases.get(p, p)


def bloco_for_frente(frente: str) -> str:
    return FRENTE_TO_BLOCO.get((frente or "").strip(), "outras")


def enrich_item(item: dict) -> dict:
    item["status"] = normalize_status(item.get("status", ""))
    item["prioridade"] = normalize_prioridade(item.get("prioridade", ""))
    item["bloco"] = bloco_for_frente(item.get("frente", ""))
    item["bloco_label"] = BLOCO_LABELS[item["bloco"]]
    pct = str(item.get("pct", "")).strip().replace("%", "")
    item["pct"] = pct
    for key in ("nup", "parceiros", "proxima", "obs", "responsavel", "entrega", "frente"):
        if item.get(key) is None:
            item[key] = ""
        else:
            item[key] = str(item[key]).strip()
    return item


def read_xlsx(path: Path) -> list[dict]:
    with zipfile.ZipFile(path) as zf:
        strings = shared_strings(zf)
        root = ET.fromstring(zf.read(sheet_path(zf)))
        items: list[dict] = []
        for row in root.findall("m:sheetData/m:row", NS):
            rnum = int(row.attrib["r"])
            if rnum == 1:
                continue
            cells: dict[str, str] = {}
            for c in row.findall("m:c", NS):
                ref = c.attrib.get("r", "")
                cells[col_letters(ref)] = cell_value(c, strings)
            if not any(cells.get(k) for k in "BCDEFGHIJKLM"):
                continue
            raw_id = (cells.get("A") or "").strip()
            item = {
                "id": raw_id.zfill(3) if raw_id.isdigit() else raw_id,
                "frente": cells.get("B", ""),
                "entrega": cells.get("C", ""),
                "inicio": excel_serial_to_iso(cells.get("D", "")),
                "nup": cells.get("E", ""),
                "responsavel": cells.get("F", ""),
                "parceiros": cells.get("G", ""),
                "prioridade": cells.get("H", ""),
                "prazo": excel_serial_to_iso(cells.get("I", "")),
                "status": cells.get("J", ""),
                "pct": cells.get("K", ""),
                "proxima": cells.get("L", ""),
                "obs": cells.get("M", ""),
            }
            if not item["id"]:
                item["id"] = f"R{rnum:03d}"
            items.append(enrich_item(item))
        return items


def merge_extras(items: list[dict]) -> list[dict]:
    by_id = {i["id"]: i for i in items}
    for extra in EXTRA_ITEMS:
        eid = extra["id"]
        if eid in by_id:
            continue
        title = extra["entrega"].casefold()
        if any(title in (i.get("entrega") or "").casefold() for i in items):
            continue
        items.append(enrich_item(dict(extra)))
    for item in items:
        entrega = (item.get("entrega") or "").casefold()
        if "sesc" in entrega and "senac" not in (item.get("parceiros") or "").casefold():
            if item.get("parceiros"):
                if "SENAC" not in item["parceiros"]:
                    item["parceiros"] = f"{item['parceiros']}/SENAC"
            else:
                item["parceiros"] = "SESC/SENAC"
    return items


def run(preserve_edits: bool = True) -> Path:
    if not XLSX.exists():
        raise FileNotFoundError(f"Planilha não encontrada: {XLSX}")
    items = read_xlsx(XLSX)
    items = merge_extras(items)
    items.sort(key=lambda i: (i.get("id") or ""))
    total = db.replace_all_itens(
        items,
        fonte=XLSX.name,
        preserve_edits=preserve_edits,
    )
    print(f"Importados {total} itens -> {db.DB_PATH}")
    return db.DB_PATH


if __name__ == "__main__":
    run()
