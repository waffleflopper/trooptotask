<script lang="ts">
	import Lock from '@lucide/svelte/icons/lock';
	import Search from '@lucide/svelte/icons/search';
	import X from '@lucide/svelte/icons/x';
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import * as Alert from '$lib/components/ui/alert';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import * as Select from '$lib/components/ui/select';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Spinner } from '$lib/components/ui/spinner';
	import { rejectedRequestMessage, withinOrganizationLifetime } from '$lib/stores/core';
	import { formatDate } from '$lib/utils/dates';
	import { PendingSave } from '$lib/utils/pendingSave.svelte';
	import { eventDayRange } from '../../../events/eventModel';
	import ResponsibilityPill from '../../components/ResponsibilityPill.svelte';
	import type { GroupLabels, Tasking } from '../../taskingModel';
	import {
		outsideScopeLabel,
		personName,
		pickerRows,
		shortPersonName,
		type PickerRow,
		type StaffingPicker,
		type StaffingSaveResult,
		type TaskingStaffing
	} from '../staffingModel';
	import { loadStaffingPickerRequest, saveStaffingRequest } from '../staffingRequests';
	import PersonState from './PersonState.svelte';
	import { groupLabel, personStateLine, qualificationTokens, reviewLabel } from './staffingLabels';

	interface Props {
		orgId: string;
		/** Title and dates are optional so a caller that only staffs can open it; they make the subtitle. */
		tasking: Pick<Tasking, 'id' | 'responsibility' | 'requirement'> &
			Partial<Pick<Tasking, 'title' | 'execution' | 'suspenseOn'>>;
		groups: GroupLabels;
		/** The viewer's day, for date labels; the browser's day when omitted. */
		today?: string;
		/** `before` is the selection the picker opened on, so a caller can offer to put it back. */
		onSaved: (result: StaffingSaveResult, before?: TaskingStaffing) => unknown;
		onClose: () => void;
	}

	let { orgId, tasking, groups, today = formatDate(new Date()), onSaved, onClose }: Props = $props();

	const ALL_GROUPS = 'all';
	const UNASSIGNED = 'unassigned';

	let picker = $state.raw<StaffingPicker | 'failed' | null>(null);
	const selected = new SvelteSet<string>();
	let removeOutsideScope = $state(false);
	let revision = $state(0);
	let initial = $state.raw<string[]>([]);
	let search = $state('');
	let groupFilter = $state(ALL_GROUPS);
	let qualifiedOnly = $state(true);
	let conflict = $state.raw<TaskingStaffing | null>(null);
	let saveError = $state('');
	let open = true;
	const saving = new PendingSave();
	const countId = $props.id();

	$effect(() => () => (open = false));

	async function load() {
		picker = null;
		try {
			const loaded = await withinOrganizationLifetime(loadStaffingPickerRequest(orgId, tasking.id), () => open);
			const picked = loaded.staffing.picks.map((pick) => pick.personnelId);
			initial = picked;
			selected.clear();
			for (const id of picked) selected.add(id);
			revision = loaded.staffing.revision;
			picker = loaded;
		} catch {
			if (open) picker = 'failed';
		}
	}

	onMount(load);

	const responsibility = $derived(tasking.responsibility);
	const organizationLevel = $derived(responsibility.kind === 'organization');
	const ownerName = $derived(
		responsibility.kind === 'organization' ? null : groupLabel(responsibility.groupId, groups)
	);
	const rows = $derived(typeof picker === 'object' && picker ? pickerRows(picker, responsibility) : []);
	const rowsById = $derived(new Map(rows.map((row) => [row.personnelId, row])));
	const groupOptions = $derived(
		Object.entries(groups)
			.map(([id, name]) => ({ id, name }))
			.sort((a, b) => a.name.localeCompare(b.name))
	);
	const groupFilterLabel = $derived(
		groupFilter === ALL_GROUPS ? 'All' : groupFilter === UNASSIGNED ? 'Unassigned' : (groups[groupFilter] ?? 'All')
	);
	// The requirement names an MOS only as free text, so the toggle appears only when that text names one people hold.
	const qualifications = $derived(
		qualificationTokens(
			tasking.requirement?.qualifications ?? null,
			rows.map((row) => row.mos)
		)
	);
	const shown = $derived.by(() => {
		const query = search.trim().toLowerCase();
		return rows.filter(
			(row) =>
				(!query || `${row.rank} ${row.firstName} ${row.lastName} ${row.mos}`.toLowerCase().includes(query)) &&
				(groupFilter === ALL_GROUPS ||
					(groupFilter === UNASSIGNED ? row.groupId === null : row.groupId === groupFilter)) &&
				(!qualifiedOnly || qualifications.length === 0 || qualifications.includes(row.mos.trim().toUpperCase()))
		);
	});
	const outsideScope = $derived(typeof picker === 'object' && picker ? picker.staffing.outsideScope : 0);
	const dirty = $derived(
		removeOutsideScope || selected.size !== initial.length || initial.some((id) => !selected.has(id))
	);
	const required = $derived(tasking.requirement?.count ?? null);
	const openSlots = $derived(required === null ? 0 : Math.max(0, required - selected.size));
	const countText = $derived(
		required === null
			? `${selected.size} selected`
			: openSlots > 0
				? `${openSlots} more needed`
				: `${selected.size} of ${required} selected`
	);
	const countTone = $derived(
		required === null ? 'text-muted-foreground' : openSlots > 0 ? 'text-accent-text' : 'text-success-foreground'
	);
	const subtitle = $derived(
		[tasking.title, tasking.execution ? eventDayRange(tasking.execution, today) : null].filter(Boolean).join(' · ')
	);
	const conflictNames = $derived(conflict?.picks.map(personName) ?? []);

	function chipLabel(row: PickerRow) {
		return [
			shortPersonName(row),
			organizationLevel && groupLabel(row.groupId, groups),
			!initial.includes(row.personnelId) && 'new'
		]
			.filter(Boolean)
			.join(' · ');
	}

	const secondary = (row: PickerRow) =>
		[groupLabel(row.groupId, groups), row.mos, row.clinicRole].filter(Boolean).join(' · ');

	function toggle(personnelId: string, checked: boolean) {
		if (checked) selected.add(personnelId);
		else selected.delete(personnelId);
	}

	function save() {
		void saving.run(async () => {
			saveError = '';
			const before = typeof picker === 'object' && picker ? picker.staffing : undefined;
			try {
				const request = saveStaffingRequest(orgId, tasking.id, {
					personnelIds: [...selected],
					keep: [],
					removeOutsideScope,
					expectedRevision: revision
				});
				const result = await withinOrganizationLifetime(request, () => open);
				if (result.outcome !== 'conflict') {
					await onSaved(result, before);
					return;
				}
				conflict = result.staffing;
				revision = result.staffing.revision;
			} catch (error) {
				if (open)
					saveError = rejectedRequestMessage(error, 'The people were not saved. Your choices are kept, so try again.');
			}
		});
	}
</script>

<AppDialog.Root open busy={saving.pending} closeBlocked={dirty} {onClose}>
	<AppDialog.Content presentation="sheet" size="wide">
		<AppDialog.Header class="gap-3 border-b border-border px-6 pt-[22px] pb-4">
			<div class="grid gap-1 pr-8">
				<AppDialog.Title class="font-heading text-2xl leading-7 font-bold">Assign people</AppDialog.Title>
				{#if subtitle}
					<AppDialog.Description class="text-sm text-muted-foreground">{subtitle}</AppDialog.Description>
				{/if}
			</div>
			<div class="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2">
				<ResponsibilityPill {responsibility} {groups} size="sm" />
				<p class="m-0 text-[13px] leading-[18px] text-foreground/80">
					{ownerName
						? `${ownerName}'s tasking. You can pick from ${ownerName}'s roster.`
						: 'Organization-level tasking. You can pick from every Group.'}
				</p>
			</div>
		</AppDialog.Header>

		<div class="flex flex-wrap items-center gap-2 border-b border-border bg-card px-6 py-3" aria-label="Selected people">
			<span class={['shrink-0 font-mono text-[13px] font-semibold tabular-nums', countTone]}>
				{required === null ? `${selected.size} selected` : `${selected.size} of ${required}`}
			</span>
			{#each [...selected] as id (id)}
				{@const row = rowsById.get(id)}
				{#if row}
					<span class="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-accent/12 pr-1 pl-2.5">
						<span class="text-[13px] leading-[18px] font-medium">{chipLabel(row)}</span>
						<button
							type="button"
							class="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-accent/20 hover:text-foreground disabled:opacity-50"
							aria-label={`Remove ${personName(row)}`}
							disabled={saving.pending}
							onclick={() => selected.delete(id)}
						>
							<X class="size-3" aria-hidden="true" />
						</button>
					</span>
				{/if}
			{/each}
			{#each Array.from({ length: Math.min(openSlots, 6) }, (_, index) => index) as slot (slot)}
				<span class="h-[26px] w-14 shrink-0 rounded-full border-[1.5px] border-dashed border-accent" aria-hidden="true"></span>
			{/each}
		</div>

		<div class="flex flex-wrap items-center gap-2 px-6 py-3">
			<label class="relative min-w-48 flex-1">
				<span class="sr-only">Search</span>
				<Search
					class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
					aria-hidden="true"
				/>
				<Input type="search" class="h-[34px] pl-8" placeholder="Search name, rank or MOS" bind:value={search} />
			</label>
			{#if organizationLevel}
				<Select.Root type="single" bind:value={groupFilter}>
					<Select.Trigger class="h-[34px]" aria-label="Group">
						<span class="text-muted-foreground">Group</span>
						<span class="font-medium">{groupFilterLabel}</span>
					</Select.Trigger>
					<Select.Content align="end">
						<Select.Item value={ALL_GROUPS} label="All Groups" />
						{#each groupOptions as group (group.id)}
							<Select.Item value={group.id} label={group.name} />
						{/each}
						<Select.Item value={UNASSIGNED} label="Unassigned" />
					</Select.Content>
				</Select.Root>
			{:else}
				<span
					class="inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-border bg-muted px-2.5 text-sm"
					title="Only this Group's roster can be picked"
				>
					<span class="text-muted-foreground">Group</span>
					<span class="font-medium">{ownerName}</span>
					<Lock class="size-3 text-muted-foreground" aria-label="Locked" />
				</span>
			{/if}
			{#if qualifications.length > 0}
				<Button
					variant={qualifiedOnly ? 'default' : 'outline'}
					class="h-[34px]"
					aria-pressed={qualifiedOnly}
					onclick={() => (qualifiedOnly = !qualifiedOnly)}
				>
					{qualifications.join(', ')}
				</Button>
			{/if}
		</div>

		<AppDialog.Body class="grid content-start gap-3 px-6 pt-0">
			{#if saveError}
				<Alert.Root variant="destructive" {@attach (alert) => alert.scrollIntoView({ block: 'nearest' })}>
					<Alert.Description>{saveError}</Alert.Description>
				</Alert.Root>
			{/if}
			{#if conflict}
				<Alert.Root variant="warning" {@attach (alert) => alert.scrollIntoView({ block: 'nearest' })}>
					<Alert.Title>Someone else saved this list while you were choosing</Alert.Title>
					<Alert.Description>
						<p class="m-0">
							Saved now: {conflictNames.length > 0 ? conflictNames.join('; ') : 'nobody'}{conflict.outsideScope > 0
								? `; ${outsideScopeLabel(conflict.outsideScope)}`
								: ''}.
						</p>
						<p class="m-0">Your choices are still selected below. Save again to replace their list with yours.</p>
					</Alert.Description>
				</Alert.Root>
			{/if}

			{#if picker === null}
				<div role="status" aria-label="Loading roster">
					{#each [0, 1, 2, 3, 4] as placeholder (placeholder)}
						<div class="flex min-h-14 items-center gap-3 border-b border-border">
							<Skeleton class="size-[18px]" />
							<Skeleton class="h-3.5 w-9" />
							<Skeleton class="h-4 w-40" />
						</div>
					{/each}
				</div>
			{:else if picker === 'failed'}
				<Alert.Root variant="destructive">
					<Alert.Title>The roster could not be loaded</Alert.Title>
					<Alert.Description>Nothing has changed. Try again in a moment.</Alert.Description>
					<div class="mt-3"><Button variant="outline" onclick={load}>Retry</Button></div>
				</Alert.Root>
			{:else}
				{#if picker.advisories.kind === 'no_execution'}
					<p class="m-0 text-[13px] text-muted-foreground">
						This tasking has no execution dates, so nobody can be checked for overlaps.
					</p>
				{:else if picker.advisories.kind === 'failed'}
					<p class="m-0 text-[13px] text-muted-foreground">
						Overlaps could not be checked. Anyone below may already be committed over these dates.
					</p>
				{/if}

				{#if shown.length === 0}
					<p class="m-0 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
						{rows.length === 0 ? 'Nobody on this roster is active.' : 'Nobody matches these filters.'}
					</p>
				{:else}
					<ul class="m-0 list-none p-0" aria-describedby={countId}>
						{#each shown as row (row.personnelId)}
							{@const inputId = `assign-${row.personnelId}`}
							<li class="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border py-2">
								<Checkbox
									id={inputId}
									class="size-[18px]"
									checked={selected.has(row.personnelId)}
									onCheckedChange={(checked) => toggle(row.personnelId, checked)}
									disabled={saving.pending}
								/>
								<span class="w-9 shrink-0 font-mono text-xs text-muted-foreground">{row.rank}</span>
								<label for={inputId} class="grid min-w-0 flex-1 basis-32 cursor-pointer gap-0.5">
									<span class="truncate text-sm leading-[18px] font-medium">{row.lastName}, {row.firstName}</span>
									<span class="truncate font-mono text-xs text-muted-foreground">{secondary(row)}</span>
									{#if row.review}
										<span class="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
											<Badge variant="warning">Needs review</Badge>
											{reviewLabel(row.review, row.groupId, groups)}
										</span>
									{/if}
								</label>
								<span class="basis-full pl-[78px] sm:w-[230px] sm:shrink-0 sm:basis-auto sm:pl-0">
									<PersonState
										line={personStateLine(
											picker.states[row.personnelId] ?? { kind: 'unknown', reason: 'failed' },
											tasking.execution ?? null,
											today
										)}
									/>
								</span>
							</li>
						{/each}
					</ul>
					{#if !organizationLevel}
						<p class="m-0 py-2 text-center font-mono text-xs text-muted-foreground">Other Groups are not listed.</p>
					{/if}
				{/if}

				{#if outsideScope > 0}
					<div class="flex items-start gap-3 rounded-lg border px-3 py-2.5">
						<Checkbox
							id="assign-remove-outside"
							class="mt-0.5"
							bind:checked={removeOutsideScope}
							disabled={saving.pending}
						/>
						<label for="assign-remove-outside" class="grid cursor-pointer gap-0.5">
							<span class="font-medium">Remove {outsideScopeLabel(outsideScope)}</span>
							<span class="text-sm text-muted-foreground">Left alone, they stay picked.</span>
						</label>
					</div>
				{/if}
			{/if}
		</AppDialog.Body>
		<AppDialog.Footer class="block border-t border-border bg-muted px-6 py-[14px]">
			<p class="m-0 text-[13px] leading-[18px] text-muted-foreground">
				{ownerName
					? `Only ${ownerName}'s roster appears because ${ownerName} owns this tasking. To use someone from another Group, ask Organization-wide calendar staff to add a tasking for that Group.`
					: 'Overlap notes come from leave, TDY and other taskings already on the calendar. They are a heads-up, not a block. Selected people are not notified.'}
			</p>
			<div class="mt-2.5 flex flex-wrap items-center gap-2">
				<span
					id={countId}
					class={['grow font-mono text-[13px] font-semibold tabular-nums', countTone]}
					aria-live="polite"
				>
					{countText}
				</span>
				<Button variant="ghost" onclick={onClose} disabled={saving.pending}>Cancel</Button>
				<Button
					onclick={save}
					disabled={saving.pending || typeof picker !== 'object' || picker === null || (!dirty && !conflict)}
				>
					{#if saving.pending}<Spinner />{/if}
					Save {selected.size}
					{selected.size === 1 ? 'person' : 'people'}
				</Button>
			</div>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
