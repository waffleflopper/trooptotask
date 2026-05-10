<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { Group } from '$lib/stores/groups.svelte';
	import type { OnboardingTemplate } from '../onboarding.types';
	import Modal from '$lib/components/Modal.svelte';
	import PersonnelModal from '$features/personnel/components/PersonnelModal.svelte';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Combobox from '$lib/components/ui/combobox';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
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
	let startDate = $state(new Date().toISOString().split('T')[0]);
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

<Modal title="Start Onboarding" {onClose} width="560px" titleId="start-onboarding-title">
	<div class="flex flex-col gap-3">
		<div class="rounded-lg border bg-muted/35 p-3">
			<p class="m-0 font-mono text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">New packet</p>
			<h3 class="mt-1 mb-0 text-lg leading-tight font-semibold tracking-tight">Open a new onboarding record.</h3>
			<p class="mt-2 mb-0 text-sm leading-relaxed text-muted-foreground">
				Choose the member, confirm the start date, and attach the template that should govern the checklist.
			</p>
		</div>

		<div class="grid gap-3 rounded-lg border bg-card p-3">
			<p class="m-0 font-mono text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">Assignment</p>
			<div class="grid gap-2 sm:grid-cols-2">
				{#if showTemplateSelector}
					<div class="grid gap-2">
						<Label for="template-select">Template</Label>
						<Select.Root type="single" bind:value={selectedTemplateId}>
							<Select.Trigger id="template-select" class="w-full">{selectedTemplateLabel}</Select.Trigger>
							<Select.Content>
								{#each templates as t (t.id)}
									<Select.Item value={t.id} label={t.name} />
								{/each}
							</Select.Content>
						</Select.Root>
					</div>
				{/if}

				<div class="grid gap-2">
					<Label for="start-date">Start Date</Label>
					<Input type="date" id="start-date" bind:value={startDate} />
				</div>
			</div>
		</div>

		<div class="grid gap-3 rounded-lg border bg-card p-3">
			<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<p class="m-0 font-mono text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">Member</p>
				<Button size="sm" variant="outline" type="button" onclick={() => (showAddPersonModal = true)}>
					Add Person
				</Button>
			</div>

			<Combobox.Root items={personnelOptions} bind:value={selectedPersonnelId} autoHighlight label="Member">
				<Combobox.Trigger id="personnel-select" placeholder="Search for a member..." />
				<Combobox.Content>
					<Combobox.Empty>No available members found.</Combobox.Empty>
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

	{#snippet footer()}
		<div class="spacer"></div>
		<Button variant="outline" type="button" onclick={onClose}>Cancel</Button>
		<Button type="button" disabled={!canSave} onclick={handleSave}>Start Onboarding</Button>
	{/snippet}
</Modal>

{#if showAddPersonModal}
	<PersonnelModal
		personnel={null}
		{groups}
		onSubmit={handleAddPersonSubmit}
		onClose={() => (showAddPersonModal = false)}
	/>
{/if}
