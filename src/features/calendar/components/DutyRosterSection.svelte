<script lang="ts">
	import type { Snippet } from 'svelte';
	import X from '@lucide/svelte/icons/x';
	import Plus from '@lucide/svelte/icons/plus';
	import { ROSTER_EXCUSAL_REASON_MAX } from '$features/calendar/contracts';
	import { poolOn } from '$features/calendar/roster/rosterEngine';
	import type { RosterPerson, WeekendMode } from '$features/calendar/roster/rosterTypes';
	import { draftPoolRules, rosterDraftProblem, type RosterDraft } from '$features/calendar/utils/rosterDraft';
	import {
		rankCodesForOptions,
		type Group,
		type Personnel,
		type RankCatalogEntry
	} from '$features/personnel/contracts';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Combobox from '$lib/components/ui/combobox';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import * as Popover from '$lib/components/ui/popover';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';

	interface Props {
		draft: RosterDraft;
		/** Active people in the Organization. */
		roster: readonly Personnel[];
		groups: readonly Group[];
		/** Rules and weekends close a DA 6 form, which needs the catalog; excusals do not. */
		rankCatalog: readonly RankCatalogEntry[] | 'loading' | 'failed';
		today: string;
		/** Set once a save was tried, so an unfinished rule shows its error. */
		showProblems: boolean;
	}

	let { draft = $bindable(), roster, groups, rankCatalog, today, showProblems }: Props = $props();

	// Segments share the width and wrap their label on a narrow sheet instead of overflowing it.
	const SEGMENT = 'h-auto min-h-8 flex-1 shrink whitespace-normal py-1';

	const WEEKEND_HELP: Record<WeekendMode, string> = {
		same: 'One rotation for every day. Pick Separate count when weekends should rotate on their own.',
		separate:
			'Weekend and holiday turns rotate on their own, so nobody pulls every Saturday. They print in red on the DA 6.',
		none: 'Nobody pulls this duty on weekends and holidays, and the DA 6 leaves those days out.'
	};

	const people = $derived(
		roster.map(
			(person): RosterPerson => ({
				id: person.id,
				rank: person.rank,
				lastName: person.lastName,
				firstName: person.firstName,
				states: [
					{
						from: today,
						active: true,
						rank: person.rank,
						mos: person.mos,
						clinicRole: person.clinicRole,
						groupId: person.groupId
					}
				]
			})
		)
	);
	const catalog = $derived(typeof rankCatalog === 'string' ? [] : rankCatalog);
	const byId = $derived(new Map(roster.map((person) => [person.id, person])));
	const pool = $derived(
		poolOn({
			rules: draftPoolRules(draft),
			people,
			excusals: draft.excusals.map(({ personId, reason }) => ({ personId, reason, from: today, through: null })),
			catalog,
			on: today
		}).members
	);
	const shortName = (person: { rank: string; lastName: string }) => `${person.rank} ${person.lastName}`;
	const poolPreview = $derived(
		pool.length > 4
			? `${pool.slice(0, 4).map(shortName).join(', ')} +${pool.length - 4}`
			: pool.map(shortName).join(', ')
	);
	const problem = $derived(showProblems ? rosterDraftProblem(draft) : null);

	const rankOptions = $derived(
		rankCodesForOptions({
			rankCatalog: catalog,
			observedRanks: roster.map((person) => person.rank),
			preserveRanks: [draft.rank?.from ?? '', draft.rank?.to ?? '']
		})
	);
	const distinct = (values: string[]) =>
		[...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
	const mosOptions = $derived(
		distinct([...roster.map((person) => person.mos), ...(draft.mos ?? [])]).map((value) => ({ value, label: value }))
	);
	const roleOptions = $derived(
		distinct([...roster.map((person) => person.clinicRole), ...(draft.role ?? [])]).map((value) => ({
			value,
			label: value
		}))
	);
	const groupOptions = $derived(groups.map((group) => ({ value: group.id, label: group.name })));
	const groupNames = $derived(new Map(groups.map((group) => [group.id, group.name])));

	const excusedIds = $derived(new Set(draft.excusals.map(({ personId }) => personId)));
	const excuseOptions = $derived(
		[...roster]
			.filter((person) => !excusedIds.has(person.id))
			.sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
			.map((person) => ({ value: person.id, label: `${person.rank} ${person.lastName}, ${person.firstName}` }))
	);

	let excuseOpen = $state(false);
	let excusePerson = $state('');
	let excuseReason = $state('');
	let excuseTried = $state(false);
	const excuseReasonMissing = $derived(excuseTried && excuseReason.trim() === '');

	function setMode(value: string) {
		if (value !== 'everyone' && value !== 'match') return;
		draft.mode = value;
		const empty = !draft.rank && !draft.mos && !draft.role && !draft.groupIds;
		if (value === 'match' && empty) draft.rank = { from: '', to: '' };
	}

	function excuse() {
		excuseTried = true;
		if (!excusePerson || excuseReason.trim() === '') return;
		draft.excusals = [...draft.excusals, { personId: excusePerson, reason: excuseReason.trim() }];
		closeExcuse();
	}

	function closeExcuse() {
		excuseOpen = false;
		excusePerson = '';
		excuseReason = '';
		excuseTried = false;
	}
</script>

{#snippet ruleRow(label: string, remove: () => void, controls: Snippet)}
	<!-- On a narrow sheet the controls take their own line under the label. -->
	<div
		class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-t px-4 py-3 first:border-t-0 @xs:grid-cols-[3.5rem_minmax(0,1fr)_auto]"
	>
		<span class="font-mono text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{label}</span>
		<div class="col-span-2 row-start-2 flex min-w-0 items-center gap-2 @xs:col-span-1 @xs:row-start-auto">
			{@render controls()}
		</div>
		<Button
			variant="ghost"
			size="icon-xs"
			aria-label={`Remove the ${label === 'MOS' ? label : label.toLowerCase()} rule`}
			onclick={remove}
		>
			<X />
		</Button>
	</div>
{/snippet}

{#snippet rankRange()}
	{#if draft.rank}
		<NativeSelect aria-label="From rank" bind:value={draft.rank.from} class="min-w-0 flex-1">
			<option value="">Rank…</option>
			{#each rankOptions as code (code)}<option value={code}>{code}</option>{/each}
		</NativeSelect>
		<span class="shrink-0 text-sm text-muted-foreground">through</span>
		<NativeSelect aria-label="Through rank" bind:value={draft.rank.to} class="min-w-0 flex-1">
			<option value="">Rank…</option>
			{#each rankOptions as code (code)}<option value={code}>{code}</option>{/each}
		</NativeSelect>
	{/if}
{/snippet}

{#snippet listRule(
	label: string,
	items: { value: string; label: string }[],
	values: string[],
	set: (next: string[] | null) => void,
	names?: Map<string, string>
)}
	{#snippet picker()}
		<Combobox.Root
			{items}
			multiple
			value={values}
			onValueChange={(next) => set(Array.isArray(next) ? next : [next])}
			{label}
			class="min-w-0 flex-1"
		>
			<Combobox.Chips class="min-w-0">
				<Combobox.Value>
					{#snippet children(selected)}
						{#each selected as value (value)}
							<Combobox.Chip {value}>{names?.get(value) ?? value}</Combobox.Chip>
						{/each}
						<Combobox.ChipsInput
							placeholder={`Add ${label === 'MOS' ? 'an MOS' : `a ${label.toLowerCase()}`}`}
							aria-label={label}
						/>
					{/snippet}
				</Combobox.Value>
			</Combobox.Chips>
			<Combobox.Content>
				<Combobox.Empty>Nobody on the roster has one yet.</Combobox.Empty>
				<Combobox.List>
					{#snippet children(value, option)}
						<Combobox.Item {value} label={option.label} />
					{/snippet}
				</Combobox.List>
			</Combobox.Content>
		</Combobox.Root>
	{/snippet}
	{@render ruleRow(label, () => set(null), picker)}
{/snippet}

<section class="flex flex-col gap-5" aria-labelledby="duty-roster-heading">
	<div class="flex items-center gap-3">
		<h3 id="duty-roster-heading" class="font-mono text-[11px] font-semibold tracking-widest uppercase">Duty roster</h3>
		<span class="h-px flex-1 bg-border" aria-hidden="true"></span>
		<span class="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">DA Form 6</span>
	</div>

	<Field.Root>
		<Field.Title id="duty-roster-who">Who pulls this duty</Field.Title>
		{#if rankCatalog === 'loading'}
			<div class="flex flex-col gap-2" role="status">
				<span class="sr-only">Loading ranks</span>
				<Skeleton class="h-8 w-full" />
				<Skeleton class="h-4 w-3/4" />
			</div>
		{:else if rankCatalog === 'failed'}
			<Alert.Root variant="destructive">
				<Alert.Title>Ranks unavailable</Alert.Title>
				<Alert.Description
					>Ranks could not load, so roster rules and weekends can't change right now. Excusals still save. Reload this
					page to try again.</Alert.Description
				>
			</Alert.Root>
		{:else}
			<ToggleGroup.Root
				type="single"
				variant="outline"
				aria-labelledby="duty-roster-who"
				class="w-full"
				bind:value={() => draft.mode, setMode}
			>
				<ToggleGroup.Item value="everyone" class={SEGMENT}>Everyone</ToggleGroup.Item>
				<ToggleGroup.Item value="match" class={SEGMENT}>Only people who match</ToggleGroup.Item>
			</ToggleGroup.Root>
			{#if draft.mode === 'everyone'}
				<Field.Description>
					All {roster.length} people in the Organization, minus anyone excused below. Add rules when only certain ranks, MOSs
					or roles pull this duty.
				</Field.Description>
			{:else}
				<div class="@container flex flex-col overflow-hidden rounded-lg border" data-testid="duty-roster-rules">
					{#if draft.rank}
						{@render ruleRow('Rank', () => (draft.rank = null), rankRange)}
					{/if}
					{#if draft.mos}
						{@render listRule('MOS', mosOptions, draft.mos, (next) => (draft.mos = next))}
					{/if}
					{#if draft.role}
						{@render listRule('Role', roleOptions, draft.role, (next) => (draft.role = next))}
					{/if}
					{#if draft.groupIds}
						{@render listRule('Group', groupOptions, draft.groupIds, (next) => (draft.groupIds = next), groupNames)}
					{/if}
					{#if !draft.rank || !draft.mos || !draft.role || !draft.groupIds}
						<div class="flex flex-wrap items-center gap-2 border-t px-4 py-3 first:border-t-0">
							<span class="text-sm text-muted-foreground"
								>{draft.rank || draft.mos || draft.role || draft.groupIds ? 'And also' : 'Match on'}</span
							>
							{#if !draft.rank}
								<Button variant="outline" size="xs" onclick={() => (draft.rank = { from: '', to: '' })}
									><Plus />Rank</Button
								>
							{/if}
							{#if !draft.mos}
								<Button variant="outline" size="xs" onclick={() => (draft.mos = [])}><Plus />MOS</Button>
							{/if}
							{#if !draft.role}
								<Button variant="outline" size="xs" onclick={() => (draft.role = [])}><Plus />Role</Button>
							{/if}
							{#if !draft.groupIds}
								<Button variant="outline" size="xs" onclick={() => (draft.groupIds = [])}><Plus />Group</Button>
							{/if}
						</div>
					{/if}
					<div class="flex items-center gap-3 border-t bg-muted/40 px-4 py-3">
						<div class="flex min-w-0 flex-1 flex-col">
							<span class="text-sm font-medium" role="status" data-testid="duty-roster-count">
								{pool.length}
								{pool.length === 1 ? 'person' : 'people'} on this roster
							</span>
							<span class="truncate text-sm text-muted-foreground">{poolPreview || 'Nobody matches yet.'}</span>
						</div>
						{#if pool.length > 0}
							<Popover.Root>
								<Popover.Trigger>
									{#snippet child({ props })}
										<Button {...props} variant="link" size="sm">See list</Button>
									{/snippet}
								</Popover.Trigger>
								<Popover.Content
									align="end"
									class="max-h-80 w-72 max-w-(--bits-popover-content-available-width) overflow-y-auto p-3"
								>
									<Popover.Header>
										<Popover.Title>{pool.length} {pool.length === 1 ? 'person' : 'people'} on this roster</Popover.Title
										>
									</Popover.Header>
									<ol class="flex flex-col gap-1 text-sm">
										{#each pool as person (person.id)}
											<li>{person.rank} {person.lastName}, {person.firstName}</li>
										{/each}
									</ol>
								</Popover.Content>
							</Popover.Root>
						{/if}
					</div>
				</div>
				{#if problem}
					<Field.Error>{problem}</Field.Error>
				{/if}
			{/if}
		{/if}
	</Field.Root>

	<Field.Root>
		<Field.Title>Excused from this roster</Field.Title>
		<div class="flex flex-wrap items-center gap-2">
			{#each draft.excusals as excusal (excusal.personId)}
				{@const person = byId.get(excusal.personId)}
				<span
					class="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-muted/40 py-0.5 pr-1 pl-2.5 text-sm"
				>
					<span class="font-medium">{person ? shortName(person) : 'Former member'}</span>
					<span class="truncate text-muted-foreground">{excusal.reason}</span>
					<Button
						variant="ghost"
						size="icon-xs"
						class="rounded-full"
						aria-label={`Reinstate ${person ? shortName(person) : 'this person'}`}
						onclick={() => (draft.excusals = draft.excusals.filter(({ personId }) => personId !== excusal.personId))}
					>
						<X />
					</Button>
				</span>
			{/each}
			<Popover.Root bind:open={() => excuseOpen, (open) => (open ? (excuseOpen = true) : closeExcuse())}>
				<Popover.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="outline" size="sm"><Plus />Excuse someone</Button>
					{/snippet}
				</Popover.Trigger>
				<Popover.Content
					align="start"
					role="dialog"
					aria-label="Excuse someone"
					class="w-80 max-w-(--bits-popover-content-available-width) gap-3 p-3"
				>
					<Field.Group>
						<Field.Root>
							<Field.Label>Person</Field.Label>
							<Combobox.Root
								items={excuseOptions}
								value={excusePerson}
								label="Person to excuse"
								onValueChange={(value) => (excusePerson = Array.isArray(value) ? (value[0] ?? '') : value)}
								autoHighlight
							>
								<Combobox.Trigger placeholder="Pick someone" aria-label="Person to excuse" />
								<Combobox.Content>
									<Combobox.Search placeholder="Search people" />
									<Combobox.Empty>No people found.</Combobox.Empty>
									<Combobox.List />
								</Combobox.Content>
							</Combobox.Root>
						</Field.Root>
						<Field.Root data-invalid={excuseReasonMissing || undefined}>
							<Field.Label for="duty-roster-excuse-reason">Reason</Field.Label>
							<Input
								id="duty-roster-excuse-reason"
								placeholder="e.g., First sergeant"
								maxlength={ROSTER_EXCUSAL_REASON_MAX}
								aria-invalid={excuseReasonMissing || undefined}
								bind:value={excuseReason}
								onkeydown={(event) => event.key === 'Enter' && excuse()}
							/>
							{#if excuseReasonMissing}
								<Field.Error>Add a reason. It prints as a remark on the DA 6.</Field.Error>
							{/if}
						</Field.Root>
					</Field.Group>
					<div class="flex justify-end gap-2">
						<Button variant="outline" size="sm" onclick={closeExcuse}>Cancel</Button>
						<Button size="sm" disabled={!excusePerson} onclick={excuse}>Excuse</Button>
					</div>
				</Popover.Content>
			</Popover.Root>
		</div>
		<Field.Description>
			For standing reasons. The reason prints as a remark on the DA 6. Leave, TDY and school come from statuses instead.
		</Field.Description>
	</Field.Root>

	<Field.Root>
		<Field.Title id="duty-roster-weekends">Weekends &amp; holidays</Field.Title>
		<ToggleGroup.Root
			type="single"
			variant="outline"
			aria-labelledby="duty-roster-weekends"
			class="w-full"
			disabled={rankCatalog === 'failed'}
			bind:value={
				() => draft.weekendMode,
				(value) => {
					if (value === 'same' || value === 'separate' || value === 'none') draft.weekendMode = value;
				}
			}
		>
			<ToggleGroup.Item value="same" class={SEGMENT}>Same count</ToggleGroup.Item>
			<ToggleGroup.Item value="separate" class={SEGMENT}>Separate count</ToggleGroup.Item>
			<ToggleGroup.Item value="none" class={SEGMENT}>No duty</ToggleGroup.Item>
		</ToggleGroup.Root>
		<Field.Description>{WEEKEND_HELP[draft.weekendMode]}</Field.Description>
	</Field.Root>
</section>
