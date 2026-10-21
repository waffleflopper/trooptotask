<script lang="ts">
	import type { Snippet } from 'svelte';
	import { navigating } from '$app/state';
	import SettingsPageHeader from './SettingsPageHeader.svelte';
	import {
		SETTINGS_GROUPS,
		SETTINGS_PAGES,
		type SettingsPage,
		type SettingsPageKey,
		type SettingsShell,
		type SettingsSkeletonBlock,
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
	const bodyPage = $derived(slowKey ? SETTINGS_PAGES[slowKey] : activePage);
	const skeleton = $derived<readonly SettingsSkeletonBlock[]>(slowKey ? SETTINGS_PAGES[slowKey].skeleton : []);
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
					<div class="grid gap-2" aria-hidden="true">
						<Skeleton class="h-4 w-full max-w-xl" />
						<Skeleton class="h-4 w-2/3" />
					</div>
				{/snippet}
			</SettingsPageHeader>
			<div class="grid" aria-hidden="true" data-settings-skeleton={slowKey}>
				{#each skeleton as block, index (index)}
					{@const opensSection = index > 0 && (block.kind === 'heading' || block.kind === 'strip')}
					{#if block.kind === 'rows'}
						<div
							class={cn(
								'border-t-2',
								block.rule === 'destructive' ? 'border-destructive' : 'border-foreground',
								block.endRule && 'border-b'
							)}
						>
							{#each block.heights as height, row (row)}
								<div class="flex items-center gap-4 border-b last:border-b-0" style:height="{height}px">
									<div class="grid flex-1 gap-2">
										<Skeleton class="h-5 w-40" />
										<Skeleton class="h-3.5 w-80 max-w-full" />
									</div>
									<Skeleton class="h-8 w-20 shrink-0" />
								</div>
							{/each}
						</div>
					{:else if block.kind === 'heading'}
						<div
							class={cn(
								'flex items-end justify-between gap-4 border-b-2 border-foreground pb-3',
								opensSection && 'mt-10'
							)}
						>
							<Skeleton class="h-6.5 w-44" />
							{#if block.action}<Skeleton class="h-8 w-55 max-w-1/2" />{/if}
						</div>
					{:else if block.kind === 'toolbar'}
						<div class="flex items-center gap-2 py-3">
							<Skeleton class="h-8 w-64" />
							<Skeleton class="ml-auto h-8 w-60 max-w-1/3" />
						</div>
					{:else if block.kind === 'strip'}
						<div class={cn('grid gap-2.5 rounded-sm border bg-muted p-3.5', opensSection && 'mt-10')}>
							<Skeleton class="h-8 w-full bg-foreground/10" />
							<Skeleton class="h-5 w-2/3 bg-foreground/10" />
						</div>
					{:else}
						<div>
							{#if block.header}
								<div class="flex h-10 items-center gap-4 border-b">
									<Skeleton class="h-3 w-24" />
									<Skeleton class="h-3 w-16" />
								</div>
							{/if}
							{#each { length: block.rows } as _, row (row)}
								<div class="flex items-center gap-4 border-b" style:height="{block.height}px">
									<Skeleton class="h-4 w-48" />
									<Skeleton class="h-3.5 w-24" />
									<Skeleton class="ml-auto h-7 w-16" />
								</div>
							{/each}
						</div>
					{/if}
				{/each}
			</div>
		{/if}
		<!-- Hidden, not unmounted, so a page keeps its state if the navigation does not complete. -->
		<div class="contents" hidden={slowKey !== null}>{@render children()}</div>
	</div>
</PageShell.Root>
