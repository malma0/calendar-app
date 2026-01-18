from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List
import secrets

from database import SessionLocal, engine, get_db
import models
import schemas
from auth import (
    get_password_hash, verify_password,
    create_access_token, get_current_user
)

# Создаём таблицы
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Календарь совместных планов API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "http://127.0.0.1:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# Регистрация пользователя
@app.post("/api/register", response_model=schemas.UserResponse)
def register(user: schemas.UserCreate, db: Session = Depends(get_db)):
    # Проверяем, существует ли пользователь
    db_user = db.query(models.User).filter(
        (models.User.email == user.email) | 
        (models.User.username == user.username)
    ).first()
    
    if db_user:
        raise HTTPException(
            status_code=400,
            detail="Email или имя пользователя уже заняты"
        )
    
    # Создаём нового пользователя
    hashed_password = get_password_hash(user.password)
    db_user = models.User(
        email=user.email,
        username=user.username,
        full_name=user.full_name,
        hashed_password=hashed_password
    )
    
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    return db_user

# Вход
@app.post("/api/token", response_model=schemas.Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверное имя пользователя или пароль",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=30)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}

# Получить текущего пользователя
@app.get("/api/users/me", response_model=schemas.UserResponse)
def read_users_me(current_user: models.User = Depends(get_current_user)):
    return current_user

# Создать событие
@app.post("/api/events", response_model=schemas.EventResponse)
def create_event(
    event: schemas.EventCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Проверяем, что группа существует и пользователь в ней
    group = db.query(models.Group).filter(
        models.Group.id == event.group_id,
        models.Group.members.any(id=current_user.id)
    ).first()
    
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена или вы не состоите в ней")
    
    db_event = models.Event(
        **event.dict(),
        user_id=current_user.id
    )
    
    db.add(db_event)
    db.commit()
    db.refresh(db_event)
    
    return db_event

# Получить события за месяц
@app.get("/api/events", response_model=List[schemas.EventResponse])
def get_events(
    group_id: int = None,
    year: int = None,
    month: int = None,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(models.Event).join(models.Group).filter(
        models.Group.members.any(id=current_user.id)
    )
    
    if group_id:
        query = query.filter(models.Event.group_id == group_id)
    
    if year and month:
        # Фильтруем по месяцу
        query = query.filter(
            models.Event.date >= f"{year}-{month:02d}-01",
            models.Event.date < f"{year}-{month+1:02d}-01" if month < 12 else f"{year+1}-01-01"
        )
    
    events = query.order_by(models.Event.date, models.Event.start_time).all()
    return events

# Создать группу
@app.post("/api/groups", response_model=schemas.GroupResponse)
def create_group(
    group: schemas.GroupCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    import uuid
    
    db_group = models.Group(
        name=group.name,
        description=group.description,
        invite_code=str(uuid.uuid4())[:8].upper(),
        owner_id=current_user.id
    )
    
    db.add(db_group)
    db.commit()
    db.refresh(db_group)
    
    # Добавляем создателя в группу
    db_group.members.append(current_user)
    db.commit()
    
    return db_group

# Получить мои группы
@app.get("/api/groups", response_model=List[schemas.GroupResponse])
def get_my_groups(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    groups = db.query(models.Group).filter(
        models.Group.members.any(id=current_user.id)
    ).all()
    
    return groups

# Тестовые роуты
@app.get("/")
def read_root():
    return {"message": "Календарь совместных планов API работает!"}

@app.get("/api/health")
def health_check():
    return {"status": "healthy", "database": "SQLite"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)