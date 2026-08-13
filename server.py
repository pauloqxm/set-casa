#!/usr/bin/env python3
"""Servidor do painel Casa do Trabalhador (local ou Railway + Supabase)."""

from __future__ import annotations

import json
import os
import re
from datetime import date, datetime
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

import db

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
HOST = os.environ.get("HOST", "0.0.0.0" if db.USE_POSTGRES else "127.0.0.1")
PORT = int(os.environ.get("PORT", "8765"))
SESSION_COOKIE = "ct_session"
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "1" if db.USE_POSTGRES else "0").strip() in {
    "1",
    "true",
    "True",
    "yes",
}

DONE = {"concluído", "concluido"}
NA = {"não se aplica", "nao se aplica"}
INAUGURACAO = date(2026, 11, 26)

PUBLIC_PREFIXES = ("/static/",)
PUBLIC_PATHS = {
    "/login.html",
    "/api/login",
    "/api/logout",
    "/api/me",
    "/api/health",
    "/favicon.ico",
}


def parse_date(value: str) -> date | None:
    if not value:
        return None
    value = str(value).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


def is_done(status: str) -> bool:
    return (status or "").strip().casefold() in DONE


def is_na(status: str) -> bool:
    return (status or "").strip().casefold() in NA


def is_atrasado(item: dict, today: date) -> bool:
    if is_done(item.get("status", "")) or is_na(item.get("status", "")):
        return False
    prazo = parse_date(item.get("prazo", ""))
    return bool(prazo and prazo < today)


def days_until(prazo_value: str, today: date) -> int | None:
    prazo = parse_date(prazo_value)
    if not prazo:
        return None
    return (prazo - today).days


def pct_number(value) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(str(value).replace("%", "").replace(",", ".").strip())
    except ValueError:
        return None


def compute_kpis(itens: list[dict], *, prazo_conclusao: date | None = None) -> dict:
    today = date.today()
    total = len(itens)
    concluidos = sum(1 for i in itens if is_done(i.get("status", "")))
    na = sum(1 for i in itens if is_na(i.get("status", "")))
    denominador = max(total - na, 1)
    pcts = [p for i in itens if (p := pct_number(i.get("pct"))) is not None]
    if pcts:
        progresso = round(sum(pcts) / len(pcts), 1)
    else:
        progresso = round(100.0 * concluidos / denominador, 1)

    criticas = sum(
        1
        for i in itens
        if (i.get("prioridade") or "").casefold() == "crítica"
        and not is_done(i.get("status", ""))
        and not is_na(i.get("status", ""))
    )
    atrasadas = sum(1 for i in itens if is_atrasado(i, today))
    aguardando = sum(
        1
        for i in itens
        if (i.get("status") or "").casefold() == "aguardando terceiros"
    )
    em_andamento = sum(
        1 for i in itens if (i.get("status") or "").casefold() == "em andamento"
    )
    nao_iniciados = sum(
        1 for i in itens if (i.get("status") or "").casefold() == "não iniciado"
    )
    base = {
        "total": total,
        "concluidos": concluidos,
        "progresso_pct": progresso,
        "criticas_abertas": criticas,
        "atrasadas": atrasadas,
        "aguardando_terceiros": aguardando,
        "em_andamento": em_andamento,
        "nao_iniciados": nao_iniciados,
        "hoje": today.isoformat(),
    }
    if prazo_conclusao is not None:
        base["prazo_conclusao"] = prazo_conclusao.isoformat()
        base["dias_para_conclusao"] = (prazo_conclusao - today).days
    else:
        # Compatibilidade: painel legado da Casa do Trabalhador sempre expôs
        # estes dois campos com o nome "inauguração".
        base["inauguracao"] = INAUGURACAO.isoformat()
        base["dias_para_inauguracao"] = (INAUGURACAO - today).days
    return base


def compute_frentes(itens: list[dict]) -> list[dict]:
    groups: dict[str, list[dict]] = {}
    for item in itens:
        frente = (item.get("frente") or "").strip() or "Sem frente"
        groups.setdefault(frente, []).append(item)

    order_preferida = [
        "Infraestrutura",
        "Restauro e Patrimônio Histórico",
        "Equipamentos e Mobiliário",
        "Comunicação Institucional",
        "Evento de Inauguração",
        "Parcerias Institucionais",
        "Implantação dos Serviços",
        "Gestão Patrimonial",
        "Gestão Contratual e Financeira",
        "Tecnologia e Infraestrutura Operacional",
    ]
    ordered = [f for f in order_preferida if f in groups]
    ordered.extend(sorted(f for f in groups if f not in ordered))

    out = []
    for frente in ordered:
        rows = groups[frente]
        total = len(rows)
        done = sum(1 for i in rows if is_done(i.get("status", "")))
        andamento = sum(
            1 for i in rows if (i.get("status") or "").casefold() == "em andamento"
        )
        aguardando = sum(
            1
            for i in rows
            if (i.get("status") or "").casefold() == "aguardando terceiros"
        )
        rest = max(total - done - andamento - aguardando, 0)
        sample = rows[0]
        bloco, bloco_label = db.bloco_from_frente(frente if frente != "Sem frente" else "")
        out.append(
            {
                "frente": frente,
                "bloco": bloco or sample.get("bloco", "outras"),
                "bloco_label": bloco_label or sample.get("bloco_label", "Outras"),
                "total": total,
                "concluidos": done,
                "em_andamento": andamento,
                "aguardando_terceiros": aguardando,
                "outros": rest,
                "pct_concluidos": round(100.0 * done / total, 1) if total else 0,
                "pct_andamento": round(100.0 * andamento / total, 1) if total else 0,
                "pct_aguardando": round(100.0 * aguardando / total, 1) if total else 0,
                "pct_outros": round(100.0 * rest / total, 1) if total else 0,
            }
        )
    return out


def annotate_items(itens: list[dict]) -> list[dict]:
    today = date.today()
    out = []
    for item in itens:
        clone = dict(item)
        clone["atrasado"] = is_atrasado(item, today)
        clone["dias_prazo"] = days_until(item.get("prazo", ""), today)
        foto = item.get("foto") or ""
        clone["foto_url"] = db.foto_public_url(foto) if foto else ""
        out.append(clone)
    return out


def attention_items(itens: list[dict]) -> list[dict]:
    today = date.today()
    selected = []
    for item in itens:
        status = (item.get("status") or "").casefold()
        prio = (item.get("prioridade") or "").casefold()
        if is_done(status) or is_na(status):
            continue
        if prio == "crítica" or is_atrasado(item, today) or status == "aguardando terceiros":
            selected.append(item)

    def sort_key(item: dict):
        prio = (item.get("prioridade") or "").casefold()
        prio_rank = 0 if prio == "crítica" else 1 if prio == "alta" else 2
        dias = item.get("dias_prazo")
        dias_rank = dias if dias is not None else 10_000
        return (prio_rank, dias_rank, item.get("id") or "")

    selected.sort(key=sort_key)
    return selected[:20]


def _kpis_for_projeto(projeto_id: str, raw_itens: list[dict]) -> dict:
    if projeto_id == db.CASA_TRABALHADOR_ID:
        return compute_kpis(raw_itens)
    projeto = db.get_projeto_public(projeto_id) or {}
    return compute_kpis(
        raw_itens, prazo_conclusao=parse_date(projeto.get("prazo_conclusao", ""))
    )


def painel_response(projeto_id: str = db.CASA_TRABALHADOR_ID) -> dict:
    painel = db.load_painel(projeto_id)
    raw_itens = painel.get("itens", [])
    itens = annotate_items(raw_itens)
    kpis = _kpis_for_projeto(projeto_id, raw_itens)
    projeto = db.get_projeto_public(projeto_id) or {}
    return {
        **painel,
        "itens": itens,
        "kpis": kpis,
        "frentes": compute_frentes(raw_itens),
        "atencao": attention_items(itens),
        "banco": db.banco_label(),
        "descricao": projeto.get("descricao", ""),
        "gerente_usuario_id": projeto.get("gerente_usuario_id"),
        "gerente_nome": projeto.get("gerente_nome") or projeto.get("gerente_usuario") or "",
        "inicio_projeto": projeto.get("inicio_projeto", ""),
        "prazo_conclusao": projeto.get("prazo_conclusao", ""),
    }


def portfolio_response(user: dict) -> dict:
    rows = db.portfolio_for_usuario(user)
    out = []
    for p in rows:
        raw_itens = p.get("itens") or []
        kpis = _kpis_for_projeto(p["id"], raw_itens)
        out.append(
            {
                "id": p["id"],
                "nome": p["nome"],
                "descricao": p.get("descricao", ""),
                "gerente_nome": p.get("gerente_nome") or "",
                "inicio_projeto": p.get("inicio_projeto", ""),
                "prazo_conclusao": p.get("prazo_conclusao", ""),
                "papel": p.get("papel"),
                "kpis": kpis,
            }
        )
    return {"ok": True, "projetos": out}


def tarefas_response(user: dict, query: str = "") -> dict:
    params = parse_qs(query or "")

    def qp(key: str, default: str = "") -> str:
        vals = params.get(key, [])
        return (vals[0] if vals else default).strip()

    filtro = {
        "prazo_de": qp("prazo_de"),
        "prazo_ate": qp("prazo_ate"),
        "projeto_id": qp("projeto_id"),
        "status": qp("status"),
        "prioridade": qp("prioridade"),
        "responsavel": qp("responsavel"),
        "origem": qp("origem"),
        "ordenar": qp("ordenar", "prazo") or "prazo",
    }
    raw, nomes, papeis = db.list_tarefas_for_usuario(user, **filtro)
    itens = annotate_items(raw)
    kpis = compute_kpis(raw)

    by_proj: dict[str, list[dict]] = {}
    for row in raw:
        pid = row.get("projeto_id") or ""
        if pid == db.TAREFAS_GERAIS_ID:
            continue
        by_proj.setdefault(pid, []).append(row)

    criticos = []
    for pid, rows in by_proj.items():
        pk = compute_kpis(rows)
        score = (
            pk["criticas_abertas"] * 3
            + pk["atrasadas"] * 2
            + max(0, int(100 - pk["progresso_pct"]))
        )
        criticos.append(
            {
                "id": pid,
                "nome": nomes.get(pid, pid),
                "atrasadas": pk["atrasadas"],
                "criticas": pk["criticas_abertas"],
                "progresso_pct": pk["progresso_pct"],
                "score": score,
            }
        )
    criticos.sort(key=lambda x: (-x["score"], -x["atrasadas"], x["nome"]))
    criticos = criticos[:5]

    resp_map: dict[str, dict] = {}
    for item in itens:
        if is_done(item.get("status", "")) or is_na(item.get("status", "")):
            continue
        nome = (item.get("responsavel") or "").strip() or "—"
        bucket = resp_map.setdefault(
            nome, {"nome": nome, "total_abertas": 0, "atrasadas": 0}
        )
        bucket["total_abertas"] += 1
        if item.get("atrasado"):
            bucket["atrasadas"] += 1
    responsaveis = sorted(
        resp_map.values(), key=lambda x: (-x["atrasadas"], -x["total_abertas"], x["nome"])
    )[:5]

    admin = user.get("papel") == "admin"
    tarefas = []
    for item in itens:
        pid = item.get("projeto_id") or ""
        meu_papel = papeis.get(pid)
        if pid == db.TAREFAS_GERAIS_ID and admin:
            meu_papel = "admin"
        tarefas.append(
            {
                **item,
                "projeto_nome": nomes.get(pid, pid),
                "origem_label": db.ORIGEM_LABELS.get(
                    item.get("origem") or db.ORIGEM_PROJETO, ""
                ),
                "meu_papel": meu_papel,
                "pode_editar": db.pode_editar_tarefa(user, item),
            }
        )

    origens = [
        {"id": k, "label": v}
        for k, v in db.ORIGEM_LABELS.items()
        if k != db.ORIGEM_PROJETO
    ]

    return {
        "ok": True,
        "filtro": filtro,
        "kpis": kpis,
        "rankings": {
            "projetos_criticos": criticos,
            "responsaveis": responsaveis,
        },
        "tarefas": tarefas,
        "projetos": db.projetos_acessiveis_usuario(user, incluir_frentes=True),
        "origens": origens,
        "pode_criar_institucional": admin,
        "status_options": db.DEFAULT_STATUS_OPTIONS,
    }


def is_public_path(path: str) -> bool:
    if path in PUBLIC_PATHS:
        return True
    return any(path.startswith(prefix) for prefix in PUBLIC_PREFIXES)


def prepare_item_payload(body: dict, item_id: str, current_foto: str = "") -> dict:
    """Remove campos de upload e aplica foto_base64/remover_foto."""
    payload = dict(body or {})
    # Impede gravar caminho arbitrário enviado pelo cliente
    payload.pop("foto", None)
    novo = db.apply_foto_from_payload(item_id, payload, current_foto=current_foto)
    payload.pop("foto_base64", None)
    payload.pop("foto_nome", None)
    payload.pop("remover_foto", None)
    if novo is not None:
        payload["foto"] = novo
    return payload


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB), **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        print(f"[{self.log_date_time_string()}] {fmt % args}")

    def _send_json(self, payload: dict, status: int = 200, cookies: list[str] | None = None) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for cookie in cookies or []:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))

    def _cookies(self) -> dict[str, str]:
        jar = SimpleCookie()
        raw = self.headers.get("Cookie", "")
        if raw:
            jar.load(raw)
        return {k: morsel.value for k, morsel in jar.items()}

    def _session_token(self) -> str | None:
        return self._cookies().get(SESSION_COOKIE)

    def _current_user(self) -> dict | None:
        return db.get_session_user(self._session_token())

    def _session_cookie(self, token: str, *, clear: bool = False) -> str:
        secure = "; Secure" if COOKIE_SECURE else ""
        if clear:
            return (
                f"{SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax{secure}"
            )
        max_age = db.SESSION_DAYS * 24 * 60 * 60
        return (
            f"{SESSION_COOKIE}={token}; Path=/; Max-Age={max_age}; "
            f"HttpOnly; SameSite=Lax{secure}"
        )

    def _require_user(self) -> dict | None:
        user = self._current_user()
        if user:
            return user
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self._send_json({"ok": False, "erro": "Não autenticado"}, 401)
        else:
            self.send_response(302)
            self.send_header("Location", "/login.html")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
        return None

    def _require_admin(self) -> dict | None:
        user = self._require_user()
        if not user:
            return None
        if user.get("papel") != "admin":
            if urlparse(self.path).path.startswith("/api/"):
                self._send_json({"ok": False, "erro": "Acesso restrito a administradores"}, 403)
            else:
                self.send_response(302)
                self.send_header("Location", "/")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
            return None
        return user

    def _require_editor(self) -> dict | None:
        user = self._require_user()
        if not user:
            return None
        if not db.pode_editar(user.get("papel", "")):
            self._send_json(
                {"ok": False, "erro": "Perfil Consulta: apenas visualização"},
                403,
            )
            return None
        return user

    _PAPEL_RANK = {"consulta": 0, "editor": 1, "admin": 2}

    def _require_projeto_role(self, projeto_id: str, minimo: str = "consulta") -> dict | None:
        """Exige que o usuário logado tenha ao menos `minimo` de acesso ao projeto.
        Administradores globais sempre têm acesso total (super-admin)."""
        user = self._require_user()
        if not user:
            return None
        # Uma única conexão: existência do projeto + papel do usuário
        with db.connect() as conn:
            db.init_db(conn)
            if not db.get_projeto(conn, projeto_id):
                self._send_json({"ok": False, "erro": "Projeto não encontrado"}, 404)
                return None
            if user.get("papel") == "admin":
                papel = "admin"
            else:
                row = conn.execute(
                    "SELECT papel FROM usuario_projetos WHERE usuario_id=? AND projeto_id=?",
                    (user.get("id"), projeto_id),
                ).fetchone()
                papel = row["papel"] if row else None
        if not papel or self._PAPEL_RANK.get(papel, -1) < self._PAPEL_RANK.get(minimo, 0):
            self._send_json({"ok": False, "erro": "Sem permissão para este projeto"}, 403)
            return None
        return user

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        # Normaliza path (alguns clientes enviam //api/...)
        if path.startswith("//"):
            path = "/" + path.lstrip("/")

        if path in ("/api/health", "/health"):
            import storage as _storage

            self._send_json(
                {
                    "ok": True,
                    "banco": db.banco_label(),
                    "postgres": db.USE_POSTGRES,
                    "storage": "supabase" if _storage.use_supabase_storage() else "local",
                    "version": "railway-supabase-1",
                    "path": path,
                }
            )
            return

        if path == "/api/logout":
            db.destroy_session(self._session_token())
            self._send_json(
                {"ok": True},
                cookies=[self._session_cookie("", clear=True)],
            )
            return

        if not is_public_path(path):
            if (
                path.startswith("/admin")
                or path == "/admin.html"
                or path in ("/projetos", "/projetos.html")
                or path.startswith("/projetos/")
            ):
                user = self._require_admin()
            else:
                user = self._require_user()
            if not user:
                return

        if path == "/api/painel":
            self._send_json(painel_response())
            return

        if path == "/api/portfolio":
            user = self._current_user()
            self._send_json(portfolio_response(user))
            return

        if path == "/api/tarefas":
            user = self._current_user()
            if not user:
                return
            if not db.projetos_acessiveis_usuario(user) and user.get("papel") != "admin":
                self._send_json({"ok": False, "erro": "Sem projetos acessíveis"}, 403)
                return
            self._send_json(tarefas_response(user, parsed.query))
            return

        if path == "/api/projetos":
            if not self._require_admin():
                return
            self._send_json({"ok": True, "projetos": db.list_projetos()})
            return

        proj_frentes_match = re.fullmatch(r"/api/projetos/([^/]+)/frentes", path)
        if proj_frentes_match:
            projeto_id = proj_frentes_match.group(1)
            if projeto_id == db.TAREFAS_GERAIS_ID:
                self._send_json({"ok": False, "erro": "Projeto não encontrado"}, 404)
                return
            user = self._require_projeto_role(projeto_id, "consulta")
            if not user:
                return
            self._send_json(
                {"ok": True, "frentes": db.frentes_for_projeto(projeto_id)}
            )
            return

        proj_match = re.fullmatch(r"/api/projetos/([^/]+)", path)
        if proj_match:
            projeto_id = proj_match.group(1)
            if not self._require_projeto_role(projeto_id, "admin"):
                return
            projeto = db.get_projeto_public(projeto_id)
            if not projeto:
                self._send_json({"ok": False, "erro": "Projeto não encontrado"}, 404)
                return
            self._send_json({"ok": True, "projeto": projeto})
            return

        proj_painel_match = re.fullmatch(r"/api/projetos/([^/]+)/painel", path)
        if proj_painel_match:
            projeto_id = proj_painel_match.group(1)
            user = self._require_projeto_role(projeto_id, "consulta")
            if not user:
                return
            payload = painel_response(projeto_id)
            payload["meu_papel"] = db.papel_no_projeto(user, projeto_id)
            self._send_json(payload)
            return

        proj_hist_match = re.fullmatch(
            r"/api/projetos/([^/]+)/itens/([^/]+)/historico", path
        )
        if proj_hist_match:
            projeto_id, item_id = proj_hist_match.groups()
            if not self._require_projeto_role(projeto_id, "consulta"):
                return
            with db.connect() as conn:
                db.init_db(conn)
                item = db.get_item(conn, item_id)
            if not item or item.get("projeto_id") != projeto_id:
                self._send_json({"ok": False, "erro": "Item não encontrado"}, 404)
                return
            self._send_json(
                {
                    "ok": True,
                    "item_id": item_id,
                    "entrega": item.get("entrega", ""),
                    "historico": db.list_historico(item_id),
                }
            )
            return

        proj_usuarios_match = re.fullmatch(r"/api/projetos/([^/]+)/usuarios", path)
        if proj_usuarios_match:
            projeto_id = proj_usuarios_match.group(1)
            if not self._require_projeto_role(projeto_id, "admin"):
                return
            self._send_json(
                {"ok": True, "usuarios": db.list_usuarios_do_projeto(projeto_id)}
            )
            return

        proj_audit_match = re.fullmatch(r"/api/projetos/([^/]+)/auditoria", path)
        if proj_audit_match:
            projeto_id = proj_audit_match.group(1)
            if not self._require_projeto_role(projeto_id, "admin"):
                return
            self._send_json(
                {"ok": True, "auditoria": db.list_audit(projeto_id=projeto_id)}
            )
            return

        foto_match = re.fullmatch(r"/api/fotos/(.+)", path)
        if foto_match:
            filename = unquote(foto_match.group(1))
            payload = db.read_foto_bytes(filename)
            if not payload:
                self.send_error(404, "Foto não encontrada")
                return
            data, ctype = payload
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "private, max-age=86400")
            self.end_headers()
            self.wfile.write(data)
            return

        if path == "/api/me":
            user = self._current_user()
            self._send_json({"ok": True, "usuario": user})
            return

        if path == "/api/usuarios":
            if not self._require_admin():
                return
            self._send_json({"ok": True, "usuarios": db.list_usuarios()})
            return

        if path == "/api/usuarios/opcoes":
            # Lista enxuta para selects (gerente etc.) — qualquer usuário autenticado
            if not self._require_user():
                return
            opcoes = [
                {
                    "id": u["id"],
                    "nome": u.get("nome") or "",
                    "usuario": u.get("usuario") or "",
                    "ativo": bool(u.get("ativo", True)),
                }
                for u in db.list_usuarios()
                if u.get("ativo", True)
            ]
            self._send_json({"ok": True, "usuarios": opcoes})
            return

        hist_match = re.fullmatch(r"/api/itens/([^/]+)/historico", path)
        if hist_match:
            item_id = hist_match.group(1)
            with db.connect() as conn:
                db.init_db(conn)
                item = db.get_item(conn, item_id)
            if not item:
                self._send_json({"ok": False, "erro": "Item não encontrado"}, 404)
                return
            self._send_json(
                {
                    "ok": True,
                    "item_id": item_id,
                    "entrega": item.get("entrega", ""),
                    "historico": db.list_historico(item_id),
                }
            )
            return

        if path in ("/", "/index.html"):
            self.path = "/index.html"
        elif path in ("/admin", "/admin.html"):
            self.path = "/admin.html"
        elif path in ("/portfolio", "/portfolio.html"):
            self.path = "/portfolio.html"
        elif path in ("/tarefas", "/tarefas.html"):
            user = self._current_user()
            if not db.projetos_acessiveis_usuario(user) and user.get("papel") != "admin":
                self.send_response(302)
                self.send_header("Location", "/portfolio.html")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                return
            self.path = "/tarefas.html"
        elif path in ("/projetos", "/projetos.html"):
            self.path = "/projetos.html"
        elif re.fullmatch(r"/projeto/[^/]+/?", path):
            projeto_id_pagina = path.strip("/").split("/")[1]
            if projeto_id_pagina == db.TAREFAS_GERAIS_ID:
                self.send_response(302)
                self.send_header("Location", "/tarefas.html")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                return
            if not self._require_projeto_role(projeto_id_pagina, "consulta"):
                return
            self.path = "/painel.html"
        elif path == "/login.html" and self._current_user():
            self.send_response(302)
            self.send_header("Location", "/portfolio.html")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return
        return super().do_GET()

    def do_PATCH(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        user_match = re.fullmatch(r"/api/usuarios/(\d+)", path)
        if user_match:
            if not self._require_admin():
                return
            user_id = int(user_match.group(1))
            try:
                body = self._read_json()
            except json.JSONDecodeError:
                self._send_json({"ok": False, "erro": "JSON inválido"}, 400)
                return
            try:
                updated = db.update_usuario(user_id, body)
            except ValueError as exc:
                self._send_json({"ok": False, "erro": str(exc)}, 400)
                return
            if not updated:
                self._send_json({"ok": False, "erro": "Usuário não encontrado"}, 404)
                return
            self._send_json({"ok": True, "usuario": updated})
            return

        proj_match = re.fullmatch(r"/api/projetos/([^/]+)", path)
        if proj_match:
            projeto_id = proj_match.group(1)
            # Admin global ou admin do projeto podem editar nome/gerente/prazo
            if not self._require_projeto_role(projeto_id, "admin"):
                return
            try:
                body = self._read_json()
            except json.JSONDecodeError:
                self._send_json({"ok": False, "erro": "JSON inválido"}, 400)
                return
            updated = db.update_projeto(projeto_id, body, usuario=self._current_user())
            if not updated:
                self._send_json({"ok": False, "erro": "Projeto não encontrado"}, 404)
                return
            self._send_json({"ok": True, "projeto": updated})
            return

        proj_item_match = re.fullmatch(r"/api/projetos/([^/]+)/itens/([^/]+)", path)
        if proj_item_match:
            projeto_id, item_id = proj_item_match.groups()
            user = self._require_projeto_role(projeto_id, "editor")
            if not user:
                return
            return self._patch_item(projeto_id, item_id, user)

        tarefa_match = re.fullmatch(r"/api/tarefas/([^/]+)", path)
        if tarefa_match:
            item_id = tarefa_match.group(1)
            with db.connect() as conn:
                db.init_db(conn)
                current = db.get_item(conn, item_id)
            if not current:
                self._send_json({"ok": False, "erro": "Tarefa não encontrada"}, 404)
                return
            projeto_id = current.get("projeto_id") or db.CASA_TRABALHADOR_ID
            if projeto_id == db.TAREFAS_GERAIS_ID:
                user = self._require_admin()
            else:
                user = self._require_projeto_role(projeto_id, "editor")
            if not user:
                return
            return self._patch_item(projeto_id, item_id, user)

        if not self._require_editor():
            return

        match = re.fullmatch(r"/api/itens/([^/]+)", path)
        if not match:
            self._send_json({"ok": False, "erro": "Rota não encontrada"}, 404)
            return
        item_id = match.group(1)
        self._patch_item(db.CASA_TRABALHADOR_ID, item_id, self._current_user())

    def _patch_item(self, projeto_id: str, item_id: str, user: dict | None) -> None:
        try:
            body = self._read_json()
        except json.JSONDecodeError:
            self._send_json({"ok": False, "erro": "JSON inválido"}, 400)
            return

        with db.connect() as conn:
            db.init_db(conn)
            current = db.get_item(conn, item_id)
        if not current or current.get("projeto_id") != projeto_id:
            self._send_json({"ok": False, "erro": "Item não encontrado"}, 404)
            return

        try:
            body = prepare_item_payload(body, item_id, current.get("foto", ""))
        except ValueError as exc:
            self._send_json({"ok": False, "erro": str(exc)}, 400)
            return

        found = db.update_item_fields(item_id, body, usuario=user)
        if not found:
            self._send_json({"ok": False, "erro": "Item não encontrado"}, 404)
            return

        painel = db.load_painel(projeto_id)
        found = annotate_items([found])[0]
        self._send_json(
            {
                "ok": True,
                "item": found,
                "kpis": _kpis_for_projeto(projeto_id, painel.get("itens", [])),
                "frentes": compute_frentes(painel.get("itens", [])),
                "atualizado_em": painel.get("atualizado_em"),
                "banco": db.banco_label(),
            }
        )

    def do_DELETE(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        user_match = re.fullmatch(r"/api/usuarios/(\d+)", path)
        if user_match:
            admin = self._require_admin()
            if not admin:
                return
            user_id = int(user_match.group(1))
            if user_id == admin.get("id"):
                self._send_json(
                    {"ok": False, "erro": "Não é possível excluir o próprio usuário"},
                    400,
                )
                return
            try:
                if not db.delete_usuario(user_id):
                    self._send_json({"ok": False, "erro": "Usuário não encontrado"}, 404)
                    return
            except ValueError as exc:
                self._send_json({"ok": False, "erro": str(exc)}, 400)
                return
            self._send_json({"ok": True, "removido": user_id})
            return

        proj_del_match = re.fullmatch(r"/api/projetos/([^/]+)", path)
        if proj_del_match:
            projeto_id = proj_del_match.group(1)
            admin = self._require_admin()
            if not admin:
                return
            try:
                if not db.delete_projeto(projeto_id, usuario=admin):
                    self._send_json({"ok": False, "erro": "Projeto não encontrado"}, 404)
                    return
            except ValueError as exc:
                self._send_json({"ok": False, "erro": str(exc)}, 400)
                return
            self._send_json({"ok": True, "removido": projeto_id})
            return

        proj_usuario_del_match = re.fullmatch(
            r"/api/projetos/([^/]+)/usuarios/(\d+)", path
        )
        if proj_usuario_del_match:
            projeto_id, usuario_id_s = proj_usuario_del_match.groups()
            user = self._require_projeto_role(projeto_id, "admin")
            if not user:
                return
            usuario_id = int(usuario_id_s)
            if not db.remove_usuario_projeto(usuario_id, projeto_id, usuario=user):
                self._send_json({"ok": False, "erro": "Vínculo não encontrado"}, 404)
                return
            self._send_json({"ok": True, "removido": usuario_id})
            return

        proj_hist_del_match = re.fullmatch(
            r"/api/projetos/([^/]+)/itens/([^/]+)/historico/(\d+)", path
        )
        if proj_hist_del_match:
            projeto_id, item_id, hist_id_s = proj_hist_del_match.groups()
            if not self._require_projeto_role(projeto_id, "editor"):
                return
            with db.connect() as conn:
                db.init_db(conn)
                item = db.get_item(conn, item_id)
            if not item or item.get("projeto_id") != projeto_id:
                self._send_json({"ok": False, "erro": "Item não encontrado"}, 404)
                return
            if not db.delete_historico(item_id, int(hist_id_s)):
                self._send_json({"ok": False, "erro": "Evento não encontrado"}, 404)
                return
            self._send_json(
                {
                    "ok": True,
                    "item_id": item_id,
                    "historico": db.list_historico(item_id),
                    "atualizado_em": db.load_painel(projeto_id).get("atualizado_em"),
                }
            )
            return

        proj_item_del_match = re.fullmatch(r"/api/projetos/([^/]+)/itens/([^/]+)", path)
        if proj_item_del_match:
            projeto_id, item_id = proj_item_del_match.groups()
            user = self._require_projeto_role(projeto_id, "editor")
            if not user:
                return
            with db.connect() as conn:
                db.init_db(conn)
                item = db.get_item(conn, item_id)
            if not item or item.get("projeto_id") != projeto_id:
                self._send_json({"ok": False, "erro": "Item não encontrado"}, 404)
                return
            db.delete_item(item_id, usuario=user)
            painel = db.load_painel(projeto_id)
            self._send_json(
                {
                    "ok": True,
                    "removido": item_id,
                    "kpis": _kpis_for_projeto(projeto_id, painel.get("itens", [])),
                    "frentes": compute_frentes(painel.get("itens", [])),
                    "atualizado_em": painel.get("atualizado_em"),
                }
            )
            return

        if not self._require_editor():
            return

        hist_match = re.fullmatch(
            r"/api/itens/([^/]+)/historico/(\d+)", path
        )
        if hist_match:
            item_id = hist_match.group(1)
            hist_id = int(hist_match.group(2))
            if not db.delete_historico(item_id, hist_id):
                self._send_json({"ok": False, "erro": "Evento não encontrado"}, 404)
                return
            self._send_json(
                {
                    "ok": True,
                    "item_id": item_id,
                    "historico": db.list_historico(item_id),
                    "atualizado_em": db.load_painel().get("atualizado_em"),
                }
            )
            return

        match = re.fullmatch(r"/api/itens/([^/]+)", path)
        if not match:
            self._send_json({"ok": False, "erro": "Rota não encontrada"}, 404)
            return
        item_id = match.group(1)
        if not db.delete_item(item_id, usuario=self._current_user()):
            self._send_json({"ok": False, "erro": "Item não encontrado"}, 404)
            return
        painel = db.load_painel()
        self._send_json(
            {
                "ok": True,
                "removido": item_id,
                "kpis": compute_kpis(painel.get("itens", [])),
                "frentes": compute_frentes(painel.get("itens", [])),
                "atualizado_em": painel.get("atualizado_em"),
            }
        )

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/login":
            try:
                body = self._read_json()
            except json.JSONDecodeError:
                self._send_json({"ok": False, "erro": "JSON inválido"}, 400)
                return
            user = db.authenticate(body.get("usuario", ""), body.get("senha", ""))
            if not user:
                self._send_json(
                    {"ok": False, "erro": "Usuário ou senha inválidos"},
                    401,
                )
                return
            token = db.create_session(user["id"])
            self._send_json(
                {"ok": True, "usuario": user},
                cookies=[self._session_cookie(token)],
            )
            return

        if path == "/api/logout":
            db.destroy_session(self._session_token())
            self._send_json(
                {"ok": True},
                cookies=[self._session_cookie("", clear=True)],
            )
            return

        if path == "/api/usuarios":
            if not self._require_admin():
                return
            try:
                body = self._read_json()
            except json.JSONDecodeError:
                self._send_json({"ok": False, "erro": "JSON inválido"}, 400)
                return
            try:
                created = db.create_usuario(
                    body.get("usuario", ""),
                    body.get("senha", ""),
                    nome=body.get("nome", ""),
                    papel=body.get("papel", "editor"),
                )
            except ValueError as exc:
                self._send_json({"ok": False, "erro": str(exc)}, 400)
                return
            self._send_json({"ok": True, "usuario": created}, status=201)
            return

        if path == "/api/projetos":
            if not self._require_admin():
                return
            try:
                body = self._read_json()
            except json.JSONDecodeError:
                self._send_json({"ok": False, "erro": "JSON inválido"}, 400)
                return
            try:
                created = db.create_projeto(body, usuario=self._current_user())
            except ValueError as exc:
                self._send_json({"ok": False, "erro": str(exc)}, 400)
                return
            self._send_json({"ok": True, "projeto": created}, status=201)
            return

        if path == "/api/tarefas":
            user = self._require_user()
            if not user:
                return
            try:
                body = self._read_json()
            except json.JSONDecodeError:
                self._send_json({"ok": False, "erro": "JSON inválido"}, 400)
                return
            try:
                created = db.create_tarefa(body, usuario=user)
            except ValueError as exc:
                self._send_json({"ok": False, "erro": str(exc)}, 400)
                return
            item = annotate_items([created])[0]
            pid = created.get("projeto_id") or db.CASA_TRABALHADOR_ID
            projetos = {p["id"]: p["nome"] for p in db.projetos_acessiveis_usuario(user)}
            projetos[db.TAREFAS_GERAIS_ID] = "Institucional"
            item["projeto_nome"] = projetos.get(pid, pid)
            item["origem_label"] = db.ORIGEM_LABELS.get(
                created.get("origem") or db.ORIGEM_PROJETO, ""
            )
            item["pode_editar"] = db.pode_editar_tarefa(user, created)
            self._send_json({"ok": True, "tarefa": item}, status=201)
            return

        proj_itens_match = re.fullmatch(r"/api/projetos/([^/]+)/itens", path)
        if proj_itens_match:
            projeto_id = proj_itens_match.group(1)
            user = self._require_projeto_role(projeto_id, "editor")
            if not user:
                return
            try:
                body = self._read_json()
            except json.JSONDecodeError:
                self._send_json({"ok": False, "erro": "JSON inválido"}, 400)
                return
            try:
                with db.connect() as conn:
                    db.init_db(conn)
                    item_id = db.next_item_id(conn, projeto_id)
                body = prepare_item_payload(body, item_id, "")
                body["id"] = item_id
                created = db.create_item(body, projeto_id=projeto_id, usuario=user)
            except ValueError as exc:
                self._send_json({"ok": False, "erro": str(exc)}, 400)
                return
            painel = db.load_painel(projeto_id)
            created = annotate_items([created])[0]
            self._send_json(
                {
                    "ok": True,
                    "item": created,
                    "kpis": _kpis_for_projeto(projeto_id, painel.get("itens", [])),
                    "frentes": compute_frentes(painel.get("itens", [])),
                    "atualizado_em": painel.get("atualizado_em"),
                },
                status=201,
            )
            return

        proj_usuarios_post_match = re.fullmatch(r"/api/projetos/([^/]+)/usuarios", path)
        if proj_usuarios_post_match:
            projeto_id = proj_usuarios_post_match.group(1)
            user = self._require_projeto_role(projeto_id, "admin")
            if not user:
                return
            try:
                body = self._read_json()
            except json.JSONDecodeError:
                self._send_json({"ok": False, "erro": "JSON inválido"}, 400)
                return
            try:
                usuario_id = int(body.get("usuario_id"))
                db.set_usuario_projeto(
                    usuario_id, projeto_id, body.get("papel", "consulta"), usuario=user
                )
            except (TypeError, ValueError) as exc:
                self._send_json({"ok": False, "erro": str(exc) or "Dados inválidos"}, 400)
                return
            self._send_json(
                {"ok": True, "usuarios": db.list_usuarios_do_projeto(projeto_id)},
                status=201,
            )
            return

        if not self._require_editor():
            return

        if path == "/api/itens":
            try:
                body = self._read_json()
            except json.JSONDecodeError:
                self._send_json({"ok": False, "erro": "JSON inválido"}, 400)
                return
            try:
                with db.connect() as conn:
                    db.init_db(conn)
                    item_id = db.next_item_id(conn)
                body = prepare_item_payload(body, item_id, "")
                body["id"] = item_id
                created = db.create_item(body, usuario=self._current_user())
            except ValueError as exc:
                self._send_json({"ok": False, "erro": str(exc)}, 400)
                return
            painel = db.load_painel()
            created = annotate_items([created])[0]
            self._send_json(
                {
                    "ok": True,
                    "item": created,
                    "kpis": compute_kpis(painel.get("itens", [])),
                    "frentes": compute_frentes(painel.get("itens", [])),
                    "atualizado_em": painel.get("atualizado_em"),
                },
                status=201,
            )
            return

        if path != "/api/reimportar":
            self._send_json({"ok": False, "erro": "Rota não encontrada"}, 404)
            return
        from import_xlsx import run

        run(preserve_edits=True)
        self._send_json({"ok": True, **painel_response()})


def main() -> None:
    if not db.USE_POSTGRES:
        print(
            "AVISO: DATABASE_URL não definida — usando SQLite local. "
            "No Railway, configure DATABASE_URL (Postgres do Supabase)."
        )
    db.ensure_db()
    with db.connect() as conn:
        db.init_db(conn)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print("Painel Casa do Trabalhador")
    print(f"Banco: {db.banco_label()}")
    print(f"Host: http://{HOST}:{PORT}/login.html")
    print("Build: railway-supabase-1")
    print("Ctrl+C para encerrar")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor encerrado.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
