import os
import ssl
import smtplib
import socket
from pathlib import Path
from email.mime.text import MIMEText
from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name('.env'))


def _env(name: str, default: str = '') -> str:
    return (os.getenv(name, default) or '').strip()


SMTP_HOST = _env('SMTP_HOST', 'smtp.gmail.com')
SMTP_PORT = int(_env('SMTP_PORT', '465') or '465')
SMTP_USER = _env('SMTP_USER')
SMTP_PASSWORD = _env('SMTP_PASSWORD').replace(' ', '')
SMTP_FROM = _env('SMTP_FROM', SMTP_USER)
SMTP_SECURITY = _env('SMTP_SECURITY', 'auto').lower()
SMTP_TIMEOUT = int(_env('SMTP_TIMEOUT', '12') or '12')
SMTP_FORCE_IPV4 = _env('SMTP_FORCE_IPV4', '1').lower() in {'1', 'true', 'yes', 'on'}


def _resolve_addresses(host: str, port: int):
    family = socket.AF_INET if SMTP_FORCE_IPV4 else socket.AF_UNSPEC
    infos = socket.getaddrinfo(host, port, family, socket.SOCK_STREAM)
    seen = set()
    addrs = []
    for info in infos:
        sockaddr = info[4]
        ip = sockaddr[0]
        key = (info[0], ip, port)
        if key in seen:
            continue
        seen.add(key)
        addrs.append((info[0], ip, port))
    if not addrs:
        raise RuntimeError(f'Не удалось разрешить адрес {host}:{port}')
    return addrs


def _build_message(email: str, code: str) -> MIMEText:
    subject = 'OpenTime — Сброс пароля'
    body = f'''Здравствуйте!\n\nВы запросили сброс пароля в приложении OpenTime.\n\nВаш код подтверждения: {code}\n\nЕсли вы не запрашивали сброс пароля — просто проигнорируйте это письмо.\n\nOpenTime\n'''
    msg = MIMEText(body, 'plain', 'utf-8')
    msg['Subject'] = subject
    msg['From'] = SMTP_FROM
    msg['To'] = email
    return msg


def _connect_ssl_via_ip(host: str, port: int):
    ctx = ssl.create_default_context()
    last_error = None
    attempts = []
    for family, ip, resolved_port in _resolve_addresses(host, port):
        try:
            raw = socket.socket(family, socket.SOCK_STREAM)
            raw.settimeout(SMTP_TIMEOUT)
            raw.connect((ip, resolved_port))
            wrapped = ctx.wrap_socket(raw, server_hostname=host)
            server = smtplib.SMTP_SSL(timeout=SMTP_TIMEOUT)
            server.sock = wrapped
            server.file = wrapped.makefile('rb')
            code, resp = server.getreply()
            if code != 220:
                raise smtplib.SMTPConnectError(code, resp)
            attempts.append(f'ssl:{ip}:{resolved_port}=ok')
            return server, attempts
        except Exception as exc:
            last_error = exc
            attempts.append(f'ssl:{ip}:{resolved_port}={exc}')
            try:
                raw.close()
            except Exception:
                pass
    raise RuntimeError(' ; '.join(attempts)) from last_error


def _connect_starttls_via_ip(host: str, port: int):
    last_error = None
    attempts = []
    for family, ip, resolved_port in _resolve_addresses(host, port):
        server = None
        try:
            server = smtplib.SMTP(timeout=SMTP_TIMEOUT)
            server.connect(ip, resolved_port)
            server.ehlo()
            ctx = ssl.create_default_context()
            server.starttls(context=ctx)
            server.ehlo()
            attempts.append(f'starttls:{ip}:{resolved_port}=ok')
            return server, attempts
        except Exception as exc:
            last_error = exc
            attempts.append(f'starttls:{ip}:{resolved_port}={exc}')
            if server is not None:
                try:
                    server.quit()
                except Exception:
                    try:
                        server.close()
                    except Exception:
                        pass
    raise RuntimeError(' ; '.join(attempts)) from last_error


def _send_via(security: str, host: str, port: int, msg: MIMEText):
    if security == 'ssl':
        server, attempts = _connect_ssl_via_ip(host, port)
    elif security == 'starttls':
        server, attempts = _connect_starttls_via_ip(host, port)
    else:
        raise ValueError(f'Неизвестный режим SMTP: {security}')

    try:
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.send_message(msg)
        return attempts
    finally:
        try:
            server.quit()
        except Exception:
            try:
                server.close()
            except Exception:
                pass


def send_reset_email(email: str, code: str):
    if not SMTP_USER or not SMTP_PASSWORD:
        raise RuntimeError('SMTP не настроен: проверь SMTP_USER и SMTP_PASSWORD в backend/.env')

    msg = _build_message(email, code)
    attempts = []

    if SMTP_SECURITY == 'ssl':
        variants = [('ssl', SMTP_PORT)]
    elif SMTP_SECURITY == 'starttls':
        variants = [('starttls', SMTP_PORT)]
    else:
        variants = []
        if SMTP_PORT == 465:
            variants.append(('ssl', 465))
            variants.append(('starttls', 587))
        elif SMTP_PORT == 587:
            variants.append(('starttls', 587))
            variants.append(('ssl', 465))
        else:
            variants.append(('ssl', SMTP_PORT))
            variants.append(('starttls', SMTP_PORT))
            if SMTP_PORT != 465:
                variants.append(('ssl', 465))
            if SMTP_PORT != 587:
                variants.append(('starttls', 587))

    last_error = None
    for security, port in variants:
        try:
            local_attempts = _send_via(security, SMTP_HOST, port, msg)
            attempts.extend(local_attempts)
            return
        except Exception as exc:
            last_error = exc
            attempts.append(f'{security}:{port}->{exc}')

    raise RuntimeError('SMTP отправка не удалась. Попытки: ' + ' | '.join(attempts)) from last_error
