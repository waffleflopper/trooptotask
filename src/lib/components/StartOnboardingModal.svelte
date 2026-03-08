<script lang="ts">
	import type { Personnel } from '../types';
	import type { Group } from '../stores/groups.svelte';
	import Modal from './Modal.svelte';
	import PersonnelModal from './PersonnelModal.svelte';
	import Spinner from './ui/Spinner.svelte';

	interface Props {
		personnel: Personnel[];
		existingOnboardingPersonnelIds: string[];
		groups: Group[];
		hasTemplateSteps?: boolean;
		onSubmit: (personnelId: string, startedAt: string) => void | Promise<void>;
		onAddPerson: (data: Omit<Personnel, 'id'>) => Promise<string | null>;
		onClose: () => void;
	}

	let { personnel, existingOnboardingPersonnelIds, groups, hasTemplateSteps = true, onSubmit, onAddPerson, onClose }: Props = $props();

	let selectedPersonnelId = $state('');
	let startDate = $state(new Date().toISOString().split('T')[0]);
	let saving = $state(false);
	let showAddPersonModal = $state(false);

	const availablePersonnel = $derived(
		personnel
			.filter((p) => !existingOnboardingPersonnelIds.includes(p.id))
			.sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
	);

	const canSave = $derived(!!selectedPersonnelId && !!startDate && hasTemplateSteps);

	async function handleSave() {
		if (!canSave || saving) return;
		saving = true;
		try {
			await onSubmit(selectedPersonnelId, startDate);
			onClose();
		} finally {
			saving = false;
		}
	}

	async function handleAddPersonSubmit(data: Omit<Personnel, 'id'>) {
		const newId = await onAddPerson(data);
		if (newId) {
			selectedPersonnelId = newId;
		}
	}
</script>

<Modal title="Start Onboarding" {onClose} width="450px" titleId="start-onboarding-title">
	<div class="form-group">
		<label class="label" for="personnel-select">Person</label>
		<div class="person-select-row">
			<select id="personnel-select" class="select" bind:value={selectedPersonnelId} style="flex: 1;">
				<option value="">Select a person...</option>
				{#each availablePersonnel as p (p.id)}
					<option value={p.id}>{p.rank} {p.lastName}, {p.firstName}</option>
				{/each}
			</select>
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
		<button class="btn btn-primary" disabled={!canSave || saving} onclick={handleSave}>
			{#if saving}<Spinner />{/if}
			{saving ? 'Starting...' : 'Start Onboarding'}
		</button>
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
