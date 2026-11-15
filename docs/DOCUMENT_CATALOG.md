# Document catalog

96 document types in 17 families. The intake sorter reads every page of every upload, matches it against this catalog and splits a mixed upload into separate documents.

**Checked** means a detailed pack reads its fields and runs document-specific checks. Every other type is still recognised, sorted, run through the PDF, pixel and character forensics and linked on the relationship graph, with general field reading.

Generated from `workflows/catalog/documents.yaml` by `python -m engines.catalog --markdown docs/DOCUMENT_CATALOG.md`.

## Identity (11)

| Document | Checked | Used for | Recognised by headings such as |
|---|---|---|---|
| Passport | yes | kyc, account, loan, mortgage, rental, insurance | passport, passeport, pasaporte, passaporte, reisepass |
| National ID card | yes | kyc, account, loan, mortgage, rental, insurance | national identity card, national id card, identity card, national id, carte nationale d'identite |
| Driver's license | yes | kyc, account, loan, mortgage, rental, insurance, auto | driver license, drivers license, driver's license, driving licence, driver licence |
| State or non-driver ID card | yes | kyc, account, loan, rental | non-driver identification card, non-driver id, state identification card, state id card, identification card |
| Residence permit or permanent resident card | yes | kyc, account, loan, rental | residence permit, residence card, permanent resident card, biometric residence permit, green card |
| Visa | yes | kyc, rental | entry visa, schengen visa, visa type, visa |
| Refugee or travel document | yes | kyc, account | refugee travel document, convention travel document, travel document, laissez-passer, emergency travel document |
| Voter ID card |  | kyc, account | voter id card, voter's card, voter card, electoral card, voter registration card |
| Social security card |  | kyc, loan, rental | social security card |
| Tax ID card |  | kyc, account, loan | permanent account number card, permanent account number, pan card, taxpayer identification card, tax identification card |
| Military ID |  | kyc, loan | uniformed services identification, armed forces identification, military id, common access card, veteran id card |

## Proof of address (3)

| Document | Checked | Used for | Recognised by headings such as |
|---|---|---|---|
| Utility bill | yes | kyc, account, loan, mortgage, rental | electricity bill, electric bill, gas bill, water bill, utility bill |
| Phone or internet bill | yes | kyc, account, loan, rental | phone bill, mobile bill, wireless bill, internet bill, broadband bill |
| Certificate of residence |  | kyc, account, loan, rental | certificate of residence, proof of residence, residence certificate, attestation de residence, certificat de residence |

## Bank accounts (7)

| Document | Checked | Used for | Recognised by headings such as |
|---|---|---|---|
| Bank statement | yes | account, loan, mortgage, rental, business | bank statement, account statement, statement of account, checking account statement, savings account statement |
| Credit card statement |  | loan, mortgage, rental | credit card statement, card statement, card account statement, credit card account statement |
| Mobile money or digital wallet statement |  | account, loan, rental | m-pesa statement, mpesa statement, mobile money statement, mtn mobile money, airtel money |
| Bank reference or account confirmation letter |  | account, loan, rental, business | bank reference letter, bank reference, account confirmation letter, confirmation of account, account verification letter |
| Direct deposit or bank details form |  | account, loan | direct deposit authorization, direct deposit form, direct deposit enrollment, bank details form, account details form |
| Wire or bank transfer confirmation |  | account, loan, mortgage, insurance, business | wire transfer confirmation, transfer confirmation, payment confirmation, swift confirmation, remittance advice |
| Deposit slip |  | account, loan | deposit slip, deposit ticket, paying-in slip, bordereau de remise, bordereau de versement |

## Payment instruments (4)

| Document | Checked | Used for | Recognised by headings such as |
|---|---|---|---|
| Cheque | yes | account, loan, mortgage, rental, insurance | pay to the order of, pay to the order, payez a l'ordre de, paguese a la orden de, pague por este cheque |
| Cashier's check or bank draft | yes | mortgage, rental, insurance | cashier's check, cashiers check, official check, bank draft, banker's draft |
| Money order |  | rental | money order, postal money order, postal order, mandat postal, giro postal |
| Payment card | yes | account, insurance | valid thru, good thru, valid through, debit card, credit card |

## Income and employment (6)

| Document | Checked | Used for | Recognised by headings such as |
|---|---|---|---|
| Pay stub | yes | loan, mortgage, rental | pay stub, paystub, pay slip, payslip, earnings statement |
| Employment verification or offer letter | yes | loan, mortgage, rental | offer letter, offer of employment, letter of employment, employment verification, verification of employment |
| Employment contract |  | loan, mortgage, rental | employment contract, employment agreement, contract of employment, contrat de travail, contrato de trabajo |
| W-2 wage and tax statement | yes | loan, mortgage, rental | form w-2, wage and tax statement, w-2 |
| 1099 income form | yes | loan, mortgage, rental | form 1099-nec, form 1099-misc, form 1099-int, form 1099-div, form 1099-k |
| Benefits or pension award letter |  | loan, mortgage, rental | benefit award letter, award letter, notice of award, benefit statement, ssa-1099 |

## Tax (7)

| Document | Checked | Used for | Recognised by headings such as |
|---|---|---|---|
| Personal tax return | yes | loan, mortgage, rental, business | form 1040, u.s. individual income tax return, individual income tax return, income tax return, self assessment tax return |
| Business tax return |  | loan, business | form 1120-s, form 1120, form 1065, schedule k-1, u.s. corporation income tax return |
| Tax assessment or notice |  | loan, mortgage, rental | notice of assessment, tax assessment, assessment notice, irs notice, notice cp |
| Tax transcript |  | loan, mortgage | tax return transcript, wage and income transcript, account transcript, record of account transcript, verification of non-filing |
| Tax clearance or compliance certificate |  | business, loan | tax clearance certificate, certificate of tax compliance, tax compliance certificate, tax residency certificate, certificate of tax residence |
| Tax ID registration letter |  | business, account | ein assignment, employer identification number assigned, cp 575, tin certificate, tax registration certificate |
| W-9 or W-8 taxpayer form |  | account, business | form w-9, request for taxpayer identification number and certification, form w-8ben-e, form w-8ben, certificate of foreign status |

## Savings and investments (6)

| Document | Checked | Used for | Recognised by headings such as |
|---|---|---|---|
| Investment or brokerage statement |  | loan, mortgage, account | brokerage statement, investment statement, portfolio statement, investment account statement, statement of holdings |
| Retirement or pension fund statement |  | loan, mortgage | 401(k) statement, 401k statement, ira statement, retirement account statement, pension fund statement |
| Crypto exchange statement |  | loan, account | crypto statement, cryptocurrency statement, coinbase, binance, kraken |
| Term deposit certificate |  | loan, account | certificate of deposit, fixed deposit receipt, fixed deposit certificate, term deposit certificate, time deposit certificate |
| Gift letter |  | mortgage, loan | gift letter, letter of gift, gift affidavit |
| Proof of funds letter |  | mortgage, rental, account | proof of funds, evidence of funds, funds verification letter, verification of funds |

## Loans and credit (5)

| Document | Checked | Used for | Recognised by headings such as |
|---|---|---|---|
| Loan statement |  | loan, mortgage | loan statement, loan account statement, auto loan statement, student loan statement, personal loan statement |
| Loan agreement or promissory note |  | loan, business | loan agreement, promissory note, credit agreement, facility agreement, loan contract |
| Credit report |  | loan, mortgage, rental | credit report, consumer credit report, credit file, credit score report, experian |
| Payoff letter |  | loan, mortgage, auto | payoff letter, payoff statement, payoff quote, settlement figure, redemption statement |
| Collection or default notice |  | loan, rental | collection notice, debt collection, final notice, notice of default, past due notice |

## Property and housing (9)

| Document | Checked | Used for | Recognised by headings such as |
|---|---|---|---|
| Lease or tenancy agreement |  | rental, loan, mortgage, kyc | lease agreement, residential lease, rental agreement, tenancy agreement, assured shorthold tenancy |
| Rent receipt |  | rental, loan | rent receipt, rental receipt, quittance de loyer, recibo de alquiler, recibo de arrendamiento |
| Landlord reference |  | rental | landlord reference, rental reference, tenant reference, rental verification, verification of rent |
| Mortgage statement |  | mortgage, loan, rental | mortgage statement, home loan statement, mortgage account statement, escrow account statement, annual escrow statement |
| Property tax bill |  | mortgage, loan, kyc | property tax bill, property tax statement, real estate tax bill, real property tax, council tax bill |
| Title deed or land registry record |  | mortgage, loan, business | warranty deed, grant deed, quitclaim deed, title deed, deed of trust |
| Property purchase agreement |  | mortgage | purchase agreement, purchase and sale agreement, residential purchase agreement, sales contract, offer to purchase |
| Property appraisal or valuation |  | mortgage | appraisal report, uniform residential appraisal report, valuation report, property valuation, home appraisal |
| Closing or settlement statement |  | mortgage | closing disclosure, settlement statement, hud-1, loan estimate, completion statement |

## Business and company (7)

| Document | Checked | Used for | Recognised by headings such as |
|---|---|---|---|
| Certificate of incorporation or registration |  | business, account | certificate of incorporation, certificate of formation, certificate of organization, articles of incorporation, articles of organization |
| Articles, bylaws or operating agreement |  | business, account | articles of association, memorandum of association, memorandum and articles, bylaws, by-laws |
| Business license or trade registration |  | business, account | business license, business licence, trade license, trading licence, business registration certificate |
| Certificate of good standing |  | business, account | certificate of good standing, certificate of existence, certificate of status, letter of good standing |
| Beneficial ownership or shareholder register |  | business, account | beneficial ownership, ultimate beneficial owner, register of members, shareholder register, share register |
| Board resolution or minutes |  | business, account | board resolution, resolution of the board, written resolution, minutes of the meeting, minutes of a meeting |
| Financial statements (balance sheet, profit and loss) |  | business, loan, mortgage | balance sheet, statement of financial position, income statement, profit and loss statement, profit and loss |

## Invoices and receipts (4)

| Document | Checked | Used for | Recognised by headings such as |
|---|---|---|---|
| Invoice | yes | insurance, business, loan | tax invoice, commercial invoice, invoice, facture, factura |
| Receipt | yes | insurance, business | sales receipt, payment receipt, cash receipt, receipt, recibo |
| Purchase order |  | business | purchase order, bon de commande, orden de compra, pedido de compra, bestellung |
| Quote or estimate |  | insurance, business | quotation, quote, estimate, pro forma invoice, proforma invoice |

## Insurance (5)

| Document | Checked | Used for | Recognised by headings such as |
|---|---|---|---|
| Insurance policy or declarations page |  | insurance, mortgage, auto, rental | declarations page, policy declarations, insurance policy, policy schedule, certificate of insurance |
| Insurance card |  | insurance, kyc | insurance card, member id card, health insurance card, proof of insurance card, insurance identification card |
| Insurance claim form |  | insurance | claim form, notice of claim, first notice of loss, proof of loss, sworn statement in proof of loss |
| Repair estimate |  | insurance, auto | repair estimate, estimate of repair, estimate of record, damage estimate, auto body estimate |
| Medical bill or explanation of benefits |  | insurance | medical bill, hospital bill, patient statement, statement of services, explanation of benefits |

## Vehicles (3)

| Document | Checked | Used for | Recognised by headings such as |
|---|---|---|---|
| Vehicle registration |  | auto, insurance, loan | vehicle registration, registration certificate, registration card, v5c, vehicle log book |
| Vehicle title |  | auto, loan | certificate of title for a vehicle, vehicle title, motor vehicle title, certificate of title, title certificate |
| Bill of sale |  | auto, loan, insurance | bill of sale, vehicle bill of sale, motor vehicle bill of sale |

## Civil and legal records (10)

| Document | Checked | Used for | Recognised by headings such as |
|---|---|---|---|
| Birth certificate |  | kyc, insurance | birth certificate, certificate of birth, certificate of live birth, acte de naissance, extrait d'acte de naissance |
| Marriage certificate |  | kyc, mortgage, insurance | marriage certificate, certificate of marriage, marriage license, acte de mariage, acta de matrimonio |
| Divorce decree |  | mortgage, loan | divorce decree, decree of divorce, judgment of dissolution, final decree of divorce, decree absolute |
| Death certificate |  | insurance | death certificate, certificate of death, acte de deces, acta de defuncion, certidao de obito |
| Court order or judgment |  | loan, mortgage, insurance | court order, order of the court, judgment, judgement, writ of |
| Power of attorney |  | account, mortgage, loan | power of attorney, durable power of attorney, procuration, procuracion, poder notarial |
| Affidavit or sworn declaration |  | kyc, insurance, loan | affidavit, sworn statement, statutory declaration, declaration under penalty of perjury, attestation sur l'honneur |
| Police or incident report |  | insurance | police report, incident report, accident report, crime report, traffic collision report |
| Bankruptcy record |  | loan, mortgage | discharge of debtor, order of discharge, bankruptcy petition, notice of bankruptcy, chapter 7 |
| Probate or estate document |  | account, insurance, mortgage | letters of administration, letters testamentary, grant of probate, last will and testament, certificate of inheritance |

## Education (2)

| Document | Checked | Used for | Recognised by headings such as |
|---|---|---|---|
| Enrollment or student status letter |  | rental, loan, account | enrollment verification, enrolment verification, proof of enrollment, certificate of enrollment, enrolment certificate |
| Transcript or diploma |  | loan | academic transcript, official transcript, diploma, degree certificate, certificate of completion |

## Applications and forms (6)

| Document | Checked | Used for | Recognised by headings such as |
|---|---|---|---|
| Loan application form |  | loan, mortgage, auto | uniform residential loan application, loan application, credit application, application for credit, mortgage application |
| Rental application form |  | rental | rental application, tenant application, application to rent, lease application, dossier de location |
| Account opening or KYC form |  | account, kyc, business | account opening form, application to open an account, new account application, customer information form, know your customer |
| Tax or records authorization form |  | loan, mortgage | form 4506-c, form 4506-t, request for transcript of tax return, form 8821, authorization to release information |
| Verification of employment or deposit form |  | loan, mortgage | request for verification of employment, request for verification of deposit, verification of deposit, form 1005, form 1006 |
| Source of funds or wealth declaration |  | account, kyc, mortgage, business | source of funds declaration, source of wealth declaration, declaration of source of funds, source of funds, source of wealth |

## Other (1)

| Document | Checked | Used for | Recognised by headings such as |
|---|---|---|---|
| Other financial document |  |  |  |
