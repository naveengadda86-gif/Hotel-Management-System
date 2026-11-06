from datetime import datetime

from bson import ObjectId
from flask import Flask, jsonify, request
from flask_cors import CORS
from pymongo import ReturnDocument

from config import bookings, check_database, customers, rooms

app = Flask(__name__)
CORS(app)

TOTAL_FLOORS = 5
ROOM_TYPES_PER_FLOOR = (
    ["Standard"] * 4
    + ["Deluxe"] * 3
    + ["Suite"] * 2
    + ["Family"]
)


def serialize_document(document):
    """Convert MongoDB IDs to strings so documents can be returned as JSON."""
    if not document:
        return document
    result = dict(document)
    for key, value in result.items():
        if isinstance(value, ObjectId):
            result[key] = str(value)
    return result


def initialize_hotel_rooms():
    """Create the fixed 50-room inventory without overwriting existing room status."""
    for floor in range(1, TOTAL_FLOORS + 1):
        for position, room_type in enumerate(ROOM_TYPES_PER_FLOOR, start=1):
            room_number = f"{floor}{position:02d}"
            rooms.update_one(
                {"floor": floor, "room_number": room_number},
                {
                    "$setOnInsert": {
                        "room_number": room_number,
                        "floor": floor,
                        "room_type": room_type,
                        "price": 0,
                        "status": "Available",
                        "created_at": datetime.now().isoformat(timespec="seconds"),
                    }
                },
                upsert=True,
            )


def dashboard_data():
    total = rooms.count_documents({})
    booked = rooms.count_documents({"status": "Booked"})
    available = total - booked
    prices = [
        float(item.get("price", 0))
        for item in rooms.find({}, {"price": 1, "_id": 0})
        if item.get("price") is not None
    ]

    floor_summary = []
    for floor in range(1, TOTAL_FLOORS + 1):
        floor_total = rooms.count_documents({"floor": floor})
        floor_booked = rooms.count_documents({"floor": floor, "status": "Booked"})
        floor_available = floor_total - floor_booked
        floor_summary.append({
            "floor": floor,
            "capacity": 10,
            "total_rooms": floor_total,
            "available_rooms": floor_available,
            "booked_rooms": floor_booked,
            "remaining_slots": max(0, 10 - floor_total),
        })

    return {
        "total_rooms": total,
        "available_rooms": available,
        "booked_rooms": booked,
        "room_types": len(rooms.distinct("room_type")),
        "min_price": min(prices) if prices else 0,
        "max_price": max(prices) if prices else 0,
        "floors": floor_summary,
    }


@app.get("/")
def home():
    return jsonify({
        "message": "GrandStay Hotel Management API is running",
        "endpoints": ["/health", "/rooms", "/dashboard-stats", "/book", "/bookings", "/checkout/<booking_id>"],
    })


@app.get("/health")
def health():
    check_database()
    return jsonify({"status": "ok", "database": "connected"})


@app.get("/rooms")
def get_rooms():
    result = [
        serialize_document(room)
        for room in rooms.find().sort([("floor", 1), ("room_number", 1)])
    ]
    return jsonify(result)


@app.post("/rooms")
def add_room():
    # The hotel uses a fixed 50-room inventory generated at startup.
    return jsonify({
        "message": "The hotel already has 50 rooms. Room inventory is created automatically."
    }), 409


@app.put("/rooms/<int:floor>/<room_number>/price")
def update_room_price(floor, room_number):
    data = request.get_json(silent=True) or {}
    try:
        price = float(data.get("price"))
        if price < 0:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({"message": "Enter a valid non-negative room rent per night."}), 400

    result = rooms.update_one(
        {"floor": floor, "room_number": room_number},
        {"$set": {"price": round(price, 2), "updated_at": datetime.now().isoformat(timespec="seconds")}},
    )
    if result.matched_count == 0:
        return jsonify({"message": "Room not found."}), 404
    return jsonify({"message": f"Room {room_number} rent updated to ₹{price:,.2f} per night.", **dashboard_data()})


@app.get("/dashboard-stats")
def get_dashboard_stats():
    return jsonify(dashboard_data())


@app.post("/book")
def book_room():
    data = request.get_json(silent=True) or {}
    room_number = str(data.get("room_number", "")).strip()
    customer_name = str(data.get("customer_name", "")).strip()
    phone = str(data.get("phone", "")).strip()

    try:
        floor = int(data.get("floor", 1))
    except (TypeError, ValueError):
        return jsonify({"message": "Please select a valid floor."}), 400

    if not room_number or not customer_name or not phone:
        return jsonify({"message": "Room, customer name and phone number are required."}), 400

    check_in_date = str(data.get("check_in_date", "")).strip()
    check_out_date = str(data.get("check_out_date", "")).strip()
    try:
        check_in = datetime.strptime(check_in_date, "%Y-%m-%d").date()
        check_out = datetime.strptime(check_out_date, "%Y-%m-%d").date()
        nights = (check_out - check_in).days
        if nights < 1:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({"message": "Choose valid check-in and check-out dates. Check-out must be at least one day after check-in."}), 400

    # Atomically reserve only a room that is currently available.
    room = rooms.find_one_and_update(
        {
            "room_number": room_number,
            "floor": floor,
            "status": "Available",
        },
        {"$set": {"status": "Booked", "booked_at": datetime.now().isoformat(timespec="seconds")}},
        return_document=ReturnDocument.BEFORE,
    )
    if room is None:
        return jsonify({"message": "This room is already booked or does not exist."}), 409

    customer_id = None
    try:
        now = datetime.now().isoformat(timespec="seconds")
        customer_result = customers.insert_one({
            "name": customer_name,
            "phone": phone,
            "created_at": now,
        })
        customer_id = customer_result.inserted_id

        booking_result = bookings.insert_one({
            "customer_name": customer_name,
            "phone": phone,
            "customer_id": customer_id,
            "room_number": room_number,
            "floor": floor,
            "room_type": room.get("room_type", "Standard"),
            "price": float(room.get("price", 0) or 0),
            "price_per_night": float(room.get("price", 0) or 0),
            "check_in_date": check_in_date,
            "check_out_date": check_out_date,
            "nights": nights,
            "total_price": round(float(room.get("price", 0) or 0) * nights, 2),
            "booking_date": now,
            "status": "Booked",
        })
    except Exception:
        rooms.update_one(
            {"_id": room["_id"], "status": "Booked"},
            {"$set": {"status": "Available"}, "$unset": {"booked_at": ""}},
        )
        if customer_id is not None:
            customers.delete_one({"_id": customer_id})
        app.logger.exception("Booking could not be saved")
        return jsonify({"message": "Booking failed. The room has been made available again."}), 500

    return jsonify({
        "message": f"Room {room_number} on Floor {floor} booked successfully.",
        "booking_id": str(booking_result.inserted_id),
        **dashboard_data(),
    }), 201


@app.get("/bookings")
def get_bookings():
    result = [
        serialize_document(booking)
        for booking in bookings.find().sort("_id", -1)
    ]
    return jsonify(result)


@app.post("/checkout/<booking_id>")
def checkout_room(booking_id):
    if not ObjectId.is_valid(booking_id):
        return jsonify({"message": "Invalid booking ID."}), 400

    booking_object_id = ObjectId(booking_id)
    now = datetime.now().isoformat(timespec="seconds")

    # Claim the active booking first so it cannot be checked out twice.
    booking = bookings.find_one_and_update(
        {"_id": booking_object_id, "status": "Booked"},
        {"$set": {"status": "Checked Out", "checkout_date": now}},
        return_document=ReturnDocument.BEFORE,
    )
    if booking is None:
        existing = bookings.find_one({"_id": booking_object_id})
        if existing is None:
            return jsonify({"message": "Booking not found."}), 404
        return jsonify({"message": "This booking has already been checked out."}), 409

    room_result = rooms.update_one(
        {
            "room_number": booking.get("room_number"),
            "floor": int(booking.get("floor", 1)),
            "status": "Booked",
        },
        {
            "$set": {
                "status": "Available",
                "last_checkout_at": now,
            },
            "$unset": {"booked_at": ""},
        },
    )

    if room_result.modified_count != 1:
        # Restore the booking status if the room could not be released.
        bookings.update_one(
            {"_id": booking_object_id, "status": "Checked Out", "checkout_date": now},
            {"$set": {"status": "Booked"}, "$unset": {"checkout_date": ""}},
        )
        return jsonify({"message": "Room could not be released. Please check its current status."}), 409

    return jsonify({
        "message": f"Room {booking.get('room_number')} checked out successfully.",
        "room_status": "Available",
        **dashboard_data(),
    })


if __name__ == "__main__":
    try:
        check_database()
        initialize_hotel_rooms()
        print("MongoDB connected successfully!")
        print("Hotel inventory ready: 50 rooms across 5 floors.")
        print("Backend API: http://127.0.0.1:5000")
        app.run(host="127.0.0.1", port=5000, debug=True)
    except Exception as error:
        print("Could not start the backend. Check MongoDB connection:", error)
