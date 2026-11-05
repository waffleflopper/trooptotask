<script lang="ts">
	import type { Snippet } from 'svelte';
	import { navigating } from '$app/state';
	import SettingsPageHeader from './SettingsPageHeader.svelte';
	import SettingsSkeleton from './SettingsSkeleton.svelte';
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
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { cn } from '$lib/utils.js';

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

	const visiblePages = $derived(
		(Object.entries(SETTINGS_PAGES) as [SettingsPageKey, SettingsPage][]).filter(
			([, page]) => !page.ownerOnly || settingsShell?.currentMember.isOwner
		)
	);
	const loadingKey = $derived(
		visiblePages.find(([key]) => key !== activeKey && `${baseHref}/${key}` === navigating.to?.url.pathname)?.[0]
	);
	// The nav answers a click right away; the body waits for the page or the skeleton below.
	const shownKey = $derived(loadingKey ?? activeKey);
	const pages = $derived(
		visiblePages.map(([key, page]) => ({
			key,
			group: page.group,
			item: {
				label: page.label,
				href: `${baseHref}/${key}`,
				active: key === shownKey,
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
	// A navigation that settles within the delay keeps the current page, so fast switches do not flash a skeleton.
	let slowKey = $state<SettingsPageKey | null>(null);
	$effect(() => {
		const key = loadingKey;
		if (!key) return;
		const timer = setTimeout(() => (slowKey = key), 150);
		return () => {
			clearTimeout(timer);
			slowKey = null;
		};
	});
	const slowPage = $derived<SettingsPage | undefined>(slowKey ? SETTINGS_PAGES[slowKey] : undefined);
	const bodyPage = $derived(slowPage ?? activePage);
	const subtitleLines = $derived(slowPage?.subtitleLines ?? 2);
</script>

<svelte:head>
	<title
		>{activePage ? `${activePage.label} - ` : ''}Unit settings - {organization?.name ?? 'Unit'} - Troop to Task</title
	>
</svelte:head>

<PageShell.Root width="wide" bodyClass="md:grid-cols-[auto_minmax(0,1fr)] md:gap-12">
	<SectionNav label="Unit settings" {groups} {apart} />
	<div
		class="grid w-full min-w-0 content-start gap-7 {bodyWidth[bodyPage?.width ?? 'form']}"
		aria-busy={loadingKey ? 'true' : undefined}
	>
		<p role="status" class="sr-only">{loadingKey ? `Loading ${SETTINGS_PAGES[loadingKey].label}...` : ''}</p>
		{#if slowKey}
			<SettingsPageHeader page={slowKey}>
				{#snippet subtitle()}
					<div class="grid" aria-hidden="true">
						{#each { length: subtitleLines }, line (line)}
							<div class="flex h-5 items-center">
								<Skeleton class={cn('h-4', line === 0 ? 'w-full max-w-xl' : 'w-2/3')} />
							</div>
						{/each}
					</div>
				{/snippet}
			</SettingsPageHeader>
			<SettingsSkeleton page={slowKey} />
		{/if}
		<!-- Hidden, not unmounted, so a page keeps its state if the navigation does not complete. -->
		<div class="contents" hidden={slowKey !== null}>{@render children()}</div>
	</div>
</PageShell.Root>
