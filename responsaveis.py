"""Lista de responsáveis (nome + e-mail) publicada em planilha Google."""

from __future__ import annotations

import csv
import io
import os
import re
import time
from typing import Any

import httpx

DEFAULT_SHEET_URL = (
    "https://docs.google.com/spreadsheets/d/e/"
    "2PACX-1vTb73UDux_g8TCkEpCedERTpFb9Mhe8KswTlyQObIUrvtGptpVRvN7UIfmd3zuVGbyt8SZLm1-aku7T"
    "/pub?gid=0&single=true&output=csv"
)
SHEET_URL = (os.environ.get("RESPONSAVEIS_SHEET_URL") or DEFAULT_SHEET_URL).strip()
CACHE_TTL_SECONDS = int(os.environ.get("RESPONSAVEIS_CACHE_TTL", "21600") or "21600")

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_cache: dict[str, Any] = {"at": 0.0, "items": []}


def _normalize_email(value: str) -> str:
    return (value or "").strip().lower()


def _fetch_rows() -> list[dict[str, str]]:
    with httpx.Client(timeout=20.0, follow_redirects=True) as client:
        res = client.get(SHEET_URL)
        res.raise_for_status()
        text = res.text
    reader = csv.DictReader(io.StringIO(text))
    items: list[dict[str, str]] = []
    for row in reader:
        nome = ""
        email = ""
        for key, val in row.items():
            k = (key or "").strip().lower()
            v = (val or "").strip()
            if k in ("nome", "name"):
                nome = v
            elif k in ("e-mail", "email", "e_mail"):
                email = _normalize_email(v)
        if not nome or not email or not _EMAIL_RE.match(email):
            continue
        items.append({"nome": nome, "email": email})
    items.sort(key=lambda x: x["nome"].lower())
    return items


def list_responsaveis(*, force_refresh: bool = False) -> list[dict[str, str]]:
    now = time.time()
    if (
        not force_refresh
        and _cache["items"]
        and now - float(_cache["at"]) < CACHE_TTL_SECONDS
    ):
        return list(_cache["items"])
    try:
        items = _fetch_rows()
        if items:
            _cache["at"] = now
            _cache["items"] = items
            return list(items)
    except Exception:
        if _cache["items"]:
            return list(_cache["items"])
        raise
    return []


def get_by_email(email: str) -> dict[str, str] | None:
    target = _normalize_email(email)
    if not target:
        return None
    for item in list_responsaveis():
        if item["email"] == target:
            return item
    return None


def apply_responsavel_payload(payload: dict) -> dict:
    email = _normalize_email(str(payload.get("responsavel_email") or ""))
    if not email:
        raise ValueError("Selecione o responsável")
    person = get_by_email(email)
    if not person:
        raise ValueError("Responsável inválido ou fora da lista oficial")
    body = dict(payload)
    body["responsavel"] = person["nome"]
    body["responsavel_email"] = person["email"]
    return body
