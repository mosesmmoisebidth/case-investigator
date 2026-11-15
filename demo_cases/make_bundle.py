"""Build demo_cases/mixed_upload/john_doe_all_in_one.pdf: every John Doe demo
document merged into ONE shuffled PDF, the way an applicant often sends a single
scan. The intake sorter has to split it back into separate documents.

    .venv/Scripts/python -m demo_cases.make_bundle
"""

from pathlib import Path

import pymupdf

SRC = Path(__file__).resolve().parent / "john_doe_loan"
OUT = Path(__file__).resolve().parent / "mixed_upload" / "john_doe_all_in_one.pdf"
ORDER = ["utility_bill_oct_2026.pdf", "statement_aug_2026.pdf", "passport_john_doe.png", "pay_stub_aug_28.pdf", "statement_oct_2026.pdf", "cheque_1042.png", "pay_stub_oct_16_scan.pdf"]


def main() -> None:
    out = pymupdf.open()
    for name in ORDER:
        p = SRC / name
        src = pymupdf.open(p) if p.suffix == ".pdf" else pymupdf.open("pdf", pymupdf.open(p).convert_to_pdf())
        out.insert_pdf(src)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT)
    (OUT.parent / "CONTEXT.txt").write_text("Loan application, John Q Doe, $40,000, salary $109,200\n", encoding="utf-8")
    print(f"wrote {OUT} ({out.page_count} pages)")


if __name__ == "__main__":
    main()
