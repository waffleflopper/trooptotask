<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Spinner } from '$lib/components/ui/spinner';
	import { rejectedRequestMessage } from '$lib/stores/core';
	import type { Personnel } from '$features/personnel/contracts';
	import type { Group, RankCatalogEntry } from '$features/personnel/contracts';
	import type { OnboardingTemplate } from '../onboarding.types';
	import { PersonnelModal } from '$features/personnel';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import * as Alert from '$lib/components/ui/alert';
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
		onSubmit: (personnelId: string, startedAt: string, templateId: string | null) => Promise<boolean>;
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

	let selectedPersonnelId = $state('');
	let startDate = $state(formatDate(new Date()));
	let selectedTemplateId = $state<string>('');
	let showAddPersonModal = $state(false);
	let saving = $state(false);
	let saveError = $state('');
	let active = true;
	onDestroy(() => {
		active = false;
	});

	const availablePersonnel = $derived(
		personnel
			.filter((p) => !existingOnboardingPersonnelIds.includes(p.id))
			.sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
	);
	const personnelOptions = $derived(
		availablePersonnel.map((p) => ({ value: p.id, label: `${p.rank} ${p.lastName}, ${p.firstName}` }))
	);
	const selectedTemplateLabel = $derived(
		templates.find((template) => template.id === (selectedTemplateId || templates[0]?.id))?.name ?? 'Select a template'
	);

	const canSave = $derived(!!selectedPersonnelId && !!startDate && hasTemplateSteps && !saving);
	const showTemplateSelector = $derived(templates.length > 1);

	async function handleSave() {
		if (!canSave) return;
		const personnelId = selectedPersonnelId;
		const date = startDate;
		const templateId = selectedTemplateId || templates[0]?.id || null;
		saving = true;
		saveError = '';
		try {
			const saved = await onSubmit(personnelId, date, templateId);
			if (!active) return;
			if (saved) onClose();
			else saveError = 'Could not start onboarding. Try again.';
		} catch (failure) {
			if (active) saveError = rejectedRequestMessage(failure, 'Could not start onboarding. Try again.');
		} finally {
			if (active) saving = false;
		}
	}

	async function handleAddPersonSubmit(data: Omit<Personnel, 'id'>) {
		const newId = await onAddPerson(data);
		if (newId) {
			selectedPersonnelId = newId;
		}
	}
</script>

<AppDialog.Root open {onClose}>
	<AppDialog.Content>
		<AppDialog.Header>
			<AppDialog.Title id="start-onboarding-title">Start Onboarding</AppDialog.Title>
			<AppDialog.Description>
				Choose the member, confirm the start date, and attach the template that should govern the checklist.
			</AppDialog.Description>
		</AppDialog.Header>

		<AppDialog.Body>
			<div class="flex flex-col gap-3">
				<Card.Root class="grid gap-3 p-3">
					<p class="m-0 font-mono text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
						Assignment
					</p>
					<div class="grid gap-2 sm:grid-cols-2">
						{#if showTemplateSelector}
							<Field.Root>
								<Field.Label for="template-select">Template</Field.Label>
								<Select.Root type="single" bind:value={selectedTemplateId}>
									<Select.Trigger disabled={saving} id="template-select" class="w-full"
										>{selectedTemplateLabel}</Select.Trigger
									>
									<Select.Content>
										{#each templates as t (t.id)}
											<Select.Item value={t.id} label={t.name} />
										{/each}
									</Select.Content>
								</Select.Root>
							</Field.Root>
						{/if}

						<Field.Root>
							<Field.Label for="start-date">Start Date</Field.Label>
							<DatePicker disabled={saving} id="start-date" bind:value={startDate} placeholder="Select start date" />
						</Field.Root>
					</div>
				</Card.Root>

				<Card.Root class="grid gap-3 p-3">
					<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
						<p class="m-0 font-mono text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">Member</p>
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

					<Combobox.Root items={personnelOptions} bind:value={selectedPersonnelId} label="Member" autoHighlight>
						<Combobox.Trigger
							id="personnel-select"
							disabled={saving}
							clearable
							placeholder="Search for a member..."
							aria-label="Member"
						/>
						<Combobox.Content>
							<Combobox.Search placeholder="Search for a member..." />
							<Combobox.Empty>No matches</Combobox.Empty>
							<Combobox.List />
						</Combobox.Content>
					</Combobox.Root>
				</Card.Root>

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
				Start Onboarding
			</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

{#if showAddPersonModal}
	<PersonnelModal
		{groups}
		{rankCatalog}
		{allowUnassigned}
		onSubmit={handleAddPersonSubmit}
		onClose={() => (showAddPersonModal = false)}
	/>
{/if}
