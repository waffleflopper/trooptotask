## Design Context

### Users

TroopToTask is designed for military unit leaders and administrative staff responsible for readiness, accountability, and continuity across an organization. Primary users include commanders, XOs, first sergeants, platoon leaders, platoon sergeants, section leaders, training room NCOs, S1/admin staff, and higher-headquarters viewers with scoped access.

They use the product in operational contexts where time pressure, handoffs, and briefing cadence matter. Their core job is to answer unit questions quickly and confidently: who is here, who is unavailable, what is due, where the gaps are, and what action is required before the next formation, brief, or transition.

The interface should leave users feeling confident, supported by authority-grade information, and able to depend on the system as the source of truth.

### Brand Personality

The brand personality is operational, structured, and practical.

The voice should feel disciplined, direct, and trustworthy under pressure. It should communicate authority without theatrics, and clarity without becoming sterile. This is not consumer productivity software and should never sound playful, trendy, or over-marketed.

Emotionally, the product should evoke confidence, authority, and dependability. It should feel like a tool leaders can rely on during real unit work, not a polished demo pretending to understand that environment.

### Aesthetic Direction

The visual direction is "Utilitarian Precision" with the feel of a military field document: printed orders, technical manuals, accountability forms, and operational paperwork translated into a modern web interface.

The established design system should remain the foundation:

- Barlow Condensed for commanding, structured display typography
- Source Serif 4 for readable, authoritative body copy
- IBM Plex Mono for labels, metadata, status markers, and operational detail
- Neutral paper-and-ink palette with a single operational amber accent used only to signal
- Hairline dividers, restrained radii, minimal shadows, and structured grids instead of decorative effects
- Light and dark mode support through token remapping, without changing the product's overall character

The interface must not resemble generic SaaS marketing or "AI slop." Avoid shiny startup aesthetics, soft productivity-app tropes, decorative gradients, glassmorphism, excessive roundness, heavy glow, or any visual language that feels trend-chasing instead of purpose-built.

There are no explicit external reference brands to imitate. The design should stand on its own and feel specific to TroopToTask's operational context.

### Design Principles

1. Structure should carry meaning. Use grids, rules, labels, and alignment to communicate hierarchy and operational order.
2. Clarity beats decoration. Every visual decision should improve scanability, trust, or task comprehension before it adds aesthetic flourish.
3. Authority comes from discipline. Typography, spacing, and interaction design should feel controlled, deliberate, and dependable.
4. Accent is for signal, not style. Operational amber should highlight status, emphasis, and action with restraint.
5. Build for real-world pressure. Interfaces should support fast recognition, brief-ready comprehension, and continuity across leader transitions.
6. Accessibility is a baseline requirement. Target WCAG AA across color contrast, focus treatment, content structure, and motion behavior.

## Repo Guardrails

For v1 work, use the relevant sections of:

- `AGENTS.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/architecture/AUTHORIZATION_AND_PROVIDER_BOUNDARIES.md`
- `docs/architecture/MODULE_CONVENTIONS.md`
- `docs/architecture/DRIFT_LEDGER.md`
- `docs/architecture/CURRENT_OWNERSHIP.md` and `docs/architecture/adrs/0013-v1-module-and-delivery-contract.md` for module work
- `CONTEXT.md#language` for domain terminology

Use these repo-specific rules:

- Treat `Organization` and `Group` as canonical v1 current-state terms.
- Do not present v2 `Account` / `Unit` / `Element` terminology as if it already describes v1.
- Keep current Supabase Auth, membership, identifiers, authorization, SQL/RLS and tenant guarantees authoritative while their owned boundaries are narrowed through the stabilization queue.
- Use current `src/features/*` placement honestly. New cross-owner calls use declared public seams, and privileged feature operations use SvelteKit-recognized server-only files; the module checker enforces regressions while Phase 08 consumer migration debt remains open.
- Do not add new direct `locals.supabase` business logic outside auth-provider edges, ports/adapters, or an explicitly approved remediation slice.
- Keep the six distinct current feature permission lanes; do not borrow another lane for new behavior. Critical Tasks' former Training coupling is resolved.
- Use `docs/architecture/GOVERNANCE_BASELINE.json` and `npm run governance:check` for existing route-level provider exceptions and permission-coupling prevention. The module graph checker also rejects new boundary violations and reports existing Phase 08 debt.
- If you touch a documented exception, reduce it with its consumers and update the affected records; do not expand exceptions. Do not silently normalize a legacy exception into precedent.
- Preserve compatibility with legacy clinic-era names, but prefer Army/military-oriented canonical terms in docs, UX copy, and new abstractions.
- Do not deepen demo or sandbox behavior.
