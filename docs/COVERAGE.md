# What Case Investigator covers

Status as of 2026-11-14, checked against the code and the demo runs.

**Status labels**

- **Proven**: ran end to end on a sample document and gave the right result.
- **Built, untested**: the code exists but no sample of this document has been run yet.
- **Not covered**: no code for it.
- **Weak**: runs, but results are noisy or limited.

## 1. Files accepted

| Input | Status |
|---|---|
| PDF with a text layer (digital statements, pay stubs) | Proven |
| Scanned PDF (image only) | Proven (OCR) |
| Photos: PNG, JPG | Proven (OCR) |
| TIFF, WebP | Built, untested |
| Multi-page PDF | Proven |
| iPhone HEIC photos | Not covered |
| Word, Excel, CSV or OFX bank exports, emails | Not covered |

## 2. Documents

| Document | Fields read | Checks on the document itself | Status |
|---|---|---|---|
| **Pay stub** | employee, address, employer, pay date, period, gross, each deduction, total deductions, net, YTD, deposit account | net = gross - deductions; listed deductions add up; Social Security 6.2% and Medicare 1.45%; pay date is a business day (not weekend or bank holiday); no future dates | **Proven** (digital PDF and scanned PDF) |
| **Bank statement** | holder, address, bank, account, routing, period, opening and closing balance, totals, every transaction row | running balance row by row; opening + deposits - withdrawals = closing; stated totals match the rows | **Proven** |
| **Cheque** | payee, drawer, bank, date, amount in figures and in words, routing, account (MICR line) | routing number checksum and Federal Reserve prefix; routing number belongs to the printed bank (7,139-bank directory); amount in words = amount in figures | **Proven** (photo and PDF) |
| **Passport** | name, surname, given names, birth date, number, nationality, issue and expiry, address | machine-readable zone (MRZ) check digits; MRZ name = printed name; not expired | **Proven** (photo) |
| **Utility bill** | customer, service address, provider, account, bill and due dates, amount | dates only | **Proven** |
| National ID card (3-line MRZ) | same as passport | MRZ check digits; not expired | Built, untested |
| Driver's license | name, birth date, number, address, issue and expiry | not expired; dates | Built, untested |
| Payment card | cardholder, number, bank, expiry | Luhn checksum; card prefix belongs to the printed bank (458,052-prefix table); not expired | Built, untested |
| W-2 | employee, employer, EIN, wages, withholding, SS and Medicare wages and tax, year | Social Security and Medicare tax match wages | Built, untested |
| Invoice | vendor, bill-to, address, number, date, subtotal, tax, total, pay-to account | subtotal + tax = total | Built, untested |
| Receipt | merchant, date, subtotal, tax, total | subtotal + tax = total | Built, untested |
| Employment or offer letter | employee, employer, salary, start date, letter date | dates only | Built, untested |
| 1099 | recipient, payer, compensation, tax year | none | Built, untested |
| Tax return | taxpayer, address, total income, AGI, wages, year | none | Built, untested |
| Anything else | name, address, organisation, date, amount, account (only where printed as "Label: value") | dates only | Built, untested |

## 3. Checks that run on every document

| Check | What it finds | Status |
|---|---|---|
| PDF file history | editing tool used (for example iLovePDF), saved again after creation, modified after created, white boxes over text, invisible text, fonts, annotations | **Proven** |
| Pixel forensics | edited regions on scans and photos, shown as a heat map | **Proven**, slow on CPU (tens of seconds per page) |
| Character forensics | characters whose font, size or spacing differ from the rest of their line | **Weak**: works, but raises noisy low-confidence leads (4 on the demo pay stub) |
| Future dates | any date after the application date | **Proven** |

## 4. Checks across documents (relationship graph)

| Rule | What it checks | Status |
|---|---|---|
| Same person | every document names the applicant (spelling variants merged, with the reason shown) | **Proven** |
| Same birth date | every birth date agrees | **Proven** |
| Photo ID valid | the ID is not expired | **Proven** |
| One current address | utility bill and latest statement show the same address | **Proven** (caught 48 Oak Ave on the bill vs 12 Elm St on the statement) |
| Pay to deposit | every pay date has a matching deposit of the net pay | **Proven** (caught the $200 edit) |
| Employer pays the account | the employer on the pay stub is who actually deposits the pay | **Proven** (caught "Brightline Staffing" depositing instead of "Acme Logistics") |
| Stated income | income in the context line matches pay stubs and deposits | **Proven** |
| Cheque account | the cheque is drawn on the applicant's own account and bank | **Proven** |
| Statement chain | statement periods follow each other with no gap and balances carry over | **Proven** |
| Recency | documents are dated within the workflow's window (90 days for loan and rental, 180 for insurance, 365 for general) | **Proven** |
| Required documents | the case has every document its workflow requires | **Proven** (caught the missing 3rd statement) |
| Invoice paid | every invoice amount matches a payment | Built, untested |
| Rent affordability | rent vs income for rental cases | **Not covered**, although the Rental workflow description promises it |

## 5. Screening

| Check | Status |
|---|---|
| Sanctions and watchlists on every person and company name | **Proven** on the demo watchlist. Today it uses a local copy of 84,785 OpenSanctions entries, because the connection to VeriSec's live screening service stopped when its certificate expired on Oct 27 |

## 6. Case types (workflows)

| Case type | Required documents | Status |
|---|---|---|
| Loan application | photo ID, 2 pay stubs, 3 consecutive bank statements, proof of address | **Proven** (John Doe demo) |
| Rental application | photo ID, 2 pay stubs or an offer letter, 2 bank statements | **Proven** (Maria Santos demo), except rent affordability |
| Insurance claim | photo ID, invoices or receipts, proof of payment | Built, untested (no insurance sample yet) |
| General financial review | none required | Built, untested |

## 7. Not covered

- Handwriting (handwritten cheque amounts, signatures) and signature matching
- Driver's license barcode (PDF417) compared with the printed fields
- ID photo, face match to a selfie, holograms and other physical security features
- Comparing a document's layout or logo against a known genuine template from the same bank or employer
- Tax return line math, 1099 checks, and W-2 totals compared with pay stub year-to-date figures
- Checking that an employer or EIN really exists
- Non-US banking details: IBAN, SWIFT and sort codes are read as text but not validated. Routing, Social Security, Medicare, W-2 and 1099 checks are US rules
- Co-applicants: the graph assumes one applicant per case
- The same document reused in another case
- Insurance-specific documents: claim forms, policy documents, police reports, medical bills

## 8. Depends on the AI model (off today)

With no model connected, everything above still runs: it is all deterministic. These need a model:

- The lead investigator's written case summary and plan
- A second look at a page image when the checks disagree (vision second opinion and zoom-in)
- Reading fields on documents that do not follow a known layout ("Anything else")
- "Ask the agent about this finding"

## 9. Known rough edges

- The Live run banner counts every raw signal ("19 findings") while Findings counts only the verified ones (8). The two numbers should match or be labelled.
- Fields are found by their printed labels. A document with an unusual layout can miss fields, which then show as "not found on this document".
- Documents are classified by keywords. A document the classifier does not recognise is treated as "Anything else".
