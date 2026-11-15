# VeriSec Case Investigator

**A fraud investigator's assistant that turns a messy pile of financial documents into one relationship graph, checks every link, and shows its proof.**

Built at HackPrinceton Fall 2026 · Business and Enterprise track · also entered for LangChain deepagents, Amazon Practical AI and Arlequin AI-Driven Forensics.

## The problem

Lenders, landlords and insurers approve applications from a case folder: an ID, bank statements, pay stubs, a utility bill, a cheque or invoice. Fake pay stubs and edited statements get loans approved. Tools that score whether a *single* document was edited miss the lies that only show when documents are compared: the employer on the pay stub never pays into the account, the address on the bill is not the one on the statements, a month of statements is missing, the cheque is drawn on someone else's bank. Today an analyst finds those by hand, document by document.

## What it does

An investigator creates a case (loan, rental, insurance claim or a custom workflow), types one line of context ("Loan application, John Q Doe, $40,000, salary $109,200") and drops in the documents. Then:

1. **A deep agent plans the investigation** and sends one analyst per document through six passes: fields, PDF structure, pixel forensics, character forensics, content logic and payment instruments.
2. **The relationship graph** links every person, address, employer, bank, account, pay period and deposit across all documents, merging "J. Doe" and "John Doe" with the reason recorded.
3. **The workflow's blueprint** checks every expected link and flow (identity, address, money, time). Each link is **verified** (green), **conflict** (red), **missing** (amber) or **unverifiable** (grey). Missing documents appear as dashed placeholders.
4. **The verifier** drops any finding without stored evidence, merges signals that point at the same field, and only raises a strong finding when independent layers agree.
5. **The investigator decides.** They accept or reject each finding (a rejection needs a reason), ask the agent follow-up questions, see the recommended outcome and the rule behind it, sign, and download the PDF report. The audit log is a hash chain.

A clean case is shown as clean *with proof*: every verified link is listed in the report.

### Example: the John Doe demo case

| Planted problem | How it is caught |
|---|---|
| Net pay edited on a scanned pay stub, PDF re-saved in an online editor | One finding with **4 agreeing layers**: pay stub maths (gross minus deductions), deposit mismatch on the graph, PDF incremental save + editor producer, TruFor pixel region over the amount |
| Employer never pays into the account | Graph: `Acme Logistics Ltd pays into account` is red; deposits come from another payer |
| Address on the utility bill differs | Graph: current address conflict (house numbers differ) |
| Cheque routing number of another bank | VeriSec bank directory: routing 021000021 belongs to JPMorgan Chase, not the printed bank; and it differs from the statements' routing for the same account |
| Payee close to a watchlist entry | Sanctions screening: 0.95 match with the list entry |
| September statement missing | Statement chain: amber placeholder between August and October |

Result: **Decline: suspected fraud** (recommended; the investigator signs). The genuine Maria Santos rental case comes out **Clear** with 33 of 33 links verified.

## What is new

Inscribe and Resistant AI score documents and already cross-check some fields. This project makes the **relationship graph** the product: an explicit graph of the whole case, checked link by link against **editable workflows**, with **missing and unverifiable links shown, never hidden**, proof attached to every link down to the field on the page, and the whole thing running **inside the bank** on its own machine.

## Architecture

```
Investigator · web app (VeriSec console design)            frontend/  Next.js 16, React 19, React Flow
        │ REST + server-sent events
FastAPI backend                                            backend/app/main.py
        │
Lead investigator (LangChain deep agent, write_todos)      agent/
   ├─ document-analyst sub-agents, one per file (parallel): six passes + zoom-in loop + vision second opinion
   ├─ build_relationship_graph, search_transactions (follow-ups), screen_names, record_lead
   └─ code closes the loop: any skipped pass is run, verifier, scoring
        │ every tool writes its evidence and returns path + summary
Engines (VeriSec, wrapped as tools)                        engines/
   intake · extract · pdf_forensics · pixel_forensics · char_forensics · logic · payments · sanctions · graph · findings · report
        │
Case folder  cases/<id>/  input (read-only, SHA-256) · pages · extracted · evidence · checks · graph · findings · report · audit.log
```

With no AI model configured, the same engines run as a deterministic pipeline, so a case is always complete and evidenced.

### Engines

| Engine | What it uses |
|---|---|
| Intake and classifier | 14 financial document packs (`workflows/doctypes/*.yaml`): passport/ID, driver's license, bank statement, pay stub, W-2, 1099, tax return, utility bill, cheque, card, invoice, receipt, employment letter, generic. **Adding a document type = adding one file.** |
| Field extractor | PDF text layer (exact, with font and box per character); PP-OCRv6 for scans and photos; MRZ with ICAO position correction; MICR line |
| PDF structure forensics | pikepdf + PyMuPDF: revisions, editor producer, edit dates, white boxes over text, overlay annotations, invisible text |
| Pixel forensics | VeriSec's TruFor + error level analysis + noise residual + copy-move, fused; only small regions over text, two layers must agree |
| Character forensics | font, size, baseline and colour per span (PDF); glyph stroke and ink (scans) |
| Content logic | pay stub maths, Social Security 6.2% and Medicare 1.45%, running balances and totals, MRZ check digits, VeriSec's ABA routing check, Luhn, invoice maths, amount in words, bank-holiday pay dates, future dates |
| Payment instruments | VeriSec bank directory (75k banks, 7k+ US routing numbers, learned bank-name matcher), Fed district, VeriSec BIN table (458k BINs) |
| Sanctions | VeriSec's yente screening API (mTLS); local OpenSanctions fallback with data-learned word weights; editable watchlists |
| Relationship graph | deterministic entity resolution (people, addresses with USPS abbreviations, organisations, accounts), blueprint rules, timeline |
| Verifier and decision | confidence rules, layer agreement, severity weights, ordered outcome rules (escalate, decline, refer, request documents, clear, incomplete) |

### Workflows

`workflows/cases/*.yaml` (loan, rental, insurance, general, plus any you create in the app) define the required documents, the investigation steps in order, the relationship rules with their severity and parameters, and the scoring. The Workflows screen edits them; new cases use them at once.

## Run it

Requirements: Python 3.13, Node 20, pnpm. VeriSec's engines and data are read from the parent folder (`VERISEC_ROOT`); TruFor runs from VeriSec's TruFor environment on CPU.

```bash
# backend
py -3.13 -m venv .venv && .venv/Scripts/pip install -r backend/requirements.txt
.venv/Scripts/uvicorn --app-dir backend app.main:app --port 8100
# frontend
cd frontend && pnpm install && pnpm dev            # http://localhost:3100
# demo documents (fictional people, every page marked SPECIMEN)
.venv/Scripts/python demo_cases/make_demo.py
```

AI model: copy `.env.example` to `.env` and set `CI_LLM_PROVIDER` (`bedrock`, `anthropic`, `openrouter` or `local`) with its key. Amazon Bedrock is the default.

## Ground rules

- **The AI flags, the human decides.** The agent never approves or declines; the investigator signs, and overrides need a rationale.
- **No finding without evidence.** Every finding points to stored artifacts; the verifier drops anything else.
- **Numbers come from tools.** The agent plans, follows up and explains; engines compute.

## Honest limits

- Demo documents are synthetic; detection on them does not prove performance on a bank's real files.
- Pixel models are a supporting layer only; open tamper detectors are unreliable alone, which is why a strong finding needs agreeing layers.
- There is no free US routing directory (the Fed's is FedLine-only); routing owners come from VeriSec's bank directory, which covers 7k+ routing numbers.
- Model weights (TruFor and others) and data (OpenSanctions is free for non-commercial use) need their licences checked before commercial use. Licensed SDKs plug in from the private companion repo.
