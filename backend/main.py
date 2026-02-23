from __future__ import annotations

import uuid
from datetime import date as dt_date, timedelta
from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

import models
import schemas
from auth import get_password_hash, verify_password, create_access_token, get_current_user
from database import engine, get_db

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Календарь совместных планов API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8080",
        "http://127.0.0.1:8080",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ===== AUTH =====
@app.post("/api/register", response_model=schemas.UserResponse)
def register(user: schemas.UserCreate, db: Session = Depends(get_db)):
    exists = (
        db.query(models.User)
        .filter((models.User.email == user.email) | (models.User.username == user.username))
        .first()
    )
    if exists:
        raise HTTPException(status_code=400, detail="Email или имя пользователя уже заняты")

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


@app.post("/api/token", response_model=schemas.Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    # OAuth2PasswordRequestForm использует поле "username" (мы кладем туда username)
    user = db.query(models.User).filter(models.User.username == form_data.username).first()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверное имя пользователя или пароль",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token(
        data={"sub": user.username},
        expires_delta=timedelta(minutes=30),
    )
    return schemas.Token(access_token=token)


@app.get("/api/users/me", response_model=schemas.UserResponse)
def read_users_me(current_user: models.User = Depends(get_current_user)):
    return current_user


# ===== GROUPS =====
@app.post("/api/groups", response_model=schemas.GroupResponse)
def create_group(
    group: schemas.GroupCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db_group = models.Group(
        name=group.name,
        description=group.description,
        invite_code=str(uuid.uuid4())[:8].upper(),
        owner_id=current_user.id,
    )
    db.add(db_group)
    db.commit()
    db.refresh(db_group)

    # добавляем создателя в участники
    db_group.members.append(current_user)
    db.commit()
    db.refresh(db_group)
    return db_group


@app.get("/api/groups", response_model=List[schemas.GroupResponse])
def get_my_groups(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return db.query(models.Group).filter(models.Group.members.any(id=current_user.id)).all()

@app.get("/api/groups/{group_id}", response_model=schemas.GroupResponse)
def get_group(
    group_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = (
        db.query(models.Group)
        .filter(models.Group.id == group_id, models.Group.members.any(id=current_user.id))
        .first()
    )
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена или вы не состоите в ней")
    return group


@app.get("/api/groups/{group_id}/members", response_model=List[schemas.GroupMember])
def get_group_members(
    group_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = (
        db.query(models.Group)
        .filter(models.Group.id == group_id, models.Group.members.any(id=current_user.id))
        .first()
    )
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена или вы не состоите в ней")
    return group.members


@app.put("/api/groups/{group_id}", response_model=schemas.GroupResponse)
def update_group(
    group_id: int,
    payload: schemas.GroupUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = (
        db.query(models.Group)
        .filter(models.Group.id == group_id, models.Group.members.any(id=current_user.id))
        .first()
    )
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена или вы не состоите в ней")

    # только владелец/админ
    if group.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Только админ группы может менять название")

    group.name = payload.name
    db.commit()
    db.refresh(group)
    return group


@app.put("/api/users/me/color", response_model=schemas.UserResponse)
def update_my_color(
    payload: schemas.UserColorUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user.color = payload.color
    db.commit()
    db.refresh(current_user)
    return current_user

# ===== EVENTS =====
@app.post("/api/events", response_model=schemas.EventResponse)
def create_event(
    event: schemas.EventCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # группа существует и пользователь участник
    group = (
        db.query(models.Group)
        .filter(models.Group.id == event.group_id, models.Group.members.any(id=current_user.id))
        .first()
    )
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена или вы не состоите в ней")

    # валидация времени
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
    return db_event


@app.get("/api/events", response_model=List[schemas.EventResponse])
def get_events(
    group_id: Optional[int] = Query(default=None),
    year: Optional[int] = Query(default=None, ge=1900, le=3000),
    month: Optional[int] = Query(default=None, ge=1, le=12),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # только группы, где пользователь состоит
    q = db.query(models.Event).join(models.Group).filter(models.Group.members.any(id=current_user.id))

    if group_id is not None:
        q = q.filter(models.Event.group_id == group_id)

    if year is not None and month is not None:
        start = dt_date(year, month, 1)
        if month == 12:
            end = dt_date(year + 1, 1, 1)
        else:
            end = dt_date(year, month + 1, 1)
        q = q.filter(models.Event.date >= start, models.Event.date < end)

    return q.order_by(models.Event.date.asc(), models.Event.start_time.asc().nulls_last()).all()


# ===== HEALTH =====
@app.get("/")
def read_root():
    return {"message": "Календарь совместных планов API работает!"}


@app.get("/api/health")
def health_check():
    return {"status": "healthy", "database": "SQLite"}