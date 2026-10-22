<script lang="ts">
	import { untrack } from 'svelte';
	import type { AssignmentType } from '$features/calendar/contracts';
	import type { Group, Personnel, RankCatalogEntry } from '$features/personnel/contracts';
	import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
	import { calendarLaneIds } from '$features/calendar/utils/calendarLanes';
	import AssignmentLaneCell from './calendar-lanes/AssignmentLaneCell.svelte';
	import AssignmentCodeChip from './AssignmentCodeChip.svelte';
	import DutyRosterSection from './DutyRosterSection.svelte';
	import {
		rosterDraftFrom,
		rosterDraftProblem,
		rosterExcusalsChanged,
		rosterRulesChanged,
		rosterSettingsFrom,
		draftPoolRules
	} from '$features/calendar/utils/rosterDraft';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import { ConfirmDialog } from '$lib/components/ui/confirm-dialog';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Switch } from '$lib/components/ui/switch';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { rejectedRequestMessage } from '$lib/stores/core';
	import { PendingSave } from '$lib/utils/pendingSave.svelte';
	import { formatDate, formatDayMonth } from '$lib/utils/dates';
	import { fromDayNumber, toDayNumber } from '$lib/utils/dayNumber';

	interface Props {
		/** The type to edit. Without it the dialog adds a new type. */
		type?: AssignmentType;
		roster: readonly Personnel[];
		groups: readonly Group[];
		rankCatalog: readonly RankCatalogEntry[] | 'loading' | 'failed';
		onClose: () => void;
	}

	let { type, roster, groups, rankCatalog, onClose }: Props = $props();

	// A color input only accepts #rrggbb, and the chosen value is saved as the type's color.
	const DEFAULT_ASSIGNMENT_COLOR = '#c47f00';

	// Once an add has saved, the dialog keeps editing that type so a failed lane change can be retried.
	let createdId = $state<string | null>(null);
	const editing = $derived(dailyAssignmentsStore.types.find((candidate) => candidate.id === (createdId ?? type?.id)));
	const initial = untrack(() => type);
	let name = $state(initial?.name ?? '');
	let shortName = $state(initial?.shortName ?? '');
	let color = $state(initial?.color ?? DEFAULT_ASSIGNMENT_COLOR);
	let assignTo = $state<AssignmentType['assignTo']>(initial?.assignTo ?? 'personnel');
	let rosterDraft = $state(rosterDraftFrom(initial));
	let triedSave = $state(false);
	let confirmingNewForm = $state(false);
	// The editor's calendar day, read again when Save is pressed. A rule change closes the open DA 6 on it.
	let today = $state(formatDate(new Date()));
	let shown = $state(initial?.showOnCalendar ?? false);
	let lanesNotice = $state('');
	const saving = new PendingSave();

	const laneIds = $derived(dailyAssignmentsStore.pendingLaneIds ?? calendarLaneIds(dailyAssignmentsStore.types));
	const savedLaneIndex = $derived(editing ? laneIds.indexOf(editing.id) : -1);
	const savedShown = $derived(savedLaneIndex >= 0);
	// Turning a lane on appends it, so an unsaved lane is always the last one.
	const lanePosition = $derived(savedShown ? savedLaneIndex + 1 : laneIds.length + 1);
	const laneCount = $derived(savedShown ? laneIds.length : laneIds.length + 1);
	const details = $derived({
		name: name.trim(),
		shortName: shortName.trim().toUpperCase(),
		color,
		assignTo
	});
	const isRoster = $derived(assignTo === 'personnel');
	// Ending a roster closes its DA 6 with a record the rank catalog computes.
	const groupLocked = $derived(rankCatalog === 'failed' && editing?.assignTo === 'personnel');
	// A rule change on a type that already keeps a DA 6 closes it, so it asks first.
	const closesForm = $derived(
		isRoster && editing?.assignTo === 'personnel' && rosterRulesChanged(editing, rosterDraft)
	);
	const rosterDirty = $derived(
		isRoster &&
			(editing
				? rosterRulesChanged(editing, rosterDraft) || rosterExcusalsChanged(editing, rosterDraft)
				: rosterDraft.mode === 'match' || rosterDraft.excusals.length > 0 || rosterDraft.weekendMode !== 'same')
	);
	const detailsDirty = $derived(
		!editing ||
			details.name !== editing.name ||
			details.shortName !== editing.shortName ||
			details.color !== editing.color ||
			details.assignTo !== editing.assignTo
	);
	const dirty = $derived(
		editing
			? detailsDirty || shown !== savedShown || rosterDirty
			: name.trim() !== '' || shortName.trim() !== '' || color !== DEFAULT_ASSIGNMENT_COLOR || shown || rosterDirty
	);
	const valid = $derived(
		details.name !== '' && details.shortName !== '' && !(isRoster && rosterDraftProblem(rosterDraft))
	);
	const sampleAssignee = $derived(roster[0]?.lastName.toUpperCase() ?? 'NAME');

	async function saveDetails(): Promise<AssignmentType | null> {
		const failure = editing ? 'Failed to save assignment type' : 'Failed to add assignment type';
		try {
			if (!editing) {
				const created = await dailyAssignmentsStore.addType({
					...details,
					showOnCalendar: false,
					sortOrder: 0,
					poolRules: isRoster ? draftPoolRules(rosterDraft) : null,
					weekendMode: isRoster ? rosterDraft.weekendMode : 'same',
					excusals: []
				});
				if (created) createdId = created.id;
				else toastStore.error(failure);
				return created;
			}
			// Becoming a Group assignment closes the open DA 6 on the editor's day.
			if (detailsDirty && !(await dailyAssignmentsStore.updateType(editing.id, details, today))) {
				toastStore.error(failure);
				return null;
			}
			return editing;
		} catch (error) {
			toastStore.error(rejectedRequestMessage(error, failure));
			return null;
		}
	}

	/** Resolves false when the roster was not saved, or the save no longer belongs to this dialog. */
	async function saveRoster(target: AssignmentType): Promise<boolean> {
		if (!isRoster || (!rosterRulesChanged(target, rosterDraft) && !rosterExcusalsChanged(target, rosterDraft)))
			return true;
		try {
			return (
				(await dailyAssignmentsStore.saveRosterSettings(target.id, rosterSettingsFrom(rosterDraft, today))) !== null
			);
		} catch (error) {
			toastStore.error(rejectedRequestMessage(error, 'Failed to save the duty roster'));
			return false;
		}
	}

	function requestSave() {
		triedSave = true;
		if (!valid) return;
		today = formatDate(new Date());
		if (closesForm) confirmingNewForm = true;
		else void saving.run(save);
	}

	async function save() {
		if (!valid) return;
		lanesNotice = '';
		const target = await saveDetails();
		if (!target || !(await saveRoster(target))) return;

		const nowShown = laneIds.includes(target.id);
		if (shown !== nowShown) {
			const id = target.id;
			const result = await dailyAssignmentsStore.setCalendarLanes(
				shown ? [...laneIds, id] : laneIds.filter((laneId) => laneId !== id)
			);
			if (result.status === 'stale') return onClose();
			if (result.status !== 'saved') {
				lanesNotice = {
					busy: 'Details are saved. Another assignment type change is still saving, so try the calendar setting again.',
					unconfirmed:
						"Details are saved. We couldn't confirm the calendar setting, so check the calendar before you try again.",
					'not-saved': 'Details are saved. The calendar setting was not saved.'
				}[result.status];
				return;
			}
		}
		onClose();
	}
</script>

<AppDialog.Root open busy={saving.pending} closeBlocked={dirty} {onClose}>
	<AppDialog.Content presentation="sheet">
		<AppDialog.Header class="border-b pb-4">
			<AppDialog.Title>{editing ? 'Edit Assignment Type' : 'Add Assignment Type'}</AppDialog.Title>
			<AppDialog.Description>
				{editing
					? 'Update this duty coverage assignment.'
					: 'Create a new duty coverage assignment for daily scheduling.'}
			</AppDialog.Description>
		</AppDialog.Header>
		<AppDialog.Body class="grid content-start gap-5">
			<fieldset class="contents" disabled={saving.pending}>
				<Field.Root>
					<Field.Label for="assignment-type-name">Full name</Field.Label>
					<Input id="assignment-type-name" type="text" placeholder="e.g., Staff Duty" bind:value={name} />
				</Field.Root>
				<div class="flex flex-wrap items-start gap-4">
					<Field.Root class="w-28">
						<Field.Label for="assignment-type-short">Short code</Field.Label>
						<Input
							id="assignment-type-short"
							type="text"
							placeholder="e.g., SD"
							maxlength={5}
							class="uppercase"
							bind:value={shortName}
						/>
						<Field.Description>Up to 5 letters</Field.Description>
					</Field.Root>
					<Field.Root class="w-auto">
						<Field.Label for="assignment-type-color">Color</Field.Label>
						<Input id="assignment-type-color" type="color" class="w-12 cursor-pointer p-1" bind:value={color} />
					</Field.Root>
				</div>
				<Field.Root>
					<Field.Title id="assignment-type-to">Assigned to</Field.Title>
					<div>
						<ToggleGroup.Root
							type="single"
							variant="outline"
							aria-labelledby="assignment-type-to"
							bind:value={
								() => assignTo,
								(value) => {
									if (value === 'personnel' || value === 'group') assignTo = value;
								}
							}
						>
							<ToggleGroup.Item value="personnel">Person</ToggleGroup.Item>
							<ToggleGroup.Item value="group" disabled={groupLocked}>Group</ToggleGroup.Item>
						</ToggleGroup.Root>
					</div>
					<Field.Description>
						A Group assignment puts the Group name in the lane. Group assignments have no duty roster.
					</Field.Description>
				</Field.Root>
				<div class="flex flex-col gap-3 rounded-lg border p-4">
					<div class="flex items-start justify-between gap-4">
						<div class="flex flex-col gap-0.5">
							<Field.Label for="assignment-type-shown">Show on the calendar</Field.Label>
							<p class="text-sm text-muted-foreground">
								{#if !shown}
									Duty planner only.
								{:else if savedShown}
									Lane {lanePosition} of {laneCount} under the dates.
								{:else}
									Adds lane {lanePosition} of {laneCount} under the dates.
								{/if}
							</p>
						</div>
						<Switch id="assignment-type-shown" bind:checked={shown} />
					</div>
					{#if shown}
						<div class="flex flex-wrap items-center gap-4 text-xs text-muted-foreground" aria-hidden="true">
							<div class="flex h-[26px] items-stretch overflow-hidden rounded-md border bg-card">
								<span class="w-1" style:background-color={color}></span>
								<span class="flex items-center px-2 text-xs font-medium text-foreground">{details.name || 'Lane'}</span>
								<span class="w-12 border-l">
									<AssignmentLaneCell
										value={{
											dateLabel: '',
											typeName: details.name,
											assignee: { short: sampleAssignee, full: sampleAssignee }
										}}
									/>
								</span>
							</div>
							{#if details.shortName}
								<span class="flex items-center gap-2">
									<AssignmentCodeChip code={details.shortName} {color} />
									Row marker
								</span>
							{/if}
						</div>
					{/if}
					{#if lanesNotice}
						<p class="text-sm text-destructive" role="alert">{lanesNotice}</p>
					{/if}
				</div>
				{#if isRoster}
					<DutyRosterSection
						bind:draft={rosterDraft}
						{roster}
						{groups}
						{rankCatalog}
						{today}
						showProblems={triedSave}
					/>
				{/if}
			</fieldset>
		</AppDialog.Body>
		<AppDialog.Footer class="border-t pt-4">
			<Button variant="outline" onclick={onClose} disabled={saving.pending}>Cancel</Button>
			<Button
				onclick={requestSave}
				disabled={saving.pending || dailyAssignmentsStore.typesBusy || !dirty || (triedSave && !valid)}
			>
				{#if saving.pending}<Spinner />{/if}
				{editing ? 'Save Changes' : 'Add Assignment Type'}
			</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

{#if confirmingNewForm}
	<ConfirmDialog
		title="Start a new DA 6?"
		message={`This starts a new DA 6 on ${formatDayMonth(fromDayNumber(toDayNumber(today) + 1))}. The current form closes as it is. Everyone keeps their current count.`}
		confirmLabel="Save changes"
		variant="default"
		onConfirm={async () => {
			await saving.run(save);
			confirmingNewForm = false;
		}}
		onCancel={() => (confirmingNewForm = false)}
	/>
{/if}
