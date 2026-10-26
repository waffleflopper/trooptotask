<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
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
	import { rejectedRequestMessage, withinOrganizationLifetime } from '$lib/stores/core';
	import { PendingSave } from '$lib/utils/pendingSave.svelte';
	import { eventDateRange } from '../../events/eventModel';
	import {
		responsibilityKey,
		taskingDraftSchema,
		type Tasking,
		type TaskingChoices,
		type TaskingEventOption
	} from '../taskingModel';
	import { createTaskingRequest, updateTaskingRequest } from '../taskingRequests';

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

	const [initial, initialChoices, prefilled, wide] = untrack(
		() => [tasking, choices, linkTo, organizationWide] as const
	);
	const id = initial?.id ?? crypto.randomUUID();
	const onlyGroup = !wide && initialChoices.groups.length === 1 ? initialChoices.groups[0].id : '';
	const start = {
		title: initial?.title ?? '',
		responsibility: initial ? responsibilityKey(initial.responsibility) : onlyGroup,
		suspenseOn: initial?.suspenseOn ?? '',
		eventId: initial ? (initial.event?.id ?? '') : (prefilled?.id ?? ''),
		startsOn: initial?.execution?.startsOn ?? '',
		endsOn: initial?.execution?.endsOn ?? '',
		reportTime: initial?.execution?.reportTime ?? '',
		count: initial?.requirement ? String(initial.requirement.count) : '',
		qualifications: initial?.requirement?.qualifications ?? '',
		instructions: initial?.instructions ?? ''
	};
	let form = $state({ ...start });
	let moreOpen = $state(Boolean(initial?.execution || initial?.requirement || initial?.instructions));
	let triedSave = $state(false);
	let saveError = $state('');
	let open = true;
	const saving = new PendingSave();

	$effect(() => () => (open = false));

	const rerouteLocked = $derived(initial !== undefined && !organizationWide);
	const groupOptions = $derived.by(() => {
		const options = [...choices.groups];
		if (initial?.responsibility.kind === 'group' && !options.some((group) => group.id === form.responsibility))
			options.push({ id: form.responsibility, name: 'Another group' });
		return options.sort((a, b) => a.name.localeCompare(b.name));
	});
	const eventOptions = $derived.by(() => {
		const options: TaskingEventOption[] = [...choices.events];
		const linked = initial?.event ?? prefilled;
		if (linked && !options.some((event) => event.id === linked.id)) options.unshift(linked);
		return options;
	});

	const input = $derived({
		title: form.title,
		eventId: form.eventId || null,
		responsibility:
			form.responsibility === 'organization'
				? { kind: 'organization' }
				: form.responsibility
					? { kind: 'group', groupId: form.responsibility }
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
	const problems = $derived.by(() => {
		const byField: Record<string, string> = {};
		if (!triedSave || parsed.success) return byField;
		for (const issue of parsed.error.issues) {
			const key = issue.path.join('.');
			if (key.startsWith('responsibility')) byField.responsibility ??= 'Choose who is responsible.';
			else if (key === 'suspenseOn') byField.suspenseOn ??= 'Choose a date.';
			else if (key === 'execution.startsOn' || key === 'execution.endsOn')
				byField[key] ??= issue.code === 'custom' ? issue.message : 'Choose both dates, or clear both.';
			else byField[key] ??= issue.message;
		}
		return byField;
	});
	const dirty = $derived(JSON.stringify(form) !== JSON.stringify(start));

	function chooseStart(value: string) {
		form.startsOn = value;
		if (value && (!form.endsOn || form.endsOn < value)) form.endsOn = value;
	}

	function clearExecution() {
		form.startsOn = '';
		form.endsOn = '';
		form.reportTime = '';
	}

	function save() {
		triedSave = true;
		if (!parsed.success) {
			if (
				problems['execution.startsOn'] ||
				problems['execution.endsOn'] ||
				problems['execution.reportTime'] ||
				problems['requirement.count'] ||
				problems['requirement.qualifications'] ||
				problems.instructions
			)
				moreOpen = true;
			return;
		}
		const draft = parsed.data;
		void saving.run(async () => {
			saveError = '';
			try {
				const request = initial ? updateTaskingRequest(orgId, id, draft) : createTaskingRequest(orgId, id, draft);
				onSaved(await withinOrganizationLifetime(request, () => open));
			} catch (error) {
				saveError = rejectedRequestMessage(error, 'The tasking was not saved. Your entries are kept, so try again.');
			}
		});
	}
</script>

<AppDialog.Root open busy={saving.pending} closeBlocked={dirty} {onClose}>
	<AppDialog.Content presentation="sheet" size="wide">
		<AppDialog.Header class="border-b pb-4">
			<AppDialog.Title>{initial ? 'Edit tasking' : 'Create tasking'}</AppDialog.Title>
			<AppDialog.Description>
				An outcome someone owns by a date. Only the outcome, who is responsible and the suspense are required.
			</AppDialog.Description>
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
			<AppDialog.Body class="grid content-start gap-5">
				{#if saveError}
					<Alert.Root variant="destructive" {@attach (alert) => alert.scrollIntoView({ block: 'nearest' })}>
						<Alert.Title>Not saved</Alert.Title>
						<Alert.Description>{saveError}</Alert.Description>
					</Alert.Root>
				{/if}
				<fieldset class="contents" disabled={saving.pending}>
					<Field.Root>
						<Field.Label for="tasking-title">Outcome</Field.Label>
						<Input
							id="tasking-title"
							autocomplete="off"
							placeholder="e.g., Provide four trauma-lane medics"
							bind:value={form.title}
						/>
						{#if problems.title}<Field.Error>{problems.title}</Field.Error>{/if}
					</Field.Root>
					<div class="grid gap-4 sm:grid-cols-2">
						<Field.Root>
							<Field.Label for="tasking-responsibility">Responsible</Field.Label>
							<NativeSelect
								id="tasking-responsibility"
								class="w-full"
								disabled={rerouteLocked}
								bind:value={form.responsibility}
							>
								{#if !form.responsibility}
									<NativeSelectOption value="" disabled>Choose who is responsible</NativeSelectOption>
								{/if}
								{#if organizationWide || form.responsibility === 'organization'}
									<NativeSelectOption value="organization">{orgName} (organization level)</NativeSelectOption>
								{/if}
								{#each groupOptions as group (group.id)}
									<NativeSelectOption value={group.id}>{group.name}</NativeSelectOption>
								{/each}
							</NativeSelect>
							{#if rerouteLocked}
								<Field.Description>Only an organization-wide operator can move responsibility.</Field.Description>
							{/if}
							{#if problems.responsibility}<Field.Error>{problems.responsibility}</Field.Error>{/if}
						</Field.Root>
						<Field.Root>
							<Field.Label for="tasking-suspense">Suspense</Field.Label>
							<DatePicker id="tasking-suspense" bind:value={form.suspenseOn} placeholder="Choose a date" />
							<Field.Description>When the outcome is due.</Field.Description>
							{#if problems.suspenseOn}<Field.Error>{problems.suspenseOn}</Field.Error>{/if}
						</Field.Root>
					</div>
					<Field.Root>
						<Field.Label for="tasking-event">Event</Field.Label>
						<div class="flex flex-wrap items-center gap-2">
							<NativeSelect id="tasking-event" class="w-full min-w-0 sm:flex-1" bind:value={form.eventId}>
								<NativeSelectOption value="">Standalone, not under an event</NativeSelectOption>
								{#each eventOptions as event (event.id)}
									<NativeSelectOption value={event.id}>
										{event.title} · {eventDateRange(event)}
									</NativeSelectOption>
								{/each}
							</NativeSelect>
							{#if form.eventId}
								<Button variant="outline" onclick={() => (form.eventId = '')}>Make standalone</Button>
							{/if}
						</div>
						{#if problems.eventId}<Field.Error>{problems.eventId}</Field.Error>{/if}
					</Field.Root>

					<Collapsible.Root bind:open={moreOpen}>
						<Collapsible.Trigger>
							{#snippet child({ props })}
								<Button {...props} variant="ghost" size="sm" class="-ml-2">
									<ChevronRight class={['transition-transform', moreOpen && 'rotate-90']} aria-hidden="true" />
									{moreOpen ? 'Hide details' : 'Add execution dates, staffing and instructions'}
								</Button>
							{/snippet}
						</Collapsible.Trigger>
						<Collapsible.Content class="grid gap-5 pt-3">
							<fieldset class="grid gap-3">
								<legend class="mb-3 text-sm font-medium">Execution</legend>
								<div class="grid gap-4 sm:grid-cols-[1fr_1fr_8rem]">
									<Field.Root>
										<Field.Label for="tasking-starts-on">Starts</Field.Label>
										<DatePicker
											id="tasking-starts-on"
											bind:value={() => form.startsOn, chooseStart}
											placeholder="Choose a date"
										/>
										{#if problems['execution.startsOn']}<Field.Error>{problems['execution.startsOn']}</Field.Error>{/if}
									</Field.Root>
									<Field.Root>
										<Field.Label for="tasking-ends-on">Ends</Field.Label>
										<DatePicker id="tasking-ends-on" bind:value={form.endsOn} placeholder="Choose a date" />
										{#if problems['execution.endsOn']}<Field.Error>{problems['execution.endsOn']}</Field.Error>{/if}
									</Field.Root>
									<Field.Root>
										<Field.Label for="tasking-report-time">Report time</Field.Label>
										<Input
											id="tasking-report-time"
											type="time"
											disabled={!form.startsOn && !form.endsOn}
											bind:value={form.reportTime}
										/>
										{#if problems['execution.reportTime']}<Field.Error>{problems['execution.reportTime']}</Field.Error
											>{/if}
									</Field.Root>
								</div>
								<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
									<Field.Description class="flex-1">
										When the selected people are committed. The report time is local, on the first day.
									</Field.Description>
									{#if form.startsOn || form.endsOn}
										<Button variant="ghost" size="sm" onclick={clearExecution}>Clear execution</Button>
									{/if}
								</div>
							</fieldset>
							<div class="grid gap-4 sm:grid-cols-[8rem_1fr]">
								<Field.Root>
									<Field.Label for="tasking-count">People needed</Field.Label>
									<Input id="tasking-count" inputmode="numeric" autocomplete="off" bind:value={form.count} />
									{#if problems['requirement.count']}<Field.Error>{problems['requirement.count']}</Field.Error>{/if}
								</Field.Root>
								<Field.Root>
									<Field.Label for="tasking-qualifications">Qualifications</Field.Label>
									<Input
										id="tasking-qualifications"
										autocomplete="off"
										placeholder="e.g., 68W, CLS current"
										bind:value={form.qualifications}
									/>
									{#if problems['requirement.qualifications']}
										<Field.Error>{problems['requirement.qualifications']}</Field.Error>
									{/if}
								</Field.Root>
							</div>
							<Field.Root>
								<Field.Label for="tasking-instructions">Instructions</Field.Label>
								<Textarea id="tasking-instructions" rows={4} bind:value={form.instructions} />
								{#if problems.instructions}<Field.Error>{problems.instructions}</Field.Error>{/if}
							</Field.Root>
						</Collapsible.Content>
					</Collapsible.Root>
				</fieldset>
			</AppDialog.Body>
		</form>
		<AppDialog.Footer class="border-t pt-4">
			<Button variant="outline" onclick={onClose} disabled={saving.pending}>Cancel</Button>
			<Button type="submit" form="tasking-form" disabled={saving.pending || (initial !== undefined && !dirty)}>
				{#if saving.pending}<Spinner />{/if}
				{initial ? 'Save changes' : 'Create tasking'}
			</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
