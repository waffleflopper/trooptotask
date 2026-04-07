# Bulk Import Mock Data

This folder contains large mock CSVs sized to exercise the bulk import flows without breaking current batch limits.

Files:
- personnel-large-org.csv: 120 personnel rows
- statuses-large-org-mar-apr-may-2026.csv: 240 status rows across last month, this month, and next month
- training-large-org.csv: 430 training rows, which stays under the current 500-row training import cap

Recommended import order:
1. Import personnel from personnel-large-org.csv
2. Create the status types listed below
3. Import statuses from statuses-large-org-mar-apr-may-2026.csv
4. Create the training types listed below
5. Import training from training-large-org.csv

Status types used in the CSV:
- Leave
- TDY
- School
- Field/Training
- Appointment
- Sick
- Quarters
- Recovery

Suggested status colors:
- Leave: #48bb78
- TDY: #9f7aea
- School: #4299e1
- Field/Training: #a0522d
- Appointment: #ed8936
- Sick: #e53e3e
- Quarters: #718096
- Recovery: #38b2ac

Training types used in the CSV:
- ACFT: fixed expiration, 6 months, can be exempted, warning 60/30
- Height/Weight: fixed expiration, 6 months, can be exempted, warning 60/30
- Weapons Qualification: fixed expiration, 12 months, no exemptions, warning 60/30
- PHA: expiration date only, no exemptions, warning 60/30
- CPR/BLS: fixed expiration, 24 months, no exemptions, warning 60/30
- SHARP: fixed expiration, 12 months, no exemptions, warning 60/30
- EO: fixed expiration, 12 months, no exemptions, warning 60/30
- Cyber Awareness: fixed expiration, 12 months, no exemptions, warning 60/30
- CLS / First Aid: fixed expiration, 24 months, no exemptions, warning 60/30
- Safety Brief: never expires, no exemptions, accepts yes/no in bulk import

Notes:
- These training dates are tuned for April 2026 so the matrix shows a realistic spread of current, coming-due, overdue, exempt, and not-done states.
- Not-done is represented intentionally by missing training records for some people and training types.
- The CSV uses exact status and training names, so creating the types with the same names will make the import path clean with no mapping cleanup.
