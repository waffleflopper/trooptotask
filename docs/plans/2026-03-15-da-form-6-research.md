# DA Form 6 (Duty Roster) Research - AR 220-45

## Governing Regulation

**AR 220-45, "Duty Rosters"** (Field Organizations) is the governing regulation. The companion document **DA PAM 220-45** provides detailed instructions for preparing and maintaining the form. The regulation applies to Active Army, Army Reserve, and Army National Guard (when in inactive duty training, annual training, or mobilization status).

The current form (DA Form 6) was last revised **July 1, 1974**. The regulation itself was most recently updated **9 April 2024**.

Key mandate: All locally established methods and procedures for DA Form 6 must comply with the intent of the regulation. Supplementation and establishment of local forms are prohibited without prior approval from Deputy Chief of Staff, G-1 (DAPE-MPA).

---

## Purpose

Duty rosters are kept for **recording the duty performed by each person** in an organization in order to **make an equitable determination of duty assignments**. A separate roster is maintained for each duty requiring the detail of individuals (e.g., one roster for CQ, another for Staff Duty, another for guard duty, etc.).

---

## AR 220-45 Chapter Structure

1. Purpose and Scope
2. Preparation and Maintenance
3. Details from Duty Rosters
4. Posting Duty Rosters
5. Weekends and Holidays
6. Disposition of Completed Rosters
7. Details from Units
8. Explanation of Figure 1 (the form itself)
9. Consolidated Roster (weekday-weekend-holiday combined)

---

## How the DA Form 6 Works

### Initial Setup

1. **Header**: Nature of duty (e.g., "CQ"), organization name, "From" and "To" dates
2. **Personnel listing**: Names entered **alphabetically within each pay grade**, beginning with the **highest pay grade** first
3. **Day columns**: Month and day headers across the top; entries are only posted for days when a detail is actually made (skip days with no detail)

### Adding New Personnel

- When a new roster is prepared, names are listed alphabetically by grade (highest first)
- **Subsequent names (new arrivals) are added at the foot (bottom) of the roster**, not re-alphabetized into the existing list
- This preserves the running number integrity of existing personnel

---

## The Numbering System

### Running Numbers (Sequential Numbers)

The DA Form 6 uses a **running number system** to track how long each person has been "off" a particular duty:

1. **Day 1**: Each person on the roster is assigned a sequential number starting with 1, going down the list (1, 2, 3, 4, ... n)
2. **Selection rule**: The person with the **highest number** for that day is selected for duty. That person's number represents they have been "longest off" that duty.
3. **Day 2**: Everyone's number **increases by one**. The person with the new highest number pulls the detail.
4. **After performing duty**: The person who pulled duty effectively resets to the bottom of the rotation.

### Core Selection Principle

> **"The person longest off the duty will be the next person detailed. When such person is not available, the person on the roster who is next longest off that duty will be detailed."**

This is the fundamental fairness mechanism -- it ensures equitable rotation.

---

## Exemption Codes and Their Effect on Numbering

This is where the system gets nuanced. There are three letter codes used when someone cannot be selected:

### "A" -- Authorized Absence (Number FREEZES)

**Used for**: Leave, pass, special duty, TDY, illness in line of duty, quarters (in line of duty), or any other authorized reason **not due to misconduct**.

**Effect on numbering**: The numbering sequence **is interrupted (frozen)**. The person's number stays the same for the duration of the absence. Their number only resumes climbing on the **first day back**.

**Rationale**: The person is absent for legitimate reasons and should not be penalized. By freezing their number, they don't accumulate "time off duty" while gone, so they won't be unfairly pushed to the top of the list when they return. They re-enter the rotation at roughly the same relative position.

### "D" -- Duty Elsewhere (Number CONTINUES to rise)

**Used for**: Personnel eligible for detail who **could not be selected** because of previous detail or other duty (e.g., they're already pulling CQ so they can't also pull guard duty that same day).

**Effect on numbering**: The numbering sequence **continues** and the appropriate number is included alongside the "D" abbreviation (e.g., "D7" or "7D").

**Rationale**: The person is available and willing but is already doing another duty. Their number keeps rising so they won't be double-penalized -- they'll still move up in the rotation and eventually cycle through naturally.

### "U" -- Unavailable Due to Misconduct (Number CONTINUES to rise)

**Used for**: AWOL, in arrest, in confinement, sick not in line of duty (e.g., injury from DUI determined "not in line of duty"), or otherwise unavailable **as a result of their own misconduct**.

**Effect on numbering**: The numbering sequence **continues** and the appropriate number is included alongside the "U" abbreviation.

**Rationale**: This is a **punitive** mechanism. Because the person's unavailability is their own fault, their number continues to rise. This means when they return, they'll have a high number and will be selected for duty sooner -- effectively "catching up" on missed duties. They are not protected from the rotation.

### Summary Table

| Code | Meaning                                      | Number Effect             | Fair?                                       |
| ---- | -------------------------------------------- | ------------------------- | ------------------------------------------- |
| A    | Authorized absence (leave, TDY, sick in LOD) | **Freezes** (interrupted) | Neutral -- no penalty, no benefit           |
| D    | Duty elsewhere (already on another detail)   | **Continues rising**      | Fair -- already doing duty                  |
| U    | Unavailable due to misconduct (AWOL, arrest) | **Continues rising**      | Punitive -- will pull duty sooner on return |

---

## Fairness and Equity Rules

1. **Equitable distribution is the primary purpose** of the DA Form 6 system
2. **Longest off = next to serve**: The fundamental algorithm ensures no one is repeatedly selected while others avoid duty
3. **Commanders have flexibility** in methods and procedures but must comply with the "spirit and intent" of the regulation
4. **Separate rosters per duty type**: Each type of duty (CQ, Staff Duty, guard, details, etc.) has its own roster, ensuring fairness within each duty category
5. **Weekend/Holiday consolidation**: AR 220-45 Chapter 9 requires consolidated weekday-weekend-holiday rosters whenever practicable, preventing separate "weekend warrior" lists that could be used to unfairly burden certain personnel
6. **Remarks section**: Numbers in parentheses after a Soldier's name reference explanatory remarks on the reverse of DA Form 6, providing transparency and audit trail

---

## Permanent vs Temporary Exemptions

The regulation does not formally define "permanent exemption" and "temporary exemption" as distinct categories, but in practice:

- **Temporary exemptions**: Handled through the A/D/U coding system. The person remains on the roster but is coded appropriately for the duration of their unavailability.
- **Permanent exemptions**: A person who is permanently exempt from a duty (e.g., by rank, position, or commander's determination) would simply **not be listed on that roster at all**. Since separate rosters are maintained per duty, a person can be on some rosters but not others.
- **Removal from roster**: When someone PCSs, ETSs, or is otherwise permanently removed, they come off the roster entirely. The remaining personnel's numbers continue as before.

---

## Key Implications for Digital Implementation

1. **Each duty type needs its own independent roster/rotation** with its own numbering
2. **The "highest number pulls duty" algorithm** is the core selection mechanism
3. **Three distinct absence states** (A, D, U) with different effects on the running count must be tracked
4. **New personnel are appended to the bottom**, not inserted alphabetically into an existing rotation
5. **The system must support freezing vs continuing numbers** based on absence type
6. **Audit trail** (remarks, explanatory notes) is part of the official form
7. **Weekend/holiday duties** should be trackable on the same roster as weekday duties
8. **Skip logic**: When the highest-numbered person is unavailable, the system must cascade to the next-highest available person

---

## Sources

- AR 220-45 (Army Regulation 220-45), "Duty Rosters" -- governing regulation
- DA PAM 220-45 -- companion pamphlet with detailed instructions
- DA Form 6 (July 1974) -- the physical form
- AskTOP.net -- CSM (Ret.) analysis of AR 220-45 requirements
- Army Study Guide -- DA Form 6 Q&A reference
- TemplateRoller -- DA Form 6 filling instructions
