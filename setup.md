# Quick local setup (Windows PowerShell)

Run these commands from the repository root. For a fresh clone, use the full
guide in [`docs/DEVELOPMENT_SETUP.md`](docs/DEVELOPMENT_SETUP.md).

## First-time setup

```powershell
py -3.12 -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
Set-Location frontend
npm ci
Copy-Item .env.example .env
Set-Location ..
```

The checked-in examples use local URLs. Do not commit either `.env` file.

## Prepare the local demo database

```powershell
Set-Location backend
..\venv\Scripts\python.exe manage.py migrate --settings=config.local_sqlite_settings
..\venv\Scripts\python.exe manage.py seed_demo --settings=config.local_sqlite_settings
Set-Location ..
```

## Run both services

Terminal 1, from the repository root:

```powershell
Set-Location backend
..\venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000 --settings=config.local_sqlite_settings
```

Terminal 2, from the repository root:

```powershell
Set-Location frontend
npm run dev
```

Open the canonical React frontend at `http://localhost:5173/`. The API is at
`http://127.0.0.1:8000/api/` and Django admin is at
`http://127.0.0.1:8000/admin/`.

## Verify

```powershell
Set-Location backend
..\venv\Scripts\python.exe manage.py check --settings=config.local_sqlite_settings
Set-Location ..\frontend
npm run lint
npm test
npm run build
```

Production deployment uses PostgreSQL, Gunicorn, HTTPS, and a built frontend;
do not deploy `config.local_sqlite_settings`. See
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).
