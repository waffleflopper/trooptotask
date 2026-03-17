# Tooling Improvements Plan

Phased plan for adding industry-standard tooling. Each phase is self-contained — complete one, then start the next.

---

## Phase 1: ESLint ✦ Next Up

### Install

```bash
npm install --save-dev eslint @eslint/js typescript-eslint eslint-plugin-svelte globals
```

### Configure

Create `eslint.config.js` (flat config):

```js
import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

export default ts.config(
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node }
    }
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: { parser: ts.parser }
    }
  },
  {
    rules: {
      // Catch missed awaits — critical for this codebase's async Supabase calls
      '@typescript-eslint/no-floating-promises': 'error',
      // Allow unused vars prefixed with _
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // Existing codebase uses `as` casts; warn instead of error
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  },
  {
    ignores: ['.svelte-kit/', 'build/', 'node_modules/', '.claude/']
  }
);
```

### Add scripts

```json
"lint": "eslint .",
"lint:fix": "eslint --fix ."
```

### Add to CI

Add `npm run lint` step in `.github/workflows/ci.yml` after the format check step.

### Triage

Run `npm run lint` and review output. Fix errors, convert questionable items to warnings. Don't try to fix everything in one pass — suppress pre-existing warnings with inline comments if needed, tighten later.

### Done when

`npm run lint` passes in CI.

---

## Phase 2: husky + lint-staged

### Install

```bash
npm install --save-dev husky lint-staged
npx husky init
```

### Configure

Add to `package.json`:

```json
"lint-staged": {
  "*.{ts,js,svelte}": ["eslint --fix", "prettier --write"],
  "*.{json,css,md,yml,yaml}": ["prettier --write"]
}
```

Update `.husky/pre-commit`:

```bash
npx lint-staged
```

### Done when

Committing a file with a formatting issue auto-fixes it before the commit completes.

---

## Phase 3: Zod

### Install

```bash
npm install zod
```

### Adopt incrementally

Do NOT rewrite existing validation. Instead:

1. Create `src/lib/server/schemas/` directory for Zod schemas
2. When you **touch** an API endpoint or form action, convert its manual validation to a Zod schema at that time
3. New endpoints/actions always use Zod from the start

### Example conversion

Before (current pattern):
```ts
const errorId = formData.get('errorId') as string;
const status = formData.get('status') as string;
if (!errorId) return fail(400, { error: 'Missing error ID' });
if (status && !['new', 'reviewed', 'resolved'].includes(status)) {
  return fail(400, { error: 'Invalid status' });
}
```

After:
```ts
import { z } from 'zod';

const UpdateSchema = z.object({
  errorId: z.string().uuid(),
  status: z.enum(['new', 'reviewed', 'resolved']).optional(),
  adminNotes: z.string().max(5000).optional()
});

const result = UpdateSchema.safeParse(Object.fromEntries(formData));
if (!result.success) return fail(400, { error: result.error.issues[0].message });
const { errorId, status, adminNotes } = result.data;
```

### Done when

Zod is installed and at least one endpoint has been converted as a reference pattern for future work.

---

## Phase 4: .nvmrc

### Do it

```bash
echo "22" > .nvmrc
```

Add `engines` to `package.json`:

```json
"engines": {
  "node": ">=22"
}
```

### Done when

File exists and matches CI's `node-version: 22`.

---

## Phase 5: Dependabot / npm audit

### Enable Dependabot

Create `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: "/"
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
    labels:
      - dependencies
```

### Add npm audit to CI

Add step in `.github/workflows/ci.yml`:

```yaml
- name: Security audit
  run: npm audit --audit-level=high
  continue-on-error: true  # advisory, not blocking (for now)
```

### Done when

Dependabot is creating PRs for outdated/vulnerable packages, and `npm audit` runs in CI.
