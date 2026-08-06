#!/usr/bin/env python3
"""Migra dados do SQLite local + uploads para Supabase (Postgres + Storage).

Uso (com variáveis de ambiente já definidas):
  set DATABASE_URL=postgresql://...
  set SUPABASE_URL=https://xxxx.supabase.co
  set SUPABASE_SERVICE_ROLE_KEY=...
  python migrate_sqlite_to_supabase.py

Lê: data/painel.db e data/uploads/
Grava: tabelas no Postgres e objetos no bucket fotos-acoes
"""

from __future__ import annotations

import os
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SQLITE_PATH = ROOT / "data" / "painel.db"
UPLOADS = ROOT / "data" / "uploads"


def require_env() -> None:
    missing = [
        k
        for k in ("DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")
        if not (os.environ.get(k) or "").strip()
    ]
    if missing:
        print("Defina as variáveis:", ", ".join(missing))
        sys.exit(1)
    if not SQLITE_PATH.exists():
        print(f"SQLite não encontrado: {SQLITE_PATH}")
        sys.exit(1)


def main() -> None:
    require_env()
    # Importa db só depois das env vars (decide Postgres)
    import db
    import storage as foto_storage

    if not db.USE_POSTGRES:
        print("DATABASE_URL inválida — migração abortada.")
        sys.exit(1)

    print("Inicializando schema no Supabase...")
    with db.connect() as conn:
        db.init_db(conn)

    src = sqlite3.connect(SQLITE_PATH)
    src.row_factory = sqlite3.Row

    # meta
    for row in src.execute("SELECT chave, valor FROM meta"):
        with db.connect() as conn:
            db.set_meta(conn, row["chave"], row["valor"])
    print("meta OK")

    # itens
    cols = [c for c in db.ITEM_FIELDS]
    # atualizado_em separado
    item_rows = src.execute("SELECT * FROM itens").fetchall()
    with db.connect() as conn:
        for row in item_rows:
            data = {k: (row[k] if k in row.keys() else "") or "" for k in cols}
            data["atualizado_em"] = (row["atualizado_em"] if "atualizado_em" in row.keys() else "") or ""
            # sobe foto local se existir
            foto = data.get("foto") or ""
            if foto:
                local = UPLOADS / Path(foto).name
                if local.is_file():
                    raw = local.read_bytes()
                    object_path = foto_storage.safe_object_name(data["id"], Path(foto).name)
                    try:
                        data["foto"] = foto_storage.upload_bytes(
                            object_path,
                            raw,
                            foto_storage.guess_content_type(local.name),
                        )
                        print(f"  foto {data['id']} -> {data['foto']}")
                    except Exception as exc:
                        print(f"  aviso foto {data['id']}: {exc}")
            db.upsert_item(conn, data, touch=False)
    print(f"itens: {len(item_rows)}")

    # historico
    hist = src.execute(
        "SELECT item_id, criado_em, tipo, resumo, detalhes FROM historico ORDER BY id"
    ).fetchall()
    with db.connect() as conn:
        # evita duplicar em reexecução
        conn.execute("DELETE FROM historico")
        for row in hist:
            conn.execute(
                """
                INSERT INTO historico(item_id, criado_em, tipo, resumo, detalhes)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    row["item_id"],
                    row["criado_em"],
                    row["tipo"] or "atualizacao",
                    row["resumo"] or "",
                    row["detalhes"] or "{}",
                ),
            )
    print(f"historico: {len(hist)}")

    # usuarios (sem sobrescrever se já houver)
    with db.connect() as conn:
        existing = conn.execute("SELECT COUNT(*) AS n FROM usuarios").fetchone()["n"]
    users = src.execute(
        "SELECT usuario, senha_hash, nome, papel, ativo, criado_em, atualizado_em FROM usuarios"
    ).fetchall()
    if existing <= 1 and users:
        with db.connect() as conn:
            conn.execute("DELETE FROM sessoes")
            conn.execute("DELETE FROM usuarios")
            for row in users:
                conn.execute(
                    """
                    INSERT INTO usuarios
                    (usuario, senha_hash, nome, papel, ativo, criado_em, atualizado_em)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        row["usuario"],
                        row["senha_hash"],
                        row["nome"] or "",
                        row["papel"] or "editor",
                        int(row["ativo"] or 0),
                        row["criado_em"] or "",
                        row["atualizado_em"] or "",
                    ),
                )
        print(f"usuarios: {len(users)}")
    else:
        print(f"usuarios: mantidos no destino ({existing})")

    src.close()
    print("Migração concluída.")


if __name__ == "__main__":
    main()
