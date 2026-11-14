# VeriSec Case Investigator

A fraud investigator's assistant for financial documents. An investigator uploads a case
folder (IDs, bank statements, pay stubs, tax forms, utility bills, cheques, invoices and any
other financial document). A LangChain deep agent runs VeriSec's forensic engines on every
file, builds a **relationship graph** of every person, address, employer, account and money
event across the documents, checks every expected link and flow against an editable
**workflow**, and returns a case report: what checks out, what conflicts and what is missing.
Every finding carries its proof. The investigator accepts or rejects each finding and decides.

Built at HackPrinceton Fall 2026.

## Layout

| Folder | What |
|---|---|
| `backend/` | FastAPI service, deep agent, case store |
| `engines/` | VeriSec engines wrapped as tools (each writes evidence) |
| `workflows/` | Editable case workflows and relationship blueprints |
| `frontend/` | Investigator web app (VeriSec console design) |
| `demo_cases/` | Demo case documents |

## Run

```bash
# backend
cd backend && py -3.13 -m venv ../.venv && ../.venv/Scripts/pip install -r requirements.txt
../.venv/Scripts/uvicorn app.main:app --port 8100
# frontend
cd frontend && pnpm install && pnpm dev   # http://localhost:3100
```

Status: milestone M0 (skeleton). See commits for progress.
