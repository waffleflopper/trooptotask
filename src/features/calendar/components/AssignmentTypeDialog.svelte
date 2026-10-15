<script lang="ts">
	import { untrack } from 'svelte';
	import type { AssignmentType } from '$features/calendar/contracts';
	import type { Personnel } from '$features/personnel/contracts';
	import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
	import { calendarLaneIds } from '$features/calendar/utils/calendarLanes';
	import AssignmentLaneCell from './calendar-lanes/AssignmentLaneCell.svelte';
	import AssignmentCodeChip from './AssignmentCodeChip.svelte';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import * as Combobox from '$lib/components/ui/combobox';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Switch } from '$lib/components/ui/switch';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { PendingSave } from '$lib/utils/pendingSave.svelte';

	interface Props {
		/** The type to edit. Without it the dialog adds a new type. */
		type?: AssignmentType;
		roster: readonly Personnel[];
		onClose: () => void;
	}

	let { type, roster, onClose }: Props = $props();

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
	let exempt = $state<string[]>([...(initial?.exemptPersonnelIds ?? [])]);
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
		assignTo,
		exemptPersonnelIds: assignTo === 'personnel' ? exempt : []
	});
	const detailsDirty = $derived(
		!editing ||
			details.name !== editing.name ||
			details.shortName !== editing.shortName ||
			details.color !== editing.color ||
			details.assignTo !== editing.assignTo ||
			!sameIds(details.exemptPersonnelIds, editing.exemptPersonnelIds)
	);
	const dirty = $derived(
		editing
			? detailsDirty || shown !== savedShown
			: name.trim() !== '' ||
					shortName.trim() !== '' ||
					color !== DEFAULT_ASSIGNMENT_COLOR ||
					shown ||
					exempt.length > 0
	);
	const valid = $derived(details.name !== '' && details.shortName !== '');

	const rosterIds = $derived(new Set(roster.map((person) => person.id)));
	// A person who left, or is outside this roster, keeps their exemption until someone removes it.
	const exemptOptions = $derived([
		...[...roster]
			.sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
			.map((person) => ({ value: person.id, label: `${person.rank} ${person.lastName}, ${person.firstName}` })),
		...exempt.filter((id) => !rosterIds.has(id)).map((id) => ({ value: id, label: 'Unknown person' }))
	]);

	const exemptLabels = $derived(new Map(exemptOptions.map((option) => [option.value, option.label])));
	const sampleAssignee = $derived(roster[0]?.lastName.toUpperCase() ?? 'NAME');

	function sameIds(a: readonly string[], b: readonly string[]) {
		return a.length === b.length && a.every((id) => b.includes(id));
	}

	async function saveDetails(): Promise<AssignmentType | null> {
		const failure = editing ? 'Failed to save assignment type' : 'Failed to add assignment type';
		try {
			if (!editing) {
				const created = await dailyAssignmentsStore.addType({ ...details, showOnCalendar: false, sortOrder: 0 });
				if (created) createdId = created.id;
				else toastStore.error(failure);
				return created;
			}
			if (detailsDirty && !(await dailyAssignmentsStore.updateType(editing.id, details))) {
				toastStore.error(failure);
				return null;
			}
			return editing;
		} catch (error) {
			toastStore.error(error instanceof Error ? error.message : failure);
			return null;
		}
	}

	async function save() {
		if (!valid) return;
		lanesNotice = '';
		const target = await saveDetails();
		if (!target) return;

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
							<ToggleGroup.Item value="group">Group</ToggleGroup.Item>
						</ToggleGroup.Root>
					</div>
					<Field.Description>
						A Group assignment puts the Group name in the lane. Group assignments have no exemptions.
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
				{#if assignTo === 'personnel'}
					<Field.Root>
						<Field.Title>Exempt from this duty</Field.Title>
						<Combobox.Root items={exemptOptions} multiple bind:value={exempt} label="Exempt from this duty">
							<Combobox.Chips>
								<Combobox.Value>
									{#snippet children(values)}
										{#each values as id (id)}
											<Combobox.Chip value={id}>{exemptLabels.get(id)}</Combobox.Chip>
										{/each}
										<Combobox.ChipsInput placeholder="Add people" aria-label="Exempt from this duty" />
									{/snippet}
								</Combobox.Value>
							</Combobox.Chips>
							<Combobox.Content>
								<Combobox.Empty>No people found.</Combobox.Empty>
								<Combobox.List>
									{#snippet children(value, option)}
										<Combobox.Item {value} label={option.label} />
									{/snippet}
								</Combobox.List>
							</Combobox.Content>
						</Combobox.Root>
						<Field.Description>Exempt people don't appear in this duty's picker.</Field.Description>
					</Field.Root>
				{/if}
			</fieldset>
		</AppDialog.Body>
		<AppDialog.Footer class="border-t pt-4">
			<Button variant="outline" onclick={onClose} disabled={saving.pending}>Cancel</Button>
			<Button
				onclick={() => saving.run(save)}
				disabled={saving.pending || dailyAssignmentsStore.typesBusy || !valid || !dirty}
			>
				{#if saving.pending}<Spinner />{/if}
				{editing ? 'Save Changes' : 'Add Assignment Type'}
			</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
