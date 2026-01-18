from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# SQLite - файл базы данных в папке проекта
DATABASE_URL = "sqlite:///./calendar.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": True})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()