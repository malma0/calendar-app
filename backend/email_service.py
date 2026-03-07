import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os

SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587

SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")


def send_reset_email(email: str, code: str):

    subject = "OpenTime — Сброс пароля"

    body = f"""
Здравствуйте!

Вы запросили сброс пароля в приложении OpenTime.

Ваш код подтверждения:

{code}

Если вы не запрашивали сброс пароля — просто проигнорируйте это письмо.

OpenTime
"""

    msg = MIMEMultipart()
    msg["From"] = SMTP_USER
    msg["To"] = email
    msg["Subject"] = subject

    msg.attach(MIMEText(body, "plain"))

    server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
    server.starttls()
    server.login(SMTP_USER, SMTP_PASSWORD)
    server.send_message(msg)
    server.quit()