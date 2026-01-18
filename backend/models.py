from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Date, Time, Table
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

# Таблица связи пользователей и групп
group_members = Table('group_members', Base.metadata,
    Column('group_id', Integer, ForeignKey('groups.id')),
    Column('user_id', Integer, ForeignKey('users.id'))
)

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    full_name = Column(String)
    color = Column(String, default="#007AFF")  # Цвет пользователя
    created_at = Column(DateTime, default=func.now())
    
    # Связи
    groups = relationship("Group", secondary=group_members, back_populates="members")
    events = relationship("Event", back_populates="user")

class Group(Base):
    __tablename__ = "groups"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(String)
    invite_code = Column(String, unique=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=func.now())
    
    # Связи
    members = relationship("User", secondary=group_members, back_populates="groups")
    events = relationship("Event", back_populates="group")

class Event(Base):
    __tablename__ = "events"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    description = Column(String)
    date = Column(Date, index=True)  # Только дата
    start_time = Column(Time)  # Время начала
    end_time = Column(Time)    # Время окончания
    user_id = Column(Integer, ForeignKey("users.id"))
    group_id = Column(Integer, ForeignKey("groups.id"))
    created_at = Column(DateTime, default=func.now())
    
    # Связи
    user = relationship("User", back_populates="events")
    group = relationship("Group", back_populates="events")