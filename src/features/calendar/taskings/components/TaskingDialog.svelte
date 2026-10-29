<script lang="ts">
	import Info from '@lucide/svelte/icons/info';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';
	import { tick, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { buildGroupTree } from '$features/personnel/contracts';
	import { TreeSelect, type TreeSelectOption } from '$lib/components/patterns/tree-select';
	import * as Alert from '$lib/components/ui/alert';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as InputGroup from '$lib/components/ui/input-group';
	import * as RadioGroup from '$lib/components/ui/radio-group';
	import * as Select from '$lib/components/ui/select';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Textarea } from '$lib/components/ui/textarea';
	import { rejectedRequestMessage, withinOrganizationLifetime } from '$lib/stores/core';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { PendingSave } from '$lib/utils/pendingSave.svelte';
	import { eventDateRange } from '../../events/eventModel';
	import { TASKING_LIST_LIMIT, checklistCreateSchema, equipmentDraftSchema } from '../taskingListsModel';
	import { addChecklistItemRequest, addEquipmentRequest } from '../taskingListsRequests';
	import {
		taskingDraftSchema,
		type Tasking,
		type TaskingChoices,
		type TaskingDraft,
		type TaskingEventOption
	} from '../taskingModel';
	import { createTaskingRequest, updateTaskingRequest } from '../taskingRequests';
	import CommittedDatesField from './CommittedDatesField.svelte';

	interface Props {
		orgId: string;
		orgName: string;
		/** The Tasking to edit. Without it the dialog creates one. */
		tasking?: Tasking;
		/** The Event a new Tasking starts linked to. */
		linkTo?: TaskingEventOption;
		choices: TaskingChoices;
		/** Organization level, and moving responsibility at all, belong to Organization-wide operators. */
		organizationWide: boolean;
		onSaved: (tasking: Tasking) => void;
		onClose: () => void;
	}

	let { orgId, orgName, tasking, linkTo, choices, organizationWide, onSaved, onClose }: Props = $props();

	type Owner = 'group' | 'organization' | '';
	/** Each row's id is minted once and becomes the item's id, so a resend finds the item instead of adding another. */
	type EquipmentRow = { id: string; name: string; quantity: string };
	type ChecklistRow = { id: string; label: string };

	const [initial, initialChoices, prefilled, wide] = untrack(
		() => [tasking, choices, linkTo, organizationWide] as const
	);
	const id = initial?.id ?? crypto.randomUUID();
	const onlyGroup = initialChoices.groups.length === 1 ? initialChoices.groups[0].id : '';
	const newEquipmentRow = (): EquipmentRow => ({ id: crypto.randomUUID(), name: '', quantity: '1' });
	const newChecklistRow = (): ChecklistRow => ({ id: crypto.randomUUID(), label: '' });
	const start = {
		title: initial?.title ?? '',
		owner: (initial ? initial.responsibility.kind : wide ? 'organization' : onlyGroup ? 'group' : '') as Owner,
		groupId: initial?.responsibility.kind === 'group' ? initial.responsibility.groupId : wide ? '' : onlyGroup,
		suspenseOn: initial?.suspenseOn ?? '',
		eventId: initial ? (initial.event?.id ?? '') : (prefilled?.id ?? ''),
		startsOn: initial?.execution?.startsOn ?? '',
		endsOn: initial?.execution?.endsOn ?? '',
		reportTime: initial?.execution?.reportTime ?? '',
		count: initial?.requirement ? String(initial.requirement.count) : '',
		qualifications: initial?.requirement?.qualifications ?? '',
		instructions: initial?.instructions ?? '',
		equipment: initial ? [] : [newEquipmentRow()],
		checklist: [] as ChecklistRow[]
	};
	let form = $state(structuredClone(start));
	let instructionsShown = $state(Boolean(initial?.instructions));
	let triedSave = $state(false);
	let saveError = $state('');
	let open = true;
	const saving = new PendingSave();

	$effect(() => () => (open = false));

	const rerouteLocked = $derived(initial !== undefined && !organizationWide);
	const tree = $derived(buildGroupTree(choices.groups));
	const groupOptions = $derived.by(() => {
		const options: TreeSelectOption[] = tree.ordered.map((node) => ({
			id: node.id,
			label: node.name,
			depth: node.level
		}));
		if (form.groupId && !tree.node(form.groupId))
			options.push({ id: form.groupId, label: 'Another group', depth: 0, aside: true });
		return options;
	});
	const chosenGroup = $derived(
		form.groupId ? (tree.node(form.groupId) ? tree.label(form.groupId) : 'Another group') : null
	);
	const eventOptions = $derived.by(() => {
		const options: TaskingEventOption[] = [...choices.events];
		const linked = initial?.event ?? prefilled;
		if (linked && !options.some((event) => event.id === linked.id)) options.unshift(linked);
		return options;
	});
	const linkedEvent = $derived(eventOptions.find((event) => event.id === form.eventId));
	const pickHint = $derived.by(() => {
		if (form.owner === 'organization')
			return `Only Organization-wide staff who manage the calendar can pick people for this.${organizationWide ? ' You can too.' : ''}`;
		if (form.owner !== 'group' || !chosenGroup) return '';
		const yours = organizationWide || tree.node(form.groupId) !== undefined;
		return `${chosenGroup}'s leaders who manage the calendar can pick ${chosenGroup} people for this.${yours ? ' You can too.' : ''}`;
	});

	const input = $derived({
		title: form.title,
		eventId: form.eventId || null,
		responsibility:
			form.owner === 'organization'
				? { kind: 'organization' }
				: form.owner === 'group' && form.groupId
					? { kind: 'group', groupId: form.groupId }
					: null,
		suspenseOn: form.suspenseOn,
		execution:
			form.startsOn || form.endsOn
				? { startsOn: form.startsOn, endsOn: form.endsOn, reportTime: form.reportTime || null }
				: null,
		requirement:
			form.count.trim() || form.qualifications.trim()
				? { count: form.count.trim() ? Number(form.count) : Number.NaN, qualifications: form.qualifications }
				: null,
		instructions: form.instructions
	});
	const parsed = $derived(taskingDraftSchema.safeParse(input));
	const equipmentParsed = $derived(
		form.equipment
			.filter((row) => row.name.trim())
			.map((row) => ({
				row,
				result: equipmentDraftSchema.safeParse({
					name: row.name,
					quantity: row.quantity.trim() ? Number(row.quantity) : Number.NaN,
					securedQuantity: 0
				})
			}))
	);
	const checklistParsed = $derived(
		form.checklist
			.filter((row) => row.label.trim())
			.map((row) => ({ row, result: checklistCreateSchema.safeParse({ id: row.id, label: row.label }) }))
	);
	const problems = $derived.by(() => {
		const byField: Record<string, string> = {};
		if (!triedSave) return byField;
		for (const issue of parsed.success ? [] : parsed.error.issues) {
			const key = issue.path.join('.');
			if (key.startsWith('responsibility'))
				byField.responsibility ??= form.owner === 'group' ? 'Choose a Group.' : 'Choose who is responsible.';
			else if (key === 'suspenseOn') byField.suspenseOn ??= 'Choose a date.';
			else if (key.startsWith('execution.'))
				byField.execution ??= issue.code === 'custom' ? issue.message : 'Choose the dates people are committed.';
			else byField[key] ??= issue.message;
		}
		for (const { row, result } of [...equipmentParsed, ...checklistParsed])
			if (!result.success) byField[row.id] = result.error.issues[0].message;
		return byField;
	});
	const dirty = $derived(JSON.stringify(form) !== JSON.stringify(start));

	function chooseOwner(owner: string) {
		if (owner !== 'group' && owner !== 'organization') return;
		form.owner = owner;
		if (owner === 'group' && !form.groupId && choices.groups.length === 1) form.groupId = choices.groups[0].id;
	}

	async function focusLater(elementId: string) {
		await tick();
		document.getElementById(elementId)?.focus();
	}

	function addEquipment() {
		const row = newEquipmentRow();
		form.equipment.push(row);
		void focusLater(`tasking-equipment-${row.id}`);
	}

	function addChecklist() {
		const row = newChecklistRow();
		form.checklist.push(row);
		void focusLater(`tasking-checklist-${row.id}`);
	}

	function showInstructions() {
		instructionsShown = true;
		void focusLater('tasking-instructions');
	}

	/** The Tasking already exists, so a list item that fails is named for the operator to add again. */
	async function addLists(saved: Tasking, equipment: EquipmentRow[], checklist: ChecklistRow[]) {
		const unsaved: string[] = [];
		for (const row of equipment) {
			const draft = { name: row.name.trim(), quantity: Number(row.quantity), securedQuantity: 0 };
			try {
				await withinOrganizationLifetime(addEquipmentRequest(orgId, saved.id, row.id, draft), () => open);
			} catch {
				unsaved.push(draft.name);
			}
		}
		for (const row of checklist) {
			try {
				await withinOrganizationLifetime(
					addChecklistItemRequest(orgId, saved.id, row.id, row.label.trim()),
					() => open
				);
			} catch {
				unsaved.push(row.label.trim());
			}
		}
		return unsaved;
	}

	function save() {
		triedSave = true;
		if (!parsed.success || Object.keys(problems).length > 0) return;
		const draft: TaskingDraft = parsed.data;
		const equipment = equipmentParsed.map(({ row }) => row);
		const checklist = checklistParsed.map(({ row }) => row);
		void saving.run(async () => {
			saveError = '';
			let saved: Tasking;
			try {
				const request = initial ? updateTaskingRequest(orgId, id, draft) : createTaskingRequest(orgId, id, draft);
				saved = await withinOrganizationLifetime(request, () => open);
			} catch (error) {
				saveError = rejectedRequestMessage(error, 'The tasking was not saved. Your entries are kept, so try again.');
				return;
			}
			const unsaved = await addLists(saved, equipment, checklist);
			onSaved(saved);
			if (unsaved.length === 0) return;
			toastStore.error(
				`The tasking was created, but ${unsaved.length === 1 ? 'this item' : 'these items'} did not save: ${unsaved.join(', ')}. Add ${unsaved.length === 1 ? 'it' : 'them'} on the tasking page.`,
				Number.POSITIVE_INFINITY
			);
			void goto(`/org/${page.params.orgId}/calendar/taskings/${saved.id}`);
		});
	}
</script>

{#snippet adder(label: string, onclick: () => void)}
	<Button variant="ghost" class="-mx-1.5 px-1.5" {onclick}>
		<Plus data-icon="inline-start" class="size-3" />{label}
	</Button>
{/snippet}

<AppDialog.Root open voice="form" busy={saving.pending} closeBlocked={dirty} {onClose}>
	<AppDialog.Content presentation="sheet" size="wide">
		<AppDialog.Header>
			<AppDialog.Title>{initial ? 'Edit tasking' : prefilled ? 'Add tasking' : 'Create tasking'}</AppDialog.Title>
			<AppDialog.Description>One outcome the unit must deliver, with one owner and one due date.</AppDialog.Description>
		</AppDialog.Header>
		<form
			id="tasking-form"
			class="contents"
			novalidate
			onsubmit={(submit) => {
				submit.preventDefault();
				save();
			}}
		>
			<AppDialog.Body class="grid content-start gap-4.5">
				{#if saveError}
					<Alert.Root variant="destructive" {@attach (alert) => alert.scrollIntoView({ block: 'nearest' })}>
						<Alert.Title>Not saved</Alert.Title>
						<Alert.Description>{saveError}</Alert.Description>
					</Alert.Root>
				{/if}
				<fieldset class="contents" disabled={saving.pending}>
					<Field.Root>
						<Field.Label for="tasking-title">Required outcome</Field.Label>
						<Input
							id="tasking-title"
							autocomplete="off"
							placeholder="e.g., Provide four trauma-lane medics"
							bind:value={form.title}
						/>
						{#if problems.title}<Field.Error>{problems.title}</Field.Error>{/if}
					</Field.Root>

					<Field.Root>
						{#if linkedEvent}
							<Field.Title id="tasking-event-label">Event</Field.Title>
							<div
								class="flex min-h-9 items-center justify-between gap-2 rounded-md border bg-muted py-1 pr-1.5 pl-3"
								aria-labelledby="tasking-event-label"
								role="group"
							>
								<span class="flex min-w-0 flex-wrap items-baseline gap-x-2">
									<span class="truncate text-sm font-medium">{linkedEvent.title}</span>
									<span class="font-mono text-xs text-muted-foreground">{eventDateRange(linkedEvent)}</span>
								</span>
								<Button
									variant="ghost"
									size="sm"
									class="text-muted-foreground"
									onclick={async () => {
										form.eventId = '';
										await tick();
										document.getElementById('tasking-event')?.focus();
									}}
								>
									<X data-icon="inline-start" />Make standalone
								</Button>
							</div>
						{:else}
							<Field.Label for="tasking-event">Event</Field.Label>
							<Select.Root type="single" bind:value={form.eventId}>
								<Select.Trigger id="tasking-event" class="w-full">
									<span class="text-muted-foreground">Standalone, not under an event</span>
								</Select.Trigger>
								<Select.Content>
									{#each eventOptions as event (event.id)}
										<Select.Item value={event.id} label={`${event.title} · ${eventDateRange(event)}`} />
									{/each}
								</Select.Content>
							</Select.Root>
						{/if}
						{#if problems.eventId}<Field.Error>{problems.eventId}</Field.Error>{/if}
					</Field.Root>

					<Field.Root>
						<Field.Title id="tasking-owner">Who is responsible?</Field.Title>
						<RadioGroup.Root
							aria-labelledby="tasking-owner"
							aria-invalid={problems.responsibility ? true : undefined}
							class="gap-2 sm:grid-cols-2"
							disabled={rerouteLocked}
							bind:value={() => form.owner, chooseOwner}
						>
							<RadioGroup.Card id="tasking-owner-group" value="group" title="A Group" disabled={rerouteLocked}>
								<TreeSelect
									id="tasking-group"
									options={groupOptions}
									value={form.groupId || null}
									onValueChange={(groupId: string) => {
										form.groupId = groupId;
										form.owner = 'group';
									}}
									label="Group"
									hideLabel
									valueLabel={chosenGroup}
									placeholder="Choose a Group"
									searchPlaceholder="Find a Group"
									disabled={rerouteLocked}
									class="h-9 w-full justify-between"
								/>
							</RadioGroup.Card>
							<RadioGroup.Card
								id="tasking-owner-organization"
								value="organization"
								title="Organization level"
								description={organizationWide
									? `No single Group. Staffed from anyone in ${orgName}.`
									: 'Only Organization-wide operators can choose this.'}
								disabled={rerouteLocked || !organizationWide}
							/>
						</RadioGroup.Root>
						{#if pickHint}
							<p class="m-0 flex gap-2 rounded-md bg-info/8 px-3 py-2.5 text-[13px] leading-[18px]">
								<Info class="mt-0.5 size-3.5 shrink-0 text-info" aria-hidden="true" />
								{pickHint}
							</p>
						{/if}
						{#if rerouteLocked}
							<Field.Description>Only an Organization-wide operator can move responsibility.</Field.Description>
						{/if}
						{#if problems.responsibility}<Field.Error>{problems.responsibility}</Field.Error>{/if}
					</Field.Root>

					<div class="grid gap-2.5">
						<div class="grid gap-x-3 gap-y-4.5 sm:grid-cols-[180px_minmax(0,1fr)]">
							<Field.Root>
								<Field.Label for="tasking-suspense">Suspense</Field.Label>
								<DatePicker id="tasking-suspense" bind:value={form.suspenseOn} placeholder="Choose a date" />
								{#if problems.suspenseOn}<Field.Error>{problems.suspenseOn}</Field.Error>{/if}
							</Field.Root>
							<Field.Root>
								<Field.Label for="tasking-committed">People committed</Field.Label>
								<CommittedDatesField
									id="tasking-committed"
									startsOn={form.startsOn}
									endsOn={form.endsOn}
									reportTime={form.reportTime}
									onChange={(next) => Object.assign(form, next)}
								/>
								{#if problems.execution}<Field.Error>{problems.execution}</Field.Error>{/if}
								{#if problems['execution.reportTime']}<Field.Error>{problems['execution.reportTime']}</Field.Error>{/if}
							</Field.Root>
						</div>
						<p class="m-0 text-[13px] leading-[18px] text-muted-foreground">
							Suspense is when this outcome is due. Committed dates show on selected people's calendar rows and do not
							change their availability.
						</p>
					</div>

					<div class="grid gap-3 border-t pt-3.5">
						<span
							class="font-mono text-[11px] leading-[14px] font-medium tracking-[0.08em] text-muted-foreground uppercase"
						>
							Optional
						</span>
						<div class="grid grid-cols-[96px_minmax(0,1fr)] items-start gap-x-3 gap-y-3">
							<Field.Title class="pt-2" id="tasking-people">People</Field.Title>
							<Field.Root>
								<div class="flex gap-3" role="group" aria-labelledby="tasking-people">
									<Input
										id="tasking-count"
										aria-label="People needed"
										inputmode="numeric"
										autocomplete="off"
										class="w-13 shrink-0 text-center font-mono font-semibold"
										bind:value={form.count}
									/>
									<Input
										id="tasking-qualifications"
										aria-label="Qualifications"
										autocomplete="off"
										placeholder="Qualifications, e.g., 68W"
										bind:value={form.qualifications}
									/>
								</div>
								{#if problems['requirement.count']}<Field.Error>{problems['requirement.count']}</Field.Error>{/if}
								{#if problems['requirement.qualifications']}
									<Field.Error>{problems['requirement.qualifications']}</Field.Error>
								{/if}
							</Field.Root>

							{#if !initial}
								<Field.Title class="pt-2">Equipment</Field.Title>
								<div class="grid justify-items-start gap-1.5">
									{#each form.equipment as row, index (row.id)}
										<Field.Root class="w-full">
											<InputGroup.Root>
												<InputGroup.Input
													id="tasking-equipment-{row.id}"
													aria-label="Equipment item {index + 1}"
													autocomplete="off"
													placeholder="e.g., M997 FLA ambulance"
													bind:value={row.name}
												/>
												<InputGroup.Text aria-hidden="true" class="font-mono text-xs">×</InputGroup.Text>
												<InputGroup.Input
													aria-label="Quantity of item {index + 1}"
													inputmode="numeric"
													autocomplete="off"
													class="w-10 flex-none pl-0 text-right font-mono text-xs"
													bind:value={row.quantity}
												/>
											</InputGroup.Root>
											{#if problems[row.id]}<Field.Error>{problems[row.id]}</Field.Error>{/if}
										</Field.Root>
									{/each}
									{#if form.equipment.length < TASKING_LIST_LIMIT}
										{@render adder('Add item', addEquipment)}
									{/if}
								</div>
							{/if}

							{#if form.checklist.length > 0}
								<Field.Title class="pt-2">Checklist</Field.Title>
								<div class="grid justify-items-start gap-1.5">
									{#each form.checklist as row, index (row.id)}
										<Field.Root class="w-full">
											<Input
												id="tasking-checklist-{row.id}"
												aria-label="Checklist item {index + 1}"
												autocomplete="off"
												placeholder="e.g., Vehicle dispatched"
												bind:value={row.label}
											/>
											{#if problems[row.id]}<Field.Error>{problems[row.id]}</Field.Error>{/if}
										</Field.Root>
									{/each}
									{#if form.checklist.length < TASKING_LIST_LIMIT}
										{@render adder('Add item', addChecklist)}
									{/if}
								</div>
							{/if}

							{#if instructionsShown}
								<Field.Label for="tasking-instructions" class="pt-2">Instructions</Field.Label>
								<Field.Root>
									<Textarea id="tasking-instructions" rows={4} bind:value={form.instructions} />
									{#if problems.instructions}<Field.Error>{problems.instructions}</Field.Error>{/if}
								</Field.Root>
							{/if}

							{#if (!initial && form.checklist.length === 0) || !instructionsShown}
								<div class="col-start-2 flex flex-wrap gap-x-5">
									{#if !initial && form.checklist.length === 0}{@render adder('Checklist', addChecklist)}{/if}
									{#if !instructionsShown}{@render adder('Instructions', showInstructions)}{/if}
								</div>
							{/if}
						</div>
					</div>
				</fieldset>
			</AppDialog.Body>
		</form>
		<AppDialog.Footer>
			{#if !initial}
				<p class="m-0 min-w-0 text-[13px] leading-[18px] text-muted-foreground sm:flex-1">
					Starts as Open. People can be picked now or later.
				</p>
			{/if}
			<Button variant="ghost" onclick={onClose} disabled={saving.pending}>Cancel</Button>
			<Button type="submit" form="tasking-form" disabled={saving.pending || (initial !== undefined && !dirty)}>
				{#if saving.pending}<Spinner />{/if}
				{initial ? 'Save changes' : prefilled ? 'Add tasking' : 'Create tasking'}
			</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
