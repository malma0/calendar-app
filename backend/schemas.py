from pydantic import BaseModel
from datetime import date, time, datetime
from typing import Optional

# Схемы для пользователей
class UserBase(BaseModel):
    email: str
    username: str
    full_name: Optional[str] = None

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class UserResponse(UserBase):
    id: int
    color: str
    created_at: datetime
    
    class Config:
        from_attributes = True

# Схемы для событий
class EventBase(BaseModel):
    title: str
    description: Optional[str] = None
    date: date
    start_time: Optional[time] = None
    end_time: Optional[time] = None

class EventCreate(EventBase):
    group_id: int

class EventResponse(EventBase):
    id: int
    user_id: int
    group_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

# Схемы для групп
class GroupBase(BaseModel):
    name: str
    description: Optional[str] = None

class GroupCreate(GroupBase):
    pass

class GroupResponse(GroupBase):
    id: int
    owner_id: int
    invite_code: str
    created_at: datetime
    
    class Config:
        from_attributes = True

# Токены
class Token(BaseModel):
    access_token: str
    token_type: str