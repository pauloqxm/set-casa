#!/usr/bin/env python3
"""Camada de dados do painel Casa do Trabalhador (SQLite local ou Postgres/Supabase)."""

from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path
from threading import Lock
from typing import Any, Iterator
from urllib.parse import quote

import storage as foto_storage

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "data" / "painel.db"
JSON_LEGACY = ROOT / "data" / "painel.json"
UPLOADS_DIR = foto_storage.UPLOADS_DIR
MAX_FOTO_BYTES = 5 * 1024 * 1024
ALLOWED_FOTO_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}

DATABASE_URL = (os.environ.get("DATABASE_URL") or "").strip()
# Railway/Supabase às vezes usam postgres:// — psycopg prefere postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = "postgresql://" + DATABASE_URL[len("postgres://") :]

USE_POSTGRES = bool(DATABASE_URL)

# Pool reutiliza conexões TCP (bem mais rápido em Postgres remoto).
_PG_POOL = None
_PG_POOL_LOCK = Lock()
_SCHEMA_READY = False
_SCHEMA_LOCK = Lock()

BLOCO_LABELS = {
    "reforma": "Reforma",
    "restauro": "Restauro",
    "aquisicao": "Aquisição",
    "comunicacao": "Comunicação",
    "inauguracao": "Inauguração",
    "parcerias": "Parcerias",
    "mudanca": "Mudança de unidade",
    "outras": "Outras",
}

FRENTE_TO_BLOCO = {
    "Infraestrutura": "reforma",
    "Restauro e Patrimônio Histórico": "restauro",
    "Equipamentos e Mobiliário": "aquisicao",
    "Comunicação Institucional": "comunicacao",
    "Evento de Inauguração": "inauguracao",
    "Parcerias Institucionais": "parcerias",
    "Implantação dos Serviços": "mudanca",
    "Gestão Patrimonial": "outras",
    "Gestão Contratual e Financeira": "outras",
    "Tecnologia e Infraestrutura Operacional": "outras",
}

FRENTES_PADRAO = list(FRENTE_TO_BLOCO.keys())

ITEM_FIELDS = (
    "id",
    "frente",
    "entrega",
    "inicio",
    "data_mudanca",
    "nup",
    "responsavel",
    "parceiros",
    "prioridade",
    "prazo",
    "status",
    "pct",
    "proxima",
    "obs",
    "foto",
    "bloco",
    "bloco_label",
    "projeto_id",
)

EDITABLE_FIELDS = (
    "status",
    "pct",
    "proxima",
    "obs",
    "prioridade",
    "prazo",
    "data_mudanca",
    "entrega",
    "frente",
    "responsavel",
    "parceiros",
    "nup",
    "inicio",
    "foto",
)

FIELD_LABELS = {
    "status": "Status",
    "pct": "%",
    "proxima": "Providência",
    "obs": "Observações",
    "prioridade": "Prioridade",
    "prazo": "Prazo",
    "data_mudanca": "Data da mudança",
    "entrega": "Entrega/Ação",
    "frente": "Frente",
    "responsavel": "Responsável",
    "parceiros": "Parceiros",
    "nup": "NUP",
    "inicio": "Início",
    "foto": "Foto",
}

DATE_FIELDS = {"prazo", "data_mudanca", "inicio"}

PBKDF2_ROUNDS = 200_000
SESSION_DAYS = 7
DEFAULT_ADMIN_USER = os.environ.get("ADMIN_USER", "admin").strip() or "admin"
DEFAULT_ADMIN_PASS = os.environ.get("ADMIN_PASS", "admin123").strip() or "admin123"

PAPEIS = ("admin", "editor", "consulta")
PAPEL_LABELS = {
    "admin": "Administrador",
    "editor": "Editor",
    "consulta": "Consulta",
}

# Projeto legado: todo dado existente antes do portfólio pertence a ele.
CASA_TRABALHADOR_ID = "casa-trabalhador"

DEFAULT_STATUS_OPTIONS = [
    "Não iniciado",
    "Em andamento",
    "Aguardando terceiros",
    "Concluído",
    "Sobrestado",
    "Não se aplica",
]


# --- Compatibilidade SQLite / Postgres ---------------------------------------


def _adapt_sql(sql: str) -> str:
    if not USE_POSTGRES:
        return sql
    # placeholders
    out = []
    i = 0
    in_str = False
    quote_ch = ""
    while i < len(sql):
        ch = sql[i]
        if in_str:
            out.append(ch)
            if ch == quote_ch:
                # escape '' or ""
                if i + 1 < len(sql) and sql[i + 1] == quote_ch:
                    out.append(sql[i + 1])
                    i += 2
                    continue
                in_str = False
            i += 1
            continue
        if ch in ("'", '"'):
            in_str = True
            quote_ch = ch
            out.append(ch)
            i += 1
            continue
        if ch == "?":
            out.append("%s")
            i += 1
            continue
        out.append(ch)
        i += 1
    sql_pg = "".join(out)
    sql_pg = sql_pg.replace("IFNULL(", "COALESCE(")
    sql_pg = re.sub(r"\s+COLLATE\s+NOCASE", "", sql_pg, flags=re.IGNORECASE)
    return sql_pg


class _CursorProxy:
    def __init__(self, cursor: Any, dialect: str):
        self._cursor = cursor
        self._dialect = dialect
        self.lastrowid = getattr(cursor, "lastrowid", None)
        self.rowcount = getattr(cursor, "rowcount", -1)

    def fetchone(self):
        row = self._cursor.fetchone()
        return _row_as_dict(row)

    def fetchall(self):
        return [_row_as_dict(r) for r in self._cursor.fetchall()]


def _row_as_dict(row: Any) -> Any:
    if row is None:
        return None
    if isinstance(row, dict):
        return row
    try:
        return dict(row)
    except Exception:
        return row


class _ConnProxy:
    def __init__(self, conn: Any, dialect: str):
        self._conn = conn
        self.dialect = dialect

    def execute(self, sql: str, params: Any = ()):
        sql2 = _adapt_sql(sql)
        if params is None:
            params = ()
        if self.dialect == "postgres":
            cur = self._conn.execute(sql2, params)
            proxy = _CursorProxy(cur, self.dialect)
            # lastrowid não existe; usar RETURNING quando necessário
            proxy.lastrowid = None
            proxy.rowcount = cur.rowcount
            return proxy
        cur = self._conn.execute(sql2, params)
        return _CursorProxy(cur, self.dialect)

    def executescript(self, script: str) -> None:
        if self.dialect == "postgres":
            # psycopg: executar statements separados
            for stmt in _split_sql_statements(script):
                if stmt.strip():
                    self._conn.execute(stmt)
            return
        self._conn.executescript(script)

    def commit(self) -> None:
        self._conn.commit()

    def rollback(self) -> None:
        self._conn.rollback()

    def close(self) -> None:
        self._conn.close()


def _split_sql_statements(script: str) -> list[str]:
    parts: list[str] = []
    buf: list[str] = []
    in_str = False
    quote_ch = ""
    for ch in script:
        if in_str:
            buf.append(ch)
            if ch == quote_ch:
                in_str = False
            continue
        if ch in ("'", '"'):
            in_str = True
            quote_ch = ch
            buf.append(ch)
            continue
        if ch == ";":
            parts.append("".join(buf).strip())
            buf = []
            continue
        buf.append(ch)
    tail = "".join(buf).strip()
    if tail:
        parts.append(tail)
    return parts


def _get_pg_pool():
    """Lazy singleton do ConnectionPool (thread-safe)."""
    global _PG_POOL
    if _PG_POOL is not None:
        return _PG_POOL
    with _PG_POOL_LOCK:
        if _PG_POOL is not None:
            return _PG_POOL
        from psycopg.rows import dict_row
        from psycopg_pool import ConnectionPool

        # min_size=1 evita cold handshake a cada request; max_size limitado
        # para caber no free tier (limite típico ~60 conexões diretas).
        _PG_POOL = ConnectionPool(
            conninfo=DATABASE_URL,
            min_size=1,
            max_size=8,
            timeout=30,
            kwargs={"row_factory": dict_row},
            open=True,
        )
        return _PG_POOL


@contextmanager
def connect(db_path: Path | None = None) -> Iterator[_ConnProxy]:
    if USE_POSTGRES:
        pool = _get_pg_pool()
        # pool.connection() devolve a conexão ao pool ao sair do with —
        # não chamar close() manualmente.
        with pool.connection() as conn:
            proxy = _ConnProxy(conn, "postgres")
            try:
                yield proxy
                conn.commit()
            except Exception:
                conn.rollback()
                raise
        return

    path = db_path or DB_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    proxy = _ConnProxy(conn, "sqlite")
    try:
        yield proxy
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def banco_label() -> str:
    if USE_POSTGRES:
        # Detecta host para distinguir Supabase vs Railway no healthcheck.
        host = ""
        try:
            from urllib.parse import urlparse

            host = (urlparse(DATABASE_URL).hostname or "").lower()
        except Exception:
            host = ""
        if "supabase" in host:
            return "supabase-postgres"
        if "railway" in host or "rlwy" in host:
            return "railway-postgres"
        return "postgres"
    return DB_PATH.name


def bloco_from_frente(frente: str) -> tuple[str, str]:
    bloco = FRENTE_TO_BLOCO.get((frente or "").strip(), "outras")
    return bloco, BLOCO_LABELS[bloco]


def next_item_id(conn: _ConnProxy, projeto_id: str = CASA_TRABALHADOR_ID) -> str:
    rows = conn.execute(
        "SELECT id FROM itens WHERE projeto_id=?", (projeto_id,)
    ).fetchall()
    if projeto_id == CASA_TRABALHADOR_ID:
        max_n = 0
        for row in rows:
            raw = str(row["id"] or "").strip()
            if raw.isdigit():
                max_n = max(max_n, int(raw))
        return f"{max_n + 1:03d}"

    # Projetos novos usam IDs namespaced (ex.: "meu-projeto-001") para nunca
    # colidir com o projeto legado nem entre si, já que "itens.id" é global.
    prefix = f"{projeto_id}-"
    max_n = 0
    for row in rows:
        raw = str(row["id"] or "").strip()
        if raw.startswith(prefix) and raw[len(prefix):].isdigit():
            max_n = max(max_n, int(raw[len(prefix):]))
    return f"{prefix}{max_n + 1:03d}"


def fmt_br_date(value: str) -> str:
    if not value:
        return "—"
    value = str(value).strip()
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", value)
    if m:
        return f"{m.group(3)}/{m.group(2)}/{m.group(1)}"
    return value


def fmt_br_value(campo: str, value: str) -> str:
    if value in (None, ""):
        return "—"
    if campo in DATE_FIELDS:
        return fmt_br_date(value)
    if campo == "foto":
        return "anexada" if value else "—"
    return str(value)


def ensure_uploads_dir() -> Path:
    return foto_storage.ensure_uploads_dir()


def foto_public_url(filename: str) -> str:
    name = str(filename or "").strip().lstrip("/")
    if not name:
        return ""
    return f"/api/fotos/{quote(name, safe='/')}"


def resolve_foto_path(filename: str) -> Path | None:
    """Compat local: resolve arquivo em data/uploads."""
    name = Path(str(filename or "")).name
    if not name or ".." in name:
        return None
    path = UPLOADS_DIR / name
    try:
        path.resolve().relative_to(UPLOADS_DIR.resolve())
    except ValueError:
        return None
    return path if path.is_file() else None


def delete_foto_file(filename: str) -> None:
    foto_storage.delete_object(filename)


def save_foto_bytes(item_id: str, raw: bytes, original_name: str = "") -> str:
    if not raw:
        raise ValueError("Arquivo de foto vazio")
    if len(raw) > MAX_FOTO_BYTES:
        raise ValueError("Foto deve ter no máximo 5 MB")

    ext = Path(original_name or "").suffix.lower()
    if ext not in ALLOWED_FOTO_EXT:
        if raw[:3] == b"\xff\xd8\xff":
            ext = ".jpg"
        elif raw[:8] == b"\x89PNG\r\n\x1a\n":
            ext = ".png"
        elif raw[:6] in (b"GIF87a", b"GIF89a"):
            ext = ".gif"
        elif raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
            ext = ".webp"
        else:
            raise ValueError("Formato de foto inválido (use JPG, PNG, WEBP ou GIF)")

    safe_id = re.sub(r"[^A-Za-z0-9_-]+", "_", str(item_id or "item"))[:40] or "item"
    stamp = datetime.now().strftime("%Y%m%d%H%M%S")
    token = secrets.token_hex(4)
    filename = f"{safe_id}_{stamp}_{token}{ext}"
    object_path = foto_storage.safe_object_name(item_id, filename)
    ctype = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }.get(ext, "application/octet-stream")
    return foto_storage.upload_bytes(object_path, raw, ctype)


def apply_foto_from_payload(
    item_id: str, payload: dict, current_foto: str = ""
) -> str | None:
    if payload.get("remover_foto"):
        if current_foto:
            delete_foto_file(current_foto)
        return ""

    raw_b64 = payload.get("foto_base64")
    if not raw_b64:
        return None

    data = str(raw_b64)
    if "," in data and data.strip().lower().startswith("data:"):
        data = data.split(",", 1)[1]
    try:
        raw = base64.b64decode(data, validate=False)
    except Exception as exc:
        raise ValueError("Não foi possível ler a foto enviada") from exc

    if current_foto:
        delete_foto_file(current_foto)
    return save_foto_bytes(item_id, raw, payload.get("foto_nome") or "")


def read_foto_bytes(object_path: str) -> tuple[bytes, str] | None:
    return foto_storage.download_bytes(object_path)


SCHEMA_SQLITE = """
CREATE TABLE IF NOT EXISTS meta (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS itens (
    id TEXT PRIMARY KEY,
    frente TEXT NOT NULL DEFAULT '',
    entrega TEXT NOT NULL DEFAULT '',
    inicio TEXT NOT NULL DEFAULT '',
    data_mudanca TEXT NOT NULL DEFAULT '',
    nup TEXT NOT NULL DEFAULT '',
    responsavel TEXT NOT NULL DEFAULT '',
    parceiros TEXT NOT NULL DEFAULT '',
    prioridade TEXT NOT NULL DEFAULT '',
    prazo TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT '',
    pct TEXT NOT NULL DEFAULT '',
    proxima TEXT NOT NULL DEFAULT '',
    obs TEXT NOT NULL DEFAULT '',
    foto TEXT NOT NULL DEFAULT '',
    bloco TEXT NOT NULL DEFAULT 'outras',
    bloco_label TEXT NOT NULL DEFAULT 'Outras',
    projeto_id TEXT NOT NULL DEFAULT 'casa-trabalhador',
    atualizado_em TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_itens_frente ON itens(frente);
CREATE INDEX IF NOT EXISTS idx_itens_status ON itens(status);
CREATE INDEX IF NOT EXISTS idx_itens_bloco ON itens(bloco);

CREATE TABLE IF NOT EXISTS historico (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id TEXT NOT NULL,
    criado_em TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'atualizacao',
    resumo TEXT NOT NULL DEFAULT '',
    detalhes TEXT NOT NULL DEFAULT '',
    usuario_id INTEGER,
    usuario_nome TEXT NOT NULL DEFAULT '',
    FOREIGN KEY(item_id) REFERENCES itens(id)
);

CREATE INDEX IF NOT EXISTS idx_historico_item ON historico(item_id, criado_em);

CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario TEXT NOT NULL UNIQUE COLLATE NOCASE,
    senha_hash TEXT NOT NULL,
    nome TEXT NOT NULL DEFAULT '',
    papel TEXT NOT NULL DEFAULT 'editor',
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT NOT NULL DEFAULT '',
    atualizado_em TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_usuarios_usuario ON usuarios(usuario);

CREATE TABLE IF NOT EXISTS sessoes (
    token TEXT PRIMARY KEY,
    usuario_id INTEGER NOT NULL,
    criado_em TEXT NOT NULL,
    expira_em TEXT NOT NULL,
    FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessoes_usuario ON sessoes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_expira ON sessoes(expira_em);

CREATE TABLE IF NOT EXISTS projetos (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL DEFAULT '',
    descricao TEXT NOT NULL DEFAULT '',
    gerente_usuario_id INTEGER,
    prazo_conclusao TEXT NOT NULL DEFAULT '',
    config_json TEXT NOT NULL DEFAULT '{}',
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT NOT NULL DEFAULT '',
    atualizado_em TEXT NOT NULL DEFAULT '',
    FOREIGN KEY(gerente_usuario_id) REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_projetos_ativo ON projetos(ativo);

CREATE TABLE IF NOT EXISTS usuario_projetos (
    usuario_id INTEGER NOT NULL,
    projeto_id TEXT NOT NULL,
    papel TEXT NOT NULL DEFAULT 'consulta',
    criado_em TEXT NOT NULL DEFAULT '',
    atualizado_em TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (usuario_id, projeto_id),
    FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY(projeto_id) REFERENCES projetos(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_usuario_projetos_projeto ON usuario_projetos(projeto_id);

CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projeto_id TEXT,
    entidade TEXT NOT NULL,
    entidade_id TEXT NOT NULL DEFAULT '',
    acao TEXT NOT NULL,
    usuario_id INTEGER,
    usuario_nome TEXT NOT NULL DEFAULT '',
    criado_em TEXT NOT NULL,
    detalhes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_audit_projeto ON audit_log(projeto_id, criado_em);
"""

SCHEMA_POSTGRES = """
CREATE TABLE IF NOT EXISTS meta (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS itens (
    id TEXT PRIMARY KEY,
    frente TEXT NOT NULL DEFAULT '',
    entrega TEXT NOT NULL DEFAULT '',
    inicio TEXT NOT NULL DEFAULT '',
    data_mudanca TEXT NOT NULL DEFAULT '',
    nup TEXT NOT NULL DEFAULT '',
    responsavel TEXT NOT NULL DEFAULT '',
    parceiros TEXT NOT NULL DEFAULT '',
    prioridade TEXT NOT NULL DEFAULT '',
    prazo TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT '',
    pct TEXT NOT NULL DEFAULT '',
    proxima TEXT NOT NULL DEFAULT '',
    obs TEXT NOT NULL DEFAULT '',
    foto TEXT NOT NULL DEFAULT '',
    bloco TEXT NOT NULL DEFAULT 'outras',
    bloco_label TEXT NOT NULL DEFAULT 'Outras',
    projeto_id TEXT NOT NULL DEFAULT 'casa-trabalhador',
    atualizado_em TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_itens_frente ON itens(frente);
CREATE INDEX IF NOT EXISTS idx_itens_status ON itens(status);
CREATE INDEX IF NOT EXISTS idx_itens_bloco ON itens(bloco);

CREATE TABLE IF NOT EXISTS historico (
    id SERIAL PRIMARY KEY,
    item_id TEXT NOT NULL,
    criado_em TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'atualizacao',
    resumo TEXT NOT NULL DEFAULT '',
    detalhes TEXT NOT NULL DEFAULT '',
    usuario_id INTEGER,
    usuario_nome TEXT NOT NULL DEFAULT '',
    FOREIGN KEY(item_id) REFERENCES itens(id)
);

CREATE INDEX IF NOT EXISTS idx_historico_item ON historico(item_id, criado_em);

CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    usuario TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    nome TEXT NOT NULL DEFAULT '',
    papel TEXT NOT NULL DEFAULT 'editor',
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT NOT NULL DEFAULT '',
    atualizado_em TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_usuarios_usuario ON usuarios(usuario);

CREATE TABLE IF NOT EXISTS sessoes (
    token TEXT PRIMARY KEY,
    usuario_id INTEGER NOT NULL,
    criado_em TEXT NOT NULL,
    expira_em TEXT NOT NULL,
    FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessoes_usuario ON sessoes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_expira ON sessoes(expira_em);

CREATE TABLE IF NOT EXISTS projetos (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL DEFAULT '',
    descricao TEXT NOT NULL DEFAULT '',
    gerente_usuario_id INTEGER,
    prazo_conclusao TEXT NOT NULL DEFAULT '',
    config_json TEXT NOT NULL DEFAULT '{}',
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT NOT NULL DEFAULT '',
    atualizado_em TEXT NOT NULL DEFAULT '',
    FOREIGN KEY(gerente_usuario_id) REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_projetos_ativo ON projetos(ativo);

CREATE TABLE IF NOT EXISTS usuario_projetos (
    usuario_id INTEGER NOT NULL,
    projeto_id TEXT NOT NULL,
    papel TEXT NOT NULL DEFAULT 'consulta',
    criado_em TEXT NOT NULL DEFAULT '',
    atualizado_em TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (usuario_id, projeto_id),
    FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY(projeto_id) REFERENCES projetos(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_usuario_projetos_projeto ON usuario_projetos(projeto_id);

CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    projeto_id TEXT,
    entidade TEXT NOT NULL,
    entidade_id TEXT NOT NULL DEFAULT '',
    acao TEXT NOT NULL,
    usuario_id INTEGER,
    usuario_nome TEXT NOT NULL DEFAULT '',
    criado_em TEXT NOT NULL,
    detalhes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_audit_projeto ON audit_log(projeto_id, criado_em);
"""


def init_db(conn: _ConnProxy) -> None:
    """Cria/migra schema. Após a 1ª vez bem-sucedida, vira no-op (cache em memória)."""
    global _SCHEMA_READY
    if _SCHEMA_READY:
        return
    with _SCHEMA_LOCK:
        if _SCHEMA_READY:
            return
        if conn.dialect == "postgres":
            conn.executescript(SCHEMA_POSTGRES)
        else:
            conn.executescript(SCHEMA_SQLITE)
        _ensure_columns(conn)
        _seed_historico_inicial(conn)
        _migrate_papeis(conn)
        _seed_admin_inicial(conn)
        _seed_projeto_casa_trabalhador(conn)
        _seed_usuario_projetos_inicial(conn)
        _SCHEMA_READY = True


def _ensure_columns(conn: _ConnProxy) -> None:
    if conn.dialect == "postgres":
        def _has_col(table: str, col: str) -> bool:
            row = conn.execute(
                """
                SELECT 1 AS ok FROM information_schema.columns
                WHERE table_name=? AND column_name=?
                """,
                (table, col),
            ).fetchone()
            return bool(row)

        # colunas já estão no CREATE TABLE; garante compatibilidade com bases antigas
        if not _has_col("itens", "foto"):
            conn.execute("ALTER TABLE itens ADD COLUMN foto TEXT NOT NULL DEFAULT ''")
        if not _has_col("itens", "projeto_id"):
            conn.execute(
                f"ALTER TABLE itens ADD COLUMN projeto_id TEXT NOT NULL "
                f"DEFAULT '{CASA_TRABALHADOR_ID}'"
            )
        # A coluna já existe agora (recém-criada ou já presente no CREATE TABLE)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_itens_projeto ON itens(projeto_id)"
        )
        if not _has_col("historico", "usuario_id"):
            conn.execute("ALTER TABLE historico ADD COLUMN usuario_id INTEGER")
        if not _has_col("historico", "usuario_nome"):
            conn.execute(
                "ALTER TABLE historico ADD COLUMN usuario_nome TEXT NOT NULL DEFAULT ''"
            )
        ensure_uploads_dir()
        return

    raw = conn._conn.execute("PRAGMA table_info(itens)").fetchall()
    cols = {row[1] for row in raw}
    if "data_mudanca" not in cols:
        conn.execute(
            "ALTER TABLE itens ADD COLUMN data_mudanca TEXT NOT NULL DEFAULT ''"
        )
        conn.execute(
            "UPDATE itens SET data_mudanca = inicio "
            "WHERE TRIM(IFNULL(data_mudanca, '')) = '' "
            "AND TRIM(IFNULL(inicio, '')) != ''"
        )
    if "foto" not in cols:
        conn.execute("ALTER TABLE itens ADD COLUMN foto TEXT NOT NULL DEFAULT ''")
    if "projeto_id" not in cols:
        conn.execute(
            f"ALTER TABLE itens ADD COLUMN projeto_id TEXT NOT NULL "
            f"DEFAULT '{CASA_TRABALHADOR_ID}'"
        )
    # A coluna já existe agora (recém-criada ou já presente no CREATE TABLE)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_itens_projeto ON itens(projeto_id)")

    hist_raw = conn._conn.execute("PRAGMA table_info(historico)").fetchall()
    hist_cols = {row[1] for row in hist_raw}
    if "usuario_id" not in hist_cols:
        conn.execute("ALTER TABLE historico ADD COLUMN usuario_id INTEGER")
    if "usuario_nome" not in hist_cols:
        conn.execute(
            "ALTER TABLE historico ADD COLUMN usuario_nome TEXT NOT NULL DEFAULT ''"
        )
    ensure_uploads_dir()


def _seed_projeto_casa_trabalhador(conn: _ConnProxy) -> None:
    row = conn.execute(
        "SELECT 1 FROM projetos WHERE id=?", (CASA_TRABALHADOR_ID,)
    ).fetchone()
    if row:
        return
    now = datetime.now().isoformat(timespec="seconds")
    config = {
        "blocos": BLOCO_LABELS,
        "frente_to_bloco": FRENTE_TO_BLOCO,
        "status_options": DEFAULT_STATUS_OPTIONS,
    }
    conn.execute(
        """
        INSERT INTO projetos (
            id, nome, descricao, gerente_usuario_id, prazo_conclusao,
            config_json, ativo, criado_em, atualizado_em
        ) VALUES (?, ?, ?, NULL, ?, ?, 1, ?, ?)
        """,
        (
            CASA_TRABALHADOR_ID,
            "Casa do Trabalhador",
            "SET / IDT · Acompanhamento gerencial",
            "2026-11-26",
            json.dumps(config, ensure_ascii=False),
            now,
            now,
        ),
    )


def _seed_usuario_projetos_inicial(conn: _ConnProxy) -> None:
    """Garante que todo usuário existente tenha acesso ao projeto legado,
    reproduzindo o papel global que ele já possuía antes do portfólio."""
    usuarios = conn.execute("SELECT id, papel FROM usuarios").fetchall()
    for u in usuarios:
        exists = conn.execute(
            "SELECT 1 FROM usuario_projetos WHERE usuario_id=? AND projeto_id=?",
            (u["id"], CASA_TRABALHADOR_ID),
        ).fetchone()
        if exists:
            continue
        try:
            papel = normalize_papel(u.get("papel") or "consulta")
        except ValueError:
            papel = "consulta"
        now = datetime.now().isoformat(timespec="seconds")
        conn.execute(
            """
            INSERT INTO usuario_projetos (usuario_id, projeto_id, papel, criado_em, atualizado_em)
            VALUES (?, ?, ?, ?, ?)
            """,
            (u["id"], CASA_TRABALHADOR_ID, papel, now, now),
        )


def _seed_historico_inicial(conn: _ConnProxy) -> None:
    rows = conn.execute(
        """
        SELECT i.id, i.proxima, i.status, i.obs, i.atualizado_em
        FROM itens i
        WHERE TRIM(IFNULL(i.proxima, '')) != ''
          AND NOT EXISTS (
            SELECT 1 FROM historico h WHERE h.item_id = i.id
          )
        """
    ).fetchall()
    for row in rows:
        criado = row["atualizado_em"] or datetime.now().isoformat(timespec="seconds")
        detalhes = {
            "proxima": {"de": "", "para": row["proxima"] or ""},
            "status": {"de": "", "para": row["status"] or ""},
        }
        conn.execute(
            """
            INSERT INTO historico(item_id, criado_em, tipo, resumo, detalhes)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                row["id"],
                criado,
                "providencia",
                f"Providência: {row['proxima']}",
                json.dumps(detalhes, ensure_ascii=False),
            ),
        )


def add_historico(
    conn: _ConnProxy,
    item_id: str,
    *,
    tipo: str,
    resumo: str,
    detalhes: dict,
    criado_em: str | None = None,
    usuario_id: int | None = None,
    usuario_nome: str = "",
) -> None:
    conn.execute(
        """
        INSERT INTO historico(item_id, criado_em, tipo, resumo, detalhes, usuario_id, usuario_nome)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            item_id,
            criado_em or datetime.now().isoformat(timespec="seconds"),
            tipo,
            resumo,
            json.dumps(detalhes, ensure_ascii=False),
            usuario_id,
            usuario_nome or "",
        ),
    )


def _autor_from_usuario(usuario: dict | None) -> tuple[int | None, str]:
    if not usuario:
        return None, ""
    return usuario.get("id"), (usuario.get("nome") or usuario.get("usuario") or "")


def list_historico(item_id: str) -> list[dict]:
    with connect() as conn:
        init_db(conn)
        rows = conn.execute(
            """
            SELECT id, item_id, criado_em, tipo, resumo, detalhes, usuario_id, usuario_nome
            FROM historico
            WHERE item_id = ?
            ORDER BY criado_em DESC, id DESC
            """,
            (item_id,),
        ).fetchall()
        out = []
        for row in rows:
            try:
                detalhes = json.loads(row["detalhes"] or "{}")
            except json.JSONDecodeError:
                detalhes = {}
            out.append(
                {
                    "id": row["id"],
                    "item_id": row["item_id"],
                    "criado_em": row["criado_em"],
                    "tipo": row["tipo"],
                    "resumo": row["resumo"],
                    "detalhes": detalhes,
                    "usuario_id": row.get("usuario_id"),
                    "usuario_nome": row.get("usuario_nome") or "",
                }
            )
        return out


def set_meta(conn: _ConnProxy, chave: str, valor: str) -> None:
    conn.execute(
        "INSERT INTO meta(chave, valor) VALUES(?, ?) "
        "ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor",
        (chave, valor),
    )


def get_meta(conn: _ConnProxy, chave: str, default: str = "") -> str:
    row = conn.execute("SELECT valor FROM meta WHERE chave=?", (chave,)).fetchone()
    return row["valor"] if row else default


def row_to_item(row: Any) -> dict:
    data = dict(row) if not isinstance(row, dict) else row
    keys = set(data.keys())
    return {field: (data.get(field) or "" if field in keys else "") for field in ITEM_FIELDS}


def list_itens(
    conn: _ConnProxy | None = None, projeto_id: str = CASA_TRABALHADOR_ID
) -> list[dict]:
    if conn is None:
        with connect() as c:
            return list_itens(c, projeto_id)
    rows = conn.execute(
        "SELECT * FROM itens WHERE projeto_id=? ORDER BY lower(id)", (projeto_id,)
    ).fetchall()
    return [row_to_item(r) for r in rows]


def get_item(conn: _ConnProxy, item_id: str) -> dict | None:
    row = conn.execute("SELECT * FROM itens WHERE id=?", (item_id,)).fetchone()
    return row_to_item(row) if row else None


def upsert_item(conn: _ConnProxy, item: dict, touch: bool = True) -> None:
    now = datetime.now().isoformat(timespec="seconds") if touch else item.get("atualizado_em", "")
    values = {k: (item.get(k) or "") for k in ITEM_FIELDS}
    if not values.get("data_mudanca") and values.get("inicio"):
        values["data_mudanca"] = values["inicio"]
    if not values.get("projeto_id"):
        values["projeto_id"] = CASA_TRABALHADOR_ID
    values["atualizado_em"] = now or datetime.now().isoformat(timespec="seconds")
    params = (
        values["id"],
        values["frente"],
        values["entrega"],
        values["inicio"],
        values["data_mudanca"],
        values["nup"],
        values["responsavel"],
        values["parceiros"],
        values["prioridade"],
        values["prazo"],
        values["status"],
        values["pct"],
        values["proxima"],
        values["obs"],
        values["foto"],
        values["bloco"],
        values["bloco_label"],
        values["projeto_id"],
        values["atualizado_em"],
    )
    conn.execute(
        """
        INSERT INTO itens (
            id, frente, entrega, inicio, data_mudanca, nup, responsavel, parceiros,
            prioridade, prazo, status, pct, proxima, obs, foto, bloco, bloco_label,
            projeto_id, atualizado_em
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?
        )
        ON CONFLICT(id) DO UPDATE SET
            frente=excluded.frente,
            entrega=excluded.entrega,
            inicio=excluded.inicio,
            data_mudanca=excluded.data_mudanca,
            nup=excluded.nup,
            responsavel=excluded.responsavel,
            parceiros=excluded.parceiros,
            prioridade=excluded.prioridade,
            prazo=excluded.prazo,
            status=excluded.status,
            pct=excluded.pct,
            proxima=excluded.proxima,
            obs=excluded.obs,
            foto=excluded.foto,
            bloco=excluded.bloco,
            bloco_label=excluded.bloco_label,
            atualizado_em=excluded.atualizado_em
        """,
        params,
    )


def replace_all_itens(
    itens: list[dict],
    *,
    fonte: str = "",
    preserve_edits: bool = False,
    projeto_id: str = CASA_TRABALHADOR_ID,
) -> int:
    with connect() as conn:
        init_db(conn)
        existing_edits: dict[str, dict] = {}
        if preserve_edits:
            for row in list_itens(conn, projeto_id):
                existing_edits[row["id"]] = {
                    k: row.get(k, "") for k in EDITABLE_FIELDS
                }

        # Escopo por projeto: nunca apaga itens de outros projetos.
        conn.execute("DELETE FROM itens WHERE projeto_id=?", (projeto_id,))
        for item in itens:
            payload = dict(item)
            payload["projeto_id"] = projeto_id
            if preserve_edits and payload.get("id") in existing_edits:
                for key, value in existing_edits[payload["id"]].items():
                    if value not in (None, ""):
                        payload[key] = value
            upsert_item(conn, payload, touch=True)

        now = datetime.now().isoformat(timespec="seconds")
        if projeto_id == CASA_TRABALHADOR_ID:
            set_meta(conn, "projeto", "Casa do Trabalhador")
            set_meta(conn, "atualizado_em", now)
            set_meta(conn, "fonte", fonte or banco_label())
            set_meta(conn, "blocos", json.dumps(BLOCO_LABELS, ensure_ascii=False))
        else:
            conn.execute(
                "UPDATE projetos SET atualizado_em=? WHERE id=?", (now, projeto_id)
            )
        return len(itens)


def update_item_fields(
    item_id: str, updates: dict, *, usuario: dict | None = None
) -> dict | None:
    allowed = {k: updates[k] for k in EDITABLE_FIELDS if k in updates}
    if not allowed:
        with connect() as conn:
            init_db(conn)
            return get_item(conn, item_id)

    with connect() as conn:
        init_db(conn)
        before = get_item(conn, item_id)
        if not before:
            return None

        normalized = {
            k: ("" if allowed[k] is None else str(allowed[k])) for k in allowed
        }
        changes = {
            k: {"de": before.get(k, ""), "para": normalized[k]}
            for k in normalized
            if (before.get(k, "") or "") != normalized[k]
        }
        if not changes:
            return before

        if "frente" in normalized:
            bloco, bloco_label = bloco_from_frente(normalized["frente"])
            normalized["bloco"] = bloco
            normalized["bloco_label"] = bloco_label
            if before.get("bloco") != bloco:
                changes["bloco"] = {"de": before.get("bloco", ""), "para": bloco}

        sets = ", ".join(f"{k}=?" for k in normalized)
        values = list(normalized.values())
        now = datetime.now().isoformat(timespec="seconds")
        values.extend([now, item_id])
        conn.execute(
            f"UPDATE itens SET {sets}, atualizado_em=? WHERE id=?",
            values,
        )
        projeto_id = before.get("projeto_id") or CASA_TRABALHADOR_ID
        if projeto_id == CASA_TRABALHADOR_ID:
            set_meta(conn, "atualizado_em", now)
        else:
            conn.execute(
                "UPDATE projetos SET atualizado_em=? WHERE id=?", (now, projeto_id)
            )

        parts = []
        for key, delta in changes.items():
            if key in ("bloco", "bloco_label"):
                continue
            label = FIELD_LABELS.get(key, key)
            if key == "proxima":
                parts.append(f"Providência → {delta['para'] or '—'}")
            elif key == "foto":
                if delta["para"]:
                    parts.append("Foto da movimentação anexada")
                else:
                    parts.append("Foto removida")
            else:
                parts.append(
                    f"{label}: {fmt_br_value(key, delta['de'])} → {fmt_br_value(key, delta['para'])}"
                )
        if not parts:
            parts.append("Ação atualizada")
        tipo = "providencia" if "proxima" in changes else "atualizacao"
        autor_id, autor_nome = _autor_from_usuario(usuario)
        add_historico(
            conn,
            item_id,
            tipo=tipo,
            resumo="; ".join(parts),
            detalhes=changes,
            criado_em=now,
            usuario_id=autor_id,
            usuario_nome=autor_nome,
        )
        add_audit(
            projeto_id=projeto_id,
            entidade="item",
            entidade_id=item_id,
            acao="atualizar",
            usuario=usuario,
            detalhes=changes,
            conn=conn,
        )
        return get_item(conn, item_id)


def create_item(
    payload: dict,
    *,
    projeto_id: str = CASA_TRABALHADOR_ID,
    usuario: dict | None = None,
) -> dict:
    with connect() as conn:
        init_db(conn)
        item_id = (payload.get("id") or "").strip() or next_item_id(conn, projeto_id)
        if get_item(conn, item_id):
            item_id = next_item_id(conn, projeto_id)

        frente = (payload.get("frente") or "").strip()
        bloco, bloco_label = bloco_from_frente(frente)
        data_mudanca = (payload.get("data_mudanca") or payload.get("inicio") or "").strip()
        item = {
            "id": item_id,
            "frente": frente,
            "entrega": (payload.get("entrega") or "").strip(),
            "inicio": (payload.get("inicio") or data_mudanca or "").strip(),
            "data_mudanca": data_mudanca,
            "nup": (payload.get("nup") or "").strip(),
            "responsavel": (payload.get("responsavel") or "").strip(),
            "parceiros": (payload.get("parceiros") or "").strip(),
            "prioridade": (payload.get("prioridade") or "").strip(),
            "prazo": (payload.get("prazo") or "").strip(),
            "status": (payload.get("status") or "Não iniciado").strip(),
            "pct": str(payload.get("pct") or "").strip(),
            "proxima": (payload.get("proxima") or "").strip(),
            "obs": (payload.get("obs") or "").strip(),
            "foto": (payload.get("foto") or "").strip(),
            "bloco": bloco,
            "bloco_label": bloco_label,
            "projeto_id": projeto_id,
        }
        if not item["entrega"]:
            raise ValueError("Informe a entrega/ação")

        upsert_item(conn, item, touch=True)
        now = datetime.now().isoformat(timespec="seconds")
        if projeto_id == CASA_TRABALHADOR_ID:
            set_meta(conn, "atualizado_em", now)
        else:
            conn.execute(
                "UPDATE projetos SET atualizado_em=? WHERE id=?", (now, projeto_id)
            )
        autor_id, autor_nome = _autor_from_usuario(usuario)
        add_historico(
            conn,
            item_id,
            tipo="criacao",
            resumo=f"Ação criada: {item['entrega']}",
            detalhes={"entrega": {"de": "", "para": item["entrega"]}},
            criado_em=now,
            usuario_id=autor_id,
            usuario_nome=autor_nome,
        )
        add_audit(
            projeto_id=projeto_id,
            entidade="item",
            entidade_id=item_id,
            acao="criar",
            usuario=usuario,
            detalhes={"entrega": item["entrega"]},
            conn=conn,
        )
        return get_item(conn, item_id)


def delete_historico(item_id: str, historico_id: int) -> bool:
    with connect() as conn:
        init_db(conn)
        cur = conn.execute(
            "DELETE FROM historico WHERE id=? AND item_id=?",
            (historico_id, item_id),
        )
        if cur.rowcount == 0:
            return False
        set_meta(conn, "atualizado_em", datetime.now().isoformat(timespec="seconds"))
        return True


def delete_item(item_id: str, *, usuario: dict | None = None) -> bool:
    with connect() as conn:
        init_db(conn)
        row = conn.execute(
            "SELECT foto, projeto_id FROM itens WHERE id=?", (item_id,)
        ).fetchone()
        if not row:
            return False
        if row["foto"]:
            delete_foto_file(row["foto"])
        projeto_id = row.get("projeto_id") or CASA_TRABALHADOR_ID
        conn.execute("DELETE FROM historico WHERE item_id=?", (item_id,))
        conn.execute("DELETE FROM itens WHERE id=?", (item_id,))
        now = datetime.now().isoformat(timespec="seconds")
        if projeto_id == CASA_TRABALHADOR_ID:
            set_meta(conn, "atualizado_em", now)
        else:
            conn.execute(
                "UPDATE projetos SET atualizado_em=? WHERE id=?", (now, projeto_id)
            )
        add_audit(
            projeto_id=projeto_id,
            entidade="item",
            entidade_id=item_id,
            acao="excluir",
            usuario=usuario,
            conn=conn,
        )
        return True


def load_painel(projeto_id: str = CASA_TRABALHADOR_ID) -> dict:
    ensure_db()
    with connect() as conn:
        init_db(conn)
        itens = list_itens(conn, projeto_id)
        if projeto_id == CASA_TRABALHADOR_ID:
            blocos_raw = get_meta(conn, "blocos", "")
            try:
                blocos = json.loads(blocos_raw) if blocos_raw else BLOCO_LABELS
            except json.JSONDecodeError:
                blocos = BLOCO_LABELS
            nome_projeto = get_meta(conn, "projeto", "Casa do Trabalhador")
            atualizado_em = get_meta(conn, "atualizado_em", "")
            fonte = get_meta(conn, "fonte", banco_label())
        else:
            projeto = get_projeto(conn, projeto_id) or {}
            blocos = (projeto.get("config") or {}).get("blocos", {})
            nome_projeto = projeto.get("nome", projeto_id)
            atualizado_em = projeto.get("atualizado_em", "")
            fonte = banco_label()
        return {
            "projeto": nome_projeto,
            "projeto_id": projeto_id,
            "atualizado_em": atualizado_em,
            "fonte": fonte,
            "blocos": blocos,
            "itens": itens,
        }


def migrate_from_json_if_needed() -> bool:
    """Importa data/painel.json se a tabela itens estiver vazia."""
    with connect() as conn:
        init_db(conn)
        count = conn.execute("SELECT COUNT(*) AS n FROM itens").fetchone()["n"]
        if count > 0:
            return False
    if not JSON_LEGACY.exists():
        return False
    payload = json.loads(JSON_LEGACY.read_text(encoding="utf-8"))
    itens = payload.get("itens", [])
    if not itens:
        return False
    replace_all_itens(
        itens,
        fonte=payload.get("fonte", JSON_LEGACY.name),
        preserve_edits=False,
    )
    with connect() as conn:
        if payload.get("atualizado_em"):
            set_meta(conn, "atualizado_em", payload["atualizado_em"])
        if payload.get("projeto"):
            set_meta(conn, "projeto", payload["projeto"])
    destino = "postgres" if USE_POSTGRES else str(DB_PATH)
    print(f"Migrados {len(itens)} itens de {JSON_LEGACY.name} -> {destino}")
    return True


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("ascii"),
        PBKDF2_ROUNDS,
    )
    return f"pbkdf2_sha256${PBKDF2_ROUNDS}${salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, rounds_s, salt, digest = stored.split("$", 3)
        if algo != "pbkdf2_sha256":
            return False
        check = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("ascii"),
            int(rounds_s),
        )
        return secrets.compare_digest(check.hex(), digest)
    except (ValueError, TypeError):
        return False


def normalize_papel(papel: str) -> str:
    value = (papel or "").strip().casefold()
    if value == "usuario":
        return "editor"
    if value not in PAPEIS:
        raise ValueError("Papel inválido (use admin, editor ou consulta)")
    return value


def pode_editar(papel: str) -> bool:
    try:
        return normalize_papel(papel) in ("admin", "editor")
    except ValueError:
        return False


def _user_public(row: Any) -> dict:
    data = dict(row)
    data.pop("senha_hash", None)
    data["ativo"] = bool(data.get("ativo", 0))
    try:
        data["papel"] = normalize_papel(data.get("papel", "consulta"))
    except ValueError:
        data["papel"] = "consulta"
    data["pode_editar"] = pode_editar(data["papel"])
    data["papel_label"] = PAPEL_LABELS.get(data["papel"], data["papel"])
    return data


def _migrate_papeis(conn: _ConnProxy) -> None:
    conn.execute(
        "UPDATE usuarios SET papel='editor' WHERE lower(papel)='usuario'"
    )


def _seed_admin_inicial(conn: _ConnProxy) -> None:
    count = conn.execute("SELECT COUNT(*) AS n FROM usuarios").fetchone()["n"]
    if count:
        return
    now = datetime.now().isoformat(timespec="seconds")
    conn.execute(
        """
        INSERT INTO usuarios (usuario, senha_hash, nome, papel, ativo, criado_em, atualizado_em)
        VALUES (?, ?, ?, 'admin', 1, ?, ?)
        """,
        (
            DEFAULT_ADMIN_USER,
            hash_password(DEFAULT_ADMIN_PASS),
            "Administrador",
            now,
            now,
        ),
    )
    print(
        f"Usuário admin criado: {DEFAULT_ADMIN_USER} "
        "(defina ADMIN_PASS no ambiente e altere a senha após o primeiro acesso)"
    )


def list_usuarios() -> list[dict]:
    with connect() as conn:
        init_db(conn)
        rows = conn.execute(
            """
            SELECT id, usuario, nome, papel, ativo, criado_em, atualizado_em
            FROM usuarios
            ORDER BY papel DESC, lower(usuario)
            """
        ).fetchall()
        return [_user_public(r) for r in rows]


def get_usuario(conn: _ConnProxy, user_id: int) -> dict | None:
    row = conn.execute(
        """
        SELECT id, usuario, nome, papel, ativo, criado_em, atualizado_em, senha_hash
        FROM usuarios WHERE id=?
        """,
        (user_id,),
    ).fetchone()
    return dict(row) if row else None


def get_usuario_by_login(conn: _ConnProxy, usuario: str) -> dict | None:
    row = conn.execute(
        """
        SELECT id, usuario, nome, papel, ativo, criado_em, atualizado_em, senha_hash
        FROM usuarios WHERE lower(usuario) = lower(?)
        """,
        ((usuario or "").strip(),),
    ).fetchone()
    return dict(row) if row else None


def create_usuario(
    usuario: str,
    senha: str,
    *,
    nome: str = "",
    papel: str = "editor",
) -> dict:
    usuario = (usuario or "").strip()
    senha = senha or ""
    nome = (nome or "").strip()
    papel = normalize_papel(papel or "editor")
    if not usuario:
        raise ValueError("Informe o nome de usuário")
    if len(usuario) < 3:
        raise ValueError("Usuário deve ter ao menos 3 caracteres")
    if len(senha) < 6:
        raise ValueError("Senha deve ter ao menos 6 caracteres")

    now = datetime.now().isoformat(timespec="seconds")
    with connect() as conn:
        init_db(conn)
        if get_usuario_by_login(conn, usuario):
            raise ValueError("Usuário já existe")
        if conn.dialect == "postgres":
            row = conn.execute(
                """
                INSERT INTO usuarios (usuario, senha_hash, nome, papel, ativo, criado_em, atualizado_em)
                VALUES (?, ?, ?, ?, 1, ?, ?)
                RETURNING id, usuario, nome, papel, ativo, criado_em, atualizado_em, senha_hash
                """,
                (usuario, hash_password(senha), nome or usuario, papel, now, now),
            ).fetchone()
            return _user_public(row)
        cur = conn.execute(
            """
            INSERT INTO usuarios (usuario, senha_hash, nome, papel, ativo, criado_em, atualizado_em)
            VALUES (?, ?, ?, ?, 1, ?, ?)
            """,
            (usuario, hash_password(senha), nome or usuario, papel, now, now),
        )
        row = get_usuario(conn, cur.lastrowid)
        return _user_public(row)


def update_usuario(user_id: int, updates: dict) -> dict | None:
    with connect() as conn:
        init_db(conn)
        before = get_usuario(conn, user_id)
        if not before:
            return None

        fields: dict[str, object] = {}
        if "nome" in updates:
            fields["nome"] = str(updates["nome"] or "").strip()
        if "papel" in updates:
            fields["papel"] = normalize_papel(str(updates["papel"] or ""))
        if "ativo" in updates:
            fields["ativo"] = 1 if updates["ativo"] else 0
        if "senha" in updates and updates["senha"]:
            senha = str(updates["senha"])
            if len(senha) < 6:
                raise ValueError("Senha deve ter ao menos 6 caracteres")
            fields["senha_hash"] = hash_password(senha)

        if not fields:
            return _user_public(before)

        novo_papel = fields.get("papel", before["papel"])
        novo_ativo = fields.get("ativo", before["ativo"])
        if before["papel"] == "admin" and (
            novo_papel != "admin" or not novo_ativo
        ):
            admins = conn.execute(
                "SELECT COUNT(*) AS n FROM usuarios WHERE papel='admin' AND ativo=1"
            ).fetchone()["n"]
            if admins <= 1:
                raise ValueError("É necessário manter ao menos um administrador ativo")

        fields["atualizado_em"] = datetime.now().isoformat(timespec="seconds")
        sets = ", ".join(f"{k}=?" for k in fields)
        values = list(fields.values()) + [user_id]
        conn.execute(f"UPDATE usuarios SET {sets} WHERE id=?", values)
        if "senha_hash" in fields:
            conn.execute("DELETE FROM sessoes WHERE usuario_id=?", (user_id,))
        return _user_public(get_usuario(conn, user_id))


def delete_usuario(user_id: int) -> bool:
    with connect() as conn:
        init_db(conn)
        before = get_usuario(conn, user_id)
        if not before:
            return False
        if before["papel"] == "admin" and before["ativo"]:
            admins = conn.execute(
                "SELECT COUNT(*) AS n FROM usuarios WHERE papel='admin' AND ativo=1"
            ).fetchone()["n"]
            if admins <= 1:
                raise ValueError("É necessário manter ao menos um administrador ativo")
        conn.execute("DELETE FROM sessoes WHERE usuario_id=?", (user_id,))
        conn.execute("DELETE FROM usuarios WHERE id=?", (user_id,))
        return True


def authenticate(usuario: str, senha: str) -> dict | None:
    with connect() as conn:
        init_db(conn)
        row = get_usuario_by_login(conn, usuario)
        if not row or not row.get("ativo"):
            return None
        if not verify_password(senha or "", row["senha_hash"]):
            return None
        return _user_public(row)


def create_session(usuario_id: int) -> str:
    token = secrets.token_urlsafe(32)
    now = datetime.now()
    expira = now + timedelta(days=SESSION_DAYS)
    with connect() as conn:
        init_db(conn)
        conn.execute(
            "DELETE FROM sessoes WHERE usuario_id=? OR expira_em < ?",
            (usuario_id, now.isoformat(timespec="seconds")),
        )
        conn.execute(
            """
            INSERT INTO sessoes (token, usuario_id, criado_em, expira_em)
            VALUES (?, ?, ?, ?)
            """,
            (
                token,
                usuario_id,
                now.isoformat(timespec="seconds"),
                expira.isoformat(timespec="seconds"),
            ),
        )
    return token


def get_session_user(token: str | None) -> dict | None:
    if not token:
        return None
    now = datetime.now().isoformat(timespec="seconds")
    with connect() as conn:
        init_db(conn)
        row = conn.execute(
            """
            SELECT u.id, u.usuario, u.nome, u.papel, u.ativo, u.criado_em, u.atualizado_em
            FROM sessoes s
            JOIN usuarios u ON u.id = s.usuario_id
            WHERE s.token = ? AND s.expira_em >= ? AND u.ativo = 1
            """,
            (token, now),
        ).fetchone()
        if not row:
            return None
        return _user_public(row)


def destroy_session(token: str | None) -> None:
    if not token:
        return
    with connect() as conn:
        init_db(conn)
        conn.execute("DELETE FROM sessoes WHERE token=?", (token,))


# --- Projetos (portfólio) -----------------------------------------------


def _slugify(value: str) -> str:
    value = (value or "").strip().lower()
    value = re.sub(r"[àáâãäå]", "a", value)
    value = re.sub(r"[èéêë]", "e", value)
    value = re.sub(r"[ìíîï]", "i", value)
    value = re.sub(r"[òóôõö]", "o", value)
    value = re.sub(r"[ùúûü]", "u", value)
    value = value.replace("ç", "c")
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-") or "projeto"


def _projeto_public(row: Any) -> dict:
    data = dict(row)
    data["ativo"] = bool(data.get("ativo", 0))
    try:
        data["config"] = json.loads(data.get("config_json") or "{}")
    except json.JSONDecodeError:
        data["config"] = {}
    data.pop("config_json", None)
    return data


def list_projetos(*, somente_ativos: bool = False) -> list[dict]:
    with connect() as conn:
        init_db(conn)
        return _list_projetos(conn, somente_ativos=somente_ativos)


def _list_projetos(conn: _ConnProxy, *, somente_ativos: bool = False) -> list[dict]:
    sql = """
        SELECT p.*, u.usuario AS gerente_usuario, u.nome AS gerente_nome
        FROM projetos p
        LEFT JOIN usuarios u ON u.id = p.gerente_usuario_id
    """
    if somente_ativos:
        sql += " WHERE p.ativo = 1"
    sql += " ORDER BY lower(p.nome)"
    rows = conn.execute(sql).fetchall()
    return [_projeto_public(r) for r in rows]


def portfolio_for_usuario(usuario: dict) -> list[dict]:
    """Retorna projetos acessíveis + itens em 1 conexão (evita N+1 do portfólio)."""
    with connect() as conn:
        init_db(conn)
        projetos = _list_projetos(conn, somente_ativos=True)
        if not projetos:
            return []

        if usuario.get("papel") == "admin":
            papeis = {p["id"]: "admin" for p in projetos}
        else:
            rows = conn.execute(
                "SELECT projeto_id, papel FROM usuario_projetos WHERE usuario_id=?",
                (usuario.get("id"),),
            ).fetchall()
            papeis = {r["projeto_id"]: r["papel"] for r in rows}

        acessiveis = [p for p in projetos if p["id"] in papeis]
        if not acessiveis:
            return []

        ids = [p["id"] for p in acessiveis]
        placeholders = ",".join("?" for _ in ids)
        item_rows = conn.execute(
            f"SELECT * FROM itens WHERE projeto_id IN ({placeholders}) ORDER BY lower(id)",
            tuple(ids),
        ).fetchall()
        by_proj: dict[str, list[dict]] = {pid: [] for pid in ids}
        for row in item_rows:
            item = row_to_item(row)
            by_proj.setdefault(item.get("projeto_id") or "", []).append(item)

        out = []
        for p in acessiveis:
            out.append(
                {
                    "id": p["id"],
                    "nome": p["nome"],
                    "descricao": p.get("descricao", ""),
                    "gerente_nome": p.get("gerente_nome") or p.get("gerente_usuario") or "",
                    "prazo_conclusao": p.get("prazo_conclusao", ""),
                    "papel": papeis[p["id"]],
                    "itens": by_proj.get(p["id"], []),
                }
            )
        return out


def get_projeto(conn: _ConnProxy, projeto_id: str) -> dict | None:
    row = conn.execute(
        """
        SELECT p.*, u.usuario AS gerente_usuario, u.nome AS gerente_nome
        FROM projetos p
        LEFT JOIN usuarios u ON u.id = p.gerente_usuario_id
        WHERE p.id=?
        """,
        (projeto_id,),
    ).fetchone()
    return _projeto_public(row) if row else None


def get_projeto_public(projeto_id: str) -> dict | None:
    with connect() as conn:
        init_db(conn)
        return get_projeto(conn, projeto_id)


def create_projeto(payload: dict, *, usuario: dict | None = None) -> dict:
    nome = (payload.get("nome") or "").strip()
    if not nome:
        raise ValueError("Informe o nome do projeto")
    config = payload.get("config") or {
        "blocos": {},
        "frente_to_bloco": {},
        "status_options": DEFAULT_STATUS_OPTIONS,
    }
    now = datetime.now().isoformat(timespec="seconds")
    with connect() as conn:
        init_db(conn)
        slug = _slugify(payload.get("id") or nome)
        base_slug = slug
        n = 2
        while conn.execute("SELECT 1 FROM projetos WHERE id=?", (slug,)).fetchone():
            slug = f"{base_slug}-{n}"
            n += 1
        gerente_id = payload.get("gerente_usuario_id") or None
        conn.execute(
            """
            INSERT INTO projetos (
                id, nome, descricao, gerente_usuario_id, prazo_conclusao,
                config_json, ativo, criado_em, atualizado_em
            ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
            """,
            (
                slug,
                nome,
                (payload.get("descricao") or "").strip(),
                gerente_id,
                (payload.get("prazo_conclusao") or "").strip(),
                json.dumps(config, ensure_ascii=False),
                now,
                now,
            ),
        )
        if gerente_id:
            _set_usuario_projeto(conn, int(gerente_id), slug, "admin")
        add_audit(
            projeto_id=slug,
            entidade="projeto",
            entidade_id=slug,
            acao="criar",
            usuario=usuario,
            detalhes={"nome": nome},
            conn=conn,
        )
        return get_projeto(conn, slug)


def update_projeto(
    projeto_id: str, updates: dict, *, usuario: dict | None = None
) -> dict | None:
    with connect() as conn:
        init_db(conn)
        before = get_projeto(conn, projeto_id)
        if not before:
            return None

        fields: dict[str, object] = {}
        if "nome" in updates:
            fields["nome"] = str(updates["nome"] or "").strip()
        if "descricao" in updates:
            fields["descricao"] = str(updates["descricao"] or "").strip()
        if "prazo_conclusao" in updates:
            fields["prazo_conclusao"] = str(updates["prazo_conclusao"] or "").strip()
        if "config" in updates:
            fields["config_json"] = json.dumps(updates["config"] or {}, ensure_ascii=False)
        if "ativo" in updates:
            fields["ativo"] = 1 if updates["ativo"] else 0

        gerente_novo = None
        if "gerente_usuario_id" in updates:
            gerente_novo = updates["gerente_usuario_id"] or None
            fields["gerente_usuario_id"] = gerente_novo

        if fields:
            fields["atualizado_em"] = datetime.now().isoformat(timespec="seconds")
            sets = ", ".join(f"{k}=?" for k in fields)
            values = list(fields.values()) + [projeto_id]
            conn.execute(f"UPDATE projetos SET {sets} WHERE id=?", values)

        if "gerente_usuario_id" in updates and gerente_novo:
            _set_usuario_projeto(conn, int(gerente_novo), projeto_id, "admin")

        add_audit(
            projeto_id=projeto_id,
            entidade="projeto",
            entidade_id=projeto_id,
            acao="atualizar",
            usuario=usuario,
            detalhes={k: v for k, v in fields.items() if k != "config_json"},
            conn=conn,
        )
        return get_projeto(conn, projeto_id)


def delete_projeto(projeto_id: str, *, usuario: dict | None = None) -> bool:
    """Soft-delete: inativa o projeto, preservando itens e histórico."""
    if projeto_id == CASA_TRABALHADOR_ID:
        raise ValueError("O projeto Casa do Trabalhador não pode ser removido")
    with connect() as conn:
        init_db(conn)
        before = get_projeto(conn, projeto_id)
        if not before:
            return False
        conn.execute(
            "UPDATE projetos SET ativo=0, atualizado_em=? WHERE id=?",
            (datetime.now().isoformat(timespec="seconds"), projeto_id),
        )
        add_audit(
            projeto_id=projeto_id,
            entidade="projeto",
            entidade_id=projeto_id,
            acao="excluir",
            usuario=usuario,
            conn=conn,
        )
        return True


# --- Acessos por projeto -------------------------------------------------


def _set_usuario_projeto(
    conn: _ConnProxy, usuario_id: int, projeto_id: str, papel: str
) -> None:
    papel = normalize_papel(papel)
    now = datetime.now().isoformat(timespec="seconds")
    conn.execute(
        """
        INSERT INTO usuario_projetos (usuario_id, projeto_id, papel, criado_em, atualizado_em)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(usuario_id, projeto_id) DO UPDATE SET
            papel=excluded.papel,
            atualizado_em=excluded.atualizado_em
        """,
        (usuario_id, projeto_id, papel, now, now),
    )


def set_usuario_projeto(
    usuario_id: int, projeto_id: str, papel: str, *, usuario: dict | None = None
) -> None:
    with connect() as conn:
        init_db(conn)
        if not get_usuario(conn, usuario_id):
            raise ValueError("Usuário não encontrado")
        if not get_projeto(conn, projeto_id):
            raise ValueError("Projeto não encontrado")
        _set_usuario_projeto(conn, usuario_id, projeto_id, papel)
        add_audit(
            projeto_id=projeto_id,
            entidade="usuario",
            entidade_id=str(usuario_id),
            acao="conceder_acesso",
            usuario=usuario,
            detalhes={"papel": normalize_papel(papel)},
            conn=conn,
        )


def remove_usuario_projeto(
    usuario_id: int, projeto_id: str, *, usuario: dict | None = None
) -> bool:
    with connect() as conn:
        init_db(conn)
        cur = conn.execute(
            "DELETE FROM usuario_projetos WHERE usuario_id=? AND projeto_id=?",
            (usuario_id, projeto_id),
        )
        removido = cur.rowcount > 0
        if removido:
            add_audit(
                projeto_id=projeto_id,
                entidade="usuario",
                entidade_id=str(usuario_id),
                acao="revogar_acesso",
                usuario=usuario,
                conn=conn,
            )
        return removido


def list_projetos_do_usuario(usuario_id: int) -> list[dict]:
    with connect() as conn:
        init_db(conn)
        rows = conn.execute(
            """
            SELECT up.projeto_id, up.papel, p.nome, p.ativo
            FROM usuario_projetos up
            JOIN projetos p ON p.id = up.projeto_id
            WHERE up.usuario_id = ?
            ORDER BY lower(p.nome)
            """,
            (usuario_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def list_usuarios_do_projeto(projeto_id: str) -> list[dict]:
    with connect() as conn:
        init_db(conn)
        rows = conn.execute(
            """
            SELECT up.usuario_id, up.papel, u.usuario, u.nome, u.ativo
            FROM usuario_projetos up
            JOIN usuarios u ON u.id = up.usuario_id
            WHERE up.projeto_id = ?
            ORDER BY lower(u.usuario)
            """,
            (projeto_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def papel_no_projeto(usuario: dict | None, projeto_id: str) -> str | None:
    """Papel do usuário no projeto. Admin global é super-admin (acesso total)."""
    if not usuario:
        return None
    if usuario.get("papel") == "admin":
        return "admin"
    with connect() as conn:
        init_db(conn)
        row = conn.execute(
            "SELECT papel FROM usuario_projetos WHERE usuario_id=? AND projeto_id=?",
            (usuario.get("id"), projeto_id),
        ).fetchone()
        return row["papel"] if row else None


def pode_editar_projeto(usuario: dict | None, projeto_id: str) -> bool:
    return papel_no_projeto(usuario, projeto_id) in ("admin", "editor")


def pode_administrar_projeto(usuario: dict | None, projeto_id: str) -> bool:
    return papel_no_projeto(usuario, projeto_id) == "admin"


# --- Auditoria -------------------------------------------------------------


def add_audit(
    *,
    projeto_id: str | None,
    entidade: str,
    acao: str,
    usuario: dict | None,
    entidade_id: str = "",
    detalhes: dict | None = None,
    conn: _ConnProxy | None = None,
) -> None:
    autor_id, autor_nome = _autor_from_usuario(usuario)
    row = (
        projeto_id,
        entidade,
        str(entidade_id or ""),
        acao,
        autor_id,
        autor_nome,
        datetime.now().isoformat(timespec="seconds"),
        json.dumps(detalhes or {}, ensure_ascii=False, default=str),
    )
    sql = """
        INSERT INTO audit_log (
            projeto_id, entidade, entidade_id, acao, usuario_id, usuario_nome, criado_em, detalhes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """
    if conn is not None:
        conn.execute(sql, row)
        return
    with connect() as c:
        init_db(c)
        c.execute(sql, row)


def list_audit(*, projeto_id: str | None = None, limite: int = 200) -> list[dict]:
    with connect() as conn:
        init_db(conn)
        if projeto_id:
            rows = conn.execute(
                "SELECT * FROM audit_log WHERE projeto_id=? "
                "ORDER BY criado_em DESC, id DESC LIMIT ?",
                (projeto_id, limite),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM audit_log ORDER BY criado_em DESC, id DESC LIMIT ?",
                (limite,),
            ).fetchall()
        out = []
        for row in rows:
            data = dict(row)
            try:
                data["detalhes"] = json.loads(data.get("detalhes") or "{}")
            except json.JSONDecodeError:
                data["detalhes"] = {}
            out.append(data)
        return out


def ensure_db() -> str:
    """Garante schema. Em Postgres/SQLite vazio, tenta carregar painel.json."""
    with connect() as conn:
        init_db(conn)
        count = conn.execute("SELECT COUNT(*) AS n FROM itens").fetchone()["n"]

    if USE_POSTGRES:
        if count == 0:
            if migrate_from_json_if_needed():
                return "postgres"
            print(
                "Postgres OK (sem itens). "
                "Inclua data/painel.json no deploy ou rode migrate_sqlite_to_supabase.py."
            )
        return "postgres"

    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    if count == 0:
        if migrate_from_json_if_needed():
            return str(DB_PATH)
        xlsx = ROOT / "Painel_Casa_do_Trabalhador.xlsx"
        if xlsx.is_file():
            from import_xlsx import run

            run()
        else:
            print(
                "SQLite vazio e sem planilha/JSON para importar. "
                "Painel inicia sem itens."
            )
    return str(DB_PATH)


if __name__ == "__main__":
    path = ensure_db()
    painel = load_painel()
    print(f"DB: {path} ({banco_label()})")
    print(f"Itens: {len(painel['itens'])}")
    print(f"Atualizado: {painel['atualizado_em']}")
