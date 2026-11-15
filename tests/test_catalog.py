"""Tests for the document catalog and the page sorter.

    .venv/Scripts/python -m tests.test_catalog            classifier + splitting (fast)
    .venv/Scripts/python -m tests.test_catalog --bundle   also a real mixed upload

Page samples are short, realistic first pages written for these tests (all
fictional). They are turned into word boxes line by line, the same shape the
PDF text layer and OCR produce.
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

from engines import catalog


def page(text: str, n: int = 1) -> dict:
    words = []
    for i, line in enumerate(l for l in text.strip().splitlines()):
        x = 40.0
        for w in line.split():
            words.append({"t": w, "b": [x, 40 + 22 * i, x + 7 * len(w), 54 + 22 * i]})
            x += 7 * len(w) + 6
    return {"page": n, "words": words, "source": "pdf_text"}


SAMPLES: dict[str, str] = {
    "bank_statement": """CHASE
January 01, 2026 through January 31, 2026
Account Number: 000000123456789
CHECKING SUMMARY
Beginning Balance $1,234.56
Deposits and Additions 3,166.80
Electronic Withdrawals 1,020.00
Ending Balance $3,381.36""",
    "credit_card_statement": """Platinum Card Statement
Payment Due Date 02/25/2026
Previous Balance $1,520.11
Payments -$500.00
Purchases +$312.40
New Balance $1,332.51
Minimum Payment Due $35.00
Credit Limit $8,000 Available Credit $6,667.49""",
    "pay_stub": """ACME LOGISTICS LTD
EARNINGS STATEMENT
Employee Name: John Q Doe Pay Date: 10/16/2026
Gross Pay 4,200.00
Federal Income Tax 504.00
Net Pay 3,166.80""",
    "utility_bill": """Springfield Power & Light
Electricity Bill
Service Address: 48 Oak Ave, Chicago, IL 60614
Meter reading 10234 kWh used 612
Amount Due $98.40 Due Date 11/12/2026""",
    "telecom_bill": """Vertex Wireless
Your monthly bill
Mobile number 312-555-0199
Plan: Unlimited Plus Data usage 14.2 GB
Monthly charges $65.00 Amount due $65.00""",
    "lease_agreement": """RESIDENTIAL LEASE AGREEMENT
This Lease is made between Landlord: Peter Gray and Tenant: Maria L Santos
Premises: 220 Lake St, Apt 4
Monthly Rent: $1,850.00 Security Deposit: $1,850.00
Term of lease: 12 months commencing November 1, 2026""",
    "w2": """Form W-2 Wage and Tax Statement 2025
a Employee's social security number
b Employer identification number (EIN) 12-3456789
1 Wages, tips, other compensation 104,200.00
2 Federal income tax withheld 12,504.00
3 Social security wages 104,200.00 5 Medicare wages and tips 104,200.00""",
    "form_1099": """Form 1099-NEC
Nonemployee Compensation
PAYER'S name Brightline Staffing LLC
PAYER'S TIN 98-7654321 RECIPIENT'S TIN ***-**-1234
1 Nonemployee compensation $18,400.00""",
    "tax_return": """Form 1040 U.S. Individual Income Tax Return 2025
Filing Status Single
1z Total wages 104,200
11 Adjusted gross income 104,200
15 Taxable income 89,600""",
    "insurance_policy": """HOMEOWNERS POLICY DECLARATIONS PAGE
Named Insured: Maria L Santos Policy Number HO-4421-998
Policy Period: 01/01/2026 to 01/01/2027
Coverage A Dwelling $350,000 Deductible $1,000
Annual Premium $1,284.00""",
    "repair_estimate": """PRELIMINARY ESTIMATE
Bay Auto Body Repair Order 5521
VIN 1HGCM82633A004352
Body labor 6.5 hrs Paint/refinish 4.0 hrs Parts $1,240.00
Deductible $500.00""",
    "medical_bill": """EXPLANATION OF BENEFITS
Patient: John Q Doe Provider: Lakeside Hospital
Date of service 09/12/2026 CPT 99213
Amount billed $420.00 Allowed amount $180.00
Insurance paid $144.00 Patient responsibility $36.00""",
    "certificate_of_incorporation": """State of Delaware
CERTIFICATE OF INCORPORATION
OF BRIGHT HARBOR TRADING INC.
The name of the corporation is Bright Harbor Trading Inc.
The registered office of the corporation in the State of Delaware is 1209 Orange Street""",
    "financial_statements": """BRIGHT HARBOR TRADING INC.
BALANCE SHEET as of December 31, 2025
Current assets 210,400
Total assets 512,900
Total liabilities 301,200
Retained earnings 211,700""",
    "invoice": """INVOICE
Invoice No: 1042 Invoice Date: 10/02/2026
Bill To: Maria L Santos
Qty Unit Price
Subtotal 1,200.00 Tax 96.00 Total Due 1,296.00""",
    "receipt": """CORNER HARDWARE
SALES RECEIPT
Cashier: 04 Terminal 2
TOTAL 54.20 CARD ENDING 4421
Thank you for shopping""",
    "mortgage_statement": """MORTGAGE STATEMENT
Loan Number 7700123
Property Address 12 Elm St, Chicago, IL
Principal balance $212,400.10 Escrow balance $1,904.33
Payment due 12/01/2026 Late fee $45.00""",
    "loan_statement": """AUTO LOAN STATEMENT
Account 55-01992
Outstanding balance $14,220.00 Interest rate 6.9%
Payment due 11/20/2026 Remaining term 31 months""",
    "credit_report": """EXPERIAN
Consumer Credit Report
Credit score 712
Payment history Accounts in good standing 9 Delinquent 0
Inquiries 2""",
    "gift_letter": """GIFT LETTER
I, Ana Santos, donor, give my daughter Maria L Santos the gift amount of $20,000.
This is a gift and not a loan. No repayment is expected.
Relationship: mother""",
    "employment_letter": """Acme Logistics Ltd
EMPLOYMENT VERIFICATION
To whom it may concern,
This letter confirms that John Q Doe is employed full-time as Dispatcher.
Start date: March 3, 2021 Annual salary: $109,200""",
    "birth_certificate": """CERTIFICATE OF LIVE BIRTH
Name of child: Maria Luisa Santos
Place of birth: Cook County Hospital
Mother: Ana Santos Father: Jorge Santos
Date of registration 06/02/1991 Registrar""",
    "police_report": """CHICAGO POLICE DEPARTMENT
TRAFFIC COLLISION REPORT
Report number 26-118842 Officer: R. Diaz Badge 4471
Location: Lake St and Wells St
Narrative: Vehicle 1 struck Vehicle 2""",
    "vehicle_registration": """VEHICLE REGISTRATION CARD
Plate: ZT 44812 VIN: 1HGCM82633A004352
Make HONDA Model ACCORD Year 2018
Registered owner: Maria L Santos""",
    "brokerage_statement": """Northline Investments
Portfolio Statement
Account Summary
Holdings Market value $84,210.55
Unrealized gain $6,120.10 Dividends $412.00 Cost basis""",
    "wallet_statement": """M-PESA STATEMENT
Customer Name: Amina Okello
Statement Period: 01 Oct 2026 - 31 Oct 2026
Receipt No. Completion Time Details Paid In Withdrawn Balance
RJK2X9 2026-10-03 Paybill 888880 0.00 1,200.00 4,310.00""",
    "transfer_confirmation": """Wire Transfer Confirmation
Ordering customer: Bright Harbor Trading Inc.
Beneficiary: Lakeside Builders LLC IBAN DE89370400440532013000
Beneficiary bank SWIFT/BIC: COBADEFFXXX
Amount transferred EUR 12,000.00 Value date 2026-10-20""",
    "bank_reference_letter": """Albany Bank & Trust
Bank Reference Letter
To whom it may concern,
We confirm that John Q Doe maintains an account with us and has been a customer since 2019.
The account is in good standing.""",
    "residence_certificate": """Mairie de Lyon
ATTESTATION DE RÉSIDENCE
Je soussigné certifie que M. Karim Benali réside au 14 rue Victor Hugo, 69002 Lyon.""",
    "drivers_license": """ILLINOIS
DRIVER'S LICENSE
DL NO D400-7836-0001
DOB 01/14/1988 EXP 01/14/2030
CLASS D RESTRICTIONS NONE
SEX M HGT 5-10 EYES BRN""",
    "national_id_card": """REPUBLIC OF KENYA
NATIONAL IDENTITY CARD
ID NUMBER 31555012
SEX M DATE OF BIRTH 12.05.1990
HOLDER'S SIGN""",
    "passport": """UNITED STATES OF AMERICA
PASSPORT
Surname DOE Given names JOHN Q
Nationality USA Date of birth 14 JAN 1988
P<USADOE<<JOHN<Q<<<<<<<<<<<<<<<<<<<<<<<<<<<<
4012345674USA8801149M3005022<<<<<<<<<<<<<<04""",
    "cheque": """ALBANY BANK & TRUST
PAY TO THE ORDER OF Viktor A. Morozkin $ 1,850.00
One thousand eight hundred fifty and 00/100 DOLLARS
MEMO rent""",
    # other languages
    "pay_stub#fr": """Société Lumière SARL
BULLETIN DE PAIE
Période du 01/10/2026 au 31/10/2026
Salaire brut 3 200,00
Net à payer 2 480,15""",
    "bank_statement#es": """Banco Ejemplo
EXTRACTO DE CUENTA
Periodo del 01/10/2026 al 31/10/2026
Saldo anterior 1.200,00
Saldo final 2.340,55""",
    "bank_statement#de": """Musterbank AG
Kontoauszug Nr. 10/2026
Alter Kontostand 1.200,00 EUR
Neuer Kontostand 2.340,55 EUR
IBAN DE89 3704 0044 0532 0130 00""",
    "pay_stub#pt": """Empresa Exemplo Ltda
HOLERITE / RECIBO DE PAGAMENTO
Salário base 4.500,00
Líquido a receber 3.810,22""",
    "utility_bill#es": """Compañía Eléctrica del Sur
FACTURA DE LUZ
Periodo de facturación 01/09/2026 - 30/09/2026
Consumo 320 kWh Total a pagar 74,20 €""",
    "lease_agreement#de": """MIETVERTRAG
Vermieter: Hans Becker Mieter: Lena Vogel
Miete monatlich 1.150,00 EUR
Kaution 3.450,00 EUR""",
    "tax_assessment#fr": """DIRECTION GÉNÉRALE DES FINANCES PUBLIQUES
AVIS D'IMPÔT 2026 SUR LES REVENUS DE 2025
Revenu fiscal de référence 41 200
Montant à payer 2 310""",
}


def test_classify() -> list[str]:
    bad = []
    for key, text in SAMPLES.items():
        want = key.split("#")[0]
        a = catalog.classify_page(page(text))
        ok = a["type"] == want
        mark = "ok " if ok else "BAD"
        print(f"  {mark} {key:30s} -> {a['type']:28s} conf {a['conf']:.2f}  {'; '.join(a['why'][:2])}")
        if not ok:
            bad.append(f"{key}: got {a['type']}")
    return bad


def test_split() -> list[str]:
    stmt = SAMPLES["bank_statement"]
    stmt_p2 = "CHASE\nAccount Number: 000000123456789\nTRANSACTION DETAIL continued\n01/20 Card purchase 42.10\n01/22 Payroll deposit 3,166.80"
    cases = {
        "two statements, no page numbers": ([stmt, stmt_p2, stmt.replace("January", "February"), stmt_p2], [2, 2]),
        "page 1 of 2 / 2 of 2 / 1 of 1": ([stmt + "\nPage 1 of 2", stmt_p2 + "\nPage 2 of 2", stmt + "\nPage 1 of 1"], [2, 1]),
        "two pay stubs": ([SAMPLES["pay_stub"], SAMPLES["pay_stub"].replace("10/16", "10/30")], [1, 1]),
        "bill then blank page": ([SAMPLES["utility_bill"], ""], [2]),
        "cover note then statement": (["Please find attached my documents.\nThanks, John", stmt, stmt_p2], [3]),
        "same type, different account": ([stmt_p2, stmt_p2.replace("123456789", "000004321")], [1, 1]),
        "mixed bundle": ([SAMPLES["passport"], stmt, stmt_p2, SAMPLES["pay_stub"], SAMPLES["pay_stub"], SAMPLES["utility_bill"], SAMPLES["lease_agreement"]], [1, 2, 1, 1, 1, 1]),
    }
    bad = []
    for name, (texts, want) in cases.items():
        groups = catalog.sort_pages([page(t, i + 1) for i, t in enumerate(texts)], "upload.pdf")
        got = [len(g["pages"]) for g in groups]
        ok = got == want
        print(f"  {'ok ' if ok else 'BAD'} {name:34s} -> {[(g['type'], len(g['pages'])) for g in groups]}")
        if not ok:
            bad.append(f"{name}: pages per document {got}, expected {want}")
    return bad


def test_bundle() -> list[str]:
    """Merge the John Doe demo files into ONE shuffled PDF and check intake separates them."""
    import pymupdf

    from engines import core, intake

    src = Path(__file__).resolve().parent.parent / "demo_cases" / "john_doe_loan"
    order = ["utility_bill_oct_2026.pdf", "statement_aug_2026.pdf", "passport_john_doe.png", "pay_stub_aug_28.pdf", "statement_oct_2026.pdf", "cheque_1042.png", "pay_stub_oct_16_scan.pdf"]
    want = ["utility_bill", "bank_statement", "passport", "pay_stub", "bank_statement", "cheque", "pay_stub"]
    out = pymupdf.open()
    for name in order:
        p = src / name
        if p.suffix == ".pdf":
            out.insert_pdf(pymupdf.open(p))
        else:
            img = pymupdf.open(p)
            out.insert_pdf(pymupdf.open("pdf", img.convert_to_pdf()))
    case_id = "zz_test_bundle"
    case = core.case_dir(case_id)
    shutil.rmtree(case, ignore_errors=True)
    for d in ("input", "pages", "intake"):
        (case / d).mkdir(parents=True, exist_ok=True)
    out.save(case / "input" / "scanned_bundle.pdf")
    try:
        r = intake.intake(case)
        got = [d["catalog_type"] for d in r["documents"]]
        print("  " + r["summary"])
        for d in r["documents"]:
            print(f"    {d['doc_id']:20s} {d['doc_label']:28s} pages {[p['page'] for p in d['pages']]}  split: {d['split_reason']}")
        return [] if got == want else [f"bundle sorted as {got}, expected {want}"]
    finally:
        shutil.rmtree(case, ignore_errors=True)


if __name__ == "__main__":
    print(f"catalog: {catalog.public()['count']} types")
    print("classify:")
    bad = test_classify()
    print("split:")
    bad += test_split()
    if "--bundle" in sys.argv:
        print("bundle:")
        bad += test_bundle()
    print("\n" + ("ALL PASSED" if not bad else "FAILED:\n  " + "\n  ".join(bad)))
    sys.exit(1 if bad else 0)
