<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';
	import { Button } from '$lib/components/ui/button';
	import * as PageShell from '$lib/components/ui/page-shell';
	import type { RouteTabItem } from '$lib/components/ui/page-shell';

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

<PageShell.Root width="content">
	<PageShell.Header
		title="Account"
		subtitle="Manage your User Profile and sign-in controls outside Organization settings."
	>
		{#snippet actions()}
			<Button type="button" variant="outline" size="sm" onclick={goBack}>
				<ArrowLeftIcon aria-hidden="true" />
				Back
			</Button>
		{/snippet}
	</PageShell.Header>
	<PageShell.Tabs items={tabs} label="Account sections" />
	{@render children()}
</PageShell.Root>
