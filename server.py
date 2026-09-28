#!/usr/bin/env python3
"""Matt Realty Desk: a small, local-only real-estate relationship manager."""

from __future__ import annotations

import csv
import io
import json
import os
import re
import shutil
import sqlite3
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

APP_DIR = Path(__file__).resolve().parent
STATIC_DIR = APP_DIR / "static"
DATA_DIR = Path(os.environ.get("MATT_REALTY_DATA", Path.home() / ".local/share/matt-realty-desk"))
DB_PATH = DATA_DIR / "realty.db"
BACKUP_DIR = DATA_DIR / "backups"
HOST = os.environ.get("MATT_REALTY_HOST", "127.0.0.1")
PORT = int(os.environ.get("MATT_REALTY_PORT", "3010"))
VOICE_BINARY = os.environ.get("MATT_REALTY_VOICE_BINARY", "/usr/lib/voxtype/voxtype-onnx-avx2")
VOICE_CONFIG = Path(os.environ.get("MATT_REALTY_VOICE_CONFIG", APP_DIR / "voice.toml"))
VOICE_ENGINE = os.environ.get("MATT_REALTY_VOICE_ENGINE", "parakeet")
VOICE_MODEL = os.environ.get("MATT_REALTY_VOICE_MODEL", "parakeet-tdt-0.6b-v3-int8")
ASSISTANT_MODEL = os.environ.get("MATT_REALTY_ASSISTANT_MODEL", "qwen3:0.6b")
DISCUSSION_MODEL = os.environ.get("MATT_REALTY_DISCUSSION_MODEL", "qwen3:1.7b")
PENDING_ACTIONS: dict[str, dict] = {}
PENDING_LOCK = threading.Lock()
ANSI_ESCAPE = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")


def now() -> str:
    return datetime.now(timezone.utc).astimezone().replace(microsecond=0).isoformat()


def db() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def initialize() -> None:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    with db() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS contacts (
          id INTEGER PRIMARY KEY,
          first_name TEXT NOT NULL,
          last_name TEXT NOT NULL DEFAULT '',
          email TEXT NOT NULL DEFAULT '',
          phone TEXT NOT NULL DEFAULT '',
          street_address TEXT NOT NULL DEFAULT '',
          address_line_2 TEXT NOT NULL DEFAULT '',
          city TEXT NOT NULL DEFAULT '',
          state TEXT NOT NULL DEFAULT '',
          postal_code TEXT NOT NULL DEFAULT '',
          type TEXT NOT NULL DEFAULT 'Prospect',
          stage TEXT NOT NULL DEFAULT 'New',
          source TEXT NOT NULL DEFAULT '',
          notes TEXT NOT NULL DEFAULT '',
          email_permission TEXT NOT NULL DEFAULT 'Not asked',
          last_contact_at TEXT,
          next_follow_up_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          archived INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS tasks (
          id INTEGER PRIMARY KEY,
          contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
          title TEXT NOT NULL,
          due_at TEXT,
          priority TEXT NOT NULL DEFAULT 'Normal',
          completed_at TEXT,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS activities (
          id INTEGER PRIMARY KEY,
          contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
          kind TEXT NOT NULL DEFAULT 'Note',
          summary TEXT NOT NULL,
          occurred_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS campaigns (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          channel TEXT NOT NULL DEFAULT 'Email',
          audience TEXT NOT NULL DEFAULT 'All opted-in contacts',
          subject TEXT NOT NULL DEFAULT '',
          body TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'Draft',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_contacts_stage ON contacts(stage) WHERE archived=0;
        CREATE INDEX IF NOT EXISTS idx_contacts_follow_up ON contacts(next_follow_up_at) WHERE archived=0;
        CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(completed_at, due_at);
        CREATE INDEX IF NOT EXISTS idx_activities_contact ON activities(contact_id, occurred_at);
        PRAGMA optimize;
        """)
        existing_columns = {item[1] for item in conn.execute("PRAGMA table_info(contacts)")}
        for column in ("street_address", "address_line_2", "city", "state", "postal_code"):
            if column not in existing_columns:
                conn.execute(f"ALTER TABLE contacts ADD COLUMN {column} TEXT NOT NULL DEFAULT ''")


def rows(query: str, params: tuple = ()) -> list[dict]:
    with db() as conn:
        return [dict(row) for row in conn.execute(query, params).fetchall()]


def row(query: str, params: tuple = ()) -> dict | None:
    result = rows(query, params)
    return result[0] if result else None


def require(value: object, field: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise ValueError(f"{field} is required")
    return text


def clean(value: object, limit: int = 5000) -> str:
    return str(value or "").strip()[:limit]


def resolve_spoken_due_date(prompt: str, model_value: object) -> str:
    text = prompt.lower()
    today = datetime.now().astimezone().date()
    if re.search(r"\btoday\b", text):
        return today.isoformat()
    if re.search(r"\btomorrow\b", text):
        return (today + timedelta(days=1)).isoformat()
    weekdays = {name: index for index, name in enumerate(("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"))}
    for name, target in weekdays.items():
        if re.search(rf"\b(?:this\s+|next\s+)?{name}\b", text):
            days = (target - today.weekday()) % 7
            return (today + timedelta(days=days or 7)).isoformat()
    return clean(model_value, 40)


ASSISTANT_MODES = {
    "crm": {
        "name": "CRM Actions",
        "model": ASSISTANT_MODEL,
        "system": "You are Matt's concise real-estate desk assistant. Help with follow-up wording, call plans, contact organization, and campaign drafts. Never claim to have sent email, changed records, or contacted anyone. Say when Matt must review or act.",
        "temperature": 0.3,
        "num_predict": 160,
    },
    "general": {
        "name": "General Assistant",
        "model": DISCUSSION_MODEL,
        "system": "You are Matt's private local assistant. Discuss ideas, explain choices, help plan work, and answer general questions in plain language. Be practical and concise. Do not claim to have changed records, sent messages, browsed the web, or completed actions that you did not actually perform.",
        "temperature": 0.45,
        "num_predict": 256,
    },
    "coach": {
        "name": "Follow-up Coach",
        "model": DISCUSSION_MODEL,
        "system": "You are Matt's real-estate follow-up coach. Help him prepare calls, handle objections, choose respectful next steps, and stay useful without being pushy. Ask one focused question when essential; otherwise give a short suggested approach and natural wording. Never claim to contact anyone or change CRM records.",
        "temperature": 0.4,
        "num_predict": 256,
    },
    "marketing": {
        "name": "Marketing Writer",
        "model": DISCUSSION_MODEL,
        "system": "You are Matt's real-estate marketing writer. Draft clear, warm, credible messages, mailers, social posts, and campaign ideas. Avoid hype, invented facts, legal promises, and unsupported market claims. Provide ready-to-edit copy and never claim it was sent or published.",
        "temperature": 0.55,
        "num_predict": 320,
    },
}


def assistant_mode(value: object) -> str:
    mode = clean(value, 30).lower() or "crm"
    return mode if mode in ASSISTANT_MODES else "crm"


def ask_qwen(prompt: str, mode: str = "crm", history: object = None) -> str:
    config = ASSISTANT_MODES[assistant_mode(mode)]
    messages = [{"role":"system", "content":config["system"]}]
    if isinstance(history, list):
        for item in history[-8:]:
            if not isinstance(item, dict) or item.get("role") not in {"user", "assistant"}:
                continue
            content = clean(item.get("content"), 2000)
            if content:
                messages.append({"role":item["role"], "content":content})
    messages.append({"role":"user", "content":prompt})
    request_data = json.dumps({"model":config["model"],"stream":False,"think":False,"keep_alive":"10m","messages":messages,"options":{"temperature":config["temperature"],"num_predict":config["num_predict"]}}).encode()
    req = urllib.request.Request("http://127.0.0.1:11434/api/chat", data=request_data, headers={"Content-Type":"application/json"})
    with urllib.request.urlopen(req, timeout=90) as response:
        answer = json.load(response).get("message", {}).get("content", "").strip()
    return re.sub(r"<think>[\s\S]*?</think>", "", answer).strip()


def transcribe_audio(payload: bytes, content_type: str) -> tuple[str, float]:
    if not payload:
        raise ValueError("No voice recording was received")
    suffix = ".ogg" if "ogg" in content_type else ".wav" if "wav" in content_type else ".webm"
    with tempfile.TemporaryDirectory(prefix="matt-realty-voice-") as temp_dir:
        source = Path(temp_dir) / f"request-input{suffix}"
        wav = Path(temp_dir) / "request.wav"
        source.write_bytes(payload)
        try:
            subprocess.run(
                ["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", str(source), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(wav)],
                check=True, capture_output=True, timeout=30,
            )
            started = time.perf_counter()
            voice_binary = VOICE_BINARY if Path(VOICE_BINARY).exists() else "voxtype"
            result = subprocess.run(
                [voice_binary, "--config", str(VOICE_CONFIG), "transcribe", str(wav)],
                check=True, capture_output=True, text=True, timeout=120,
            )
            elapsed = time.perf_counter() - started
        except FileNotFoundError as exc:
            raise ValueError(f"Voice tool is unavailable: {exc.filename}") from exc
        except subprocess.TimeoutExpired as exc:
            raise ValueError("Voice transcription took too long. Please try a shorter request.") from exc
        except subprocess.CalledProcessError as exc:
            detail = exc.stderr or exc.stdout or ""
            if isinstance(detail, bytes):
                detail = detail.decode(errors="replace")
            raise ValueError(f"Voice transcription failed: {str(detail).strip()[-300:]}") from exc
    output = ANSI_ESCAPE.sub("", result.stdout)
    lines = [line.strip() for line in output.splitlines() if line.strip()]
    final_line = lines[-1] if lines else ""
    matches = re.findall(r'[Tt]ranscription completed in [\d.]+s:\s*"(.*)"\s*$', output, re.MULTILINE)
    transcript = final_line if final_line and "transcription completed in" not in final_line.lower() else (matches[-1].strip() if matches else "")
    if not transcript:
        raise ValueError("I didn't hear clear speech. Please try again a little closer to the microphone.")
    return transcript[:2000], elapsed


def synthesize_speech(text: str) -> bytes:
    speaker = shutil.which("espeak-ng") or shutil.which("espeak")
    if not speaker:
        raise ValueError("Spoken replies are not installed yet")
    spoken = clean(text, 1600)
    if not spoken:
        raise ValueError("There is no reply to speak")
    try:
        result = subprocess.run(
            [speaker, "--stdout", "--stdin", "-v", "en-us", "-s", "158", "-p", "45"],
            input=spoken.encode(),
            capture_output=True,
            timeout=30,
            check=True,
        )
    except (subprocess.TimeoutExpired, subprocess.CalledProcessError) as exc:
        raise ValueError("The spoken reply could not be generated") from exc
    return result.stdout


def action_preview(action: str, args: dict) -> str:
    if action == "create_contact":
        details = [clean(args.get("name"), 200), clean(args.get("relationship"), 50) or "Prospect"]
        if args.get("phone"): details.append(clean(args["phone"], 50))
        if args.get("email"): details.append(clean(args["email"], 250))
        address = ", ".join(filter(None, (
            clean(args.get("street_address"), 250),
            clean(args.get("address_line_2"), 100),
            clean(args.get("city"), 100),
            clean(args.get("state"), 50),
            clean(args.get("postal_code"), 30),
        )))
        if address: details.append(address)
        return "Create contact: " + " · ".join(details)
    if action == "create_followup":
        details = [clean(args.get("task"), 300)]
        if args.get("due_date"): details.append(f"Due {clean(args['due_date'], 40)}")
        if args.get("contact_name"): details.append(f"For {clean(args['contact_name'], 200)}")
        return "Create reminder: " + " · ".join(details)
    return "Review this request"


def stage_action(action: str, args: dict) -> str:
    token = uuid.uuid4().hex
    with PENDING_LOCK:
        cutoff = datetime.now().timestamp() - 600
        for old_token in [key for key, value in PENDING_ACTIONS.items() if value["created"] < cutoff]:
            PENDING_ACTIONS.pop(old_token, None)
        PENDING_ACTIONS[token] = {"action": action, "arguments": args, "created": datetime.now().timestamp()}
    return token


def execute_staged(token: str) -> dict:
    with PENDING_LOCK:
        pending = PENDING_ACTIONS.pop(token, None)
    if not pending or pending["created"] < datetime.now().timestamp() - 600:
        raise ValueError("That confirmation expired. Please say the request again.")
    action, args = pending["action"], pending["arguments"]
    if action == "create_contact":
        full_name = require(args.get("name"), "Contact name")
        parts = full_name.split(None, 1); first = parts[0]; last = parts[1] if len(parts) > 1 else ""
        stamp = now()
        with db() as conn:
            cur = conn.execute("""INSERT INTO contacts(first_name,last_name,email,phone,street_address,address_line_2,city,state,postal_code,type,stage,source,notes,email_permission,created_at,updated_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,'New','Voice command',?,'Not asked',?,?)""", (
                    first, last, clean(args.get("email"),250), clean(args.get("phone"),50),
                    clean(args.get("street_address"),250), clean(args.get("address_line_2"),100),
                    clean(args.get("city"),100), clean(args.get("state"),50), clean(args.get("postal_code"),30),
                    clean(args.get("relationship"),50) or "Prospect", clean(args.get("notes")), stamp, stamp,
                ))
            item_id = cur.lastrowid
        return {"ok": True, "message": f"Created {full_name} as a new contact.", "contact_id": item_id}
    if action == "create_followup":
        title = require(args.get("task"), "Reminder")
        contact_name = clean(args.get("contact_name"), 200); contact_id = None
        if contact_name:
            match = row("SELECT id FROM contacts WHERE archived=0 AND lower(trim(first_name||' '||last_name))=lower(?) LIMIT 1", (contact_name,))
            contact_id = match["id"] if match else None
        with db() as conn:
            cur = conn.execute("INSERT INTO tasks(contact_id,title,due_at,priority,created_at) VALUES(?,?,?,?,?)", (contact_id, title, clean(args.get("due_date"),40) or None, clean(args.get("priority"),30) or "Normal", now()))
            item_id = cur.lastrowid
        return {"ok": True, "message": f"Created reminder: {title}.", "task_id": item_id}
    raise ValueError("That action is not allowed")


def backup() -> Path:
    stamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    target = BACKUP_DIR / f"realty-{stamp}.db"
    with db() as source, sqlite3.connect(target) as destination:
        source.backup(destination)
    cutoff = datetime.now() - timedelta(days=30)
    for item in BACKUP_DIR.glob("realty-*.db"):
        if datetime.fromtimestamp(item.stat().st_mtime) < cutoff:
            item.unlink(missing_ok=True)
    return target


class Handler(SimpleHTTPRequestHandler):
    server_version = "MattRealtyDesk/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def log_message(self, fmt, *args):
        print(f"[{now()}] {self.address_string()} {fmt % args}")

    def send_json(self, payload, status=200):
        data = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def send_bytes(self, data: bytes, content_type: str, status=200):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length > 10_000_000:
            raise ValueError("Request is too large")
        return json.loads(self.rfile.read(length) or b"{}")

    def binary_body(self, limit=15_000_000):
        length = int(self.headers.get("Content-Length", 0))
        if length <= 0:
            raise ValueError("No voice recording was received")
        if length > limit:
            raise ValueError("Voice recording is too large")
        return self.rfile.read(length)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        try:
            if path == "/api/health":
                return self.send_json({"ok": True, "database": str(DB_PATH), "time": now()})
            if path == "/api/summary":
                today = datetime.now().astimezone().date().isoformat()
                return self.send_json({
                    "contacts": row("SELECT COUNT(*) AS n FROM contacts WHERE archived=0")["n"],
                    "active": row("SELECT COUNT(*) AS n FROM contacts WHERE archived=0 AND stage IN ('Active','Under Contract')")["n"],
                    "due": row("SELECT COUNT(*) AS n FROM tasks WHERE completed_at IS NULL AND (due_at IS NULL OR date(due_at)<=date(?))", (today,))["n"],
                    "overdueFollowUps": row("SELECT COUNT(*) AS n FROM contacts WHERE archived=0 AND next_follow_up_at IS NOT NULL AND date(next_follow_up_at)<=date(?)", (today,))["n"],
                })
            if path == "/api/contacts":
                q = parse_qs(parsed.query).get("q", [""])[0].strip()
                stage = parse_qs(parsed.query).get("stage", [""])[0].strip()
                sql = "SELECT * FROM contacts WHERE archived=0"
                params = []
                if q:
                    sql += " AND (first_name||' '||last_name LIKE ? OR email LIKE ? OR phone LIKE ? OR street_address LIKE ? OR address_line_2 LIKE ? OR city LIKE ? OR state LIKE ? OR postal_code LIKE ?)"
                    params += [f"%{q}%"] * 8
                if stage:
                    sql += " AND stage=?"; params.append(stage)
                sql += " ORDER BY updated_at DESC"
                return self.send_json(rows(sql, tuple(params)))
            if path == "/api/tasks":
                return self.send_json(rows("""SELECT t.*, trim(c.first_name||' '||c.last_name) AS contact_name
                    FROM tasks t LEFT JOIN contacts c ON c.id=t.contact_id
                    WHERE t.completed_at IS NULL ORDER BY due_at IS NULL, due_at, t.id DESC"""))
            if path == "/api/campaigns":
                return self.send_json(rows("SELECT * FROM campaigns ORDER BY updated_at DESC"))
            if path.startswith("/api/contacts/") and path.endswith("/activity"):
                cid = int(path.split("/")[3])
                return self.send_json(rows("SELECT * FROM activities WHERE contact_id=? ORDER BY occurred_at DESC", (cid,)))
            if path == "/api/export/contacts.csv":
                export_fields = ["first_name","last_name","email","phone","street_address","address_line_2","city","state","postal_code","type","stage","source","email_permission","notes"]
                contacts = rows(f"SELECT {','.join(export_fields)} FROM contacts WHERE archived=0 ORDER BY last_name,first_name")
                output = io.StringIO(); writer = csv.DictWriter(output, fieldnames=export_fields)
                writer.writeheader(); writer.writerows(contacts)
                data = output.getvalue().encode()
                self.send_response(200); self.send_header("Content-Type", "text/csv; charset=utf-8"); self.send_header("Content-Disposition", "attachment; filename=matt-realty-contacts.csv"); self.send_header("Content-Length", str(len(data))); self.end_headers(); return self.wfile.write(data)
            return super().do_GET()
        except Exception as exc:
            return self.send_json({"error": str(exc)}, 400)

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            if path == "/api/voice/transcribe":
                content_type = self.headers.get("Content-Type", "").split(";", 1)[0].lower()
                if content_type not in {"audio/webm", "audio/ogg", "audio/wav", "audio/x-wav"}:
                    raise ValueError("Unsupported voice recording format")
                transcript, elapsed = transcribe_audio(self.binary_body(), content_type)
                return self.send_json({"transcript": transcript, "transcription_seconds": round(elapsed, 1), "engine": VOICE_ENGINE, "model": VOICE_MODEL})
            data = self.body()
            if path == "/api/tts":
                return self.send_bytes(synthesize_speech(require(data.get("text"), "Reply")), "audio/wav")
            if path == "/api/contacts":
                stamp = now()
                values = (
                    require(data.get("first_name"), "First name"), clean(data.get("last_name"),100), clean(data.get("email"),250), clean(data.get("phone"),50),
                    clean(data.get("street_address"),250), clean(data.get("address_line_2"),100), clean(data.get("city"),100), clean(data.get("state"),50), clean(data.get("postal_code"),30),
                    clean(data.get("type"),50) or "Prospect", clean(data.get("stage"),50) or "New", clean(data.get("source"),100), clean(data.get("notes")),
                    clean(data.get("email_permission"),50) or "Not asked", clean(data.get("next_follow_up_at"),40) or None, stamp, stamp,
                )
                with db() as conn:
                    cur = conn.execute("""INSERT INTO contacts(first_name,last_name,email,phone,street_address,address_line_2,city,state,postal_code,type,stage,source,notes,email_permission,next_follow_up_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", values)
                    cid = cur.lastrowid
                return self.send_json(row("SELECT * FROM contacts WHERE id=?", (cid,)), 201)
            if path == "/api/import/contacts":
                incoming = data.get("contacts")
                if not isinstance(incoming, list) or not incoming:
                    raise ValueError("No contacts were found in that file")
                if len(incoming) > 5000:
                    raise ValueError("Import up to 5,000 contacts at a time")
                stamp = now(); imported = 0; skipped = 0; invalid = 0
                with db() as conn:
                    for item in incoming:
                        if not isinstance(item, dict):
                            invalid += 1; continue
                        first = clean(item.get("first_name"), 100)
                        last = clean(item.get("last_name"), 100)
                        email = clean(item.get("email"), 250).lower()
                        phone = clean(item.get("phone"), 50)
                        if not first and last:
                            first, last = last, ""
                        if not first:
                            invalid += 1; continue
                        duplicate = None
                        if email:
                            duplicate = conn.execute("SELECT id FROM contacts WHERE archived=0 AND lower(email)=?", (email,)).fetchone()
                        if not duplicate and phone:
                            digits = re.sub(r"\D", "", phone)
                            if len(digits) >= 7:
                                duplicate = conn.execute("SELECT id FROM contacts WHERE archived=0 AND replace(replace(replace(replace(replace(phone,' ',''),'-',''),'(',''),')',''),'+','') LIKE ?", (f"%{digits[-10:]}",)).fetchone()
                        if duplicate:
                            skipped += 1; continue
                        conn.execute("""INSERT INTO contacts(first_name,last_name,email,phone,street_address,address_line_2,city,state,postal_code,type,stage,source,notes,email_permission,created_at,updated_at)
                            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", (
                                first, last, email, phone, clean(item.get("street_address"),250), clean(item.get("address_line_2"),100),
                                clean(item.get("city"),100), clean(item.get("state"),50), clean(item.get("postal_code"),30),
                                clean(item.get("type"),50) or "Prospect", "New", clean(item.get("source"),100) or "Imported contact",
                                clean(item.get("notes")), "Not asked", stamp, stamp,
                            ))
                        imported += 1
                return self.send_json({"imported": imported, "duplicates_skipped": skipped, "invalid_skipped": invalid}, 201)
            if path == "/api/tasks":
                title = require(data.get("title"), "Task")
                with db() as conn:
                    cur = conn.execute("INSERT INTO tasks(contact_id,title,due_at,priority,created_at) VALUES(?,?,?,?,?)", (data.get("contact_id") or None, title, clean(data.get("due_at"),40) or None, clean(data.get("priority"),30) or "Normal", now()))
                    task_id = cur.lastrowid
                return self.send_json(row("SELECT * FROM tasks WHERE id=?", (task_id,)), 201)
            if path == "/api/campaigns":
                stamp = now()
                with db() as conn:
                    cur = conn.execute("INSERT INTO campaigns(name,channel,audience,subject,body,status,created_at,updated_at) VALUES(?,?,?,?,?,'Draft',?,?)", (require(data.get("name"), "Campaign name"), clean(data.get("channel"),30) or "Email", clean(data.get("audience"),200) or "All opted-in contacts", clean(data.get("subject"),300), clean(data.get("body"),20000), stamp, stamp))
                    campaign_id = cur.lastrowid
                return self.send_json(row("SELECT * FROM campaigns WHERE id=?", (campaign_id,)), 201)
            if path.startswith("/api/contacts/") and path.endswith("/activity"):
                cid = int(path.split("/")[3]); summary = require(data.get("summary"), "Activity note")
                with db() as conn:
                    cur = conn.execute("INSERT INTO activities(contact_id,kind,summary,occurred_at) VALUES(?,?,?,?)", (cid, clean(data.get("kind"),30) or "Note", summary, now()))
                    conn.execute("UPDATE contacts SET last_contact_at=?,updated_at=? WHERE id=?", (now(), now(), cid))
                return self.send_json({"id": cur.lastrowid}, 201)
            if path == "/api/command/interpret":
                prompt = require(data.get("prompt"), "Voice command")[:2000]
                mode = assistant_mode(data.get("mode"))
                if mode != "crm":
                    try:
                        answer = ask_qwen(prompt, mode, data.get("history"))
                        config = ASSISTANT_MODES[mode]
                        return self.send_json({"kind":"answer", "answer":answer or "I couldn't form an answer. Please try a shorter request.", "mode":mode, "assistant":config["name"], "delegated_to":config["model"]})
                    except (urllib.error.URLError, TimeoutError):
                        return self.send_json({"error":"The local discussion model is waking up or unavailable. Try again in a moment."}, 503)
                from needle_router import interpret
                try:
                    routed = interpret(prompt)
                except Exception as exc:
                    print(f"Needle routing error: {exc}")
                    return self.send_json({"error":"The command router is still starting or unavailable. Try again in a moment."}, 503)
                action = routed.get("action")
                args = routed.get("arguments") or {}
                confidence = routed.get("confidence")
                if action == "create_followup":
                    args["due_date"] = resolve_spoken_due_date(prompt, args.get("due_date"))
                if not action:
                    return self.send_json({"kind":"unsupported", "message":"I couldn't match that to a safe action. Try asking a shorter question or use one of the examples.", "confidence":confidence})
                if action in {"create_contact", "create_followup"}:
                    token = stage_action(action, args)
                    return self.send_json({"kind":"confirmation", "action":action, "preview":action_preview(action,args), "token":token, "confidence":confidence})
                if action == "search_contacts":
                    query = require(args.get("query"), "Search")[:200]
                    found = rows("""SELECT id,first_name,last_name,email,phone,street_address,address_line_2,city,state,postal_code,type,stage,next_follow_up_at FROM contacts
                        WHERE archived=0 AND (first_name||' '||last_name LIKE ? OR email LIKE ? OR phone LIKE ? OR type LIKE ? OR stage LIKE ? OR street_address LIKE ? OR city LIKE ? OR state LIKE ? OR postal_code LIKE ?)
                        ORDER BY updated_at DESC LIMIT 10""", tuple([f"%{query}%"] * 9))
                    return self.send_json({"kind":"search", "query":query, "results":found, "confidence":confidence})
                if action in {"draft_message", "ask_assistant"}:
                    delegated = clean(args.get("request") or args.get("question") or prompt, 2000)
                    try:
                        answer = ask_qwen(delegated, "crm")
                        return self.send_json({"kind":"answer", "answer":answer or "I couldn't form an answer. Please try a shorter request.", "delegated_to":"Local Qwen", "confidence":confidence})
                    except (urllib.error.URLError, TimeoutError):
                        return self.send_json({"error":"The local assistant is waking up or unavailable. Try again in a moment."}, 503)
                return self.send_json({"kind":"unsupported", "message":"That action is not enabled yet."})
            if path == "/api/command/execute":
                return self.send_json(execute_staged(require(data.get("token"), "Confirmation token")), 201)
            if path == "/api/assistant":
                prompt = require(data.get("prompt"), "Message")[:2000]
                mode = assistant_mode(data.get("mode"))
                try:
                    answer = ask_qwen(prompt, mode, data.get("history"))
                    return self.send_json({"answer": answer or "I couldn't form an answer. Please try a shorter request.", "mode":mode})
                except (urllib.error.URLError, TimeoutError):
                    return self.send_json({"error":"The local assistant is waking up or unavailable. Try again in a moment."}, 503)
            if path == "/api/backup":
                return self.send_json({"ok": True, "file": backup().name})
            return self.send_json({"error": "Not found"}, 404)
        except (ValueError, KeyError, sqlite3.Error) as exc:
            return self.send_json({"error": str(exc)}, 400)

    def do_PATCH(self):
        path = urlparse(self.path).path
        try:
            data = self.body()
            if path.startswith("/api/tasks/"):
                task_id = int(path.rsplit("/",1)[1]); completed = now() if data.get("completed") else None
                with db() as conn: conn.execute("UPDATE tasks SET completed_at=? WHERE id=?", (completed, task_id))
                return self.send_json({"ok": True})
            if path.startswith("/api/contacts/"):
                cid = int(path.rsplit("/",1)[1]); allowed = {"first_name","last_name","email","phone","street_address","address_line_2","city","state","postal_code","type","stage","source","notes","email_permission","next_follow_up_at","archived"}
                updates = {k: (clean(v) if k != "archived" else int(bool(v))) for k,v in data.items() if k in allowed}
                if not updates: raise ValueError("No supported fields")
                updates["updated_at"] = now(); fields = ",".join(f"{k}=?" for k in updates)
                with db() as conn: conn.execute(f"UPDATE contacts SET {fields} WHERE id=?", (*updates.values(), cid))
                return self.send_json(row("SELECT * FROM contacts WHERE id=?", (cid,)))
            return self.send_json({"error":"Not found"},404)
        except (ValueError, sqlite3.Error) as exc:
            return self.send_json({"error": str(exc)}, 400)


if __name__ == "__main__":
    initialize()
    print(f"Matt Realty Desk listening on http://{HOST}:{PORT}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
