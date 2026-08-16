"""Notificações por e-mail ao cadastrar tarefa."""

from __future__ import annotations

import logging
import os
import re
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html import escape

import db

log = logging.getLogger(__name__)

GMAIL_USER = (os.environ.get("GMAIL_USER") or "tarefas@trabalho.ce.gov.br").strip()
GMAIL_APP_PASSWORD = (os.environ.get("GMAIL_APP_PASSWORD") or "").replace(" ", "")
APP_BASE_URL = (os.environ.get("APP_BASE_URL") or "").strip().rstrip("/")
SMTP_HOST = (os.environ.get("SMTP_HOST") or "smtp.gmail.com").strip()
SMTP_PORT = int(os.environ.get("SMTP_PORT") or "587")


def _fmt_date(value: str) -> str:
    raw = (value or "").strip()
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", raw)
    if m:
        return f"{m.group(3)}/{m.group(2)}/{m.group(1)}"
    return raw or "—"


def _build_email(item: dict, criador: dict | None, projeto_nome: str) -> tuple[str, str, str]:
    titulo = (item.get("entrega") or "Nova tarefa").strip()
    responsavel = (item.get("responsavel") or "").strip()
    prazo = _fmt_date(item.get("prazo") or "")
    prioridade = (item.get("prioridade") or "—").strip()
    proxima = (item.get("proxima") or "—").strip()
    obs = (item.get("obs") or "").strip()
    origem = (item.get("origem_label") or item.get("origem") or "—").strip()
    criador_nome = ""
    if criador:
        criador_nome = (criador.get("nome") or criador.get("usuario") or "").strip()
    link = f"{APP_BASE_URL}/tarefas.html" if APP_BASE_URL else ""

    subject = f"[SET Projetos] Nova tarefa: {titulo}"
    plain_lines = [
        f"Olá, {responsavel or 'responsável'}.",
        "",
        "Uma nova tarefa foi atribuída a você no SET Projetos.",
        "",
        f"Tarefa: {titulo}",
        f"Projeto / origem: {projeto_nome or origem}",
        f"Prazo: {prazo}",
        f"Prioridade: {prioridade}",
        f"Próxima providência: {proxima}",
    ]
    if obs and obs != "—":
        plain_lines.append(f"Observações: {obs}")
    if criador_nome:
        plain_lines.append(f"Cadastrada por: {criador_nome}")
    if link:
        plain_lines.extend(["", f"Acesse: {link}"])
    plain = "\n".join(plain_lines)

    html_parts = [
        f"<p>Olá, <strong>{escape(responsavel or 'responsável')}</strong>.</p>",
        "<p>Uma nova tarefa foi atribuída a você no <strong>SET Projetos</strong>.</p>",
        '<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">',
        f"<tr><td style=\"padding:4px 12px 4px 0;color:#666\">Tarefa</td><td><strong>{escape(titulo)}</strong></td></tr>",
        f"<tr><td style=\"padding:4px 12px 4px 0;color:#666\">Projeto</td><td>{escape(projeto_nome or origem)}</td></tr>",
        f"<tr><td style=\"padding:4px 12px 4px 0;color:#666\">Prazo</td><td>{escape(prazo)}</td></tr>",
        f"<tr><td style=\"padding:4px 12px 4px 0;color:#666\">Prioridade</td><td>{escape(prioridade)}</td></tr>",
        f"<tr><td style=\"padding:4px 12px 4px 0;color:#666\">Próxima providência</td><td>{escape(proxima)}</td></tr>",
    ]
    if obs and obs != "—":
        html_parts.append(
            f"<tr><td style=\"padding:4px 12px 4px 0;color:#666\">Observações</td><td>{escape(obs)}</td></tr>"
        )
    if criador_nome:
        html_parts.append(
            f"<tr><td style=\"padding:4px 12px 4px 0;color:#666\">Cadastrada por</td><td>{escape(criador_nome)}</td></tr>"
        )
    html_parts.append("</table>")
    if link:
        html_parts.append(
            f'<p style="margin-top:16px"><a href="{escape(link)}">Abrir tarefas no SET Projetos</a></p>'
        )
    html = "".join(html_parts)
    return subject, plain, html


def send_email(to_email: str, subject: str, plain: str, html: str) -> None:
    if not GMAIL_APP_PASSWORD:
        raise RuntimeError("GMAIL_APP_PASSWORD não configurada")
    if not to_email:
        raise ValueError("Destinatário vazio")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"SET Projetos <{GMAIL_USER}>"
    msg["To"] = to_email
    msg.attach(MIMEText(plain, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.ehlo()
        smtp.login(GMAIL_USER, GMAIL_APP_PASSWORD)
        smtp.sendmail(GMAIL_USER, [to_email], msg.as_string())


def notify_nova_tarefa(
    item: dict,
    criador: dict | None,
    *,
    projeto_nome: str = "",
    origem_label: str = "",
) -> None:
    email = (item.get("responsavel_email") or "").strip().lower()
    item_id = (item.get("id") or "").strip()
    if not email:
        log.info("Tarefa %s sem responsavel_email; e-mail não enviado", item_id)
        return

    enriched = dict(item)
    if origem_label:
        enriched["origem_label"] = origem_label

    try:
        subject, plain, html = _build_email(enriched, criador, projeto_nome)
        send_email(email, subject, plain, html)
        db.log_notificacao_tarefa(item_id, "email", email, "ok", "")
        log.info("E-mail de nova tarefa enviado para %s (item %s)", email, item_id)
    except Exception as exc:
        db.log_notificacao_tarefa(item_id, "email", email, "erro", str(exc))
        log.exception("Falha ao enviar e-mail da tarefa %s para %s", item_id, email)
