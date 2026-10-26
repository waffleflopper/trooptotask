<script lang="ts">
	import { untrack } from 'svelte';
	import * as Alert from '$lib/components/ui/alert';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { rejectedRequestMessage, withinOrganizationLifetime } from '$lib/stores/core';
	import { PendingSave } from '$lib/utils/pendingSave.svelte';
	import { eventDraftSchema, type CalendarEvent, type EventHost, type MemberLabels } from '../eventModel';
	import { createEventRequest, updateEventRequest } from '../eventRequests';

	interface Props {
		orgId: string;
		/** The event to edit. Without it the dialog creates one. */
		event?: CalendarEvent;
		members: MemberLabels;
		currentUserId: string;
		onSaved: (event: CalendarEvent) => void;
		onClose: () => void;
	}

	let { orgId, event, members, currentUserId, onSaved, onClose }: Props = $props();

	const [initial, creator] = untrack(() => [event, currentUserId] as const);
	const id = initial?.id ?? crypto.randomUUID();
	let title = $state(initial?.title ?? '');
	let startsOn = $state(initial?.startsOn ?? '');
	let endsOn = $state(initial?.endsOn ?? '');
	let hostKind = $state<EventHost['kind']>(initial?.host.kind ?? 'organization');
	let hostName = $state(initial?.host.kind === 'external' ? initial.host.name : '');
	let coordinatorUserId = $state(initial?.coordinatorUserId ?? creator);
	let location = $state(initial?.location ?? '');
	let sourceReference = $state(initial?.sourceReference ?? '');
	let description = $state(initial?.description ?? '');
	let moreOpen = $state(Boolean(initial?.location || initial?.sourceReference || initial?.description));
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
	const coordinatorLeft = $derived(!(coordinatorUserId in members));

	const input = $derived({
		title,
		startsOn,
		endsOn,
		host: hostKind === 'external' ? { kind: hostKind, name: hostName } : { kind: hostKind },
		coordinatorUserId,
		location,
		description,
		sourceReference
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

	function save() {
		triedSave = true;
		if (!parsed.success) {
			if (problems.location || problems.sourceReference || problems.description) moreOpen = true;
			return;
		}
		const draft = parsed.data;
		void saving.run(async () => {
			saveError = '';
			try {
				const request = initial ? updateEventRequest(orgId, id, draft) : createEventRequest(orgId, id, draft);
				const saved = await withinOrganizationLifetime(request, () => open);
				onSaved(saved);
			} catch (error) {
				saveError = rejectedRequestMessage(error, 'The event was not saved. Your entries are kept, so try again.');
			}
		});
	}
</script>

<AppDialog.Root open busy={saving.pending} closeBlocked={dirty} {onClose}>
	<AppDialog.Content presentation="sheet" size="wide">
		<AppDialog.Header class="border-b pb-4">
			<AppDialog.Title>{initial ? 'Edit event' : 'Create event'}</AppDialog.Title>
			<AppDialog.Description>
				An event your unit runs or supports, or one to stay aware of. Only the title, dates and host are required.
			</AppDialog.Description>
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
			<AppDialog.Body class="grid content-start gap-5">
				<fieldset class="contents" disabled={saving.pending}>
					<Field.Root>
						<Field.Label for="event-title">Title</Field.Label>
						<Input id="event-title" autocomplete="off" bind:value={title} />
						{#if problems.title}<Field.Error>{problems.title}</Field.Error>{/if}
					</Field.Root>
					<div class="grid gap-4 sm:grid-cols-2">
						<Field.Root>
							<Field.Label for="event-starts-on">Start date</Field.Label>
							<DatePicker id="event-starts-on" bind:value={() => startsOn, chooseStart} placeholder="Choose a date" />
							{#if problems.startsOn}<Field.Error>{problems.startsOn}</Field.Error>{/if}
						</Field.Root>
						<Field.Root>
							<Field.Label for="event-ends-on">End date</Field.Label>
							<DatePicker id="event-ends-on" bind:value={endsOn} placeholder="Choose a date" />
							<Field.Description>Same as the start for a one-day event.</Field.Description>
							{#if problems.endsOn}<Field.Error>{problems.endsOn}</Field.Error>{/if}
						</Field.Root>
					</div>
					<Field.Root>
						<Field.Title id="event-host">Host</Field.Title>
						<div>
							<ToggleGroup.Root
								type="single"
								variant="outline"
								aria-labelledby="event-host"
								bind:value={
									() => hostKind,
									(value) => {
										if (value === 'organization' || value === 'external') hostKind = value;
									}
								}
							>
								<ToggleGroup.Item value="organization">This organization</ToggleGroup.Item>
								<ToggleGroup.Item value="external">Another host</ToggleGroup.Item>
							</ToggleGroup.Root>
						</div>
					</Field.Root>
					{#if hostKind === 'external'}
						<Field.Root>
							<Field.Label for="event-host-name">Host name</Field.Label>
							<Input id="event-host-name" autocomplete="off" placeholder="e.g., 1-1 BN" bind:value={hostName} />
							{#if problems['host.name']}<Field.Error>{problems['host.name']}</Field.Error>{/if}
						</Field.Root>
					{/if}
					<Field.Root>
						<Field.Label for="event-coordinator">Coordinator</Field.Label>
						<NativeSelect id="event-coordinator" class="w-full" bind:value={coordinatorUserId}>
							{#if coordinatorLeft}
								<NativeSelectOption value={coordinatorUserId}>Former member</NativeSelectOption>
							{/if}
							{#each memberOptions as member (member.userId)}
								<NativeSelectOption value={member.userId}>{member.label}</NativeSelectOption>
							{/each}
						</NativeSelect>
						<Field.Description>The point of contact. It grants no access.</Field.Description>
					</Field.Root>

					<Collapsible.Root bind:open={moreOpen}>
						<Collapsible.Trigger>
							{#snippet child({ props })}
								<Button {...props} variant="ghost" size="sm" class="-ml-2">
									{moreOpen ? 'Hide details' : 'Add location, source and notes'}
								</Button>
							{/snippet}
						</Collapsible.Trigger>
						<Collapsible.Content class="grid gap-5 pt-3">
							<Field.Root>
								<Field.Label for="event-location">Location</Field.Label>
								<Input id="event-location" autocomplete="off" bind:value={location} />
								{#if problems.location}<Field.Error>{problems.location}</Field.Error>{/if}
							</Field.Root>
							<Field.Root>
								<Field.Label for="event-source">Source reference</Field.Label>
								<Input
									id="event-source"
									autocomplete="off"
									placeholder="e.g., BN FRAGO 27-012 or https://…"
									bind:value={sourceReference}
								/>
								<Field.Description>An order identifier or an http or https link.</Field.Description>
								{#if problems.sourceReference}<Field.Error>{problems.sourceReference}</Field.Error>{/if}
							</Field.Root>
							<Field.Root>
								<Field.Label for="event-description">Description</Field.Label>
								<Textarea id="event-description" rows={4} bind:value={description} />
								{#if problems.description}<Field.Error>{problems.description}</Field.Error>{/if}
							</Field.Root>
						</Collapsible.Content>
					</Collapsible.Root>

					{#if saveError}
						<Alert.Root variant="destructive">
							<Alert.Title>Not saved</Alert.Title>
							<Alert.Description>{saveError}</Alert.Description>
						</Alert.Root>
					{/if}
				</fieldset>
			</AppDialog.Body>
		</form>
		<AppDialog.Footer class="border-t pt-4">
			<Button variant="outline" onclick={onClose} disabled={saving.pending}>Cancel</Button>
			<Button type="submit" form="event-form" disabled={saving.pending || (initial !== undefined && !dirty)}>
				{#if saving.pending}<Spinner />{/if}
				{initial ? 'Save changes' : 'Create event'}
			</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
