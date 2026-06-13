<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { Group } from '$lib/stores/groups.svelte';
	import type { OnboardingTemplate } from '../onboarding.types';
	import PersonnelModal from '$features/personnel/components/PersonnelModal.svelte';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Combobox from '$lib/components/ui/combobox';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';
	import * as Select from '$lib/components/ui/select';
	import { formatDate } from '$lib/utils/dates';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

	interface Props {
		personnel: Personnel[];
		existingOnboardingPersonnelIds: string[];
		groups: Group[];
		templates: OnboardingTemplate[];
		hasTemplateSteps?: boolean;
		onSubmit: (personnelId: string, startedAt: string, templateId: string | null) => void | Promise<void>;
		onAddPerson: (data: Omit<Personnel, 'id'>) => Promise<string | null>;
		onClose: () => void;
	}

	let {
		personnel,
		existingOnboardingPersonnelIds,
		groups,
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

	const canSave = $derived(!!selectedPersonnelId && !!startDate && hasTemplateSteps);
	const showTemplateSelector = $derived(templates.length > 1);

	async function handleSave() {
		if (!canSave) return;
		const personnelId = selectedPersonnelId;
		const date = startDate;
		const templateId = selectedTemplateId || templates[0]?.id || null;
		onClose();
		await onSubmit(personnelId, date, templateId);
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
				<div class="grid gap-3 rounded-lg border bg-card p-3">
					<p class="m-0 font-mono text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
						Assignment
					</p>
					<div class="grid gap-2 sm:grid-cols-2">
						{#if showTemplateSelector}
							<Field.Root>
								<Field.Label for="template-select">Template</Field.Label>
								<Select.Root type="single" bind:value={selectedTemplateId}>
									<Select.Trigger id="template-select" class="w-full">{selectedTemplateLabel}</Select.Trigger>
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
							<DatePicker id="start-date" bind:value={startDate} placeholder="Select start date" />
						</Field.Root>
					</div>
				</div>

				<div class="grid gap-3 rounded-lg border bg-card p-3">
					<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
						<p class="m-0 font-mono text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">Member</p>
						<Button size="sm" variant="outline" type="button" onclick={() => (showAddPersonModal = true)}>
							Add Person
						</Button>
					</div>

					<Combobox.Root items={personnelOptions} bind:value={selectedPersonnelId} label="Member" autoHighlight>
						<Combobox.Trigger
							id="personnel-select"
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
				</div>

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
			<Button type="button" disabled={!canSave} onclick={handleSave}>Start Onboarding</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

{#if showAddPersonModal}
	<PersonnelModal
		personnel={null}
		{groups}
		onSubmit={handleAddPersonSubmit}
		onClose={() => (showAddPersonModal = false)}
	/>
{/if}
