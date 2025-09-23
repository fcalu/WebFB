# Backend
Run:
```
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```
APIs: `/leagues`, `/teams?league=...`, `/predict`
