<script lang="ts">
	import type { Snippet } from 'svelte';
	import { navigating } from '$app/state';
	import {
		SETTINGS_GROUPS,
		SETTINGS_PAGES,
		type SettingsPage,
		type SettingsPageKey,
		type SettingsShell,
		type SettingsNavCounts
	} from './settingsShell';
	import * as PageShell from '$lib/components/patterns/page-shell/index.js';
	import {
		SectionNav,
		type SectionNavCount,
		type SectionNavGroup,
		type SectionNavItem
	} from '$lib/components/patterns/section-nav/index.js';

	let {
		children,
		settingsShell,
		navCounts,
		orgUrlSegment,
		activePath
	}: {
		children: Snippet;
		settingsShell?: SettingsShell;
		navCounts?: SettingsNavCounts;
		orgUrlSegment: string;
		activePath: string;
	} = $props();

	const organization = $derived(settingsShell?.organization);
	const baseHref = $derived<`/org/${string}/settings`>(`/org/${organization?.urlSegment ?? orgUrlSegment}/settings`);
	const activeKey = $derived(activePath.split('/settings/')[1]?.split('/')[0] || 'general');
	const activePage = $derived<SettingsPage | undefined>(SETTINGS_PAGES[activeKey as SettingsPageKey]);
	const bodyWidth = { form: 'max-w-[51.25rem]', table: 'max-w-[57rem]' } as const;

	function counted(value: number, one: string): SectionNavCount {
		return { value, label: `${value} ${one}${value === 1 ? '' : 's'}` };
	}

	const counts = $derived<Partial<Record<SettingsPageKey, Promise<SectionNavCount>>>>({
		members: navCounts?.pendingInvitations.then((value) => counted(value, 'pending invitation')),
		approvals: navCounts?.pendingApprovals.then((value) => counted(value, 'pending request'))
	});

	const pages = $derived(
		(Object.entries(SETTINGS_PAGES) as [SettingsPageKey, SettingsPage][])
			.filter(([, page]) => !page.ownerOnly || settingsShell?.currentMember.isOwner)
			.map(([key, page]) => ({
				group: page.group,
				item: {
					label: page.label,
					href: `${baseHref}/${key}`,
					active: key === activeKey,
					count: counts[key],
					tag: page.ownerOnly ? 'Owner' : undefined
				} satisfies SectionNavItem
			}))
	);
	const groups = $derived<SectionNavGroup[]>(
		SETTINGS_GROUPS.map((label) => ({
			label,
			items: pages.filter(({ group }) => group === label).map(({ item }) => item)
		}))
	);
	const apart = $derived(pages.find(({ group }) => group === null)?.item);
	const loading = $derived(
		navigating.to ? pages.find(({ item }) => !item.active && item.href === navigating.to?.url.pathname) : undefined
	);
</script>

<svelte:head>
	<title
		>{activePage ? `${activePage.label} - ` : ''}Unit settings - {organization?.name ?? 'Unit'} - Troop to Task</title
	>
</svelte:head>

<PageShell.Root width="wide" bodyClass="md:grid-cols-[auto_minmax(0,1fr)] md:gap-12">
	<SectionNav label="Unit settings" {groups} {apart} />
	<div
		class="grid w-full min-w-0 content-start gap-7 transition-opacity aria-busy:opacity-60 aria-busy:delay-150 {bodyWidth[
			activePage?.width ?? 'form'
		]}"
		aria-busy={loading ? 'true' : undefined}
	>
		<p role="status" class="sr-only">{loading ? `Loading ${loading.item.label}...` : ''}</p>
		{@render children()}
	</div>
</PageShell.Root>
