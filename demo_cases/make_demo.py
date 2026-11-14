"""Demo cases (all people fictional, every page marked SPECIMEN).

john_doe_loan/  "Loan application, John Q Doe, $40,000, salary $109,200"
  passport (photo), statements for August and October (September missing),
  pay stub August (digital), pay stub October (scanned, net pay edited and the
  PDF re-saved in an online editor), utility bill (different address), cheque
  (routing number of another bank; payee close to a watchlist entry).
  Planted: edited net pay, different address, employer never in deposits,
  cheque routing of another bank, watchlist near match, missing statement.

maria_santos_rental/  a genuine rental case: everything links up.

Run: python demo_cases/make_demo.py
"""

from __future__ import annotations

import io
import sys
from datetime import date, timedelta
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent / "doc_testgen"))
from icao_mrz import td3  # noqa: E402  (VeriSec's ICAO 9303 MRZ generator)

FONTS = Path("C:/Windows/Fonts")
SPECIMEN = "SPECIMEN · SYNTHETIC TEST DOCUMENT · NOT A REAL RECORD"


def F(name: str, size: int):
    return ImageFont.truetype(str(FONTS / name), size)


def money(v: float) -> str:
    return f"{v:,.2f}"


# ------------------------------------------------------------------ PDFs (digital)
def pdf_doc(path: Path, draw, producer: str, created: str, modified: str | None = None) -> None:
    doc = pymupdf.open()
    page = doc.new_page(width=612, height=792)
    draw(page)
    page.insert_text((40, 780), SPECIMEN, fontsize=6.5, fontname="helv", color=(0.55, 0.55, 0.55))
    doc.set_metadata({"producer": producer, "creator": producer, "creationDate": f"D:{created}", "modDate": f"D:{modified or created}"})
    doc.save(path, garbage=3, deflate=True)
    doc.close()


def t(page, x, y, s, size=9.5, bold=False, color=(0.13, 0.12, 0.09)):
    page.insert_text((x, y), s, fontsize=size, fontname="hebo" if bold else "helv", color=color)


def statement(path: Path, bank: str, bank_addr: str, holder: str, addr: tuple[str, str], acct: str, routing: str, start: date, end: date, opening: float, rows: list[tuple[date, str, float]]):
    bal = opening
    lines = []
    tot_in = tot_out = 0.0
    for d, desc, amt in rows:
        bal = round(bal + amt, 2)
        lines.append((d, desc, amt, bal))
        if amt > 0:
            tot_in += amt
        else:
            tot_out += -amt

    def draw(p):
        p.draw_rect(pymupdf.Rect(0, 0, 612, 70), color=None, fill=(0.07, 0.24, 0.36))
        t(p, 40, 36, bank.upper(), 16, True, (1, 1, 1))
        t(p, 40, 54, bank_addr, 8.5, False, (0.85, 0.9, 0.95))
        t(p, 420, 36, "ACCOUNT STATEMENT", 11, True, (1, 1, 1))
        t(p, 40, 98, f"Account Holder: {holder}", 10)
        t(p, 40, 113, f"Address: {addr[0]}, {addr[1]}", 10)
        t(p, 40, 128, f"Account Number: {acct}", 10)
        t(p, 40, 143, f"Routing Number: {routing}", 10)
        t(p, 360, 98, f"Statement Period: {start:%m/%d/%Y}", 10)
        t(p, 360, 113, f"Through: {end:%m/%d/%Y}", 10)
        p.draw_rect(pymupdf.Rect(36, 160, 576, 226), color=(0.85, 0.83, 0.78), fill=(0.97, 0.96, 0.93))
        t(p, 46, 178, f"Opening Balance {money(opening)}", 10)
        t(p, 46, 194, f"Total Deposits {money(tot_in)}", 10)
        t(p, 300, 178, f"Total Withdrawals {money(tot_out)}", 10)
        t(p, 300, 194, f"Closing Balance {money(bal)}", 10, True)
        y = 252
        for x, h in ((40, "Date"), (112, "Description"), (330, "Withdrawals"), (412, "Deposits"), (500, "Balance")):
            t(p, x, y, h, 9.5, True)
        p.draw_line((36, y + 5), (576, y + 5), color=(0.7, 0.7, 0.7), width=0.6)
        y += 20
        for d, desc, amt, b in lines:
            t(p, 40, y, f"{d:%m/%d/%Y}", 9.5)
            t(p, 112, y, desc, 9.5)
            if amt < 0:
                t(p, 330, y, money(-amt), 9.5)
            else:
                t(p, 412, y, money(amt), 9.5)
            t(p, 500, y, money(b), 9.5)
            y += 17
        t(p, 40, 740, f"Questions? Call {bank} customer service. Member FDIC.", 7.5, False, (0.4, 0.4, 0.4))

    pdf_doc(path, draw, f"{bank} eStatements 4.2", end.strftime("%Y%m%d080000"))
    return bal


def stub_numbers(gross: float, fed: float, state: float) -> dict:
    ss, med = round(gross * 0.062, 2), round(gross * 0.0145, 2)
    total = round(fed + ss + med + state, 2)
    return {"gross": gross, "fed": fed, "ss": ss, "med": med, "state": state, "total": total, "net": round(gross - total, 2)}


def stub_pdf(path: Path, employer: str, emp_addr: str, name: str, addr: str, pay: date, ps: date, pe: date, n: dict, ytd_gross: float, ytd_net: float, acct_last4: str):
    def draw(p):
        t(p, 40, 50, employer.upper(), 15, True)
        t(p, 40, 66, emp_addr, 8.5)
        t(p, 400, 50, "EARNINGS STATEMENT", 11, True)
        t(p, 40, 100, f"Employer: {employer}", 10)
        t(p, 40, 116, f"Employee Name: {name}", 10)
        t(p, 40, 132, f"Employee Address: {addr}", 10)
        t(p, 360, 100, f"Pay Date: {pay:%m/%d/%Y}", 10)
        t(p, 360, 116, f"Period Start: {ps:%m/%d/%Y}", 10)
        t(p, 360, 132, f"Period End: {pe:%m/%d/%Y}", 10)
        y = 176
        rows = [("Gross Pay", n["gross"]), ("Federal Income Tax", n["fed"]), ("Social Security", n["ss"]), ("Medicare", n["med"]), ("State Income Tax", n["state"]), ("Total Deductions", n["total"]), ("Net Pay", n["net"])]
        for lbl, v in rows:
            t(p, 40, y, f"{lbl} {money(v)}", 10, lbl in ("Gross Pay", "Net Pay"))
            y += 18
        t(p, 360, 176, f"YTD Gross {money(ytd_gross)}", 10)
        t(p, 360, 194, f"YTD Net {money(ytd_net)}", 10)
        t(p, 40, y + 16, f"Deposit Account: ****{acct_last4}", 10)

    pdf_doc(path, draw, "ADP Workforce Now", pay.strftime("%Y%m%d060000"))


def stub_scan_edited(path_pdf: Path, employer: str, emp_addr: str, name: str, addr: str, pay: date, ps: date, pe: date, n: dict, fake_net: float, acct_last4: str):
    """A scanned stub whose net pay was painted over and retyped, then re-saved in an online PDF editor."""
    W, H = 1700, 2200
    im = Image.new("RGB", (W, H), (252, 251, 247))
    d = ImageDraw.Draw(im)
    b, r, big = F("arialbd.ttf", 44), F("arial.ttf", 30), F("arialbd.ttf", 32)
    d.text((110, 120), employer.upper(), font=b, fill=(30, 28, 22))
    d.text((110, 180), emp_addr, font=F("arial.ttf", 24), fill=(60, 58, 50))
    d.text((1080, 125), "EARNINGS STATEMENT", font=F("arialbd.ttf", 32), fill=(30, 28, 22))
    y = 290
    for s in (f"Employer: {employer}", f"Employee Name: {name}", f"Employee Address: {addr}"):
        d.text((110, y), s, font=r, fill=(30, 28, 22))
        y += 50
    y2 = 290
    for s in (f"Pay Date: {pay:%m/%d/%Y}", f"Period Start: {ps:%m/%d/%Y}", f"Period End: {pe:%m/%d/%Y}"):
        d.text((1000, y2), s, font=r, fill=(30, 28, 22))
        y2 += 50
    y = 500
    net_box = None
    rows = [("Gross Pay", n["gross"]), ("Federal Income Tax", n["fed"]), ("Social Security", n["ss"]), ("Medicare", n["med"]), ("State Income Tax", n["state"]), ("Total Deductions", n["total"]), ("Net Pay", n["net"])]
    for lbl, v in rows:
        f = big if lbl in ("Gross Pay", "Net Pay") else r
        d.text((110, y), lbl, font=f, fill=(30, 28, 22))
        d.text((700, y), money(v), font=f, fill=(30, 28, 22))
        if lbl == "Net Pay":
            net_box = (690, y - 6, 960, y + 44)
        y += 56
    d.text((110, y + 40), f"Deposit Account: ****{acct_last4}", font=r, fill=(30, 28, 22))
    d.text((110, H - 90), SPECIMEN, font=F("arial.ttf", 20), fill=(140, 140, 140))
    # scanner look: slight blur and noise, JPEG
    im = im.filter(ImageFilter.GaussianBlur(0.6))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=88)
    im = Image.open(io.BytesIO(buf.getvalue())).convert("RGB")
    # the edit: a white patch over the net pay and a retyped amount in a near-identical font
    d = ImageDraw.Draw(im)
    d.rectangle(net_box, fill=(253, 253, 251))
    d.text((702, net_box[1] + 4), money(fake_net), font=F("calibrib.ttf", 35), fill=(18, 18, 18))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=95)
    jpg = buf.getvalue()
    doc = pymupdf.open()
    page = doc.new_page(width=612, height=792)
    page.insert_image(page.rect, stream=jpg)
    doc.set_metadata({"producer": "Canon iR-ADV C5535 Scan", "creator": "Canon iR-ADV C5535", "creationDate": f"D:{pay:%Y%m%d}070000", "modDate": f"D:{pay:%Y%m%d}070000"})
    doc.save(path_pdf)
    doc.close()
    # re-saved later in an online editor: incremental update with the editor as producer
    doc = pymupdf.open(path_pdf)
    doc.set_metadata({**doc.metadata, "producer": "iLovePDF", "modDate": f"D:{(pay + timedelta(days=24)):%Y%m%d}213000"})
    doc.save(path_pdf, incremental=True, encryption=pymupdf.PDF_ENCRYPT_KEEP)
    doc.close()


def utility_bill(path: Path, provider: str, name: str, addr: tuple[str, str], acct: str, bill: date, due: date, amount: float):
    def draw(p):
        p.draw_rect(pymupdf.Rect(0, 0, 612, 64), color=None, fill=(0.95, 0.62, 0.13))
        t(p, 40, 40, provider.upper(), 17, True, (1, 1, 1))
        t(p, 40, 100, f"Customer Name: {name}", 10)
        t(p, 40, 116, f"Service Address: {addr[0]}, {addr[1]}", 10)
        t(p, 40, 132, f"Account Number: {acct}", 10)
        t(p, 360, 100, f"Bill Date: {bill:%m/%d/%Y}", 10)
        t(p, 360, 116, f"Due Date: {due:%m/%d/%Y}", 10)
        t(p, 40, 176, "Electric service 642 kWh", 10)
        t(p, 40, 194, f"Amount Due {money(amount)}", 12, True)

    pdf_doc(path, draw, "SPL Billing System 11", bill.strftime("%Y%m%d050000"))


def passport_png(path: Path, surname: str, given: str, number: str, dob: date, sex: str, expiry: date, issued: date):
    W, H = 1500, 1000
    im = Image.new("RGB", (W, H), (233, 238, 242))
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, W, 90), fill=(28, 55, 92))
    d.text((40, 22), "PASSPORT · UNITED STATES OF AMERICA", font=F("arialbd.ttf", 36), fill=(255, 255, 255))
    d.rectangle((60, 140, 420, 600), fill=(205, 212, 220), outline=(120, 130, 140), width=3)
    d.ellipse((160, 210, 320, 380), fill=(170, 178, 188))
    d.rectangle((150, 390, 330, 590), fill=(170, 178, 188))
    lab, val = F("arial.ttf", 22), F("arialbd.ttf", 30)
    rows = [("Surname", surname.upper()), ("Given Names", given.upper()), ("Nationality", "UNITED STATES OF AMERICA"), ("Date of Birth", f"{dob:%d %b %Y}"), ("Sex", sex), ("Passport No", number), ("Date of Issue", f"{issued:%d %b %Y}"), ("Date of Expiry", f"{expiry:%d %b %Y}")]
    y = 140
    for k, v in rows:
        d.text((480, y), k, font=lab, fill=(70, 80, 95))
        d.text((480, y + 26), v, font=val, fill=(20, 24, 30))
        y += 70 if k not in ("Sex",) else 70
    mrz = td3("USA", surname, given, number, "USA", dob.strftime("%y%m%d"), sex, expiry.strftime("%y%m%d"))
    mz = F("cour.ttf", 40)
    d.rectangle((0, 790, W, H), fill=(245, 247, 249))
    d.text((40, 815), mrz[0], font=mz, fill=(10, 10, 10))
    d.text((40, 880), mrz[1], font=mz, fill=(10, 10, 10))
    d.text((40, 950), SPECIMEN, font=F("arial.ttf", 18), fill=(130, 130, 130))
    im.save(path, "PNG")


def cheque_png(path: Path, bank: str, drawer: str, drawer_addr: str, payee: str, amount: float, words: str, dt: date, routing: str, acct: str, serial: str):
    W, H = 1800, 800
    im = Image.new("RGB", (W, H), (240, 246, 238))
    d = ImageDraw.Draw(im)
    d.rectangle((10, 10, W - 10, H - 10), outline=(150, 170, 150), width=4)
    d.text((60, 50), drawer, font=F("arialbd.ttf", 32), fill=(30, 30, 30))
    d.text((60, 92), drawer_addr, font=F("arial.ttf", 24), fill=(60, 60, 60))
    d.text((760, 50), bank.upper(), font=F("arialbd.ttf", 34), fill=(25, 60, 90))
    d.text((1380, 60), f"No. {serial}", font=F("arial.ttf", 28), fill=(40, 40, 40))
    d.text((1300, 160), f"Date: {dt:%m/%d/%Y}", font=F("arial.ttf", 32), fill=(20, 20, 20))
    d.text((60, 260), f"Pay to the order of: {payee}", font=F("arial.ttf", 34), fill=(20, 20, 20))
    d.rectangle((1380, 250, 1740, 310), outline=(90, 90, 90), width=2)
    d.text((1395, 258), f"Amount: ${money(amount)}", font=F("arialbd.ttf", 30), fill=(20, 20, 20))
    d.text((60, 360), words, font=F("arial.ttf", 32), fill=(20, 20, 20))
    d.line((60, 400, 1500, 400), fill=(120, 120, 120), width=2)
    d.text((60, 470), "Memo: October rent and deposit", font=F("arial.ttf", 26), fill=(60, 60, 60))
    d.text((1150, 520), f"Drawer: {drawer}", font=F("arial.ttf", 26), fill=(60, 60, 60))
    d.text((180, 640), f"T{routing}T  {acct}C  {serial}", font=F("cour.ttf", 46), fill=(10, 10, 10))
    d.text((60, H - 50), SPECIMEN, font=F("arial.ttf", 18), fill=(130, 130, 130))
    im.save(path, "PNG")


def john_doe(out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    name, addr = "John Q Doe", ("12 Elm St", "Chicago, IL 60601")
    bank, bank_addr, routing, acct = "Albany Bank & Trust", "3400 W Lawrence Ave, Chicago, IL 60625", "071004446", "0044170917"
    employer, emp_addr = "Acme Logistics Ltd", "900 W Fulton Market, Chicago, IL 60607"
    n = stub_numbers(4200.00, 504.00, 207.90)  # net 3,166.70
    passport_png(out / "passport_john_doe.png", "Doe", "John Q", "C03005988", date(1990, 6, 14), "M", date(2031, 5, 2), date(2021, 5, 3))
    aug_rows = [
        (date(2026, 8, 3), "Rent payment Lakeview Homes", -1650.00),
        (date(2026, 8, 7), "Whole Foods Market", -142.18),
        (date(2026, 8, 14), "BRIGHTLINE STAFFING LLC DIR DEP", n["net"]),
        (date(2026, 8, 19), "ComEd utility autopay", -96.40),
        (date(2026, 8, 28), "BRIGHTLINE STAFFING LLC DIR DEP", n["net"]),
        (date(2026, 8, 30), "Card purchase Target", -88.27),
    ]
    close_aug = statement(out / "statement_aug_2026.pdf", bank, bank_addr, name, addr, acct, routing, date(2026, 8, 1), date(2026, 8, 31), 2410.55, aug_rows)
    oct_rows = [
        (date(2026, 10, 2), "BRIGHTLINE STAFFING LLC DIR DEP", n["net"]),
        (date(2026, 10, 5), "Rent payment Lakeview Homes", -1650.00),
        (date(2026, 10, 9), "Card purchase Jewel-Osco", -121.64),
        (date(2026, 10, 16), "BRIGHTLINE STAFFING LLC DIR DEP", n["net"]),
        (date(2026, 10, 21), "ComEd utility autopay", -88.10),
        (date(2026, 10, 28), "Venmo transfer", -200.00),
    ]
    statement(out / "statement_oct_2026.pdf", bank, bank_addr, name, addr, acct, routing, date(2026, 10, 1), date(2026, 10, 31), round(close_aug + 1580.33, 2), oct_rows)
    stub_pdf(out / "pay_stub_aug_28.pdf", employer, emp_addr, name, ", ".join(addr), date(2026, 8, 28), date(2026, 8, 15), date(2026, 8, 28), n, 4200.00 * 17, n["net"] * 17, acct[-4:])
    stub_scan_edited(out / "pay_stub_oct_16_scan.pdf", employer, emp_addr, name, ", ".join(addr), date(2026, 10, 16), date(2026, 10, 3), date(2026, 10, 16), n, n["net"] + 200.00, acct[-4:])
    utility_bill(out / "utility_bill_oct_2026.pdf", "Springfield Power & Light", name, ("48 Oak Ave", "Chicago, IL 60614"), "SPL-5520-1187", date(2026, 10, 20), date(2026, 11, 10), 92.35)
    cheque_png(out / "cheque_1042.png", bank, name, ", ".join(addr), "Viktor A. Morozkin", 1850.00, "One thousand eight hundred fifty dollars and 00/100", date(2026, 10, 28), "021000021", acct, "1042")
    (out / "CONTEXT.txt").write_text("Loan application, John Q Doe, $40,000, salary $109,200\n", encoding="utf-8")


def maria_santos(out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    name, addr = "Maria L Santos", ("2215 N Clark St Apt 4", "Chicago, IL 60614")
    bank, bank_addr, routing, acct = "1st Equity Bank", "3956 W Dempster St, Skokie, IL 60076", "071925693", "0081123356"
    employer, emp_addr = "Harbor Health Partners", "455 N Cityfront Plaza, Chicago, IL 60611"
    n = stub_numbers(3800.00, 418.00, 188.10)
    passport_png(out / "passport_maria_santos.png", "Santos", "Maria L", "C11946507", date(1993, 2, 21), "F", date(2033, 9, 12), date(2023, 9, 13))
    sep = [(date(2026, 9, 1), "Rent payment North Clark Lofts", -1450.00), (date(2026, 9, 11), "HARBOR HEALTH PARTNERS PAYROLL", n["net"]), (date(2026, 9, 15), "Mariano's", -96.20), (date(2026, 9, 25), "HARBOR HEALTH PARTNERS PAYROLL", n["net"])]
    close_sep = statement(out / "statement_sep_2026.pdf", bank, bank_addr, name, addr, acct, routing, date(2026, 9, 1), date(2026, 9, 30), 1820.40, sep)
    octr = [(date(2026, 10, 1), "Rent payment North Clark Lofts", -1450.00), (date(2026, 10, 9), "HARBOR HEALTH PARTNERS PAYROLL", n["net"]), (date(2026, 10, 14), "ComEd utility autopay", -71.85), (date(2026, 10, 23), "HARBOR HEALTH PARTNERS PAYROLL", n["net"])]
    statement(out / "statement_oct_2026.pdf", bank, bank_addr, name, addr, acct, routing, date(2026, 10, 1), date(2026, 10, 31), close_sep, octr)
    stub_pdf(out / "pay_stub_oct_09.pdf", employer, emp_addr, name, ", ".join(addr), date(2026, 10, 9), date(2026, 9, 26), date(2026, 10, 9), n, 3800.00 * 20, n["net"] * 20, acct[-4:])
    stub_pdf(out / "pay_stub_oct_23.pdf", employer, emp_addr, name, ", ".join(addr), date(2026, 10, 23), date(2026, 10, 10), date(2026, 10, 23), n, 3800.00 * 21, n["net"] * 21, acct[-4:])
    utility_bill(out / "utility_bill_oct_2026.pdf", "Springfield Power & Light", name, addr, "SPL-7731-0042", date(2026, 10, 18), date(2026, 11, 8), 71.85)
    (out / "CONTEXT.txt").write_text("Rental application, Maria L Santos, rent $1,450, salary $98,800\n", encoding="utf-8")


if __name__ == "__main__":
    base = ROOT / "demo_cases"
    john_doe(base / "john_doe_loan")
    maria_santos(base / "maria_santos_rental")
    for d in ("john_doe_loan", "maria_santos_rental"):
        print(d, sorted(p.name for p in (base / d).iterdir()))
