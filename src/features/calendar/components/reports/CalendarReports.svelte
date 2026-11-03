<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import {
		buildGroupTree,
		groupFilterMatcher,
		hasSubGroups,
		type Group,
		type Personnel
	} from '$features/personnel/contracts';
	import type { StatusType } from '$features/calendar/contracts';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import * as ReportWorkspace from '$lib/components/patterns/report-workspace';
	import { WorkspaceToolbar, type ToolbarItem } from '$lib/components/patterns/workspace-toolbar';
	import { Button } from '$lib/components/ui/button';
	import { showSubGroupsToggle } from '$lib/stores/showSubGroups.svelte';
	import { formatDate, formatDayMonth, formatDayMonthYear } from '$lib/utils/dates';
	import { visibleUrl } from '$lib/utils/visibleUrl';
	import { CalendarReportFeed } from './calendarReportFeed.svelte';
	import type { LensHandle, ReportFilters } from './lensTypes';
	import { LENSES } from './lenses';
	import {
		parseReportQuery,
		reportRange,
		serializeReportQuery,
		shiftReportStart,
		SPAN_DAYS,
		type ReportQuery
	} from './reportQuery';

	interface Props {
		orgId: string;
		orgUrlSegment?: string;
		personnel: Personnel[];
		statusTypes: StatusType[];
		groups: Group[];
	}

	let { orgId, orgUrlSegment = orgId, personnel, statusTypes, groups }: Props = $props();

	const query = $derived(parseReportQuery(visibleUrl().searchParams));
	const lens = $derived(LENSES.find((candidate) => candidate.id === query.lens) ?? LENSES[0]);
	const Lens = $derived(lens.component);

	// The viewer's own day, known only after mount so the server and the first client render agree.
	let today = $state<string | null>(null);
	onMount(() => {
		today = formatDate(new Date());
	});
	const range = $derived(reportRange(query, today));

	const feed = $derived(new CalendarReportFeed(orgId));
	$effect(() => {
		const active = feed;
		return () => active.dispose();
	});
	$effect(() => {
		const active = feed;
		const target = lens.sharedControls ? range : null;
		if (target) untrack(() => active.load(target));
	});

	const tree = $derived(buildGroupTree(groups));
	const groupSelect = ReportWorkspace.createMultiSelect(() => tree.roots);
	const statusSelect = ReportWorkspace.createMultiSelect(() => statusTypes);
	let mosCodes = $state<string[]>([]);

	const groupOptions = $derived(tree.roots.map((root) => ({ value: root.id, label: tree.label(root.id) })));
	const statusOptions = $derived(statusTypes.map((status) => ({ value: status.id, label: status.name })));
	const mosOptions = $derived(
		[...new Set(personnel.map((person) => person.mos).filter(Boolean))]
			.sort()
			.map((mos) => ({ value: mos, label: mos }))
	);
	const nestedGroups = $derived(hasSubGroups(tree));

	const filters = $derived.by<ReportFilters>(() => {
		const selectedRootIds = new Set(groupSelect.selectedIds);
		const matchers = groupSelect.allSelected
			? null
			: tree.roots.filter((root) => selectedRootIds.has(root.id)).map((root) => groupFilterMatcher(tree, root.id));
		return {
			personnel: personnel.filter(
				(person) =>
					(matchers === null || matchers.some((matches) => matches(person.groupId))) &&
					(mosCodes.length === 0 || mosCodes.includes(person.mos))
			),
			selectedRootIds,
			allGroupsSelected: groupSelect.allSelected,
			awayStatusTypeIds: new Set(statusSelect.selectedIds)
		};
	});

	function setSelection(
		select: { has(id: string): boolean; toggle(id: string): void },
		ids: string[],
		values: string[]
	) {
		for (const id of ids) if (values.includes(id) !== select.has(id)) select.toggle(id);
	}

	let handle = $state<LensHandle>();

	const toolbarItems = $derived<ToolbarItem[]>([
		...(lens.sharedControls && groupOptions.length > 0
			? [
					{
						kind: 'multiSelect',
						id: 'report-groups',
						label: 'Group',
						options: groupOptions,
						values: [...groupSelect.selectedIds],
						defaultValues: groupOptions.map((option) => option.value),
						onValuesChange: (values) =>
							setSelection(
								groupSelect,
								groupOptions.map((option) => option.value),
								values
							)
					} satisfies ToolbarItem
				]
			: []),
		...(lens.sharedControls && statusOptions.length > 0
			? [
					{
						kind: 'multiSelect',
						id: 'report-away-statuses',
						label: 'Counts as away',
						options: statusOptions,
						values: [...statusSelect.selectedIds],
						defaultValues: statusOptions.map((option) => option.value),
						onValuesChange: (values) =>
							setSelection(
								statusSelect,
								statusOptions.map((option) => option.value),
								values
							)
					} satisfies ToolbarItem
				]
			: []),
		...(lens.sharedControls && mosOptions.length > 0
			? [
					{
						kind: 'multiSelect',
						id: 'report-mos',
						label: 'MOS',
						options: mosOptions,
						values: mosCodes,
						onValuesChange: (values) => (mosCodes = values)
					} satisfies ToolbarItem
				]
			: []),
		...(lens.sharedControls && nestedGroups
			? [
					{
						kind: 'action',
						id: 'report-display',
						label: 'Display',
						icon: 'sliders',
						menuItems: [showSubGroupsToggle()]
					} satisfies ToolbarItem
				]
			: []),
		...(handle?.exportActions() ?? []),
		{
			kind: 'action',
			id: 'calendar',
			label: 'Back to calendar',
			icon: 'arrow-left',
			href: `/org/${orgUrlSegment}/calendar`
		}
	]);

	function hrefFor(next: Partial<ReportQuery>): `/${string}` {
		const search = serializeReportQuery({ ...query, ...next }, today);
		return `/org/${orgUrlSegment}/calendar/reports${search ? `?${search}` : ''}`;
	}

	const lensTabs = $derived(
		LENSES.map((candidate) => ({
			label: candidate.label,
			href: hrefFor({ lens: candidate.id }),
			active: candidate.id === lens.id
		}))
	);
	const spanTabs = $derived(
		SPAN_DAYS.map((days) => ({ label: `${days} D`, href: hrefFor({ days }), active: days === query.days }))
	);
	const rangeLabel = $derived(range ? `${formatDayMonth(range.start)} to ${formatDayMonthYear(range.end)}` : null);
</script>

{#snippet spanSwitch()}
	<div class="flex flex-wrap items-center gap-2" data-sveltekit-noscroll>
		<div class="flex items-center gap-1">
			<Button
				variant="outline"
				size="icon-sm"
				aria-label="Previous {query.days} days"
				aria-disabled={range === null}
				href={range ? hrefFor({ start: shiftReportStart(range, query.days, -1) }) : undefined}
			>
				<ChevronLeftIcon aria-hidden="true" />
			</Button>
			<p class="min-w-44 text-center font-mono text-xs tabular-nums" aria-live="polite">
				{rangeLabel ?? ' '}
			</p>
			<Button
				variant="outline"
				size="icon-sm"
				aria-label="Next {query.days} days"
				aria-disabled={range === null}
				href={range ? hrefFor({ start: shiftReportStart(range, query.days, 1) }) : undefined}
			>
				<ChevronRightIcon aria-hidden="true" />
			</Button>
		</div>
		<PageShell.Tabs variant="segmented" label="Report span" items={spanTabs} />
		{#if query.start !== null && query.start !== today}
			<Button variant="outline" size="sm" href={hrefFor({ start: null })}>Today</Button>
		{/if}
	</div>
{/snippet}

<div class="mx-auto flex max-w-[1600px] flex-col gap-4">
	<PageShell.Header eyebrow="Calendar" title="Calendar reports" aside={lens.sharedControls ? spanSwitch : undefined} />
	<div data-sveltekit-noscroll>
		<PageShell.Tabs label="Report lenses" items={lensTabs} />
	</div>
	<WorkspaceToolbar ariaLabel="Calendar report controls" items={toolbarItems} />

	<Lens
		bind:this={handle}
		{orgId}
		{personnel}
		{statusTypes}
		{groups}
		{filters}
		{range}
		{today}
		feed={feed.state}
		onRetry={() => feed.retry()}
	/>
</div>
