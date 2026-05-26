<script lang="ts">
	import { page } from '$app/stores';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as PageShell from '$lib/components/ui/page-shell/index.js';

	let { children } = $props();

	const settingsData = $derived($page.data);
	const organization = $derived(settingsData.workspace?.sections.organization);
	const currentMember = $derived(settingsData.workspace?.currentMember);
	const baseHref = $derived(`/org/${settingsData.orgUrlSegment ?? $page.params.orgId}/settings`);
	const activePath = $derived($page.url.pathname);
	const tabs = $derived(
		[
			{ label: 'General', href: `${baseHref}/general`, active: activePath.endsWith('/settings/general') },
			{ label: 'Billing', href: `${baseHref}/billing`, active: activePath.endsWith('/settings/billing') },
			{
				label: 'Members',
				href: `${baseHref}/members`,
				active: activePath.endsWith('/settings/members'),
				badge: settingsData.workspace?.sections.members.invitations.length || undefined,
				badgeVariant: 'warning' as const
			},
			{ label: 'Policies', href: `${baseHref}/policies`, active: activePath.endsWith('/settings/policies') },
			{
				label: 'Archives',
				href: `${baseHref}/archives`,
				active: activePath.endsWith('/settings/archives'),
				badge: settingsData.workspace?.sections.archivedPersonnel.rows.length || undefined,
				badgeVariant: 'outline' as const
			},
			{ label: 'Logs', href: `${baseHref}/logs`, active: activePath.endsWith('/settings/logs') },
			{ label: 'Exports', href: `${baseHref}/exports`, active: activePath.endsWith('/settings/exports') },
			...(currentMember?.isOwner
				? [{ label: 'Danger', href: `${baseHref}/danger`, active: activePath.endsWith('/settings/danger') }]
				: [])
		].map((tab) => ({
			...tab,
			active: tab.active || (activePath.endsWith('/settings') && tab.label === 'General')
		}))
	);
</script>

<svelte:head>
	<title>Settings - {organization?.name ?? 'Organization'} - Troop to Task</title>
</svelte:head>

<PageShell.Root width="wide" bodyClass="gap-5">
	<PageShell.Header
		title="Organization Settings"
		subtitle={`${organization?.name ?? 'Organization'} governance, access, policies, retention, and export controls.`}
	>
		{#snippet meta()}
			<Badge variant="outline">{currentMember?.isOwner ? 'Owner access' : 'Admin access'}</Badge>
		{/snippet}
	</PageShell.Header>

	<PageShell.Tabs items={tabs as never} label="Organization settings sections" />

	{@render children()}
</PageShell.Root>
