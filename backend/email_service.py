import os
import smtplib
from pathlib import Path
from email.mime.text import MIMEText
from dotenv import load_dotenv

# грузим .env именно из папки backend
load_dotenv(Path(__file__).with_name(".env"))

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))
SMTP_USER = os.getenv("SMTP_USER", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").strip()
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USER).strip()


def send_reset_email(email: str, code: str):
    if not SMTP_USER or not SMTP_PASSWORD:
        raise RuntimeError(
            f"SMTP не настроен. SMTP_USER='{SMTP_USER}', SMTP_PASSWORD length={len(SMTP_PASSWORD)}"
        )

    subject = "OpenTime — Сброс пароля"
    body = f"""Здравствуйте!

Вы запросили сброс пароля в приложении OpenTime.

Ваш код подтверждения: {code}

Если вы не запрашивали сброс пароля — просто проигнорируйте это письмо.

OpenTime
"""

    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM
    msg["To"] = email

    with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=20) as server:
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.send_message(msg)