<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as PageShell from '$lib/components/patterns/page-shell/index.js';
	import { SETTINGS_PAGES, type SettingsPageKey } from './settingsShell';

	let { page, subtitle }: { page: SettingsPageKey; subtitle: string | Snippet } = $props();

	const settingsPage = $derived(SETTINGS_PAGES[page]);
</script>

<PageShell.Header
	eyebrow={`Unit settings · ${settingsPage.ownerOnly ? 'Owner only' : 'Owners and admins'}`}
	title={settingsPage.label}
	variant="display"
	{subtitle}
/>
