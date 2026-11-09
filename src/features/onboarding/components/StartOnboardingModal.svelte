<script lang="ts">
	import { onDestroy } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { Spinner } from '$lib/components/ui/spinner';
	import { rejectedRequestMessage } from '$lib/stores/core';
	import { toastStore } from '$lib/stores/toast.svelte';
	import type { Personnel } from '$features/personnel/contracts';
	import type { Group, RankCatalogEntry } from '$features/personnel/contracts';
	import type { OnboardingTemplate } from '../onboarding.types';
	import { START_ONBOARDING_BATCH_LIMIT, type StartOnboardingOutcome } from '../contracts';
	import { preselectedTemplateId } from '../startTemplateChoice';
	import PersonnelModal from '$features/personnel/components/PersonnelModal.svelte';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import * as Alert from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import * as Combobox from '$lib/components/ui/combobox';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';
	import * as Select from '$lib/components/ui/select';
	import { formatDate } from '$lib/utils/dates';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

	interface Props {
		personnel: Personnel[];
		canAddPerson: boolean;
		existingOnboardingPersonnelIds: string[];
		groups: Group[];
		allowUnassigned?: boolean;
		rankCatalog: RankCatalogEntry[];
		rankCatalogUnavailable: boolean;
		templates: OnboardingTemplate[];
		hasTemplateSteps?: boolean;
		/** Resolves each person's outcome, or null when the request no longer applies. */
		onSubmit: (
			personnelIds: string[],
			startedAt: string,
			templateId: string
		) => Promise<StartOnboardingOutcome[] | null>;
		onAddPerson: (data: Omit<Personnel, 'id'>) => Promise<string | null>;
		onClose: () => void;
	}

	let {
		personnel,
		canAddPerson,
		existingOnboardingPersonnelIds,
		groups,
		allowUnassigned = true,
		rankCatalog,
		rankCatalogUnavailable,
		templates,
		hasTemplateSteps = true,
		onSubmit,
		onAddPerson,
		onClose
	}: Props = $props();

	let selectedPersonnelIds = $state<string[]>([]);
	let startDate = $state(formatDate(new Date()));
	let chosenTemplateId = $state('');
	let showAddPersonModal = $state(false);
	let saving = $state(false);
	let saveError = $state('');
	let results = $state<StartOnboardingOutcome[]>([]);
	let active = true;
	onDestroy(() => {
		active = false;
	});

	const alreadyOnboarding = $derived(new SvelteSet(existingOnboardingPersonnelIds));
	const sortedPersonnel = $derived(
		[...personnel].sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
	);
	const personnelOptions = $derived(
		sortedPersonnel.map((p) => ({
			value: p.id,
			label: `${p.rank} ${p.lastName}, ${p.firstName}`,
			...(alreadyOnboarding.has(p.id) ? { disabled: true, description: 'Already onboarding' } : {})
		}))
	);
	const labelById = $derived(new Map(personnelOptions.map((option) => [option.value, option.label])));

	const templateId = $derived(
		templates.some((template) => template.id === chosenTemplateId) ? chosenTemplateId : preselectedTemplateId(templates)
	);
	const templateLabel = (template: OnboardingTemplate) =>
		template.isDefault ? `${template.name} (default)` : template.name;
	const selectedTemplateLabel = $derived.by(() => {
		const template = templates.find((item) => item.id === templateId);
		return template ? templateLabel(template) : 'Choose a template';
	});

	const selectionCount = $derived(selectedPersonnelIds.length);
	const overLimit = $derived(selectionCount > START_ONBOARDING_BATCH_LIMIT);
	const canSave = $derived(
		selectionCount > 0 && !overLimit && !!startDate && !!templateId && hasTemplateSteps && !saving
	);
	const startLabel = $derived(
		selectionCount === 0
			? 'Start Onboarding'
			: `Start onboarding for ${selectionCount} ${selectionCount === 1 ? 'person' : 'people'}`
	);
	const labelFor = (personnelId: string) => labelById.get(personnelId) ?? 'Unknown member';

	async function handleSave() {
		if (!canSave) return;
		const personnelIds = [...selectedPersonnelIds];
		saving = true;
		saveError = '';
		try {
			const outcomes = await onSubmit(personnelIds, startDate, templateId);
			if (!active) return;
			if (!outcomes) {
				saveError = 'Could not start onboarding. Try again.';
				return;
			}
			const started = outcomes.filter((outcome) => outcome.outcome === 'started').length;
			if (started === outcomes.length) {
				toastStore.success(
					started === 1
						? `Started onboarding for ${labelFor(outcomes[0].personnelId)}`
						: `Started onboarding for ${started} people`
				);
				onClose();
				return;
			}
			results = outcomes;
			const failed = new Set(outcomes.filter((outcome) => outcome.outcome === 'failed').map((o) => o.personnelId));
			selectedPersonnelIds = selectedPersonnelIds.filter((personnelId) => failed.has(personnelId));
		} catch (failure) {
			if (active) saveError = rejectedRequestMessage(failure, 'Could not start onboarding. Try again.');
		} finally {
			if (active) saving = false;
		}
	}

	async function handleAddPersonSubmit(data: Omit<Personnel, 'id'>) {
		const newId = await onAddPerson(data);
		if (active && newId) selectedPersonnelIds = [...selectedPersonnelIds, newId];
	}
</script>

<AppDialog.Root open {onClose}>
	<AppDialog.Content>
		<AppDialog.Header>
			<AppDialog.Title id="start-onboarding-title">Start Onboarding</AppDialog.Title>
			<AppDialog.Description>
				Choose the members, confirm the start date, and pick the template that should govern the checklist.
			</AppDialog.Description>
		</AppDialog.Header>

		<AppDialog.Body>
			<div class="flex flex-col gap-3">
				<Card.Root class="grid gap-3 p-3">
					<p class="m-0 font-mono text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
						Assignment
					</p>
					<div class="grid gap-2">
						<Field.Root>
							<Field.Label for="template-select">Template</Field.Label>
							<Select.Root type="single" value={templateId} onValueChange={(value) => (chosenTemplateId = value)}>
								<Select.Trigger disabled={saving} id="template-select" class="w-full"
									>{selectedTemplateLabel}</Select.Trigger
								>
								<Select.Content>
									{#each templates as t (t.id)}
										<Select.Item value={t.id} label={templateLabel(t)} />
									{/each}
								</Select.Content>
							</Select.Root>
						</Field.Root>

						<Field.Root>
							<Field.Label for="start-date">Start Date</Field.Label>
							<DatePicker disabled={saving} id="start-date" bind:value={startDate} placeholder="Select start date" />
						</Field.Root>
					</div>
				</Card.Root>

				<Card.Root class="grid gap-3 p-3">
					<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
						<p class="m-0 font-mono text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">Members</p>
						{#if canAddPerson}
							<Button
								size="sm"
								variant="outline"
								type="button"
								disabled={rankCatalogUnavailable || saving}
								onclick={() => (showAddPersonModal = true)}
							>
								Add Person
							</Button>
						{/if}
					</div>

					<Combobox.Root
						items={personnelOptions}
						multiple
						bind:value={selectedPersonnelIds}
						label="Members"
						autoHighlight
						disabled={saving}
					>
						<Combobox.Chips class="max-h-32 overflow-y-auto">
							<Combobox.Value>
								{#snippet children(values)}
									{#each values as value (value)}
										<Combobox.Chip {value}>{labelFor(value)}</Combobox.Chip>
									{/each}
									<Combobox.ChipsInput
										id="personnel-select"
										placeholder={values.length === 0 ? 'Search for members...' : ''}
										aria-label="Members"
									/>
								{/snippet}
							</Combobox.Value>
						</Combobox.Chips>
						<Combobox.Content>
							<Combobox.Empty>No matches</Combobox.Empty>
							<Combobox.List aria-label="Members" />
						</Combobox.Content>
					</Combobox.Root>
					{#if overLimit}
						<p class="m-0 text-xs text-destructive" role="alert">
							Choose at most {START_ONBOARDING_BATCH_LIMIT} people at a time.
						</p>
					{/if}
				</Card.Root>

				{#if results.length > 0}
					<Alert.Root variant="warning" aria-live="polite">
						<TriangleAlert />
						<Alert.Title>
							Started {results.filter((result) => result.outcome === 'started').length} of {results.length}
						</Alert.Title>
						<Alert.Description>
							<ul class="m-0 grid list-none gap-1 p-0" aria-label="Start results">
								{#each results as result (result.personnelId)}
									<li class="flex flex-wrap items-center justify-between gap-x-2">
										<span class="min-w-0 truncate">{labelFor(result.personnelId)}</span>
										{#if result.outcome === 'started'}
											<Badge variant="success">Started</Badge>
										{:else if result.outcome === 'already_onboarding'}
											<Badge variant="info">Already onboarding</Badge>
										{:else}
											<Badge variant="danger">Not started</Badge>
											<span class="w-full text-xs text-muted-foreground">{result.message}</span>
										{/if}
									</li>
								{/each}
							</ul>
						</Alert.Description>
					</Alert.Root>
				{/if}

				{#if saveError}
					<Alert.Root variant="destructive">
						<TriangleAlert />
						<Alert.Title>Onboarding not started</Alert.Title>
						<Alert.Description>{saveError}</Alert.Description>
					</Alert.Root>
				{/if}

				{#if canAddPerson && rankCatalogUnavailable}
					<Alert.Root variant="warning">
						<TriangleAlert />
						<Alert.Title>Ranks unavailable</Alert.Title>
						<Alert.Description>
							Reload this page before adding a Person. You can still start onboarding for an existing member.
						</Alert.Description>
					</Alert.Root>
				{/if}

				{#if !hasTemplateSteps}
					<Alert.Root variant="warning">
						<TriangleAlert />
						<Alert.Title>Template Required</Alert.Title>
						<Alert.Description>
							No onboarding steps are configured yet. Build the onboarding template before starting a packet.
						</Alert.Description>
					</Alert.Root>
				{/if}
			</div>
		</AppDialog.Body>

		<AppDialog.Footer>
			<Button variant="outline" type="button" onclick={onClose}>Cancel</Button>
			<Button type="button" disabled={!canSave} onclick={handleSave}>
				{#if saving}<Spinner />{/if}
				{startLabel}
			</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

{#if showAddPersonModal}
	<PersonnelModal
		{groups}
		{rankCatalog}
		{allowUnassigned}
		addAnother={false}
		onSubmit={handleAddPersonSubmit}
		onClose={() => (showAddPersonModal = false)}
	/>
{/if}
