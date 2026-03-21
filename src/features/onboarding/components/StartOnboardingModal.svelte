<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { Group } from '$lib/stores/groups.svelte';
	import type { OnboardingTemplate } from '../onboarding.types';
	import Modal from '$lib/components/Modal.svelte';
	import PersonnelModal from '$features/personnel/components/PersonnelModal.svelte';
	import SearchSelect from '$lib/components/ui/SearchSelect.svelte';

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
	let selectedTemplateId = $state<string>(templates[0]?.id ?? '');
	let showAddPersonModal = $state(false);

	const availablePersonnel = $derived(
		personnel
			.filter((p) => !existingOnboardingPersonnelIds.includes(p.id))
			.sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
	);

	const canSave = $derived(!!selectedPersonnelId && !!startDate && hasTemplateSteps);
	const showTemplateSelector = $derived(templates.length > 1);

	async function handleSave() {
		if (!canSave) return;
		const personnelId = selectedPersonnelId;
		const date = startDate;
		const templateId = selectedTemplateId || null;
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

<Modal title="Start Onboarding" {onClose} width="450px" titleId="start-onboarding-title">
	{#if showTemplateSelector}
		<div class="form-group">
			<label class="label" for="template-select">Template</label>
			<select id="template-select" class="select" bind:value={selectedTemplateId}>
				{#each templates as t (t.id)}
					<option value={t.id}>{t.name}</option>
				{/each}
			</select>
		</div>
	{/if}
	<div class="form-group">
		<label class="label" for="personnel-select">Person</label>
		<div class="person-select-row">
			<div style="flex: 1;">
				<SearchSelect
					id="personnel-select"
					options={availablePersonnel.map((p) => ({ value: p.id, label: `${p.rank} ${p.lastName}, ${p.firstName}` }))}
					bind:value={selectedPersonnelId}
					placeholder="Search for a person..."
				/>
			</div>
			<button class="btn btn-secondary btn-sm" onclick={() => (showAddPersonModal = true)}>+ Add New</button>
		</div>
	</div>
	<div class="form-group">
		<label class="label" for="start-date">Start Date</label>
		<input type="date" id="start-date" class="input" bind:value={startDate} />
	</div>
	{#if !hasTemplateSteps}
		<p class="warning-text">No template steps defined. Set up your onboarding template before starting.</p>
	{/if}
	{#snippet footer()}
		<div class="spacer"></div>
		<button class="btn btn-secondary" onclick={onClose}>Cancel</button>
		<button class="btn btn-primary" disabled={!canSave} onclick={handleSave}> Start Onboarding </button>
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

<style>
	.person-select-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.warning-text {
		color: var(--color-warning);
		font-size: var(--font-size-sm);
		margin-top: var(--spacing-sm);
	}
</style>
