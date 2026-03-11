# Bulk Import Test Files

## Personnel Import

### `personnel-import-with-headers.csv`
15 valid rows with standard headers. Tests:
- All rank tiers (enlisted, NCO, warrant, officer, civilian)
- MOS codes
- Group assignment (Alpha Squad, Bravo Squad, Charlie Squad)
- Missing optional fields (blank group, blank MOS)
- Name with apostrophe (O'Brien)

### `personnel-import-no-headers.csv`
5 valid rows with no headers. Tests positional fallback mapping.

### `personnel-import-shuffled-headers.csv`
5 valid rows with columns in a different order (First Name before Last Name, etc). Tests that header auto-detection correctly maps columns regardless of order.

### `personnel-import-with-errors.csv`
10 rows with a mix of valid and error cases. Tests:
- Row 1: ✅ Valid
- Row 2: ❌ Invalid rank (`E5` — not in ALL_RANKS)
- Row 3: ❌ Missing rank
- Row 4: ❌ Missing last name
- Row 5: ❌ Missing first name
- Row 6: ⚠️ Unknown group (`UnknownPlatoon`) — warning, still importable
- Row 7: ✅ Valid
- Row 8: ✅ Valid
- Row 9: ❌ Invalid rank (`GENERAL`)
- Row 10: ✅ Valid with apostrophe in name

Expected: 5 valid rows ready, 4 errors, 1 warning

---

## Training Import

> **Note:** These files assume personnel from `personnel-import-with-headers.csv` have already been imported. The training types used (CPR/BLS, Sexual Harassment Prevention, Active Shooter Training) must exist in your org's training type list.

### `training-import-with-headers.csv`
15 rows covering all status value types:
- ISO dates (`2024-09-15`)
- US format dates (`09/22/2024`)
- Yes/done/x values (for non-expiring types)
- `exempt` keyword
- `no` to skip a row
- Notes field

### `training-import-with-errors.csv`
10 rows with error cases:
- Row 1: ✅ Valid date
- Row 2: ❌ Training type not found
- Row 3: ❌ Person not found
- Row 4: ❌ Invalid status value (`maybe`)
- Row 5: ❌ Invalid date (`13/45/2024`)
- Row 6: ✅ Valid exempt
- Row 7: ✅ Valid yes on non-expiring type
- Row 8: ⬜ Empty status — skipped (auto-unchecked)
- Row 9: ✅ Valid date
- Row 10: ✅ Valid date

Expected: 5 ready, 4 errors, 1 skipped

### `training-import-alt-headers.csv`
4 valid rows using non-standard header names:
- `surname` → Last Name
- `given name` → First Name
- `course` → Training Type
- `date completed` → Date / Status
- `remarks` → Notes

Tests the fuzzy header matching.
