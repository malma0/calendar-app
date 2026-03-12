from __future__ import annotations

from datetime import date, time, datetime
from typing import Optional, List

from pydantic import BaseModel, EmailStr, Field


class UserBase(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=50)
    full_name: Optional[str] = None


class UserCreate(UserBase):
    password: str = Field(min_length=6, max_length=128)


class UserUpdate(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    full_name: Optional[str] = None
    avatar: Optional[str] = None


class UserResponse(UserBase):
    id: int
    color: str = "#007AFF"
    created_at: Optional[datetime] = None
    avatar: Optional[str] = None

    class Config:
        orm_mode = True
        from_attributes = True


class GroupBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: Optional[str] = None


class GroupCreate(GroupBase):
    pass


class GroupUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class GroupResponse(GroupBase):
    id: int
    owner_id: int
    invite_code: str
    created_at: Optional[datetime] = None
    member_color: Optional[str] = None

    class Config:
        orm_mode = True
        from_attributes = True


class GroupMember(BaseModel):
    id: int
    login: str
    name: Optional[str] = None
    color: str = "#007AFF"
    avatar: Optional[str] = None

    class Config:
        orm_mode = True
        from_attributes = True


class UserColorUpdate(BaseModel):
    color: str = Field(min_length=4, max_length=20)


class EventBase(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    date: date
    start_time: Optional[time] = None
    end_time: Optional[time] = None


class EventCreate(EventBase):
    group_id: int


class EventUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    date: date
    start_time: Optional[time] = None
    end_time: Optional[time] = None


class EventResponse(EventBase):
    id: int
    user_id: int
    group_id: int
    created_at: Optional[datetime] = None
    creator_login: Optional[str] = None
    creator_name: Optional[str] = None
    creator_avatar: Optional[str] = None
    color: Optional[str] = None

    class Config:
        orm_mode = True
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str
