# Prototype Components

Shared throwaway-prototype helpers live here so future prototype routes do not rebuild the same wiring.

## PrototypeSwitcher

Use `PrototypeSwitcher` for UI prototypes with multiple route variants. The switcher:

- reads and writes a URL search parameter, defaulting to `variant`;
- wraps previous/next controls with keyboard arrow support;
- hides itself in production builds;
- stays fixed above the app shell as a prototype-only overlay.

Example:

```svelte
<script lang="ts">
	import { PrototypeSwitcher, type PrototypeVariant } from '$lib/components/prototype';

	const variants: PrototypeVariant[] = [
		{ key: 'A', label: 'Command brief' },
		{ key: 'B', label: 'Leader book' },
		{ key: 'C', label: 'Operations matrix' }
	];
</script>

<PrototypeSwitcher {variants} current={variant} ariaLabel="Personnel detail prototype variants" />
```
