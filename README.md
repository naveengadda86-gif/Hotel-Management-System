# GrandStay Hotel Management System

Beginner-friendly project using React + Vite, Python Flask and MongoDB.

## Features
- Automatically creates 50 rooms across 5 floors.
- Every floor has 4 Standard, 3 Deluxe, 2 Suite and 1 Family room.
- Book an available room with customer name and phone number.
- Dashboard counts total, booked and available rooms from MongoDB.
- Check Out releases the room and preserves the old booking as `Checked Out`.
- Booking history and floor summary.

## Requirements
- Python 3.10 or newer
- Node.js (LTS) and npm
- MongoDB Community Server running locally, or MongoDB connection URI

## Run on Windows / VS Code

### 1. Extract and open
Extract the ZIP. In VS Code, open the `hotel management` folder (the folder containing `backend` and `frontend`).

### 2. Start MongoDB
Start MongoDB Community Server. If using Compass, connect to:
`mongodb://127.0.0.1:27017/`

### 3. Start backend
Open Terminal 1 in VS Code and run one command at a time:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python app.py
```

If PowerShell blocks activation, run:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

Backend API: http://127.0.0.1:5000/

Keep Terminal 1 open.

### 4. Start frontend
Open Terminal 2 in VS Code (do not stop backend):

```powershell
cd frontend
npm install
npm run dev
```

Open the URL Vite prints, usually http://localhost:5173/

## Test
1. Dashboard initially displays 50 total, 50 available, 0 booked (for a new/clean database).
2. Book a room, e.g. Floor 1 / Room 101.
3. Dashboard becomes 50 total, 49 available, 1 booked.
4. In Booking Details click Check Out and confirm.
5. Dashboard becomes 50 total, 50 available, 0 booked. Booking history retains the record with status `Checked Out`.

## Notes
- Do not delete the booking/customer history on checkout. The room is released, and the booking is marked `Checked Out`.
- This project uses a fixed 50-room inventory. The Add Room form/API is intentionally not provided.
- Existing MongoDB records are not deleted by startup. If the database already has unrelated or duplicate room documents, the total may be greater than 50; inspect `hotel_db.rooms` before deleting anything.
- Do not include `.venv` or `node_modules` in the ZIP; they are recreated on your computer.
