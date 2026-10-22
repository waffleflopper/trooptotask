# ADR index

Every ADR listed here is current.

| ADR                                                                                                                         | Decision                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| [0001: Organization authorization model](adrs/0001-v1-authorization-replacement-model.md)                                   | Fixed governance roles, presets with per-lane capability overrides, one shared scope set and independent feature lanes.                 |
| [0006: Duty Role terminology](adrs/0006-legacy-terminology-compatibility-policy.md)                                         | Say **Duty Role** to users and keep `clinic_role` and `clinicRole` as compatibility names.                                              |
| [0009: Access Requests and Account Setup Links](adrs/0009-beta-access-request-account-setup-links.md)                       | App-owned, hashed, 14-day setup links create a **User Account** only after the recipient sets a password, behind an email-scoped claim. |
| [0011: Platform Administration boundary](adrs/0011-platform-administration-boundary.md)                                     | Platform support is separate from Organization governance, and Organization surfaces read platform state only through narrow ports.     |
| [0012: Organization-invited platform access auto-approval](adrs/0012-organization-invited-platform-access-auto-approval.md) | An Organization Invitation approves the invitee's Access Request through a grant derived from live invitations.                         |

Write an ADR only for a decision that is current, surprising and hard to reverse. Put it in `adrs/`. Number it 0014 or higher, because deleted numbers are not reused. An ADR states the decision, the non-obvious reason for it and the constraints it imposes. When a decision no longer holds, delete its ADR and its row here.
