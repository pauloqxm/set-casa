"""Notificações por e-mail ao cadastrar tarefa."""

from __future__ import annotations

import logging
import os
import re
import smtplib
import uuid
from datetime import datetime, timedelta, timezone
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html import escape
from urllib.parse import quote

import db

log = logging.getLogger(__name__)

CALENDAR_TZ = timezone(timedelta(hours=-3))

GMAIL_USER = (os.environ.get("GMAIL_USER") or "tarefas@trabalho.ce.gov.br").strip()
GMAIL_APP_PASSWORD = (os.environ.get("GMAIL_APP_PASSWORD") or "").replace(" ", "")
APP_BASE_URL = (os.environ.get("APP_BASE_URL") or "").strip().rstrip("/")
SMTP_HOST = (os.environ.get("SMTP_HOST") or "smtp.gmail.com").strip()
SMTP_PORT = int(os.environ.get("SMTP_PORT") or "587")
DEFAULT_PRAZO_HORA = (os.environ.get("DEFAULT_PRAZO_HORA") or "09:00").strip() or "09:00"


def _fmt_date(value: str) -> str:
    raw = (value or "").strip()
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", raw)
    if m:
        return f"{m.group(3)}/{m.group(2)}/{m.group(1)}"
    return raw or "—"


def _fmt_prazo_com_hora(item: dict) -> str:
    data = _fmt_date(item.get("prazo") or "")
    hora = (item.get("prazo_hora") or "").strip()
    if data == "—":
        return data
    if hora:
        return f"{data} às {hora}"
    return data


def _event_window(item: dict) -> tuple[datetime, datetime] | None:
    prazo = (item.get("prazo") or "").strip()
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", prazo)
    if not m:
        return None
    hora = (item.get("prazo_hora") or DEFAULT_PRAZO_HORA).strip() or DEFAULT_PRAZO_HORA
    hm = re.fullmatch(r"(\d{1,2}):(\d{2})", hora)
    if not hm:
        hora = DEFAULT_PRAZO_HORA
        hm = re.fullmatch(r"(\d{1,2}):(\d{2})", hora)
    if not hm:
        return None
    start = datetime(
        int(m.group(1)),
        int(m.group(2)),
        int(m.group(3)),
        int(hm.group(1)),
        int(hm.group(2)),
        tzinfo=CALENDAR_TZ,
    )
    return start, start + timedelta(hours=1)


def _ics_escape(value: str) -> str:
    return (
        (value or "")
        .replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
    )


def _ics_stamp(dt: datetime) -> str:
    return dt.astimezone(CALENDAR_TZ).strftime("%Y%m%dT%H%M%S")


def _google_calendar_url(item: dict, projeto_nome: str, descricao: str) -> str:
    window = _event_window(item)
    if not window:
        return ""
    start, end = window
    dates = (
        f"{start.strftime('%Y%m%dT%H%M%S')}/"
        f"{end.strftime('%Y%m%dT%H%M%S')}"
    )
    params = {
        "action": "TEMPLATE",
        "text": (item.get("entrega") or "Tarefa SET Projetos").strip(),
        "dates": dates,
        "details": descricao,
        "location": projeto_nome or "SET Projetos",
        "ctz": "America/Fortaleza",
    }
    return "https://calendar.google.com/calendar/render?" + "&".join(
        f"{k}={quote(v)}" for k, v in params.items() if v
    )


def _build_ics(
    item: dict,
    responsavel_email: str,
    *,
    projeto_nome: str,
    descricao: str,
) -> str | None:
    window = _event_window(item)
    if not window:
        return None
    start, end = window
    item_id = (item.get("id") or uuid.uuid4().hex).strip()
    uid = f"{item_id}@set-projetos"
    titulo = (item.get("entrega") or "Tarefa SET Projetos").strip()
    return "\r\n".join(
        [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//SET Projetos//PT",
            "CALSCALE:GREGORIAN",
            "METHOD:REQUEST",
            "BEGIN:VTIMEZONE",
            "TZID:America/Fortaleza",
            "BEGIN:STANDARD",
            "TZOFFSETFROM:-0300",
            "TZOFFSETTO:-0300",
            "TZNAME:-03",
            "DTSTART:19700101T000000",
            "END:STANDARD",
            "END:VTIMEZONE",
            "BEGIN:VEVENT",
            f"UID:{uid}",
            f"DTSTAMP:{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}",
            f"DTSTART;TZID=America/Fortaleza:{_ics_stamp(start)}",
            f"DTEND;TZID=America/Fortaleza:{_ics_stamp(end)}",
            f"SUMMARY:{_ics_escape(titulo)}",
            f"DESCRIPTION:{_ics_escape(descricao)}",
            f"LOCATION:{_ics_escape(projeto_nome or 'SET Projetos')}",
            f"ORGANIZER;CN=SET Projetos:mailto:{GMAIL_USER}",
            (
                "ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;"
                f"PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:{responsavel_email}"
            ),
            "STATUS:CONFIRMED",
            "TRANSP:OPAQUE",
            "SEQUENCE:0",
            "END:VEVENT",
            "END:VCALENDAR",
            "",
        ]
    )


def _build_email(
    item: dict,
    criador: dict | None,
    projeto_nome: str,
) -> tuple[str, str, str, str | None]:
    titulo = (item.get("entrega") or "Nova tarefa").strip()
    responsavel = (item.get("responsavel") or "").strip()
    prazo = _fmt_prazo_com_hora(item)
    prioridade = (item.get("prioridade") or "—").strip()
    proxima = (item.get("proxima") or "—").strip()
    obs = (item.get("obs") or "").strip()
    origem = (item.get("origem_label") or item.get("origem") or "—").strip()
    criador_nome = ""
    if criador:
        criador_nome = (criador.get("nome") or criador.get("usuario") or "").strip()
    link = f"{APP_BASE_URL}/tarefas.html" if APP_BASE_URL else ""

    descricao_parts = [
        f"Projeto / origem: {projeto_nome or origem}",
        f"Prazo: {prazo}",
        f"Prioridade: {prioridade}",
        f"Próxima providência: {proxima}",
    ]
    if obs and obs != "—":
        descricao_parts.append(f"Observações: {obs}")
    if criador_nome:
        descricao_parts.append(f"Cadastrada por: {criador_nome}")
    if link:
        descricao_parts.append(f"Sistema: {link}")
    descricao = "\n".join(descricao_parts)

    calendar_url = _google_calendar_url(item, projeto_nome or origem, descricao)
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
    if item.get("prazo"):
        plain_lines.extend(
            [
                "",
                "Convite de agenda: este e-mail inclui um convite (.ics). "
                "No Gmail/Google Agenda, aceite o convite para registrar o compromisso.",
            ]
        )
    if calendar_url:
        plain_lines.extend(["", f"Adicionar manualmente ao Google Agenda: {calendar_url}"])
    if link:
        plain_lines.extend(["", f"Acesse o sistema: {link}"])
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
    if item.get("prazo"):
        html_parts.append(
            "<p style=\"margin-top:16px\">"
            "<strong>Agenda:</strong> este e-mail traz um convite de calendário. "
            "No Gmail, use <em>Sim</em> / <em>Adicionar ao calendário</em> para registrar o compromisso."
            "</p>"
        )
    action_links = []
    if calendar_url:
        action_links.append(
            f'<a href="{escape(calendar_url)}" style="margin-right:12px">Abrir no Google Agenda</a>'
        )
    if link:
        action_links.append(f'<a href="{escape(link)}">Ver no SET Projetos</a>')
    if action_links:
        html_parts.append(f'<p style="margin-top:12px">{" ".join(action_links)}</p>')
    html = "".join(html_parts)
    ics = _build_ics(
        item,
        (item.get("responsavel_email") or "").strip().lower(),
        projeto_nome=projeto_nome or origem,
        descricao=descricao,
    )
    return subject, plain, html, ics


def send_email(
    to_email: str,
    subject: str,
    plain: str,
    html: str,
    *,
    ics: str | None = None,
) -> None:
    if not GMAIL_APP_PASSWORD:
        raise RuntimeError("GMAIL_APP_PASSWORD não configurada")
    if not to_email:
        raise ValueError("Destinatário vazio")

    mixed = MIMEMultipart("mixed")
    mixed["Subject"] = subject
    mixed["From"] = f"SET Projetos <{GMAIL_USER}>"
    mixed["To"] = to_email

    alternative = MIMEMultipart("alternative")
    alternative.attach(MIMEText(plain, "plain", "utf-8"))
    alternative.attach(MIMEText(html, "html", "utf-8"))
    if ics:
        calendar_part = MIMEText(ics, "calendar;method=REQUEST", "utf-8")
        calendar_part.add_header("Content-Disposition", 'inline; filename="convite.ics"')
        alternative.attach(calendar_part)
    mixed.attach(alternative)

    if ics:
        attachment = MIMEBase("text", "calendar", method="REQUEST")
        attachment.set_payload(ics.encode("utf-8"))
        encoders.encode_base64(attachment)
        attachment.add_header("Content-Disposition", 'attachment; filename="convite.ics"')
        mixed.attach(attachment)

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.ehlo()
        smtp.login(GMAIL_USER, GMAIL_APP_PASSWORD)
        smtp.sendmail(GMAIL_USER, [to_email], mixed.as_string())


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
        subject, plain, html, ics = _build_email(enriched, criador, projeto_nome)
        send_email(email, subject, plain, html, ics=ics)
        detalhes = "convite_agenda" if ics else "sem_prazo"
        db.log_notificacao_tarefa(item_id, "email", email, "ok", detalhes)
        log.info(
            "E-mail de nova tarefa enviado para %s (item %s, agenda=%s)",
            email,
            item_id,
            bool(ics),
        )
    except Exception as exc:
        db.log_notificacao_tarefa(item_id, "email", email, "erro", str(exc))
        log.exception("Falha ao enviar e-mail da tarefa %s para %s", item_id, email)
