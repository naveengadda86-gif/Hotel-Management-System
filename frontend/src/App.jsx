import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";

const API_URL = (import.meta.env.VITE_API_URL || "http://127.0.0.1:5000").replace(/\/$/, "");

const initialStats = {
  total_rooms: 0,
  available_rooms: 0,
  booked_rooms: 0,
  room_types: 0,
  min_price: 0,
  max_price: 0,
  floors: [],
};

function App() {
  const [rooms, setRooms] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [stats, setStats] = useState(initialStats);
  const [bookingForm, setBookingForm] = useState({
    room_key: "",
    customer_name: "",
    phone: "",
    check_in_date: new Date().toISOString().slice(0, 10),
    check_out_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
  });
  const [priceEdits, setPriceEdits] = useState({});
  const [loading, setLoading] = useState(false);
  const [savingBooking, setSavingBooking] = useState(false);
  const [checkingOut, setCheckingOut] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const availableRooms = useMemo(
    () => rooms.filter((room) => room.status === "Available"),
    [rooms]
  );

  const selectedRoom = availableRooms.find(
    (room) => `${room.floor}-${room.room_number}` === bookingForm.room_key
  );
  const stayNights = Math.max(
    0,
    Math.round((new Date(`${bookingForm.check_out_date}T00:00:00`) - new Date(`${bookingForm.check_in_date}T00:00:00`)) / 86400000)
  );
  const estimatedTotal = selectedRoom ? Number(selectedRoom.price || 0) * stayNights : 0;

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [roomsResponse, statsResponse, bookingsResponse] = await Promise.all([
        fetch(`${API_URL}/rooms`),
        fetch(`${API_URL}/dashboard-stats`),
        fetch(`${API_URL}/bookings`),
      ]);

      if (!roomsResponse.ok || !statsResponse.ok || !bookingsResponse.ok) {
        throw new Error("Unable to load hotel information. Check that the Flask backend is running.");
      }

      const [roomsData, statsData, bookingsData] = await Promise.all([
        roomsResponse.json(),
        statsResponse.json(),
        bookingsResponse.json(),
      ]);

      setRooms(Array.isArray(roomsData) ? roomsData : []);
      setStats({ ...initialStats, ...statsData });
      setBookings(Array.isArray(bookingsData) ? bookingsData : []);
      setError("");
    } catch (fetchError) {
      setError(fetchError.message || "Backend connection failed. Start MongoDB and Flask.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const handleBookRoom = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!selectedRoom) {
      setError("Please select an available room.");
      return;
    }

    setSavingBooking(true);
    try {
      const response = await fetch(`${API_URL}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_number: selectedRoom.room_number,
          floor: Number(selectedRoom.floor),
          customer_name: bookingForm.customer_name.trim(),
          phone: bookingForm.phone.trim(),
          check_in_date: bookingForm.check_in_date,
          check_out_date: bookingForm.check_out_date,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Booking could not be completed.");

      setSuccess(result.message);
      setBookingForm({
        room_key: "", customer_name: "", phone: "",
        check_in_date: new Date().toISOString().slice(0, 10),
        check_out_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      });
      await fetchDashboard();
    } catch (requestError) {
      setError(requestError.message || "Booking failed.");
    } finally {
      setSavingBooking(false);
    }
  };

  const handlePriceUpdate = async (room) => {
    const key = `${room.floor}-${room.room_number}`;
    const price = priceEdits[key] ?? room.price ?? 0;
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`${API_URL}/rooms/${room.floor}/${room.room_number}/price`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Could not update room rent.");
      setSuccess(result.message);
      setPriceEdits((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      await fetchDashboard();
    } catch (requestError) {
      setError(requestError.message || "Could not update room rent.");
    }
  };

  const handleCheckout = async (bookingId) => {
    if (!window.confirm("Are you sure this customer has checked out?")) return;

    setError("");
    setSuccess("");
    setCheckingOut(bookingId);
    try {
      const response = await fetch(`${API_URL}/checkout/${bookingId}`, {
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Checkout failed.");

      setSuccess(result.message);
      await fetchDashboard();
    } catch (requestError) {
      setError(requestError.message || "Unable to check out this customer.");
    } finally {
      setCheckingOut("");
    }
  };

  const roomPriceRange = stats.total_rooms
    ? `₹${stats.min_price} - ₹${stats.max_price}`
    : "₹0 - ₹0";

  return (
    <div className="app-container">
      <header className="header">
        <div>
          <h1>GrandStay Hotel</h1>
          <p>Hotel Management Dashboard</p>
        </div>
        <span className="admin-label">Admin Panel</span>
      </header>

      <main className="main-content">
        <section className="welcome-section">
          <h2>Welcome to GrandStay</h2>
          <p>Manage your hotel rooms, bookings and customer checkouts from one place.</p>
        </section>

        <section className="stats-container" aria-label="Hotel room statistics">
          <div className="stat-card">
            <h3>Total Rooms</h3>
            <p>{stats.total_rooms} Rooms</p>
            <small>All rooms in the hotel</small>
          </div>
          <div className="stat-card">
            <h3>Available Rooms</h3>
            <p>{stats.available_rooms} Rooms</p>
            <small>Rooms ready to be booked</small>
          </div>
          <div className="stat-card">
            <h3>Booked Rooms</h3>
            <p>{stats.booked_rooms} Rooms</p>
            <small>Currently occupied rooms</small>
          </div>
          <div className="stat-card">
            <h3>Room Types</h3>
            <p>{stats.room_types}</p>
          </div>
          <div className="stat-card">
            <h3>Room Price Range</h3>
            <p>{roomPriceRange}</p>
          </div>
        </section>

        {error && <p className="error-message" role="alert">{error}</p>}
        {success && <p className="success-message" role="status">{success}</p>}

        <section className="content-card">
          <div className="section-heading">
            <div>
              <h2>Book a Room</h2>
              <p className="helper-text">The hotel has 50 rooms across 5 floors.</p>
            </div>
          </div>
          <form onSubmit={handleBookRoom} className="room-form booking-form">
            <div className="form-group">
              <label htmlFor="booking-room">Available Room</label>
              <select
                id="booking-room"
                value={bookingForm.room_key}
                onChange={(event) => setBookingForm({ ...bookingForm, room_key: event.target.value })}
                required
              >
                <option value="">Select an available room</option>
                {availableRooms.map((room) => (
                  <option key={`${room.floor}-${room.room_number}`} value={`${room.floor}-${room.room_number}`}>
                    Floor {room.floor} - Room {room.room_number} ({room.room_type})
                  </option>
                ))}
              </select>
              {availableRooms.length === 0 && (
                <span className="helper-text">There are no available rooms to book.</span>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="customer-name">Customer Name</label>
              <input
                id="customer-name"
                type="text"
                placeholder="Enter customer name"
                value={bookingForm.customer_name}
                onChange={(event) => setBookingForm({ ...bookingForm, customer_name: event.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="customer-phone">Phone Number</label>
              <input
                id="customer-phone"
                type="tel"
                placeholder="Enter phone number"
                value={bookingForm.phone}
                onChange={(event) => setBookingForm({ ...bookingForm, phone: event.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="check-in-date">Check-in Date</label>
              <input
                id="check-in-date"
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                value={bookingForm.check_in_date}
                onChange={(event) => setBookingForm({ ...bookingForm, check_in_date: event.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="check-out-date">Check-out Date</label>
              <input
                id="check-out-date"
                type="date"
                min={bookingForm.check_in_date || new Date().toISOString().slice(0, 10)}
                value={bookingForm.check_out_date}
                onChange={(event) => setBookingForm({ ...bookingForm, check_out_date: event.target.value })}
                required
              />
            </div>
            <div className="form-group stay-estimate">
              <label>Stay & Estimated Rent</label>
              <div className="estimate-panel">
                <strong>{stayNights} night{stayNights === 1 ? "" : "s"}</strong>
                <strong>₹{estimatedTotal.toLocaleString("en-IN")}</strong>
                <small>{selectedRoom ? `₹${Number(selectedRoom.price || 0).toLocaleString("en-IN")} per night` : "Select a room to calculate rent"}</small>
              </div>
            </div>
            <button type="submit" className="add-button" disabled={savingBooking || !availableRooms.length || stayNights < 1}>
              {savingBooking ? "Booking..." : "Book Room"}
            </button>
          </form>
        </section>

        <section className="content-card">
          <div className="section-heading">
            <div>
              <h2>Room Details</h2>
              <p className="helper-text">4 Standard, 3 Deluxe, 2 Suite and 1 Family room on each floor.</p>
            </div>
            <button onClick={fetchDashboard} className="refresh-button" disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          {loading && rooms.length === 0 ? (
            <p className="empty-message">Loading rooms...</p>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr><th>Room Number</th><th>Floor</th><th>Room Type</th><th>Price/Night</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {rooms.map((room) => (
                    <tr key={`${room.floor}-${room.room_number}`}>
                      <td>{room.room_number}</td>
                      <td>{room.floor}</td>
                      <td>{room.room_type}</td>
                      <td>
                        <div className="price-editor">
                          <span>₹</span>
                          <input
                            aria-label={`Rent per night for room ${room.room_number}`}
                            type="number"
                            min="0"
                            step="0.01"
                            value={priceEdits[`${room.floor}-${room.room_number}`] ?? room.price ?? 0}
                            onChange={(event) => setPriceEdits({
                              ...priceEdits,
                              [`${room.floor}-${room.room_number}`]: event.target.value,
                            })}
                          />
                          <button type="button" className="save-price-button" onClick={() => handlePriceUpdate(room)}>Save</button>
                        </div>
                        <small className="helper-text">per night</small>
                      </td>
                      <td>
                        <span className={room.status === "Available" ? "available-status" : "booked-status"}>
                          {room.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="content-card">
          <h2>Booking Details</h2>
          {bookings.length === 0 ? (
            <p className="empty-message">No bookings have been made yet.</p>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th><th>Phone</th><th>Room</th><th>Floor</th>
                    <th>Rent/Night</th><th>Check-in</th><th>Check-out</th><th>Nights</th><th>Total Rent</th><th>Booking Date</th><th>Status</th><th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((booking) => (
                    <tr key={booking._id}>
                      <td>{booking.customer_name}</td>
                      <td>{booking.phone}</td>
                      <td>{booking.room_number}</td>
                      <td>{booking.floor}</td>
                      <td>₹{booking.price_per_night ?? booking.price ?? 0}</td>
                      <td>{booking.check_in_date || "-"}</td>
                      <td>{booking.check_out_date || "-"}</td>
                      <td>{booking.nights ?? "-"}</td>
                      <td><strong>₹{Number(booking.total_price ?? booking.price ?? 0).toLocaleString("en-IN")}</strong></td>
                      <td>{booking.booking_date?.replace("T", " ") || "-"}</td>
                      <td>
                        <span className={booking.status === "Booked" ? "booked-status" : "available-status"}>
                          {booking.status}
                        </span>
                      </td>
                      <td>
                        {booking.status === "Booked" ? (
                          <button
                            className="checkout-button"
                            onClick={() => handleCheckout(booking._id)}
                            disabled={checkingOut === booking._id}
                          >
                            {checkingOut === booking._id ? "Checking out..." : "Check Out"}
                          </button>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="content-card">
          <h2>Floor Summary</h2>
          <div className="floor-summary-grid">
            {stats.floors.map((floor) => (
              <div className="floor-summary-card" key={floor.floor}>
                <h3>Floor {floor.floor}</h3>
                <p>Maximum capacity: <strong>{floor.capacity}</strong></p>
                <p>Rooms: <strong>{floor.total_rooms}</strong></p>
                <p>Available: <strong>{floor.available_rooms}</strong></p>
                <p>Booked: <strong>{floor.booked_rooms}</strong></p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer><p>© 2026 GrandStay Hotel Management System</p></footer>
    </div>
  );
}

export default App;
