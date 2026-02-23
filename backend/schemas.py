from __future__ import annotations

from datetime import date, time, datetime
from typing import Optional, List

from pydantic import BaseModel, EmailStr, Field


# ===== USERS =====
class UserBase(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=50)
    full_name: Optional[str] = None


class UserCreate(UserBase):
    password: str = Field(min_length=6, max_length=128)


class UserResponse(UserBase):
    id: int
    color: str
    created_at: datetime

    class Config:
        from_attributes = True


# ===== GROUPS =====
class GroupBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
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

class GroupUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=120)

# ===== EVENTS =====
class EventBase(BaseModel):
    title: str = Field(min_length=1, max_length=200)
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


# ===== TOKEN =====
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

    class GroupUpdate(BaseModel):
        name: str = Field(min_length=1, max_length=120)


class GroupMember(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None
    color: str

    class Config:
        from_attributes = True


class UserColorUpdate(BaseModel):
    color: str = Field(min_length=4, max_length=20)  # например "#RRGGBB"