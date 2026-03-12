from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Date, Time
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)

    full_name = Column(String, nullable=True)
    avatar = Column(Text, nullable=True)
    color = Column(String, nullable=True, default="#007AFF")
    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)

    reset_token = Column(String, nullable=True)
    reset_token_expires_at = Column(DateTime, nullable=True)

    memberships = relationship("GroupMember", back_populates="user", cascade="all, delete-orphan")
    events = relationship("Event", back_populates="user", cascade="all, delete-orphan")


class Group(Base):
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    invite_code = Column(String, unique=True, index=True, nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)

    members = relationship("GroupMember", back_populates="group", cascade="all, delete-orphan")
    events = relationship("Event", back_populates="group", cascade="all, delete-orphan")


class GroupMember(Base):
    __tablename__ = "group_members"

    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    group_id = Column(Integer, ForeignKey("groups.id"), primary_key=True)
    color = Column(String, nullable=True, default="#007AFF")

    user = relationship("User", back_populates="memberships")
    group = relationship("Group", back_populates="members")


class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    date = Column(Date, nullable=False)
    start_time = Column(Time, nullable=True)
    end_time = Column(Time, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False)
    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)

    user = relationship("User", back_populates="events")
    group = relationship("Group", back_populates="events")
