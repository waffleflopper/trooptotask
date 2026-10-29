<script lang="ts">
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import PrinterIcon from '@lucide/svelte/icons/printer';
	import {
		BUILT_IN_ARMY_RANK_OPTIONS,
		type Group,
		type GroupTree,
		type Personnel,
		type RankCatalogEntry
	} from '$features/personnel/contracts';
	import { TreeSelect, type TreeSelectOption } from '$lib/components/patterns/tree-select';
	import * as SegmentedFilter from '$lib/components/patterns/segmented-filter';
	import * as Alert from '$lib/components/ui/alert';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Switch } from '$lib/components/ui/switch';
	import { cn } from '$lib/utils';
	import { rosterDateLine, rosterPrintRows, rosterSplit } from '../rosterPrintRows';
	import { signInRosterFilterOptions, signInRosterRankCategoryGroups } from '../signInRosterFilter';
	import { signInRosterRankOptions } from '../signInRosterRankOrder';
	import AudienceFilter from './AudienceFilter.svelte';
	import type { NewRoster } from './newRoster.svelte';

	let {
		draft,
		personnel,
		groups,
		tree,
		rankCatalog,
		onBack,
		onSave
	}: {
		draft: NewRoster;
		personnel: readonly Personnel[];
		groups: readonly Group[];
		tree: GroupTree;
		rankCatalog: readonly RankCatalogEntry[] | undefined;
		onBack: () => void;
		onSave: () => void;
	} = $props();

	const ORDER_OPTIONS = [
		{ value: 'alphabetical', label: 'A–Z' },
		{ value: 'rank', label: 'Rank' }
	] as const;
	const RANK_SHORTCUTS = [
		{ key: 'officer', label: 'All Officers' },
		{ key: 'warrant', label: 'All Warrant' },
		{ key: 'enlisted', label: 'All Enlisted' },
		{ key: 'civilian', label: 'Civilians' }
	] as const;

	const groupCounts = $derived(tree.subtreeCounts(personnel, (person) => person.groupId));
	const groupOptions = $derived(
		tree.ordered.map(
			(node): TreeSelectOption => ({
				id: node.id,
				label: node.name,
				depth: node.level,
				count: groupCounts.get(node.id) ?? 0
			})
		)
	);
	const chosenGroups = $derived(draft.filter.groups.filter((id) => tree.node(id)));
	const rankOptions = $derived(
		signInRosterRankOptions(
			rankCatalog,
			personnel.map((person) => person.rank),
			BUILT_IN_ARMY_RANK_OPTIONS
		)
	);
	const rankItems = $derived(rankOptions.map((rank) => ({ value: rank, label: rank })));
	const rankShortcuts = $derived(signInRosterRankCategoryGroups(rankCatalog, rankOptions));
	const audienceOptions = $derived(signInRosterFilterOptions(personnel));
	const mosItems = $derived(audienceOptions.mos.map((value) => ({ value, label: value })));
	const roleItems = $derived(audienceOptions.roles.map((value) => ({ value, label: value })));
	const printRows = $derived(
		rosterPrintRows(
			draft.snapshot,
			rosterSplit({ separateByGroup: draft.separateByGroup, filterConfig: draft.filter }),
			tree,
			groups
		)
	);
	const nobody = $derived(draft.people.length === 0);
</script>

<AppDialog.Header class="border-b pb-4">
	<div class="flex items-center gap-2">
		<Button
			variant="ghost"
			size="icon-xs"
			class="-ml-1"
			aria-label="Back to sign-in rosters"
			disabled={draft.saving}
			onclick={onBack}
		>
			<ArrowLeftIcon aria-hidden="true" />
		</Button>
		<p class="font-mono text-[11px] leading-[14px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
			Sign-in rosters · New
		</p>
	</div>
	<AppDialog.Title>New sign-in roster</AppDialog.Title>
	<AppDialog.Description class={cn('tabular-nums', nobody && 'font-medium text-destructive-text')}>
		{draft.people.length} of {personnel.length} personnel match the filters below
	</AppDialog.Description>
</AppDialog.Header>

<AppDialog.Body class="flex flex-col gap-0 p-0">
	<fieldset class="contents" disabled={draft.saving}>
		<section class="flex flex-col gap-4 border-b px-7 py-5" aria-labelledby="roster-section-roster">
			<h3
				id="roster-section-roster"
				class="font-mono text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase"
			>
				Roster
			</h3>
			<div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,11rem)]">
				<Field.Root>
					<Field.Label for="roster-title">Title</Field.Label>
					<Input
						id="roster-title"
						type="text"
						{@attach (input) => input.focus()}
						placeholder="e.g. 68W skills validation"
						bind:value={draft.title}
					/>
				</Field.Root>
				<Field.Root>
					<div class="flex items-baseline justify-between gap-2">
						<Field.Label for="roster-date">Date</Field.Label>
						<Button
							variant="link"
							size="none"
							class="text-[13px] underline"
							aria-pressed={draft.blankDate}
							onclick={() => (draft.blankDate = !draft.blankDate)}
						>
							{draft.blankDate ? 'Use a date' : 'Leave blank'}
						</Button>
					</div>
					<DatePicker
						id="roster-date"
						bind:value={draft.date}
						disabled={draft.blankDate}
						placeholder="Date left blank"
					/>
				</Field.Root>
			</div>
			<div class="flex flex-wrap items-center gap-x-6 gap-y-3">
				<div class="flex items-center gap-3">
					<span class="text-sm font-medium">Order</span>
					<SegmentedFilter.Root label="Order" options={ORDER_OPTIONS} bind:value={draft.sortBy} />
				</div>
				<Field.Root orientation="horizontal" class="w-auto">
					<Switch id="roster-split" bind:checked={draft.separateByGroup} />
					<Field.Label for="roster-split">Split by group</Field.Label>
				</Field.Root>
			</div>
		</section>

		<section class="flex flex-col gap-3 border-b px-7 py-5" aria-labelledby="roster-section-who">
			<div class="flex min-h-5 items-center justify-between gap-3">
				<h3
					id="roster-section-who"
					class="font-mono text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase"
				>
					Who's on it
				</h3>
				{#if draft.hasFilter}
					<Button
						variant="link"
						size="none"
						class="text-[13px] leading-5 underline"
						onclick={() => draft.clearFilters()}
					>
						Clear filters
					</Button>
				{/if}
			</div>
			{#if groupOptions.length > 0}
				<Field.Root class="gap-1.5 sm:grid sm:grid-cols-[3.5rem_minmax(0,1fr)] sm:items-start sm:gap-x-3">
					<Field.Title class="sm:min-h-8 sm:items-center">Group</Field.Title>
					<TreeSelect
						multiple
						options={groupOptions}
						value={draft.filter.groups}
						onValueChange={(next) => draft.setFilter('groups', next)}
						label="Group"
						hideLabel
						valueLabel={chosenGroups.length > 0 ? chosenGroups.map((id) => tree.label(id)).join(', ') : 'Any group'}
						placeholder="Any group"
						searchPlaceholder="Find a Group"
						class="w-full justify-between"
					/>
				</Field.Root>
			{/if}
			<AudienceFilter
				label="Rank"
				anyLabel="Any rank"
				items={rankItems}
				values={draft.filter.ranks}
				onChange={(next) => draft.setFilter('ranks', next)}
				emptyText="No ranks found."
			>
				{#snippet menuTop()}
					<div class="flex flex-wrap gap-1.5 border-b p-2" role="group" aria-label="Rank shortcuts">
						{#each RANK_SHORTCUTS as shortcut (shortcut.key)}
							{@const ranks = rankShortcuts[shortcut.key]}
							{@const selected = ranks.length > 0 && ranks.every((rank) => draft.filter.ranks.includes(rank))}
							<Button
								size="xs"
								variant={selected ? 'secondary' : 'outline'}
								aria-pressed={selected}
								disabled={ranks.length === 0}
								onclick={() => draft.toggleRanks(ranks)}
							>
								{shortcut.label}
							</Button>
						{/each}
					</div>
				{/snippet}
			</AudienceFilter>
			<AudienceFilter
				label="MOS"
				anyLabel="Any MOS"
				items={mosItems}
				values={draft.filter.mos}
				onChange={(next) => draft.setFilter('mos', next)}
				emptyText="Nobody has an MOS yet."
			/>
			<AudienceFilter
				label="Role"
				anyLabel="Any role"
				items={roleItems}
				values={draft.filter.roles}
				onChange={(next) => draft.setFilter('roles', next)}
				emptyText="Nobody has a role yet."
			/>
			<p class="text-sm text-muted-foreground sm:pl-[4.25rem]">
				A Soldier must match every filter you set. Within one filter, any choice counts.
			</p>
		</section>
	</fieldset>

	<section class="flex flex-1 flex-col gap-3 bg-muted px-7 py-5" aria-labelledby="roster-section-preview">
		<div class="flex items-center justify-between gap-3">
			<h3
				id="roster-section-preview"
				class="font-mono text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase"
			>
				On this roster · <span class={cn('tabular-nums', nobody && 'text-destructive-text')}>{draft.people.length}</span
				>
			</h3>
			<span class="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">Print preview</span>
		</div>
		<div class="rounded-sm border bg-card px-6 py-6 text-card-foreground shadow-sm" data-testid="roster-print-preview">
			<p class={cn('text-center text-lg font-semibold', !draft.title.trim() && 'text-muted-foreground')}>
				{draft.title.trim() || 'Roster title'}
			</p>
			<p class="mt-1 text-center text-sm">{rosterDateLine(draft.blankDate ? null : draft.date, draft.blankDate)}</p>
			<table class="mt-4 w-full border-collapse text-sm">
				<thead>
					<tr class="bg-muted text-left">
						<th class="w-10 border border-border px-2 py-1.5 text-center font-semibold">#</th>
						<th class="w-16 border border-border px-2 py-1.5 font-semibold">Rank</th>
						<th class="w-48 border border-border px-2 py-1.5 font-semibold">Name</th>
						<th class="border border-border px-2 py-1.5 font-semibold">Signature</th>
					</tr>
				</thead>
				<tbody>
					{#each printRows as row, index (index)}
						{#if row.kind === 'group'}
							<tr class="bg-muted">
								<th colspan="4" scope="colgroup" class="border border-border px-2 pt-2 pb-1 text-left font-bold">
									{row.name}
								</th>
							</tr>
						{:else}
							<tr>
								<td class="border border-border px-2 py-2 text-center tabular-nums">{row.number}</td>
								<td class="border border-border px-2 py-2">{row.rank}</td>
								<td class="border border-border px-2 py-2">{row.name}</td>
								<td class="border border-border px-2 py-2"></td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
			{#if nobody}
				<p class="py-6 text-center text-sm text-destructive-text">Nobody matches these filters.</p>
			{/if}
		</div>
	</section>
</AppDialog.Body>

<AppDialog.Footer class="items-center border-t px-7 py-4 sm:justify-between">
	<div class="flex w-full flex-col gap-3">
		{#if draft.error}
			<Alert.Root variant="destructive" role="alert">
				<Alert.Description>{draft.error}</Alert.Description>
			</Alert.Root>
		{/if}
		<div class="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
			<p class="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
				Saved to rosters · PDF, Letter
			</p>
			<div class="flex flex-col-reverse gap-2 sm:flex-row">
				<Button variant="outline" disabled={draft.saving} onclick={onBack}>Cancel</Button>
				<Button disabled={!draft.canSave || draft.saving} onclick={() => onSave()}>
					{#if draft.saving}<Spinner class="size-4" />{:else}<PrinterIcon aria-hidden="true" />{/if}
					{draft.saving ? 'Saving…' : 'Save and print'}
				</Button>
			</div>
		</div>
	</div>
</AppDialog.Footer>
