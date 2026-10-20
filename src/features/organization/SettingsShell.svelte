<script lang="ts">
	import type { Snippet } from 'svelte';
	import { navigating } from '$app/state';
	import type { SettingsShell } from './settingsShell';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import * as PageShell from '$lib/components/patterns/page-shell/index.js';
	import type { RouteTabItem } from '$lib/components/patterns/page-shell/index.js';

	let {
		children,
		settingsShell,
		orgUrlSegment,
		activePath
	}: { children: Snippet; settingsShell?: SettingsShell; orgUrlSegment: string; activePath: string } = $props();

	const organization = $derived(settingsShell?.organization);
	const currentMember = $derived(settingsShell?.currentMember);
	const baseHref = $derived(`/org/${organization?.urlSegment ?? orgUrlSegment}/settings`);

	function counted(
		count: number | undefined,
		variant: 'warning' | 'outline',
		one: string,
		many = `${one}s`
	): Pick<RouteTabItem, 'badge'> {
		return count ? { badge: { value: count, label: `${count} ${count === 1 ? one : many}`, variant } } : {};
	}

	const tabs = $derived(
		[
			{ label: 'General', href: `${baseHref}/general`, active: activePath.endsWith('/settings/general') },
			{
				label: 'Members',
				href: `${baseHref}/members`,
				active: activePath.endsWith('/settings/members'),
				...counted(settingsShell?.navBadges.pendingInvitationsCount, 'warning', 'pending invitation')
			},
			{ label: 'Policies', href: `${baseHref}/policies`, active: activePath.endsWith('/settings/policies') },
			...(settingsShell?.tabVisibility.ranks
				? [{ label: 'Ranks', href: `${baseHref}/ranks`, active: activePath.endsWith('/settings/ranks') }]
				: []),
			{
				label: 'Archives',
				href: `${baseHref}/archives`,
				active: activePath.endsWith('/settings/archives'),
				...counted(settingsShell?.navBadges.archivedPersonnelCount, 'outline', 'archived person', 'archived people')
			},
			{
				label: 'Approvals',
				href: `${baseHref}/approvals`,
				active: activePath.endsWith('/settings/approvals'),
				...counted(settingsShell?.navBadges.pendingApprovalsCount, 'warning', 'pending request')
			},
			...(settingsShell?.tabVisibility.logs
				? [{ label: 'Logs', href: `${baseHref}/logs`, active: activePath.endsWith('/settings/logs') }]
				: []),
			{ label: 'Exports', href: `${baseHref}/exports`, active: activePath.endsWith('/settings/exports') },
			...(settingsShell?.tabVisibility.danger
				? [{ label: 'Danger', href: `${baseHref}/danger`, active: activePath.endsWith('/settings/danger') }]
				: [])
		].map((tab) => ({
			...tab,
			active: tab.active || (activePath.endsWith('/settings') && tab.label === 'General')
		}))
	);
	const loadingTab = $derived(
		navigating.to ? tabs.find((tab) => !tab.active && tab.href === navigating.to?.url.pathname) : undefined
	);
</script>

<svelte:head>
	<title>Settings - {organization?.name ?? 'Organization'} - Troop to Task</title>
</svelte:head>

<PageShell.Root width="wide" bodyClass="grid-cols-[minmax(0,1fr)] gap-5">
	<PageShell.Header
		title="Organization Settings"
		subtitle={`${organization?.name ?? 'Organization'} governance, access, policies, retention, and export controls.`}
	>
		{#snippet meta()}
			<Badge variant="outline">{currentMember?.isOwner ? 'Owner access' : 'Admin access'}</Badge>
			<p role="status" class="flex items-center gap-2 text-sm text-muted-foreground">
				{#if loadingTab}
					<Spinner role="presentation" aria-hidden="true" />
					Loading {loadingTab.label}...
				{/if}
			</p>
		{/snippet}
	</PageShell.Header>

	<PageShell.Tabs items={tabs as RouteTabItem[]} label="Organization settings sections" />

	<div class="min-w-0" aria-busy={loadingTab ? 'true' : undefined}>
		{@render children()}
	</div>
</PageShell.Root>
