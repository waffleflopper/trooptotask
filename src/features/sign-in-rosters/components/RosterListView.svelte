<script lang="ts">
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SearchIcon from '@lucide/svelte/icons/search';
	import * as Alert from '$lib/components/ui/alert';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Empty from '$lib/components/ui/empty';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as Popover from '$lib/components/ui/popover';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Spinner } from '$lib/components/ui/spinner';
	import { formatDayMonthYear } from '$lib/utils/dates';
	import type { SignInRoster } from '../sign-in-rosters.types';
	import RosterRow from './RosterRow.svelte';
	import type { RosterList } from './rosterList.svelte';

	let {
		list,
		orgName,
		canEdit,
		onNew,
		onReprint,
		onDelete
	}: {
		list: RosterList;
		orgName: string;
		canEdit: boolean;
		onNew: () => void;
		onReprint: (roster: SignInRoster) => void;
		onDelete: (roster: SignInRoster) => void;
	} = $props();

	const firstLoad = $derived(list.loading && list.rosters.length === 0);
	const hasMore = $derived(list.rosters.length < list.total);
	const dateFilterLabel = $derived.by(() => {
		if (!list.dateFrom && !list.dateTo) return 'Any date';
		if (list.dateFrom && list.dateTo)
			return `${formatDayMonthYear(list.dateFrom)} – ${formatDayMonthYear(list.dateTo)}`;
		return list.dateFrom ? `From ${formatDayMonthYear(list.dateFrom)}` : `Until ${formatDayMonthYear(list.dateTo)}`;
	});
</script>

<AppDialog.Header eyebrow={`Training · ${orgName}`} class="gap-2 border-b px-7 pt-6 pb-4">
	<AppDialog.Title>Sign-in rosters</AppDialog.Title>
	<AppDialog.Description class="flex min-h-5 flex-wrap items-center gap-x-3">
		{#if firstLoad}
			<Skeleton class="h-4 w-28" />
		{:else if !list.loadError}
			<span class="tabular-nums">{list.total} saved</span>
			{#if list.waitingOnScan > 0}
				<span class="font-medium text-warning-foreground tabular-nums">
					{list.waitingOnScan}{hasMore ? '+' : ''} waiting on a signed scan
				</span>
			{/if}
		{/if}
	</AppDialog.Description>
	<div class="flex flex-wrap items-center gap-2 pt-2">
		<div class="relative min-w-40 flex-1">
			<SearchIcon
				aria-hidden="true"
				class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
			/>
			<Input
				type="search"
				class="pl-8"
				placeholder="Search titles"
				aria-label="Search titles"
				bind:value={list.searchTitle}
				oninput={() => list.searchSoon()}
			/>
		</div>
		<Popover.Root>
			<Popover.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="outline" aria-label={`Date range: ${dateFilterLabel}`}>
						<CalendarIcon aria-hidden="true" />
						{dateFilterLabel}
						<ChevronDownIcon aria-hidden="true" />
					</Button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content align="end" class="w-64 gap-3 p-3">
				<Field.Root>
					<Field.Label for="roster-from">From</Field.Label>
					<DatePicker
						id="roster-from"
						bind:value={list.dateFrom}
						placeholder="From date"
						onValueChange={() => void list.load(true)}
					/>
				</Field.Root>
				<Field.Root>
					<Field.Label for="roster-to">To</Field.Label>
					<DatePicker
						id="roster-to"
						bind:value={list.dateTo}
						placeholder="To date"
						onValueChange={() => void list.load(true)}
					/>
				</Field.Root>
				{#if list.dateFrom || list.dateTo}
					<Button
						variant="outline"
						size="sm"
						onclick={() => {
							list.dateFrom = '';
							list.dateTo = '';
							void list.load(true);
						}}
					>
						Clear dates
					</Button>
				{/if}
			</Popover.Content>
		</Popover.Root>
		{#if canEdit}
			<Button onclick={onNew}>
				<PlusIcon aria-hidden="true" />
				New roster
			</Button>
		{/if}
	</div>
</AppDialog.Header>

<AppDialog.Body class="flex flex-col gap-3 px-7 py-2">
	{#if list.loadError}
		<Alert.Root variant="destructive" class="mt-3">
			<Alert.Description>{list.loadError}</Alert.Description>
			<Alert.Action>
				<Button size="sm" variant="outline" onclick={() => void list.load(list.rosters.length === 0)}>Retry</Button>
			</Alert.Action>
		</Alert.Root>
	{/if}

	{#if firstLoad}
		<div class="flex flex-col" role="status" aria-label="Loading sign-in rosters">
			{#each { length: 5 } as _, index (index)}
				<div class="flex items-center gap-3 border-b border-border py-4">
					<div class="flex min-w-0 flex-1 flex-col gap-2">
						<Skeleton class="h-5 w-48 max-w-full" />
						<Skeleton class="h-3 w-36 max-w-full" />
					</div>
					<Skeleton class="h-8 w-32" />
					<Skeleton class="size-8" />
					<Skeleton class="size-8" />
				</div>
			{/each}
		</div>
	{:else if list.rosters.length === 0 && !list.loadError}
		<Empty.Root>
			<Empty.Header>
				<Empty.Title level={3}>
					{list.hasFilters ? 'No rosters match.' : 'No sign-in rosters yet.'}
				</Empty.Title>
			</Empty.Header>
			<Empty.Content>
				{#if list.hasFilters}
					<Button variant="outline" onclick={() => list.clearFilters()}>Clear filters</Button>
				{:else if canEdit}
					<Button onclick={onNew}>New roster</Button>
				{/if}
			</Empty.Content>
		</Empty.Root>
	{:else if list.rosters.length > 0}
		<ul class="flex flex-col">
			{#each list.rosters as roster (roster.id)}
				<RosterRow {roster} {list} {canEdit} onReprint={() => onReprint(roster)} onDelete={() => onDelete(roster)} />
			{/each}
		</ul>
		<div class="flex items-center justify-between gap-3 pb-3">
			<p class="font-mono text-[11px] tracking-[0.06em] text-muted-foreground uppercase tabular-nums">
				Showing {list.rosters.length} of {list.total} · newest first
			</p>
			{#if hasMore}
				<Button variant="link" size="none" class="underline" disabled={list.loading} onclick={() => list.load(false)}>
					{#if list.loading}<Spinner class="size-3" />{/if}
					Show more
				</Button>
			{/if}
		</div>
	{/if}
</AppDialog.Body>
