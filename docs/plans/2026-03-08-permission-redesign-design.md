# Permission System Redesign

## Goal

Upgrade TroopToTask's permission system from a two-role model (owner/member) to a three-role model (owner/admin/member) with optional group-scoped access for members. The system should be powerful and customizable when needed, but simple by default.

## Architecture

### Roles

Three database roles via the `organization_role` enum: `owner`, `admin`, `member`.

| Capability | Owner | Admin | Member |
|---|---|---|---|
| All org data (read/write) | Yes | Yes | Per permission flags |
| View audit logs | Yes | Yes | No |
| Manage members & invitations | Yes | Yes | Per `can_manage_members` flag |
| Org settings (name, billing) | Yes | Yes | No |
| Transfer ownership | Yes | No | No |
| Delete organization | Yes | No | No |

Owners and admins bypass individual permission flags — they always have full org-wide access. Members are checked against their 7 boolean permission flags (unchanged from today).

### Group Scoping

A new nullable column on `organization_memberships` and `organization_invitations`:

```sql
scoped_group_id UUID REFERENCES groups(id) ON DELETE SET NULL
```

- `NULL` (default) = org-wide access. This is today's behavior; nothing changes for existing members.
- Set to a group ID = member can only see/edit personnel in that group, with the exception of the calendar.

**Group scoping only applies to the `member` role.** Owners and admins are always org-wide.

### Scoping Rules by Page

| Page | Org-wide member | Group-scoped member |
|---|---|---|
| Calendar | See all, edit per flags | See all, edit only own group |
| Personnel | See all, edit per flags | See only own group |
| Training | See all, edit per flags | See only own group |
| Leader's Book | See all, edit per flags | See only own group |
| Audit Log | No access | No access |
| Org Settings | No access (unless `can_manage_members`) | No access |

When a scoped group is deleted, `ON DELETE SET NULL` returns the member to org-wide access.

### Permission Presets

| Preset | Role | Scope | Description |
|---|---|---|---|
| Admin | `admin` | org-wide | Full access, manage members, view audit log |
| Full Editor | `member` | org-wide | All edit permissions, no member management |
| Team Leader | `member` | scoped to group | All edit permissions for their group only |
| Calendar Only | `member` | org-wide | View/edit calendar, view-only personnel & training |
| Personnel Only | `member` | org-wide | View/edit personnel, view-only calendar & training |
| Training Only | `member` | org-wide | View/edit training, view-only calendar & personnel |
| Viewer | `member` | org-wide | View all, edit nothing |
| Custom | `member` | configurable | Individual flag + scope selection |

### Enforcement Points

1. **Layout data loading** (`+layout.server.ts`): When `scoped_group_id` is set, filter `personnel`, `personnelTrainings`, and leader's book queries to that group. Calendar data remains unfiltered for org-wide visibility.

2. **API routes** (`crudFactory.ts` + manual endpoints): Add group-scope enforcement. If the acting member has a `scoped_group_id` and the target record's `personnel_id` belongs to a different group, return 403.

3. **Permission helpers** (`permissions.ts`): Update all `isOwner` checks to `isOwner || isAdmin`. Add `getGroupScope(supabase, orgId, userId)` helper that returns the scoped group ID or null. Add `requireAdminOrOwner()` for audit log / settings access.

4. **Settings page**: Admins can access org settings and manage members. Only owners see the transfer ownership and delete organization sections. The invite flow gets a "Team Leader" preset with a group picker dropdown.

5. **Audit log pages**: Gate on `role === 'owner' || role === 'admin'` instead of owner-only. Update both the org-level audit page and the avatar menu link.

6. **UI role badges**: Display "Owner", "Admin", or "Member" in the settings member list and avatar menu header.

### Database Migration

```sql
-- Add 'admin' to the role enum
ALTER TYPE organization_role ADD VALUE 'admin';

-- Add group scope column to memberships
ALTER TABLE organization_memberships
  ADD COLUMN scoped_group_id UUID REFERENCES groups(id) ON DELETE SET NULL;

-- Add group scope column to invitations
ALTER TABLE organization_invitations
  ADD COLUMN scoped_group_id UUID REFERENCES groups(id) ON DELETE SET NULL;
```

Existing data is unaffected: all current members have `NULL` scope (org-wide) and retain their `owner` or `member` roles.

### Key Invariants

- Owners and admins always have org-wide access; group scoping is ignored for these roles.
- A member with `scoped_group_id = NULL` behaves exactly like today (org-wide, per-flag permissions).
- Calendar visibility is always org-wide regardless of scope (for coordination). Calendar *editing* respects group scope.
- Deleting a group that a member is scoped to gracefully falls back to org-wide access (ON DELETE SET NULL).
- The "Team Leader" preset is just a member with all edit flags + a scoped group — no special logic beyond existing flag checks + scope filtering.
