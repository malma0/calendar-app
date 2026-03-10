from __future__ import annotations

import random
import secrets
from datetime import date as dt_date, datetime, timedelta
from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException, status, Query
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
    _ensure_groups_columns()
    _ensure_group_members_columns()


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


@app.get("/api/users/me", response_model=schemas.UserResponse)
def read_users_me(current_user: models.User = Depends(get_current_user)):
    return current_user


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
    db.commit()
    db.refresh(current_user)
    return current_user


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
    return db_group


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
        setattr(group, "member_color", member_color or current_user.color or "#007AFF")
        result.append(group)
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
    return group


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
    return group


@app.post("/api/groups/{group_id}/leave")
def leave_group(group_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    group = db.query(models.Group).filter_by(id=group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")
    if group.owner_id == current_user.id:
        raise HTTPException(status_code=400, detail="Создатель не может выйти из группы. Удалите группу или передайте владение.")
    membership = db.query(models.GroupMember).filter_by(group_id=group_id, user_id=current_user.id).first()
    if membership:
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
    return group


@app.put("/api/users/me/color", response_model=schemas.UserResponse)
def update_my_color(payload: schemas.UserColorUpdate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    current_user.color = payload.color
    db.commit()
    db.refresh(current_user)
    return current_user


@app.post("/api/events", response_model=schemas.EventResponse)
def create_event(event: schemas.EventCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    allowed = db.query(models.GroupMember).filter_by(group_id=event.group_id, user_id=current_user.id).first()
    if not allowed:
        raise HTTPException(status_code=404, detail="Группа не найдена или вы не состоите в ней")
    if event.start_time and event.end_time and event.start_time >= event.end_time:
        raise HTTPException(status_code=400, detail="end_time должно быть позже start_time")
    db_event = models.Event(
        title=event.title,
        description=event.description,
        date=event.date,
        start_time=event.start_time,
        end_time=event.end_time,
        user_id=current_user.id,
        group_id=event.group_id,
    )
    db.add(db_event)
    db.commit()
    db.refresh(db_event)
    return {
        **db_event.__dict__,
        "creator_login": current_user.username,
        "creator_name": current_user.full_name or current_user.username,
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
    db.commit()
    db.refresh(ev)
    membership = db.query(models.GroupMember).filter_by(group_id=ev.group_id, user_id=current_user.id).first()
    return {
        **ev.__dict__,
        "creator_login": current_user.username,
        "creator_name": current_user.full_name or current_user.username,
        "color": membership.color if membership and membership.color else current_user.color or "#007AFF",
    }


@app.delete("/api/events/{event_id}")
def delete_event(event_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    ev = db.query(models.Event).filter_by(id=event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Событие не найдено")
    if ev.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Удалить можно только своё событие")
    db.delete(ev)
    db.commit()
    return {"detail": "Событие удалено"}


@app.get("/api/events", response_model=List[schemas.EventResponse])
def get_events(group_id: Optional[int] = Query(default=None), year: Optional[int] = Query(default=None, ge=1900, le=3000), month: Optional[int] = Query(default=None, ge=1, le=12), current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
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
        out.append({
            "id": ev.id,
            "title": ev.title,
            "description": ev.description,
            "date": ev.date,
            "start_time": ev.start_time,
            "end_time": ev.end_time,
            "user_id": ev.user_id,
            "group_id": ev.group_id,
            "created_at": ev.created_at,
            "creator_login": user.username,
            "creator_name": user.full_name or user.username,
            "color": member_color or user.color or "#007AFF",
        })
    return out


@app.get("/")
def read_root():
    return {"message": "Календарь совместных планов API работает!"}


@app.get("/api/health")
def health_check():
    return {"status": "healthy", "database": "SQLite"}
