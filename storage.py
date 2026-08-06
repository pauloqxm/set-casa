#!/usr/bin/env python3
"""Armazenamento de fotos: local (dev) ou Supabase Storage (produção)."""

from __future__ import annotations

import mimetypes
import os
import re
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent
UPLOADS_DIR = ROOT / "data" / "uploads"
BUCKET = os.environ.get("SUPABASE_STORAGE_BUCKET", "fotos-acoes")


def use_supabase_storage() -> bool:
    return bool(
        os.environ.get("SUPABASE_URL", "").strip()
        and os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    )


def ensure_uploads_dir() -> Path:
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    return UPLOADS_DIR


def _supabase_headers(*, content_type: str | None = None) -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {os.environ['SUPABASE_SERVICE_ROLE_KEY'].strip()}",
        "apikey": os.environ["SUPABASE_SERVICE_ROLE_KEY"].strip(),
    }
    if content_type:
        headers["Content-Type"] = content_type
    return headers


def _supabase_base() -> str:
    return os.environ["SUPABASE_URL"].strip().rstrip("/")


def guess_content_type(filename: str) -> str:
    ctype, _ = mimetypes.guess_type(filename)
    return ctype or "application/octet-stream"


def upload_bytes(object_path: str, raw: bytes, content_type: str = "") -> str:
    object_path = object_path.lstrip("/")
    if use_supabase_storage():
        url = f"{_supabase_base()}/storage/v1/object/{BUCKET}/{object_path}"
        ctype = content_type or guess_content_type(object_path)
        with httpx.Client(timeout=60.0) as client:
            # upsert
            res = client.post(
                url,
                headers={
                    **_supabase_headers(content_type=ctype),
                    "x-upsert": "true",
                },
                content=raw,
            )
            if res.status_code >= 400:
                raise ValueError(f"Falha ao enviar foto ao Storage: {res.status_code} {res.text[:200]}")
        return object_path

    ensure_uploads_dir()
    # local: guarda só o basename para compatibilidade com paths simples
    name = Path(object_path).name
    path = UPLOADS_DIR / name
    path.write_bytes(raw)
    return name


def delete_object(object_path: str) -> None:
    if not object_path:
        return
    object_path = str(object_path).lstrip("/")
    if use_supabase_storage():
        url = f"{_supabase_base()}/storage/v1/object/{BUCKET}"
        with httpx.Client(timeout=30.0) as client:
            # API oficial: lista de paths no body
            client.request(
                "DELETE",
                url,
                headers=_supabase_headers(content_type="application/json"),
                json=[object_path],
            )
        return

    name = Path(object_path).name
    if ".." in name:
        return
    path = UPLOADS_DIR / name
    if path.is_file():
        try:
            path.unlink()
        except OSError:
            pass


def download_bytes(object_path: str) -> tuple[bytes, str] | None:
    if not object_path:
        return None
    object_path = str(object_path).lstrip("/")
    if use_supabase_storage():
        url = f"{_supabase_base()}/storage/v1/object/authenticated/{BUCKET}/{object_path}"
        with httpx.Client(timeout=60.0) as client:
            res = client.get(url, headers=_supabase_headers())
            if res.status_code == 404:
                # tenta endpoint público/objeto direto
                url2 = f"{_supabase_base()}/storage/v1/object/{BUCKET}/{object_path}"
                res = client.get(url2, headers=_supabase_headers())
            if res.status_code >= 400:
                return None
            ctype = res.headers.get("content-type") or guess_content_type(object_path)
            return res.content, ctype

    name = Path(object_path).name
    if ".." in name or "/" in name.replace("\\", "/"):
        # aceita apenas basename no modo local
        if "/" in object_path.replace("\\", "/") or "\\" in object_path:
            name = Path(object_path).name
    path = UPLOADS_DIR / name
    if not path.is_file():
        return None
    return path.read_bytes(), guess_content_type(name)


def safe_object_name(item_id: str, filename: str) -> str:
    safe_id = re.sub(r"[^A-Za-z0-9_-]+", "_", str(item_id or "item"))[:40] or "item"
    return f"{safe_id}/{filename}"
