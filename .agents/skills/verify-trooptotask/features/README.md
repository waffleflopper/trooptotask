# TroopToTask feature map

This is a user-facing behavior map for the web app. Start with one relevant file, then drive every entry point and state the change could affect. The five initial files cover access, finding people, managing groups, moving through Calendar, and availability. Add another short file when work reaches an unmapped feature.

## Baseline preconditions

- Run `doctor` on the owned production app before driving. Its candidate and origin must match `launch`.
- Use the disposable synthetic organization and accounts created by `launch`. `manager` has Personnel and Group controls; `calendarOperate` has Calendar controls; `viewer` and `scoped` exercise read and scope limits.
- `login ROLE` returns the actual page ID and organization ID. Use those values in commands. The UIDs in DevTools snapshots are temporary: take a new snapshot, read the UID beside the named control, and use it for the next `click` or `fill`.
- Work in one worker/browser at a time. Worker `2` is a separate session only when every command includes `--worker 2`.

## Driving conventions

The files use `PAGE` for the page ID from `login` and `UID` for a control from the latest snapshot. Set both to their actual values before running a command. For example, after the snapshot identifies the `Manage Groups` button:

```bash
PAGE=2
UID=4_27
npm run --silent verify:app -- tool click "{\"pageId\":$PAGE,\"uid\":\"$UID\"}"
```

The values above came from one observed run and are not stable selectors. Match the control's accessible name in a fresh snapshot each time; when names repeat, use its containing dialog or row. After a mutation, reload or reopen through the UI before claiming persistence. Wait for an observable heading, row, or dialog rather than a fixed delay. Capture a before snapshot, after snapshot, screenshot, and the second read under `.verification/evidence/verify-trooptotask/<run-name>/`.

## Proof and skip reporting

- Show the user action and resulting visible state. For saved data, confirm it through a second user-facing read after reload or reopening.
- Check the exact role and organization in the session. A manager result does not establish what a scoped member can see.
- For affected behavior, drive every reachable entry point and the success, cancel, empty, denied, and persistence states that apply. Name any skipped path and its unmet prerequisite.
- Inspect network or console output when the visible state is ambiguous; use read-only evaluation only after the user path.

## Features

### Access

- [Sign in and sign out](sign-in.md): public sign-in gate, synthetic sign-in, account menu, and session exit.

### People

- [Find personnel](find-personnel.md): roster search, grouped and alphabetical views, and opening a record.
- [Manage groups](manage-groups.md): add, edit, remove, and persist organization groups.

### Calendar

- [Calendar navigation](calendar-navigation.md): month, today, long-range view, group filter, and search.
- [Availability status](availability-status.md): inspect, add, edit, cancel, and remove a person's status.

## Feature entry contract

Every feature file has one user-facing summary and these four H2 sections in order: `Sub-features`, `How to get to it (user POV)`, `Driving it with verify:app`, and `Gotchas`. Keep commands and expected observations together so an agent can run the file without reading application code.
