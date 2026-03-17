# Beta Banner & Help System Design

## Feature 1: Beta Tester Banner on Login Page

**Goal:** Make it obvious that the app is accepting beta testers. Currently "Request access" is a small text link buried at the bottom of the login card.

**Design:** A styled banner positioned above the auth card with the gold brand accent (`#B8943E`). Contains a headline, short description, and a link/button to `/auth/request-access`. Easily removable when beta ends.

**Location:** `src/routes/auth/login/+page.svelte` — new markup above the `.auth-card` div.

## Feature 2: Contextual Help System

**Goal:** Integrate help buttons throughout the site that open a slide-out panel with contextual help content.

### Components

- **`HelpButton.svelte`** (`src/lib/components/ui/`) — Small circular `?` icon. Props: `topic: string`. Clicking opens the help panel to that topic.
- **`HelpPanel.svelte`** (`src/lib/components/ui/`) — Fixed slide-out panel from right edge. Shows title + HTML content for the active topic. Close button + click-outside-to-dismiss. Semi-transparent backdrop overlay.

### Content Source

- **`lib/help-content.ts`** — Centralized map of topic IDs to `{ title: string, content: string }`. Content is HTML strings for formatting flexibility.

```typescript
export const helpContent: Record<string, { title: string; content: string }> = {
	'training-records': {
		title: 'Training Records',
		content: '<p>Track individual and unit training...</p>'
	}
	// ...
};
```

### Usage Pattern

```svelte
<h3>Training Records <HelpButton topic="training-records" /></h3>
```

### State Management

HelpPanel manages open/close state internally. HelpButton communicates the topic to open via a shared store or custom event. Only one topic displays at a time.
