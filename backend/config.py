import os
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv(Path(__file__).with_name(".env"))

MONGO_URI = os.getenv("MONGO_URI", "mongodb://127.0.0.1:27017/")
client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
db = client["hotel_db"]

customers = db["customers"]
rooms = db["rooms"]
bookings = db["bookings"]


def check_database():
    client.admin.command("ping")
