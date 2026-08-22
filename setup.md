## Backend

### Activate virtual environment

```powershell
..\venv\Scripts\Activate.ps1
```

### Run database migrations

```powershell
python manage.py migrate --settings=config.local_sqlite_settings
```

### Seed demo data

```powershell
python manage.py seed_demo --settings=config.local_sqlite_settings
```

### Start Django server

```powershell
python manage.py runserver 127.0.0.1:8000 --settings=config.local_sqlite_settings
```

## Frontend

### Navigate to frontend directory

```powershell
cd "C:\Users\SUNRISE SURGICAL0\Github C\karmasheel\frontend"
```

### Start frontend development server

```powershell
npm run dev
```