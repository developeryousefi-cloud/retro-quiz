# Retro Quiz

A real-time, web-based quiz app for team retrospectives. Facilitators can create sessions, participants join and answer questions live, and results are tracked and displayed. Built with React, Node.js, Socket.IO, and SQLite.

## Quick Start

### 1. Install all dependencies (backend & frontend)

Make sure you have Python and Node.js installed.

```sh
python install_all.py
```

or

```sh
python3 install_all.py
```

### 2. Start the backend

```sh
cd backend
node index.js
```

### 3. Start the frontend

```sh
cd frontend
npm run dev
```

### 4. Open the app

Visit [http://localhost:5173/](http://localhost:5173/) in your browser.

---

## Project Structure

- `backend/` — Node.js, Express, Socket.IO, SQLite
- `frontend/` — React, Vite, Bootstrap
- `install_all.py` — Installs all dependencies for both frontend and backend

---

## Deployment
- Frontend: Vercel/Netlify (static hosting)
- Backend: Render (Node.js with persistent SQLite)

---

## License
MIT 