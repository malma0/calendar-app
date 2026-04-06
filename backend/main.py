from __future__ import annotations

import json
import random
import secrets
import os
import threading

try:
    from pywebpush import webpush, WebPushException
except Exception:
    webpush = None
    WebPushException = Exception
from datetime import date as dt_date, datetime, timedelta
from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException, status, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import text
from sqlalchemy.orm import Session

import models
import schemas
from auth import get_password_hash, verify_password, create_access_token, get_current_user
from database import engine, get_db
from email_service import send_reset_email

models.Base.metadata.create_all(bind=engine)

VAPID_PUBLIC_KEY = os.getenv("OPENTIME_VAPID_PUBLIC_KEY", "BBk-jAYk9d-Xqte73-7erJLm_6qOXVJ_JDnMoWirw9we1m2IIMZnIs1pNC1I3-LuXfrELhPNL7hpkQT-POeTcuM")
VAPID_PRIVATE_KEY = os.getenv("OPENTIME_VAPID_PRIVATE_KEY", "p_96APoLgSwNBrAFMxOXVj73hgDEwCEgbuMzhpyPz58")
VAPID_SUBJECT = os.getenv("OPENTIME_VAPID_SUBJECT", "mailto:opentime@example.com")


def _ensure_user_reset_columns() -> None:
    try:
        with engine.begin() as conn:
            cols = conn.execute(text("PRAGMA table_info(users)")).fetchall()
            names = {row[1] for row in cols}
            if "reset_token" not in names:
                conn.execute(text("ALTER TABLE users ADD COLUMN reset_token VARCHAR"))
            if "reset_token_expires_at" not in names:
                conn.execute(text("ALTER TABLE users ADD COLUMN reset_token_expires_at DATETIME"))
    except Exception:
        pass


def _ensure_users_extra_columns() -> None:
    try:
        with engine.begin() as conn:
            cols = conn.execute(text("PRAGMA table_info(users)")).fetchall()
            names = {row[1] for row in cols}
            if "avatar" not in names:
                conn.execute(text("ALTER TABLE users ADD COLUMN avatar TEXT"))
    except Exception:
        pass


def _ensure_groups_columns() -> None:
    try:
        with engine.begin() as conn:
            cols = conn.execute(text("PRAGMA table_info(groups)")).fetchall()
            names = {row[1] for row in cols}
            if "description" not in names:
                conn.execute(text("ALTER TABLE groups ADD COLUMN description TEXT"))
            if "invite_code" not in names:
                conn.execute(text("ALTER TABLE groups ADD COLUMN invite_code VARCHAR"))
            if "created_at" not in names:
                conn.execute(text("ALTER TABLE groups ADD COLUMN created_at DATETIME"))
            rows = conn.execute(text("SELECT id, invite_code FROM groups")).fetchall()
            for gid, code in rows:
                if not code:
                    conn.execute(text("UPDATE groups SET invite_code=:code, created_at=COALESCE(created_at, :created) WHERE id=:id"), {
                        "code": secrets.token_hex(4).upper(),
                        "created": datetime.utcnow(),
                        "id": gid,
                    })
    except Exception:
        pass


def _ensure_group_members_columns() -> None:
    try:
        with engine.begin() as conn:
            cols = conn.execute(text("PRAGMA table_info(group_members)")).fetchall()
            names = {row[1] for row in cols}
            if "color" not in names:
                conn.execute(text("ALTER TABLE group_members ADD COLUMN color VARCHAR"))
            rows = conn.execute(text("SELECT gm.user_id, gm.group_id, gm.color, u.color FROM group_members gm LEFT JOIN users u ON u.id = gm.user_id")).fetchall()
            for user_id, group_id, color, user_color in rows:
                if not color:
                    conn.execute(text("UPDATE group_members SET color=:color WHERE user_id=:user_id AND group_id=:group_id"), {
                        "color": user_color or "#007AFF",
                        "user_id": user_id,
                        "group_id": group_id,
                    })
    except Exception:
        pass




def _ensure_push_subscriptions_table() -> None:
    try:
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS push_subscriptions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    endpoint TEXT NOT NULL UNIQUE,
                    p256dh TEXT NOT NULL,
                    auth TEXT NOT NULL,
                    enabled INTEGER NOT NULL DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """))
    except Exception:
        pass


def _upsert_push_subscription(user_id: int, subscription: dict) -> None:
    endpoint = str((subscription or {}).get("endpoint") or "").strip()
    keys = (subscription or {}).get("keys") or {}
    p256dh = str(keys.get("p256dh") or "").strip()
    auth = str(keys.get("auth") or "").strip()
    if not endpoint or not p256dh or not auth:
        raise HTTPException(status_code=400, detail="Некорректная push-подписка")
    with engine.begin() as conn:
        conn.execute(text("""
            INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, enabled, updated_at)
            VALUES (:user_id, :endpoint, :p256dh, :auth, 1, CURRENT_TIMESTAMP)
            ON CONFLICT(endpoint) DO UPDATE SET
                user_id=excluded.user_id,
                p256dh=excluded.p256dh,
                auth=excluded.auth,
                enabled=1,
                updated_at=CURRENT_TIMESTAMP
        """), {"user_id": user_id, "endpoint": endpoint, "p256dh": p256dh, "auth": auth})


def _remove_push_subscription(user_id: int, endpoint: str) -> None:
    if not endpoint:
        return
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM push_subscriptions WHERE user_id=:user_id AND endpoint=:endpoint"), {"user_id": user_id, "endpoint": endpoint})


def _send_push_to_users(user_ids: list[int], title: str, body: str, url: str = "/", tag: str = "opentime") -> None:
    if not user_ids or not webpush or not VAPID_PUBLIC_KEY or not VAPID_PRIVATE_KEY:
        return
    unique_ids = sorted({int(uid) for uid in user_ids if uid})
    if not unique_ids:
        return
    with engine.begin() as conn:
        rows = conn.execute(text(f"SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE enabled=1 AND user_id IN ({','.join(str(uid) for uid in unique_ids)})")).fetchall()
    payload = json.dumps({"title": title, "body": body, "url": url, "tag": tag})
    stale = []
    for row in rows:
        try:
            webpush(
                subscription_info={
                    "endpoint": row[1],
                    "keys": {"p256dh": row[2], "auth": row[3]},
                },
                data=payload,
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": VAPID_SUBJECT},
                ttl=60,
            )
        except Exception as exc:
            status_code = getattr(getattr(exc, 'response', None), 'status_code', None)
            if status_code in (404, 410):
                stale.append(row[0])
    if stale:
        with engine.begin() as conn:
            conn.execute(text(f"DELETE FROM push_subscriptions WHERE id IN ({','.join(str(int(x)) for x in stale)})"))




def _send_push_to_users_async(user_ids: list[int], title: str, body: str, url: str = "/", tag: str = "opentime") -> None:
    try:
        thread = threading.Thread(
            target=_send_push_to_users,
            args=(list(user_ids or []), title, body, url, tag),
            daemon=True,
        )
        thread.start()
    except Exception:
        pass

def _ensure_meeting_proposal_tables() -> None:
    try:
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS meeting_proposals (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    group_id INTEGER NOT NULL,
                    creator_id INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT,
                    date DATE NOT NULL,
                    start_time TIME NOT NULL,
                    end_time TIME NOT NULL,
                    status VARCHAR DEFAULT 'open',
                    shadow_event_id INTEGER,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS meeting_proposal_votes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    proposal_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    vote VARCHAR NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """))
            rows = conn.execute(text("PRAGMA index_list(meeting_proposal_votes)")).fetchall()
            names = {row[1] for row in rows}
            if "idx_meeting_proposal_votes_unique" not in names:
                conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS idx_meeting_proposal_votes_unique ON meeting_proposal_votes (proposal_id, user_id)"))
    except Exception:
        pass


def _cleanup_orphan_meeting_proposals(db: Session) -> None:
    db.execute(text("""
        DELETE FROM meeting_proposal_votes
        WHERE proposal_id IN (
            SELECT mp.id
            FROM meeting_proposals mp
            LEFT JOIN events e ON e.id = mp.shadow_event_id
            WHERE COALESCE(mp.status, 'open') = 'open'
              AND mp.shadow_event_id IS NOT NULL
              AND e.id IS NULL
        )
    """))
    db.execute(text("""
        DELETE FROM meeting_proposals
        WHERE id IN (
            SELECT mp.id
            FROM meeting_proposals mp
            LEFT JOIN events e ON e.id = mp.shadow_event_id
            WHERE COALESCE(mp.status, 'open') = 'open'
              AND mp.shadow_event_id IS NOT NULL
              AND e.id IS NULL
        )
    """))
    # Also drop stale proposals whose shadow event exists but no longer points back to this proposal.
    stale_ids = [row[0] for row in db.execute(text("""
        SELECT mp.id
        FROM meeting_proposals mp
        JOIN events e ON e.id = mp.shadow_event_id
        WHERE COALESCE(mp.status, 'open') = 'open'
          AND mp.shadow_event_id IS NOT NULL
          AND (e.description IS NULL OR e.description NOT LIKE ('[proposal:' || mp.id || ']%'))
    """)).fetchall()]
    if stale_ids:
        db.execute(text(f"DELETE FROM meeting_proposal_votes WHERE proposal_id IN ({','.join(str(int(x)) for x in stale_ids)})"))
        db.execute(text(f"DELETE FROM meeting_proposals WHERE id IN ({','.join(str(int(x)) for x in stale_ids)})"))
    db.commit()


def _proposal_membership_or_404(group_id: int, current_user, db: Session):
    membership = db.query(models.GroupMember).filter_by(group_id=group_id, user_id=current_user.id).first()
    if not membership:
        raise HTTPException(status_code=404, detail="Группа не найдена или вы не состоите в ней")
    return membership


def _serialize_proposal_row(row, current_user_id: int, db: Session):
    proposal_id = row.id if hasattr(row, 'id') else row[0]
    group_id = row.group_id if hasattr(row, 'group_id') else row[1]
    votes_rows = db.execute(text("""
        SELECT u.id, u.username, COALESCE(u.full_name, u.username) AS display_name, mpv.vote
        FROM group_members gm
        JOIN users u ON u.id = gm.user_id
        LEFT JOIN meeting_proposal_votes mpv
            ON mpv.user_id = gm.user_id AND mpv.proposal_id = :proposal_id
        WHERE gm.group_id = :group_id
        ORDER BY display_name ASC
    """), {"proposal_id": proposal_id, "group_id": group_id}).fetchall()

    avatar_map = {}
    try:
        user_ids = [row[0] for row in votes_rows]
        if user_ids:
            users = db.query(models.User).filter(models.User.id.in_(user_ids)).all()
            avatar_map = {user.id: _get_user_avatar_value(user) for user in users}
    except Exception:
        avatar_map = {}

    summary = {"yes": 0, "no": 0, "maybe": 0, "pending": 0}
    members = []
    current_user_vote = None
    for user_id, username, display_name, vote in votes_rows:
        if vote in summary:
            summary[vote] += 1
        else:
            summary["pending"] += 1
        if user_id == current_user_id:
            current_user_vote = vote
        members.append({
            "user_id": user_id,
            "login": username,
            "name": display_name,
            "vote": vote or "pending",
            "avatar": avatar_map.get(user_id),
        })

    return {
        "id": proposal_id,
        "group_id": group_id,
        "creator_id": row.creator_id,
        "creator_name": row.creator_name,
        "creator_avatar": avatar_map.get(row.creator_id),
        "creator_login": row.creator_login,
        "title": row.title,
        "description": row.description or "",
        "date": str(row.date),
        "start_time": str(row.start_time)[:5],
        "end_time": str(row.end_time)[:5],
        "status": row.status or "open",
        "shadow_event_id": row.shadow_event_id,
        "created_at": str(row.created_at),
        "current_user_vote": current_user_vote or "pending",
        "summary": summary,
        "members": members,
        "calendar_badge": "СБОР",
    }


def _merge_intervals(intervals: list[tuple[datetime, datetime]]) -> list[tuple[datetime, datetime]]:
    if not intervals:
        return []
    intervals = sorted(intervals, key=lambda x: x[0])
    merged: list[tuple[datetime, datetime]] = [intervals[0]]
    for start, end in intervals[1:]:
        last_start, last_end = merged[-1]
        if start <= last_end:
            if end > last_end:
                merged[-1] = (last_start, end)
        else:
            merged.append((start, end))
    return merged


def _format_slot_label(start: datetime, end: datetime) -> str:
    return f"{start.strftime('%d.%m %H:%M')} – {end.strftime('%H:%M')}"


PROPOSAL_META_PREFIX = "__PROPOSAL__"


def _extract_proposal_meta(description: str | None) -> tuple[dict, str]:
    raw = description or ""
    if not raw.startswith(PROPOSAL_META_PREFIX):
        return {"votes_yes": [], "votes_no": []}, raw
    payload = raw[len(PROPOSAL_META_PREFIX):]
    meta_line, _, visible = payload.partition("\n")
    try:
        meta = json.loads(meta_line or "{}")
    except Exception:
        meta = {}
    meta.setdefault("votes_yes", [])
    meta.setdefault("votes_no", [])
    return meta, visible.lstrip("\n")


def _build_proposal_description(visible: str | None, meta: dict | None = None) -> str:
    data = meta or {"votes_yes": [], "votes_no": []}
    return f"{PROPOSAL_META_PREFIX}{json.dumps(data, ensure_ascii=False)}\n{(visible or '').strip()}"


def _is_proposal_event(ev) -> bool:
    title = getattr(ev, 'title', '') or ''
    description = getattr(ev, 'description', '') or ''
    return title.startswith('ВСТРЕЧА ·') or title.startswith('📌 ') or description.startswith(PROPOSAL_META_PREFIX)








PERSONAL_GROUP_PREFIX = "__personal__:"

def _personal_group_name(user_id: int) -> str:
    return f"{PERSONAL_GROUP_PREFIX}{user_id}"

def _is_personal_group(group) -> bool:
    return bool(group) and str(getattr(group, "name", "") or "").startswith(PERSONAL_GROUP_PREFIX)

def _ensure_personal_group(db: Session, user: models.User):
    name = _personal_group_name(user.id)
    group = db.query(models.Group).filter(models.Group.name == name, models.Group.owner_id == user.id).first()
    if not group:
        group = models.Group(
            name=name,
            description="Личное пространство пользователя",
            invite_code=secrets.token_hex(4).upper(),
            owner_id=user.id,
            created_at=datetime.utcnow(),
        )
        db.add(group)
        db.commit()
        db.refresh(group)
    membership = db.query(models.GroupMember).filter_by(group_id=group.id, user_id=user.id).first()
    if not membership:
        membership = models.GroupMember(user_id=user.id, group_id=group.id, color=user.color)
        db.add(membership)
        db.commit()
        db.refresh(group)
    return group, membership


def _serialize_user(user):
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "full_name": user.full_name,
        "color": getattr(user, 'color', None) or "#007AFF",
        "created_at": getattr(user, 'created_at', None),
        "avatar": _get_user_avatar_value(user),
    }


def _serialize_group(group, member_color=None, fallback_color="#007AFF"):
    if isinstance(group, tuple) and len(group) >= 1:
        group = group[0]
    return {
        "id": group.id,
        "name": group.name,
        "description": getattr(group, 'description', None),
        "owner_id": group.owner_id,
        "invite_code": group.invite_code,
        "created_at": getattr(group, 'created_at', None),
        "member_color": member_color or getattr(group, 'member_color', None) or fallback_color or "#007AFF",
    }
def _get_user_avatar_value(user):
    for attr in ("avatar_url", "avatar_path", "avatar", "profile_image", "profile_image_url", "photo_url", "image_url"):
        value = getattr(user, attr, None)
        if value:
            return value
    return None

def _serialize_event(ev, user, member_color):
    meta, visible_description = _extract_proposal_meta(getattr(ev, 'description', None))
    return {
        "id": ev.id,
        "title": ev.title,
        "description": visible_description,
        "date": ev.date,
        "start_time": ev.start_time,
        "end_time": ev.end_time,
        "user_id": ev.user_id,
        "group_id": ev.group_id,
        "created_at": ev.created_at,
        "creator_login": user.username,
        "creator_name": user.full_name or user.username,
        "creator_avatar": _get_user_avatar_value(user),
        "color": member_color or user.color or "#007AFF",
        "proposal_votes_yes": meta.get("votes_yes", []),
        "proposal_votes_no": meta.get("votes_no", []),
    }

app = FastAPI(title="Календарь совместных планов API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://192.168.0.234:5500",
        "http://192.168.0.214:5500",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup_migrations():
    _ensure_user_reset_columns()
    _ensure_users_extra_columns()
    _ensure_groups_columns()
    _ensure_group_members_columns()
    _ensure_meeting_proposal_tables()


@app.post("/api/register", response_model=schemas.UserResponse)
def register(user: schemas.UserCreate, db: Session = Depends(get_db)):
    exists = (
        db.query(models.User)
        .filter((models.User.email == user.email) | (models.User.username == user.username))
        .first()
    )
    if exists:
        raise HTTPException(status_code=400, detail="Email или login уже заняты")

    db_user = models.User(
        email=user.email,
        username=user.username,
        full_name=user.full_name,
        hashed_password=get_password_hash(user.password),
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    _ensure_personal_group(db, db_user)
    return db_user


@app.post("/api/password/request")
def request_password_reset(payload: schemas.PasswordResetRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user:
        return {"detail": "Если email существует, код восстановления отправлен."}

    token = f"{random.randint(100000, 999999)}"
    user.reset_token = token
    user.reset_token_expires_at = datetime.utcnow() + timedelta(minutes=30)
    db.commit()

    try:
        send_reset_email(user.email, token)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Не удалось отправить письмо: {exc}")

    return {"detail": "Код восстановления отправлен на почту.", "token": token}


@app.post("/api/password/reset")
def confirm_password_reset(payload: schemas.PasswordResetConfirm, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.reset_token == payload.token).first()
    if not user or not user.reset_token_expires_at or user.reset_token_expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Неверный или просроченный токен")

    user.hashed_password = get_password_hash(payload.new_password)
    user.reset_token = None
    user.reset_token_expires_at = None
    db.commit()
    return {"detail": "Пароль обновлен"}


@app.post("/api/token", response_model=schemas.Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    identifier = (form_data.username or "").strip()
    if "@" in identifier:
        user = db.query(models.User).filter(models.User.email == identifier).first()
    else:
        user = db.query(models.User).filter(models.User.username == identifier).first()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверное имя пользователя или пароль",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token(data={"sub": str(user.id)}, expires_delta=timedelta(minutes=30))
    return schemas.Token(access_token=token)


@app.get("/api/push/public-key")
def get_push_public_key(current_user: models.User = Depends(get_current_user)):
    return {"public_key": VAPID_PUBLIC_KEY, "supported": webpush is not None}


@app.post("/api/push/subscribe")
def subscribe_push(payload: dict = Body(...), current_user: models.User = Depends(get_current_user)):
    subscription = payload.get("subscription") if isinstance(payload, dict) else None
    _upsert_push_subscription(current_user.id, subscription or {})
    return {"ok": True}


@app.post("/api/push/unsubscribe")
def unsubscribe_push(payload: dict = Body(...), current_user: models.User = Depends(get_current_user)):
    endpoint = str((payload or {}).get("endpoint") or "").strip()
    _remove_push_subscription(current_user.id, endpoint)
    return {"ok": True}


@app.post("/api/push/test")
def test_push(current_user: models.User = Depends(get_current_user)):
    _send_push_to_users([current_user.id], "Тест OpenTime", "Push-уведомления подключены.", "/", "opentime-test")
    return {"ok": True}


@app.get("/api/users/me", response_model=schemas.UserResponse)
def read_users_me(current_user: models.User = Depends(get_current_user)):
    return _serialize_user(current_user)


@app.put("/api/users/me", response_model=schemas.UserResponse)
def update_me(payload: schemas.UserUpdate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    exists = (
        db.query(models.User)
        .filter(models.User.username == payload.username, models.User.id != current_user.id)
        .first()
    )
    if exists:
        raise HTTPException(status_code=400, detail="Login уже занят")
    current_user.username = payload.username
    current_user.full_name = payload.full_name
    if hasattr(payload, "avatar") and payload.avatar is not None and hasattr(current_user, "avatar"):
        current_user.avatar = payload.avatar
    db.commit()
    db.refresh(current_user)
    return _serialize_user(current_user)


@app.post("/api/groups", response_model=schemas.GroupResponse)
def create_group(group: schemas.GroupCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_group = models.Group(
        name=group.name,
        description=group.description,
        invite_code=secrets.token_hex(4).upper(),
        owner_id=current_user.id,
        created_at=datetime.utcnow(),
    )
    db.add(db_group)
    db.commit()
    db.refresh(db_group)

    if not db.query(models.GroupMember).filter_by(user_id=current_user.id, group_id=db_group.id).first():
        db.add(models.GroupMember(user_id=current_user.id, group_id=db_group.id, color=current_user.color))
        db.commit()
    setattr(db_group, "member_color", current_user.color)
    return _serialize_group(db_group, current_user.color, current_user.color or "#007AFF")


@app.get("/api/groups", response_model=List[schemas.GroupResponse])
def get_my_groups(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    groups = (
        db.query(models.Group, models.GroupMember.color.label("member_color"))
        .join(models.GroupMember, models.GroupMember.group_id == models.Group.id)
        .filter(models.GroupMember.user_id == current_user.id)
        .order_by(models.Group.created_at.desc().nullslast(), models.Group.id.desc())
        .all()
    )
    result = []
    for group, member_color in groups:
        if _is_personal_group(group):
            continue
        result.append(_serialize_group(group, member_color, current_user.color or "#007AFF"))
    return result


@app.get("/api/groups/{group_id}", response_model=schemas.GroupResponse)
def get_group(group_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = (
        db.query(models.Group, models.GroupMember.color.label("member_color"))
        .join(models.GroupMember, models.GroupMember.group_id == models.Group.id)
        .filter(models.Group.id == group_id, models.GroupMember.user_id == current_user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Группа не найдена или вы не состоите в ней")
    group, member_color = row
    setattr(group, "member_color", member_color or current_user.color or "#007AFF")
    return _serialize_group(group, member_color, current_user.color or "#007AFF")


@app.get("/api/groups/{group_id}/members", response_model=List[schemas.GroupMember])
def get_group_members(group_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    allowed = db.query(models.GroupMember).filter_by(group_id=group_id, user_id=current_user.id).first()
    if not allowed:
        raise HTTPException(status_code=404, detail="Группа не найдена или вы не состоите в ней")
    rows = (
        db.query(models.User, models.GroupMember.color)
        .join(models.GroupMember, models.GroupMember.user_id == models.User.id)
        .filter(models.GroupMember.group_id == group_id)
        .order_by(models.User.full_name.asc().nulls_last(), models.User.username.asc())
        .all()
    )
    return [
        {
            "id": user.id,
            "login": user.username,
            "name": user.full_name or user.username,
            "color": color or user.color or "#007AFF",
            "avatar": _get_user_avatar_value(user),
        }
        for user, color in rows
    ]


@app.put("/api/groups/{group_id}", response_model=schemas.GroupResponse)
def update_group(group_id: int, payload: schemas.GroupUpdate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")
    if group.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Только админ группы может менять название")
    group.name = payload.name
    db.commit()
    db.refresh(group)
    membership = db.query(models.GroupMember).filter_by(group_id=group.id, user_id=current_user.id).first()
    setattr(group, "member_color", membership.color if membership and membership.color else current_user.color)
    return group


@app.put("/api/groups/{group_id}/my-color", response_model=schemas.GroupResponse)
def update_group_color(group_id: int, payload: schemas.UserColorUpdate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")
    membership = db.query(models.GroupMember).filter_by(group_id=group.id, user_id=current_user.id).first()
    if not membership:
        raise HTTPException(status_code=404, detail="Вы не состоите в группе")
    membership.color = payload.color
    db.commit()
    db.refresh(group)
    setattr(group, "member_color", payload.color)
    return _serialize_group(group, payload.color, current_user.color or "#007AFF")


@app.post("/api/groups/{group_id}/leave")
def leave_group(group_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    group = db.query(models.Group).filter_by(id=group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")

    membership = db.query(models.GroupMember).filter_by(group_id=group_id, user_id=current_user.id).first()
    if not membership:
        raise HTTPException(status_code=404, detail="Вы не состоите в группе")

    if group.owner_id == current_user.id:
        other_members = (
            db.query(models.GroupMember)
            .filter(models.GroupMember.group_id == group_id, models.GroupMember.user_id != current_user.id)
            .all()
        )
        if other_members:
            next_owner = random.choice(other_members)
            group.owner_id = next_owner.user_id
            db.delete(membership)
            db.commit()
            return {"detail": "Вы вышли из группы. Права админа переданы другому участнику."}
        else:
            db.delete(membership)
            db.delete(group)
            db.commit()
            return {"detail": "Вы вышли из группы. Группа удалена, так как участников больше не осталось."}

    db.delete(membership)
    db.commit()
    return {"detail": "Вы вышли из группы"}


@app.delete("/api/groups/{group_id}")
def delete_group(group_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    group = db.query(models.Group).filter_by(id=group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")
    if group.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Удалить группу может только создатель")
    db.delete(group)
    db.commit()
    return {"detail": "Группа удалена"}


@app.get("/api/groups/{group_id}/invite")
def get_group_invite(group_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    group = (
        db.query(models.Group)
        .join(models.GroupMember, models.GroupMember.group_id == models.Group.id)
        .filter(models.Group.id == group_id, models.GroupMember.user_id == current_user.id)
        .first()
    )
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена или вы не состоите в ней")
    return {"invite_code": group.invite_code, "group_id": group.id, "group_name": group.name}


@app.post("/api/invite/{invite_code}/join", response_model=schemas.GroupResponse)
def join_by_invite(invite_code: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    group = db.query(models.Group).filter(models.Group.invite_code == invite_code.upper()).first()
    if not group:
        raise HTTPException(status_code=404, detail="Приглашение не найдено")
    exists = db.query(models.GroupMember).filter_by(group_id=group.id, user_id=current_user.id).first()
    if not exists:
        db.add(models.GroupMember(group_id=group.id, user_id=current_user.id, color=current_user.color))
        db.commit()
    db.refresh(group)
    setattr(group, "member_color", current_user.color)
    return _serialize_group(group, current_user.color, current_user.color or "#007AFF")


@app.put("/api/users/me/color", response_model=schemas.UserResponse)
def update_my_color(payload: schemas.UserColorUpdate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    current_user.color = payload.color
    db.commit()
    db.refresh(current_user)
    return current_user


@app.post("/api/events", response_model=schemas.EventResponse)
def create_event(event: schemas.EventCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    target_group_id = event.group_id
    allowed = None
    if target_group_id is not None:
        allowed = db.query(models.GroupMember).filter_by(group_id=target_group_id, user_id=current_user.id).first()
        if not allowed:
            raise HTTPException(status_code=404, detail="Группа не найдена или вы не состоите в ней")
    else:
        personal_group, allowed = _ensure_personal_group(db, current_user)
        target_group_id = personal_group.id
    if event.start_time and event.end_time and event.start_time >= event.end_time:
        raise HTTPException(status_code=400, detail="end_time должно быть позже start_time")
    is_proposal = str(event.title or '').startswith('ВСТРЕЧА ·') or str(event.title or '').startswith('📌 ')
    db_event = models.Event(
        title=event.title,
        description=_build_proposal_description(event.description) if is_proposal else event.description,
        date=event.date,
        start_time=event.start_time,
        end_time=event.end_time,
        user_id=current_user.id,
        group_id=target_group_id,
    )
    db.add(db_event)
    db.commit()
    db.refresh(db_event)
    if not is_proposal:
        member_ids = [row[0] for row in db.query(models.GroupMember.user_id).filter(models.GroupMember.group_id == event.group_id, models.GroupMember.user_id != current_user.id).all()]
        if member_ids:
            group = db.query(models.Group).filter_by(id=event.group_id).first()
            when = f"{event.date.strftime('%d.%m')} · {db_event.start_time.strftime('%H:%M') if db_event.start_time else ''}".strip()
            _send_push_to_users_async(member_ids, f"Новый план в группе «{group.name if group else 'OpenTime'}»", f"{current_user.full_name or current_user.username}: {db_event.title} {when}".strip(), "/", "opentime-event")
    return {
        **db_event.__dict__,
        "creator_login": current_user.username,
        "creator_name": current_user.full_name or current_user.username,
        "creator_avatar": _get_user_avatar_value(current_user),
        "color": allowed.color or current_user.color or "#007AFF",
    }


@app.put("/api/events/{event_id}", response_model=schemas.EventResponse)
def update_event(event_id: int, payload: schemas.EventUpdate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    ev = db.query(models.Event).filter_by(id=event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Событие не найдено")
    if ev.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Редактировать можно только свои события")
    if payload.start_time and payload.end_time and payload.start_time >= payload.end_time:
        raise HTTPException(status_code=400, detail="Конец должен быть позже начала")
    ev.title = payload.title
    ev.date = payload.date
    ev.start_time = payload.start_time
    ev.end_time = payload.end_time
    if hasattr(payload, "description"):
        ev.description = payload.description
    db.commit()
    db.refresh(ev)
    membership = db.query(models.GroupMember).filter_by(group_id=ev.group_id, user_id=current_user.id).first()
    return {
        **ev.__dict__,
        "creator_login": current_user.username,
        "creator_name": current_user.full_name or current_user.username,
        "creator_avatar": _get_user_avatar_value(current_user),
        "color": membership.color if membership and membership.color else current_user.color or "#007AFF",
    }


@app.delete("/api/events/{event_id}")
def delete_event(event_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    ev = db.query(models.Event).filter_by(id=event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Событие не найдено")
    proposal_row = db.execute(text("SELECT id, creator_id, shadow_event_id FROM meeting_proposals WHERE shadow_event_id = :event_id AND COALESCE(status, 'open') = 'open'"), {"event_id": event_id}).fetchone()
    if proposal_row:
        if proposal_row.creator_id != current_user.id:
            raise HTTPException(status_code=403, detail="Удалить можно только своё предложение встречи")
        db.execute(text("DELETE FROM meeting_proposal_votes WHERE proposal_id = :proposal_id"), {"proposal_id": proposal_row.id})
        db.execute(text("DELETE FROM meeting_proposals WHERE id = :proposal_id"), {"proposal_id": proposal_row.id})
        db.delete(ev)
        db.commit()
        return {"detail": "Предложение встречи удалено"}
    if ev.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Удалить можно только своё событие")
    db.delete(ev)
    db.commit()
    return {"detail": "Событие удалено"}


@app.get("/api/events", response_model=List[schemas.EventResponse])
def get_events(group_id: Optional[int] = Query(default=None), year: Optional[int] = Query(default=None, ge=1900, le=3000), month: Optional[int] = Query(default=None, ge=1, le=12), current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if group_id is None:
        personal_group, _ = _ensure_personal_group(db, current_user)
        group_id = personal_group.id
    q = (
        db.query(models.Event, models.User, models.GroupMember.color.label("member_color"))
        .join(models.GroupMember, models.GroupMember.group_id == models.Event.group_id)
        .join(models.User, models.User.id == models.Event.user_id)
        .filter(models.GroupMember.user_id == current_user.id)
        .filter(models.GroupMember.group_id == models.Event.group_id)
    )
    if group_id is not None:
        q = q.filter(models.Event.group_id == group_id)
    if year is not None and month is not None:
        start = dt_date(year, month, 1)
        end = dt_date(year + 1, 1, 1) if month == 12 else dt_date(year, month + 1, 1)
        q = q.filter(models.Event.date >= start, models.Event.date < end)
    rows = q.order_by(models.Event.date.asc(), models.Event.start_time.asc().nulls_last()).all()
    out = []
    for ev, user, member_color in rows:
        if _is_proposal_event(ev):
            continue
        linked = db.execute(text("SELECT 1 FROM meeting_proposals WHERE shadow_event_id = :event_id AND COALESCE(status, 'open') = 'open' LIMIT 1"), {"event_id": ev.id}).fetchone()
        if linked:
            continue
        out.append(_serialize_event(ev, user, member_color))
    return out


@app.get("/api/groups/{group_id}/proposals")
def get_group_proposals(group_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    membership = db.query(models.GroupMember).filter_by(group_id=group_id, user_id=current_user.id).first()
    if not membership:
        raise HTTPException(status_code=404, detail="Группа не найдена или вы не состоите в ней")

    rows = (
        db.query(models.Event, models.User, models.GroupMember.color.label("member_color"))
        .join(models.User, models.User.id == models.Event.user_id)
        .join(models.GroupMember, (models.GroupMember.group_id == models.Event.group_id) & (models.GroupMember.user_id == models.Event.user_id))
        .filter(models.Event.group_id == group_id)
        .order_by(models.Event.date.asc(), models.Event.start_time.asc().nulls_last())
        .all()
    )

    today = dt_date.today()
    result = []
    for ev, user, member_color in rows:
        if ev.date and ev.date < today:
            continue
        if not _is_proposal_event(ev):
            continue
        data = _serialize_event(ev, user, member_color)
        yes = data.pop('proposal_votes_yes', [])
        no = data.pop('proposal_votes_no', [])
        data['votes_yes'] = yes
        data['votes_no'] = no
        data['my_vote'] = 'yes' if current_user.id in yes else ('no' if current_user.id in no else None)
        result.append(data)
    return result


@app.post("/api/events/{event_id}/proposal-vote")
def vote_for_proposal(event_id: int, payload: dict = Body(...), current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    ev = db.query(models.Event).filter_by(id=event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Событие не найдено")
    membership = db.query(models.GroupMember).filter_by(group_id=ev.group_id, user_id=current_user.id).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Вы не состоите в группе")
    if not _is_proposal_event(ev):
        raise HTTPException(status_code=400, detail="Голосовать можно только по предложенной встрече")

    vote = str((payload or {}).get('vote') or '').lower().strip()
    if vote not in {'yes', 'no'}:
        raise HTTPException(status_code=400, detail="vote должен быть yes или no")

    meta, visible_description = _extract_proposal_meta(ev.description)
    yes = [x for x in meta.get('votes_yes', []) if x != current_user.id]
    no = [x for x in meta.get('votes_no', []) if x != current_user.id]
    if vote == 'yes':
        yes.append(current_user.id)
    else:
        no.append(current_user.id)
    meta['votes_yes'] = yes
    meta['votes_no'] = no
    ev.description = _build_proposal_description(visible_description, meta)
    db.commit()
    return {"detail": "Голос сохранён", "vote": vote, "votes_yes": yes, "votes_no": no}


@app.get("/api/groups/{group_id}/best-window")
def get_best_group_window(
    group_id: int,
    days_ahead: int = Query(default=14, ge=1, le=60),
    min_minutes: int = Query(default=120, ge=15, le=720),
    from_hour: int = Query(default=9, ge=0, le=23),
    to_hour: int = Query(default=22, ge=1, le=24),
    max_results: int = Query(default=3, ge=1, le=10),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = db.query(models.GroupMember).filter_by(group_id=group_id, user_id=current_user.id).first()
    if not membership:
        raise HTTPException(status_code=404, detail="Группа не найдена или вы не состоите в ней")

    group = db.query(models.Group).filter_by(id=group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")

    member_rows = (
        db.query(models.GroupMember, models.User)
        .join(models.User, models.User.id == models.GroupMember.user_id)
        .filter(models.GroupMember.group_id == group_id)
        .all()
    )
    member_ids = [gm.user_id for gm, _ in member_rows]
    member_names = [user.full_name or user.username for _, user in member_rows]

    if len(member_ids) < 2:
        return {
            "group_id": group.id,
            "group_name": group.name,
            "member_count": len(member_ids),
            "member_names": member_names,
            "min_minutes": min_minutes,
            "days_ahead": days_ahead,
            "window": None,
            "alternatives": [],
            "summary": "В группе нужен хотя бы ещё один участник, чтобы искать общее окно.",
        }

    today = dt_date.today()
    range_end = today + timedelta(days=days_ahead)
    events = (
        db.query(models.Event)
        .filter(models.Event.group_id == group_id)
        .filter(models.Event.date >= today, models.Event.date <= range_end)
        .all()
    )

    results = []
    slot_length = timedelta(minutes=min_minutes)

    for offset in range(days_ahead + 1):
        current_day = today + timedelta(days=offset)
        day_start = datetime.combine(current_day, datetime.min.time()).replace(hour=from_hour, minute=0, second=0, microsecond=0)
        day_end = datetime.combine(current_day, datetime.min.time()) + timedelta(hours=to_hour)
        if day_end <= day_start:
            continue

        busy_intervals: list[tuple[datetime, datetime]] = []
        for ev in events:
            if ev.date != current_day:
                continue
            ev_start = datetime.combine(ev.date, ev.start_time) if ev.start_time else day_start
            ev_end = datetime.combine(ev.date, ev.end_time) if ev.end_time else day_end
            if ev_end <= day_start or ev_start >= day_end:
                continue
            if ev_start < day_start:
                ev_start = day_start
            if ev_end > day_end:
                ev_end = day_end
            if ev_end > ev_start:
                busy_intervals.append((ev_start, ev_end))

        merged = _merge_intervals(busy_intervals)
        cursor = day_start
        for start, end in merged:
            if start - cursor >= slot_length:
                slot_end = cursor + slot_length
                results.append({
                    "date": current_day.isoformat(),
                    "start": cursor.isoformat(),
                    "end": slot_end.isoformat(),
                    "duration_minutes": min_minutes,
                    "label": _format_slot_label(cursor, slot_end),
                })
                if len(results) >= max_results:
                    break
            if end > cursor:
                cursor = end
        if len(results) >= max_results:
            break
        if day_end - cursor >= slot_length:
            slot_end = cursor + slot_length
            results.append({
                "date": current_day.isoformat(),
                "start": cursor.isoformat(),
                "end": slot_end.isoformat(),
                "duration_minutes": min_minutes,
                "label": _format_slot_label(cursor, slot_end),
            })
            if len(results) >= max_results:
                break

    first = results[0] if results else None
    if first:
        if min_minutes % 60 == 0:
            duration_label = f"{min_minutes // 60}ч"
        else:
            duration_label = f"{min_minutes} мин"
        summary = f'Ближайшее общее окно для “{group.name}”: {first["label"]} ({duration_label})'
    else:
        summary = f'В ближайшие {days_ahead} дней не найдено общего окна на {min_minutes} мин. Попробуйте уменьшить длительность.'

    return {
        "group_id": group.id,
        "group_name": group.name,
        "member_count": len(member_ids),
        "member_names": member_names,
        "min_minutes": min_minutes,
        "days_ahead": days_ahead,
        "window": first,
        "alternatives": results[1:],
        "summary": summary,
    }


@app.get("/api/groups/{group_id}/meeting-proposals")
def get_group_meeting_proposals(
    group_id: int,
    limit: int = Query(default=10, ge=1, le=50),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _cleanup_orphan_meeting_proposals(db)
    _proposal_membership_or_404(group_id, current_user, db)
    rows = db.execute(text("""
        SELECT mp.*,
               u.username AS creator_login,
               COALESCE(u.full_name, u.username) AS creator_name
        FROM meeting_proposals mp
        JOIN users u ON u.id = mp.creator_id
        WHERE mp.group_id = :group_id
          AND COALESCE(mp.status, 'open') = 'open'
          AND (
                mp.shadow_event_id IS NULL
                OR EXISTS (SELECT 1 FROM events e WHERE e.id = mp.shadow_event_id)
          )
        ORDER BY mp.date ASC, mp.start_time ASC, mp.id DESC
        LIMIT :limit
    """), {"group_id": group_id, "limit": limit}).fetchall()
    return [_serialize_proposal_row(row, current_user.id, db) for row in rows]


@app.post("/api/meeting-proposals")
def create_meeting_proposal(payload: dict, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    _cleanup_orphan_meeting_proposals(db)
    group_id = int(payload.get("group_id") or 0)
    title = str(payload.get("title") or "").strip()
    description = str(payload.get("description") or "").strip()
    date_value = str(payload.get("date") or "").strip()
    start_time_value = str(payload.get("start_time") or "").strip()
    end_time_value = str(payload.get("end_time") or "").strip()

    if not group_id or not title or not date_value or not start_time_value or not end_time_value:
        raise HTTPException(status_code=400, detail="Заполните группу, название, дату, начало и конец")

    _proposal_membership_or_404(group_id, current_user, db)

    try:
        parsed_date = dt_date.fromisoformat(date_value)
        parsed_start = datetime.strptime(start_time_value[:5], "%H:%M").time()
        parsed_end = datetime.strptime(end_time_value[:5], "%H:%M").time()
    except ValueError:
        raise HTTPException(status_code=400, detail="Неверный формат даты или времени")

    if parsed_start >= parsed_end:
        raise HTTPException(status_code=400, detail="Конец встречи должен быть позже начала")

    row = db.execute(text("""
        INSERT INTO meeting_proposals (group_id, creator_id, title, description, date, start_time, end_time, status)
        VALUES (:group_id, :creator_id, :title, :description, :date, :start_time, :end_time, 'open')
    """), {
        "group_id": group_id,
        "creator_id": current_user.id,
        "title": title,
        "description": description,
        "date": parsed_date,
        "start_time": parsed_start.strftime("%H:%M:%S"),
        "end_time": parsed_end.strftime("%H:%M:%S"),
    })
    proposal_id = row.lastrowid

    shadow_event = models.Event(
        title=f"🗳️ {title}",
        description=f"[proposal:{proposal_id}]\n{description}" if description else f"[proposal:{proposal_id}]",
        date=parsed_date,
        start_time=parsed_start,
        end_time=parsed_end,
        user_id=current_user.id,
        group_id=group_id,
    )
    db.add(shadow_event)
    db.flush()
    db.execute(text("UPDATE meeting_proposals SET shadow_event_id=:event_id WHERE id=:proposal_id"), {"event_id": shadow_event.id, "proposal_id": proposal_id})
    db.execute(text("""
        INSERT INTO meeting_proposal_votes (proposal_id, user_id, vote)
        VALUES (:proposal_id, :user_id, 'yes')
    """), {"proposal_id": proposal_id, "user_id": current_user.id})
    db.commit()
    member_ids = [row[0] for row in db.query(models.GroupMember.user_id).filter(models.GroupMember.group_id == group_id, models.GroupMember.user_id != current_user.id).all()]
    if member_ids:
        group = db.query(models.Group).filter_by(id=group_id).first()
        _send_push_to_users_async(member_ids, f"Новый сбор в группе «{group.name if group else 'OpenTime'}»", f"{current_user.full_name or current_user.username}: {title} · {parsed_date.strftime('%d.%m')} {parsed_start.strftime('%H:%M')}–{parsed_end.strftime('%H:%M')}", "/", "opentime-proposal")

    created = db.execute(text("""
        SELECT mp.*,
               u.username AS creator_login,
               COALESCE(u.full_name, u.username) AS creator_name
        FROM meeting_proposals mp
        JOIN users u ON u.id = mp.creator_id
        WHERE mp.id = :proposal_id
    """), {"proposal_id": proposal_id}).fetchone()
    return _serialize_proposal_row(created, current_user.id, db)


@app.get("/api/meeting-proposals/{proposal_id}")
def get_meeting_proposal(proposal_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    _cleanup_orphan_meeting_proposals(db)
    row = db.execute(text("""
        SELECT mp.*,
               u.username AS creator_login,
               COALESCE(u.full_name, u.username) AS creator_name
        FROM meeting_proposals mp
        JOIN users u ON u.id = mp.creator_id
        WHERE mp.id = :proposal_id
    """), {"proposal_id": proposal_id}).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Предложение встречи не найдено")
    _proposal_membership_or_404(row.group_id, current_user, db)
    return _serialize_proposal_row(row, current_user.id, db)


@app.post("/api/meeting-proposals/{proposal_id}/vote")
def vote_for_meeting_proposal(proposal_id: int, payload: dict, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    _cleanup_orphan_meeting_proposals(db)
    vote = str(payload.get("vote") or "").strip().lower()
    if vote not in {"yes", "no", "maybe"}:
        raise HTTPException(status_code=400, detail="Голос должен быть yes, no или maybe")

    row = db.execute(text("""
        SELECT mp.*,
               u.username AS creator_login,
               COALESCE(u.full_name, u.username) AS creator_name
        FROM meeting_proposals mp
        JOIN users u ON u.id = mp.creator_id
        WHERE mp.id = :proposal_id
    """), {"proposal_id": proposal_id}).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Предложение встречи не найдено")
    _proposal_membership_or_404(row.group_id, current_user, db)

    db.execute(text("""
        INSERT INTO meeting_proposal_votes (proposal_id, user_id, vote, created_at, updated_at)
        VALUES (:proposal_id, :user_id, :vote, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(proposal_id, user_id)
        DO UPDATE SET vote=excluded.vote, updated_at=CURRENT_TIMESTAMP
    """), {"proposal_id": proposal_id, "user_id": current_user.id, "vote": vote})
    db.commit()

    fresh = db.execute(text("""
        SELECT mp.*,
               u.username AS creator_login,
               COALESCE(u.full_name, u.username) AS creator_name
        FROM meeting_proposals mp
        JOIN users u ON u.id = mp.creator_id
        WHERE mp.id = :proposal_id
    """), {"proposal_id": proposal_id}).fetchone()
    return _serialize_proposal_row(fresh, current_user.id, db)



@app.put("/api/meeting-proposals/{proposal_id}")
def update_meeting_proposal(proposal_id: int, payload: dict, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    _cleanup_orphan_meeting_proposals(db)
    row = db.execute(text("""
        SELECT mp.*,
               u.username AS creator_login,
               COALESCE(u.full_name, u.username) AS creator_name
        FROM meeting_proposals mp
        JOIN users u ON u.id = mp.creator_id
        WHERE mp.id = :proposal_id AND COALESCE(mp.status, 'open') = 'open'
    """), {"proposal_id": proposal_id}).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Предложение встречи не найдено")
    if row.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Редактировать можно только своё предложение встречи")

    title = str(payload.get("title") or row.title).strip()
    description = str(payload.get("description") or "").strip()
    date_value = str(payload.get("date") or row.date).strip()
    start_time_value = str(payload.get("start_time") or row.start_time).strip()[:5]
    end_time_value = str(payload.get("end_time") or row.end_time).strip()[:5]

    try:
        parsed_date = dt_date.fromisoformat(date_value)
        parsed_start = datetime.strptime(start_time_value[:5], "%H:%M").time()
        parsed_end = datetime.strptime(end_time_value[:5], "%H:%M").time()
    except ValueError:
        raise HTTPException(status_code=400, detail="Неверный формат даты или времени")
    if parsed_start >= parsed_end:
        raise HTTPException(status_code=400, detail="Конец встречи должен быть позже начала")

    db.execute(text("""
        UPDATE meeting_proposals
        SET title=:title, description=:description, date=:date, start_time=:start_time, end_time=:end_time
        WHERE id=:proposal_id
    """), {
        "proposal_id": proposal_id,
        "title": title,
        "description": description,
        "date": parsed_date,
        "start_time": parsed_start.strftime("%H:%M:%S"),
        "end_time": parsed_end.strftime("%H:%M:%S"),
    })
    if row.shadow_event_id:
        shadow = db.query(models.Event).filter_by(id=row.shadow_event_id).first()
        if shadow:
            shadow.title = f"🗳️ {title}"
            shadow.description = f"[proposal:{proposal_id}]\n{description}" if description else f"[proposal:{proposal_id}]"
            shadow.date = parsed_date
            shadow.start_time = parsed_start
            shadow.end_time = parsed_end
    db.commit()
    fresh = db.execute(text("""
        SELECT mp.*,
               u.username AS creator_login,
               COALESCE(u.full_name, u.username) AS creator_name
        FROM meeting_proposals mp
        JOIN users u ON u.id = mp.creator_id
        WHERE mp.id = :proposal_id
    """), {"proposal_id": proposal_id}).fetchone()
    return _serialize_proposal_row(fresh, current_user.id, db)


@app.delete("/api/meeting-proposals/{proposal_id}")
def delete_meeting_proposal(proposal_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    _cleanup_orphan_meeting_proposals(db)
    row = db.execute(text("SELECT id, creator_id, shadow_event_id FROM meeting_proposals WHERE id = :proposal_id AND COALESCE(status, 'open') = 'open'"), {"proposal_id": proposal_id}).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Предложение встречи не найдено")
    if row.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Удалить можно только своё предложение встречи")
    db.execute(text("DELETE FROM meeting_proposal_votes WHERE proposal_id = :proposal_id"), {"proposal_id": proposal_id})
    db.execute(text("DELETE FROM meeting_proposals WHERE id = :proposal_id"), {"proposal_id": proposal_id})
    if row.shadow_event_id:
        shadow = db.query(models.Event).filter_by(id=row.shadow_event_id).first()
        if shadow:
            db.delete(shadow)
    db.commit()
    return {"detail": "Предложение встречи удалено"}


@app.get("/")
def read_root():
    return {"message": "Календарь совместных планов API работает!"}


@app.get("/api/health")
def health_check():
    return {"status": "healthy", "database": "SQLite"}
