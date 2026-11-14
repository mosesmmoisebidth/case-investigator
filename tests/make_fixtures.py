"""Tiny fixture documents for engine tests (fictional people and companies)."""

from pathlib import Path

import pymupdf


def _pdf(path: Path, lines: list[tuple[float, float, str, float]], producer: str = "PayrollPro 7.2") -> None:
    doc = pymupdf.open()
    page = doc.new_page(width=612, height=792)
    for x, y, text, size in lines:
        page.insert_text((x, y), text, fontsize=size, fontname="helv")
    doc.set_metadata({"producer": producer, "creator": producer, "creationDate": "D:20260305090000", "modDate": "D:20260305090000"})
    doc.save(path)


def make(out: Path) -> list[Path]:
    out.mkdir(parents=True, exist_ok=True)
    stub = out / "pay_stub_march.pdf"
    _pdf(
        stub,
        [
            (40, 50, "ACME LOGISTICS LTD - EARNINGS STATEMENT", 14),
            (40, 80, "Employer: Acme Logistics Ltd", 10),
            (40, 96, "Employee Name: John Q Doe", 10),
            (40, 112, "Employee Address: 12 Elm St, Springfield, IL 62701", 10),
            (40, 128, "Pay Date: 03/13/2026", 10),
            (40, 144, "Period Start: 02/28/2026", 10),
            (300, 144, "Period End: 03/13/2026", 10),
            (40, 180, "Gross Pay 4,000.00", 10),
            (40, 196, "Federal Income Tax 400.00", 10),
            (40, 212, "Social Security 248.00", 10),
            (40, 228, "Medicare 58.00", 10),
            (40, 244, "State Income Tax 150.00", 10),
            (40, 260, "Total Deductions 856.00", 10),
            (40, 276, "Net Pay 3,344.00", 10),
            (40, 300, "Deposit Account: ****1234", 10),
        ],
    )
    stmt = out / "bank_statement_march.pdf"
    _pdf(
        stmt,
        [
            (40, 50, "FIRST BANK OF SPRINGFIELD - ACCOUNT STATEMENT", 14),
            (40, 80, "Account Holder: John Q Doe", 10),
            (40, 96, "Address: 12 Elm St, Springfield, IL 62701", 10),
            (40, 112, "Account Number: 0000001234", 10),
            (40, 128, "Routing Number: 071000013", 10),
            (40, 144, "Statement Period: 03/01/2026", 10),
            (300, 144, "Through: 03/31/2026", 10),
            (40, 170, "Opening Balance 1,000.00", 10),
            (40, 200, "Date", 10), (120, 200, "Description", 10), (330, 200, "Withdrawals", 10), (420, 200, "Deposits", 10), (510, 200, "Balance", 10),
            (40, 216, "03/02/2026", 10), (120, 216, "Grocery Mart", 10), (330, 216, "120.00", 10), (510, 216, "880.00", 10),
            (40, 232, "03/13/2026", 10), (120, 232, "Payroll Gusto Inc", 10), (420, 232, "3,144.00", 10), (510, 232, "4,024.00", 10),
            (40, 248, "03/20/2026", 10), (120, 248, "Rent payment", 10), (330, 248, "1,500.00", 10), (510, 248, "2,524.00", 10),
            (40, 280, "Total Deposits 3,144.00", 10),
            (40, 296, "Total Withdrawals 1,620.00", 10),
            (40, 312, "Closing Balance 2,524.00", 10),
        ],
        producer="FirstBank eStatements",
    )
    chq = out / "cheque_rent.pdf"
    _pdf(
        chq,
        [
            (40, 50, "FIRST BANK OF SPRINGFIELD", 12),
            (400, 50, "Date: 03/21/2026", 10),
            (40, 90, "Pay to the order of: Oak Property Management", 10),
            (400, 90, "Amount: $1,500.00", 10),
            (40, 110, "One thousand five hundred dollars and 00/100", 10),
            (40, 140, "Drawer: John Q Doe", 10),
            (60, 200, "⑆021000021⑆ 0000001234⑈ 0457", 12),
        ],
        producer="iLovePDF",
    )
    return [stub, stmt, chq]
