<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import type { RouteTabItem } from '$lib/components/patterns/page-shell';
	import { WorkspaceToolbar } from '$lib/components/patterns/workspace-toolbar';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	const tabs = $derived([
		{
			label: 'Profile',
			href: '/account/profile',
			active: data.accountPathname === '/account/profile'
		},
		{
			label: 'Security',
			href: '/account/security',
			active: data.accountPathname === '/account/security'
		}
	] satisfies RouteTabItem[]);

	function goBack() {
		if (browser && window.history.length > 1) {
			window.history.back();
			return;
		}

		void goto(resolve('/dashboard'));
	}
</script>

<main>
	<PageShell.Root width="content">
		<PageShell.Header
			title="Account"
			subtitle="Manage your User Profile and sign-in controls outside Organization settings."
		/>
		<WorkspaceToolbar
			ariaLabel="Account controls"
			items={[{ kind: 'action', id: 'back', label: 'Back', icon: 'arrow-left', onclick: goBack }]}
		/>
		<PageShell.Tabs items={tabs} label="Account sections" />
		{@render children()}
	</PageShell.Root>
</main>
