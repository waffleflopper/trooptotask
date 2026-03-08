# Permission Enhancements, Deletion Approvals & Notifications — Design

**Date:** 2026-03-08
**Status:** Approved

## Overview

This design covers six areas of work building on the permission redesign:

1. Fix team leader group dropdown bug + remove unused presets
2. Add onboarding and leader's book permission toggles
3. Restrict config/power features to full editors, admins, and owners
4. Deletion approval workflow for non-privileged users
5. Admin hub with sub-navigation (Approvals + Audit Log)
6. Notification system (bell icon, extensible types)

---

## 1. Team Leader Group Dropdown Fix & Preset Cleanup

### Bug

In `OrganizationMemberManager.svelte`, the group picker for team leaders only shows when `preset === 'team-leader'`, but `preset` is computed from the member's **current stored role**, not the newly selected dropdown value. So when assigning someone as team leader for the first time, the group picker never appears.

### Fix

Track selected preset value in component state. When "Team Leader" is selected from the dropdown, show the group picker based on the *selected* value, not the stored member data.

### Preset Cleanup

Remove `calendar-only`, `personnel-only`, `training-only` from `PERMISSION_PRESETS` and UI dropdown. Remaining presets: admin, full-editor, team-leader, viewer, custom.

---

## 2. New Permission Columns: Onboarding & Leader's Book

### Database Changes

Add four columns to `organization_memberships` and `organization_invitations`:
- `can_view_onboarding BOOLEAN DEFAULT true`
- `can_edit_onboarding BOOLEAN DEFAULT true`
- `can_view_leaders_book BOOLEAN DEFAULT true`
- `can_edit_leaders_book BOOLEAN DEFAULT true`

Defaults are `true` so existing members retain full access.

### RLS Functions

Add four new functions matching existing pattern:
- `can_view_onboarding(p_organization_id uuid)`
- `can_edit_onboarding(p_organization_id uuid)`
- `can_view_leaders_book(p_organization_id uuid)`
- `can_edit_leaders_book(p_organization_id uuid)`

### TypeScript Types

Update `OrganizationMember`, `OrganizationMemberPermissions`, `PermissionPreset` definitions in `src/lib/types.ts`. Update `PERMISSION_PRESETS` with new fields.

### Preset Values

| Preset | Onboarding | Leader's Book | Other |
|--------|-----------|---------------|-------|
| admin | view+edit | view+edit | all true |
| full-editor | view+edit | view+edit | all true except canManageMembers=false |
| team-leader | view+edit | view+edit | same as full-editor + scopedGroupId |
| viewer | view only | view only | all view=true, edit=false |

### Enforcement

- Layout server loads and passes `canViewOnboarding`, `canEditOnboarding`, `canViewLeadersBook`, `canEditLeadersBook`
- Onboarding page: show "no permission" message when `canViewOnboarding=false`, disable edits when `canEditOnboarding=false`
- Leader's book page: show "no permission" message when `canViewLeadersBook=false`, disable edits when `canEditLeadersBook=false`
- Calendar, personnel, training pages: same pattern for existing permissions (show message when view=false)
- API routes: enforce via `requireEditPermission` extended to support new permission types

### UI

- `OrganizationMemberManager.svelte`: add Onboarding and Leader's Book sections to the custom permission grid
- Settings page invite form: new permissions carried through invitation flow

---

## 3. Config & Power Feature Restrictions

### "Full Editor" Detection

A member with ALL 11 permission toggles set to true (canViewCalendar, canEditCalendar, canViewPersonnel, canEditPersonnel, canViewTraining, canEditTraining, canViewOnboarding, canEditOnboarding, canViewLeadersBook, canEditLeadersBook, canManageMembers). Detected dynamically via helper function, not stored.

### Restricted Features

These require full-editor, admin, or owner:

**Type/Config Managers:**
- StatusTypeManager
- AssignmentTypeManager
- TrainingTypeManager
- CounselingTypeManager
- OnboardingTemplateManager
- SpecialDayManager

**Calendar Power Features:**
- BulkStatusModal (mass status apply)
- DutyRosterGenerator
- MonthlyAssignmentPlanner

**Other:**
- Data export

### Implementation

- Layout server computes and passes `isFullEditor` boolean
- Pages check `isFullEditor || isPrivileged` to show/hide feature buttons
- API routes for type management add server-side check

---

## 4. Deletion Approval Workflow

### New Table: `deletion_requests`

```sql
CREATE TABLE deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  requested_by_email TEXT NOT NULL,
  resource_type TEXT NOT NULL, -- 'personnel', 'counseling_record', 'training_record', 'development_goal'
  resource_id UUID NOT NULL,
  resource_description TEXT NOT NULL, -- e.g. "SGT Smith - Annual Counseling (2026-03-01)"
  resource_url TEXT, -- e.g. "/org/{orgId}/leaders-book?person={id}"
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'denied'
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  denial_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Who Goes Through Approval

Anyone who is NOT an owner, admin, or full editor. Full editors can delete directly.

### What Requires Approval

- Deleting personnel records
- Deleting counseling records
- Deleting training records
- Deleting development goals

### Flow

1. Non-privileged user clicks "Delete" → creates `deletion_request` with status='pending'
2. Record stays in DB unchanged
3. UI shows "Pending deletion" indicator to the requester on that record
4. Requester can click "Cancel request" to remove the `deletion_request`
5. Admin/owner reviews on Approvals page
6. **Approve:** Actual deletion happens server-side, notification sent to requester
7. **Deny:** Request marked denied with optional reason, notification sent to requester

### API

- `POST /org/[orgId]/api/deletion-requests` — create request
- `DELETE /org/[orgId]/api/deletion-requests` — cancel own request
- `POST /org/[orgId]/api/deletion-requests/review` — approve or deny (admin/owner only)
- `GET /org/[orgId]/api/deletion-requests` — list requests (admin: all, member: own)

---

## 5. Admin Hub

### URL Structure

- `/org/[orgId]/admin/` — layout with sub-navigation
- `/org/[orgId]/admin/approvals` — deletion approval requests
- `/org/[orgId]/admin/audit` — audit log (moved from `/org/[orgId]/audit/`)

### Layout

Horizontal tab bar: **Approvals** | **Audit Log**

Access restricted to owner and admin roles.

### Approvals Page

- Table columns: Requester (email), Action ("Delete"), Description (linked to resource), Requested (timestamp)
- Approve / Deny buttons per row
- Deny shows text field for optional reason
- Filter tabs: Pending | Resolved (approved/denied history)

### Migration

- Old `/org/[orgId]/audit/` route removed
- Avatar menu "Audit Log" becomes "Admin" pointing to `/org/[orgId]/admin/approvals`
- Redirect from `/org/[orgId]/audit` to `/org/[orgId]/admin/audit` for bookmarks

---

## 6. Notification System

### New Table: `notifications`

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'deletion_approved', 'deletion_denied', extensible
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT, -- optional navigation link
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Bell Icon Component

- Location: header, next to avatar circle
- Red dot badge when unread count > 0
- Click opens dropdown with notification list
- Each notification: title, message, relative timestamp, trash icon to dismiss
- Clicking notification with link navigates there and marks as read
- "Mark all read" at top of dropdown

### When Notifications Are Created

- Deletion request approved → notify requester
- Deletion request denied → notify requester (includes denial reason in message)
- Future extensibility: member joins, invitation accepted, etc.

### Data Loading

- Unread count loaded in org layout server, passed to header
- Full notification list fetched client-side when bell is clicked (API endpoint)
- Refreshed on page navigation

### API

- `GET /org/[orgId]/api/notifications` — list user's notifications
- `PUT /org/[orgId]/api/notifications` — mark as read / mark all read
- `DELETE /org/[orgId]/api/notifications` — dismiss notification
