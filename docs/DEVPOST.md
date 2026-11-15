# VeriSec Case Investigator (Devpost text)

**Tagline:** Drop in a messy pile of financial documents; get one relationship graph where every link is checked and every finding carries its proof.

## Inspiration
Fake pay stubs and edited bank statements get loans and leases approved. Single-document checkers miss the lies that only appear when documents are compared: the employer never pays into the account, the bill's address is not the statement's, a month is missing, the cheque is drawn on another bank. Analysts find these by hand, one document at a time.

## What it does
An investigator opens a case, types one line of context and uploads every document. A LangChain deep agent plans the investigation and sends one analyst per document through six forensic passes. Then a relationship graph links every person, address, employer, bank, account, pay period and deposit across the case, and the workflow's blueprint checks every expected link: verified, conflict, missing or unverifiable. A verifier drops anything without evidence and only raises a strong finding when independent layers agree. The investigator reviews each finding next to its evidence, asks the agent follow-up questions, sees the recommended outcome and the rule behind it, signs, and downloads the report. Workflows (required documents, steps, rules, scoring) are editable in the app.

## How we built it
- **Agent:** LangChain deepagents. A lead investigator plans with write_todos, delegates one task per document to parallel document-analyst sub-agents, follows up on red and amber links (for example, searching deposits for a payroll provider before raising an employer finding), screens names and writes a narrative. Every engine is a tool that saves its evidence and returns a path plus a summary. Amazon Bedrock (Claude) by default.
- **Engines (from VeriSec):** TruFor pixel forensics, PP-OCRv6, the MICR routing check, a 75k-bank directory with routing owners, a 458k BIN table and yente sanctions screening; plus PDF structure forensics (pikepdf, PyMuPDF), character forensics and deterministic content logic (pay stub maths, FICA rates, running balances, MRZ, Luhn).
- **Graph:** deterministic entity resolution with recorded reasons, blueprint rules over the identity, address, money and time flows.
- **App:** FastAPI with server-sent events; Next.js 16 and React Flow in the VeriSec console design; PDF reports rendered locally; hash-chained audit log.

## Challenges
Open tamper detectors are unreliable alone, so we stack independent layers and require agreement. OCR misreads MRZ characters, which we correct by ICAO position. There is no free US routing directory, so routing owners come from VeriSec's bank directory.

## Accomplishments
On the demo loan case every planted problem is caught, and the edited net pay is one finding backed by four layers. The genuine rental case comes out Clear with every link verified.

## What we learned
The relationship view, not the tamper score, is what makes a case understandable at a glance.

## What's next
More document packs, Neo4j for large cases, bank-specific workflows, on-premise deployment with single sign-on and four-eyes approval.

## Built with
Python, FastAPI, LangChain deepagents, Amazon Bedrock, PyMuPDF, pikepdf, OpenCV, PyTorch (TruFor), RapidOCR (PP-OCRv6), NetworkX, rapidfuzz, Next.js, React, React Flow, TypeScript.
