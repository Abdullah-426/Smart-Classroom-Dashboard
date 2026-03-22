# Project directory layout (verified)

Root: **`Smart Classroom Dashboard/`** (name may vary on disk).

```
Smart Classroom Dashboard/
├── package.json              # npm run storage | npm run dev:all
├── package-lock.json         # after npm install at root
├── storage-bridge.mjs        # HTTP on port 4050; npm scripts bind 0.0.0.0 for Docker
├── .gitignore                # includes /data/
├── data/                     # created when bridge runs; gitignored
│   ├── telemetry.jsonl
│   ├── occupancy-sessions.json
│   ├── bridge-state.json
│   └── downtime.json         # persisted pipeline downtime total
├── frontend/                 # Vite + React dashboard
│   ├── package.json
│   ├── vite.config.ts        # proxy /api/storage → :4050, /api → Node-RED
│   └── src/
├── all_flows_edit.json       # Node-RED export (import + Deploy)
├── docs/
│   ├── storage-bridge.md
│   └── PROJECT_LAYOUT.md     # this file
└── backend-reference/        # firmware / reference (if present)
```

**What you must run**

- **Storage bridge:** from root, `npm run storage` (or use `npm run dev:all`).
- **Dashboard:** `npm run dev` inside `frontend/` **unless** you use root `npm run dev:all`.

If `data/` is missing until the first successful ingest, that is normal; the bridge creates it on first write.
