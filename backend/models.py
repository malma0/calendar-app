from __future__ import annotations

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Date, Time, Table, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from database import Base

group_members = Table(
    "group_members",
    Base.metadata,
    Column("group_id", Integer, ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    UniqueConstraint("group_id", "user_id", name="uq_group_user"),
)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)

    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)

    hashed_password = Column(String, nullable=False)

    full_name = Column(String, nullable=True)
    color = Column(String, default="#007AFF", nullable=False)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    groups = relationship("Group", secondary=group_members, back_populates="members")
    events = relationship("Event", back_populates="user", cascade="all, delete-orphan")


class Group(Base):
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    description = Column(String, nullable=True)

    invite_code = Column(String, unique=True, index=True, nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    members = relationship("User", secondary=group_members, back_populates="groups")
    events = relationship("Event", back_populates="group", cascade="all, delete-orphan")


class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)

    title = Column(String, index=True, nullable=False)
    description = Column(String, nullable=True)

    date = Column(Date, index=True, nullable=False)
    start_time = Column(Time, nullable=True)
    end_time = Column(Time, nullable=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    user = relationship("User", back_populates="events")
    group = relationship("Group", back_populates="events")