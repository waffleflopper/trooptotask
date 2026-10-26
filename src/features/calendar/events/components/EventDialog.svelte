<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import { tick, untrack } from 'svelte';
	import * as Alert from '$lib/components/ui/alert';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as RadioGroup from '$lib/components/ui/radio-group';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Textarea } from '$lib/components/ui/textarea';
	import { rejectedRequestMessage, withinOrganizationLifetime } from '$lib/stores/core';
	import { PendingSave } from '$lib/utils/pendingSave.svelte';
	import { eventDraftSchema, type CalendarEvent, type EventHost, type MemberLabels } from '../eventModel';
	import { createEventRequest, updateEventRequest } from '../eventRequests';
	import CoordinatorField from './CoordinatorField.svelte';

	interface Props {
		orgId: string;
		/** Names the hosting choice; without it the choice reads "This organization runs it". */
		orgName?: string;
		/** The event to edit. Without it the dialog creates one. */
		event?: CalendarEvent;
		members: MemberLabels;
		currentUserId: string;
		/** Offers "Create and add tasking" beside Create event. */
		offerTasking?: boolean;
		onSaved: (event: CalendarEvent, next?: 'add-tasking') => void;
		onClose: () => void;
	}

	let { orgId, orgName, event, members, currentUserId, offerTasking = false, onSaved, onClose }: Props = $props();

	type Extra = 'location' | 'description';

	const [initial, creator] = untrack(() => [event, currentUserId] as const);
	const id = initial?.id ?? crypto.randomUUID();
	// An Organization-hosted event saved before source references moved under the outside host keeps its own field.
	const legacySource = initial?.host.kind === 'organization' && Boolean(initial.sourceReference);
	let title = $state(initial?.title ?? '');
	let startsOn = $state(initial?.startsOn ?? '');
	let endsOn = $state(initial?.endsOn ?? '');
	let hostKind = $state<EventHost['kind']>(initial?.host.kind ?? 'organization');
	let hostName = $state(initial?.host.kind === 'external' ? initial.host.name : '');
	let coordinatorUserId = $state(initial?.coordinatorUserId ?? creator);
	let location = $state(initial?.location ?? '');
	let sourceReference = $state(initial?.sourceReference ?? '');
	let description = $state(initial?.description ?? '');
	let shown = $state<Record<Extra, boolean>>({
		location: Boolean(initial?.location),
		description: Boolean(initial?.description)
	});
	let triedSave = $state(false);
	let saveError = $state('');
	let open = true;
	const saving = new PendingSave();

	$effect(() => () => (open = false));

	const memberOptions = $derived(
		Object.entries(members)
			.map(([userId, label]) => ({ userId, label }))
			.sort((a, b) => a.label.localeCompare(b.label))
	);
	const sourceShown = $derived(hostKind === 'external' || legacySource);

	const input = $derived({
		title,
		startsOn,
		endsOn,
		host: hostKind === 'external' ? { kind: hostKind, name: hostName } : { kind: hostKind },
		coordinatorUserId,
		location,
		description,
		sourceReference: sourceShown ? sourceReference : ''
	});
	const parsed = $derived(eventDraftSchema.safeParse(input));
	const problems = $derived.by(() => {
		const byField: Record<string, string> = {};
		if (!triedSave || parsed.success) return byField;
		for (const issue of parsed.error.issues) {
			const key = issue.path.join('.');
			byField[key] ??= key === 'startsOn' || key === 'endsOn' ? 'Choose a date.' : issue.message;
		}
		if (parsed.error.issues.some((issue) => issue.code === 'custom' && issue.path[0] === 'endsOn'))
			byField.endsOn = 'End on or after the start date.';
		return byField;
	});

	const dirty = $derived(
		JSON.stringify(input) !==
			JSON.stringify({
				title: initial?.title ?? '',
				startsOn: initial?.startsOn ?? '',
				endsOn: initial?.endsOn ?? '',
				host: initial?.host ?? { kind: 'organization' },
				coordinatorUserId: initial?.coordinatorUserId ?? creator,
				location: initial?.location ?? '',
				description: initial?.description ?? '',
				sourceReference: initial?.sourceReference ?? ''
			})
	);

	function chooseStart(value: string) {
		startsOn = value;
		if (value && (!endsOn || endsOn < value)) endsOn = value;
	}

	async function reveal(extra: Extra) {
		shown[extra] = true;
		await tick();
		document.getElementById(`event-${extra}`)?.focus();
	}

	function save(next?: 'add-tasking') {
		triedSave = true;
		if (!parsed.success) {
			if (problems.location) shown.location = true;
			if (problems.description) shown.description = true;
			return;
		}
		const draft = parsed.data;
		void saving.run(async () => {
			saveError = '';
			try {
				const request = initial ? updateEventRequest(orgId, id, draft) : createEventRequest(orgId, id, draft);
				const saved = await withinOrganizationLifetime(request, () => open);
				if (next) onSaved(saved, next);
				else onSaved(saved);
			} catch (error) {
				saveError = rejectedRequestMessage(error, 'The event was not saved. Your entries are kept, so try again.');
			}
		});
	}
</script>

<AppDialog.Root open voice="form" busy={saving.pending} closeBlocked={dirty} {onClose}>
	<AppDialog.Content presentation="sheet" size="wide">
		<AppDialog.Header>
			<AppDialog.Title>{initial ? 'Edit event' : 'Create event'}</AppDialog.Title>
			<AppDialog.Description>Something happening that the unit should see on the calendar.</AppDialog.Description>
		</AppDialog.Header>
		<form
			id="event-form"
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
						<Field.Label for="event-title">Title</Field.Label>
						<Input id="event-title" autocomplete="off" bind:value={title} />
						{#if problems.title}<Field.Error>{problems.title}</Field.Error>{/if}
					</Field.Root>
					<div class="grid gap-x-3 gap-y-4.5 sm:grid-cols-2">
						<Field.Root>
							<Field.Label for="event-starts-on">Starts</Field.Label>
							<DatePicker id="event-starts-on" bind:value={() => startsOn, chooseStart} placeholder="Choose a date" />
							{#if problems.startsOn}<Field.Error>{problems.startsOn}</Field.Error>{/if}
						</Field.Root>
						<Field.Root>
							<Field.Label for="event-ends-on">Ends</Field.Label>
							<DatePicker id="event-ends-on" bind:value={endsOn} placeholder="Choose a date" />
							{#if problems.endsOn}<Field.Error>{problems.endsOn}</Field.Error>{/if}
						</Field.Root>
					</div>
					<div class="grid gap-2">
						<Field.Title id="event-host">Who is running it?</Field.Title>
						<RadioGroup.Root
							aria-labelledby="event-host"
							class="gap-2 sm:grid-cols-2"
							bind:value={
								() => hostKind,
								(value) => {
									if (value === 'organization' || value === 'external') hostKind = value;
								}
							}
						>
							<RadioGroup.Card
								id="event-host-organization"
								value="organization"
								title="We are hosting"
								description={`${orgName ?? 'This organization'} runs it`}
							/>
							<RadioGroup.Card
								id="event-host-external"
								value="external"
								title="Another organization"
								description="Tracked here for awareness and taskings"
							/>
						</RadioGroup.Root>
						{#if hostKind === 'external'}
							<div class="grid gap-3 rounded-md bg-muted p-3 sm:grid-cols-2">
								<Field.Root>
									<Field.Label for="event-host-name" class="text-[13px]">Hosting organization</Field.Label>
									<Input id="event-host-name" autocomplete="off" placeholder="e.g., 1-1 BN" bind:value={hostName} />
									{#if problems['host.name']}<Field.Error>{problems['host.name']}</Field.Error>{/if}
								</Field.Root>
								<Field.Root>
									<Field.Label for="event-source" class="text-[13px]">Source reference</Field.Label>
									<Input
										id="event-source"
										autocomplete="off"
										placeholder="e.g., BN FRAGO 27-012"
										bind:value={sourceReference}
									/>
									{#if problems.sourceReference}<Field.Error>{problems.sourceReference}</Field.Error>{/if}
								</Field.Root>
							</div>
						{/if}
					</div>
					<Field.Root>
						<Field.Label for="event-coordinator">Coordinator</Field.Label>
						<CoordinatorField
							id="event-coordinator"
							value={coordinatorUserId}
							options={memberOptions}
							{currentUserId}
							onChange={(userId) => (coordinatorUserId = userId)}
						/>
						<Field.Description>
							The member who owns the requirement. People sent are chosen on each tasking.
						</Field.Description>
					</Field.Root>
					{#if legacySource && hostKind === 'organization'}
						<Field.Root>
							<Field.Label for="event-source">Source reference</Field.Label>
							<Input id="event-source" autocomplete="off" bind:value={sourceReference} />
							{#if problems.sourceReference}<Field.Error>{problems.sourceReference}</Field.Error>{/if}
						</Field.Root>
					{/if}
					{#if shown.location}
						<Field.Root>
							<Field.Label for="event-location">Location</Field.Label>
							<Input id="event-location" autocomplete="off" bind:value={location} />
							{#if problems.location}<Field.Error>{problems.location}</Field.Error>{/if}
						</Field.Root>
					{/if}
					{#if shown.description}
						<Field.Root>
							<Field.Label for="event-description">Description</Field.Label>
							<Textarea id="event-description" rows={4} bind:value={description} />
							{#if problems.description}<Field.Error>{problems.description}</Field.Error>{/if}
						</Field.Root>
					{/if}
					{#if !shown.location || !shown.description}
						<div class="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5">
							<span
								class="mr-2 font-mono text-[11px] leading-[14px] font-medium tracking-[0.08em] text-muted-foreground uppercase"
							>
								Optional
							</span>
							{#if !shown.location}
								<Button variant="ghost" class="-mx-1.5 px-1.5" onclick={() => void reveal('location')}>
									<Plus data-icon="inline-start" class="size-3" />Location
								</Button>
							{/if}
							{#if !shown.description}
								<Button variant="ghost" class="-mx-1.5 px-1.5" onclick={() => void reveal('description')}>
									<Plus data-icon="inline-start" class="size-3" />Description
								</Button>
							{/if}
						</div>
					{/if}
				</fieldset>
			</AppDialog.Body>
		</form>
		<AppDialog.Footer>
			<p class="m-0 min-w-0 text-[13px] leading-[18px] text-muted-foreground sm:flex-1">
				Does not mark anyone unavailable.
			</p>
			<Button variant="ghost" onclick={onClose} disabled={saving.pending}>Cancel</Button>
			{#if offerTasking && !initial}
				<Button variant="outline" onclick={() => save('add-tasking')} disabled={saving.pending}>
					Create and add tasking
				</Button>
			{/if}
			<Button type="submit" form="event-form" disabled={saving.pending || (initial !== undefined && !dirty)}>
				{#if saving.pending}<Spinner />{/if}
				{initial ? 'Save changes' : 'Create event'}
			</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
