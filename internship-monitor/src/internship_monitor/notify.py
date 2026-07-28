"""Digest delivery: email (SMTP) and/or Slack webhook.

Both are optional and driven entirely by environment variables so credentials
live in repository secrets, never in the repo. If nothing is configured the
monitor still writes the digest file to the repo and just skips delivery.
"""

from __future__ import annotations

import json
import os
import smtplib
import ssl
import urllib.request
from email.message import EmailMessage


def send_email(subject: str, body_markdown: str) -> str:
    """Send the digest via SMTP. Returns a short status string.

    Env: SMTP_HOST, SMTP_PORT (default 587), SMTP_USER, SMTP_PASSWORD,
         DIGEST_FROM (default SMTP_USER), DIGEST_TO.
    """
    host = os.environ.get("SMTP_HOST")
    to_addr = os.environ.get("DIGEST_TO")
    if not host or not to_addr:
        return "email: skipped (SMTP_HOST/DIGEST_TO not set)"

    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER", "")
    password = os.environ.get("SMTP_PASSWORD", "")
    from_addr = os.environ.get("DIGEST_FROM", user)

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_addr
    msg.set_content(body_markdown)

    try:
        context = ssl.create_default_context()
        with smtplib.SMTP(host, port, timeout=30) as server:
            server.starttls(context=context)
            if user:
                server.login(user, password)
            server.send_message(msg)
        return f"email: sent to {to_addr}"
    except Exception as exc:
        return f"email: FAILED ({exc})"


def send_slack(text: str) -> str:
    """Post the digest to a Slack incoming webhook (SLACK_WEBHOOK_URL)."""
    url = os.environ.get("SLACK_WEBHOOK_URL")
    if not url:
        return "slack: skipped (SLACK_WEBHOOK_URL not set)"
    payload = json.dumps({"text": text[:39000]}).encode("utf-8")
    req = urllib.request.Request(url, data=payload,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return f"slack: HTTP {resp.status}"
    except Exception as exc:
        return f"slack: FAILED ({exc})"


def deliver(subject: str, body_markdown: str) -> list[str]:
    return [send_email(subject, body_markdown), send_slack(body_markdown)]
