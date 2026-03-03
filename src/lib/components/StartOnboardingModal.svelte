<script lang="ts">
	import type { Personnel } from '../types';
	import Modal from './Modal.svelte';
	import Spinner from './ui/Spinner.svelte';

	interface Props {
		personnel: Personnel[];
		existingOnboardingPersonnelIds: string[];
		onSubmit: (personnelId: string, startedAt: string) => void;
		onClose: () => void;
	}

	let { personnel, existingOnboardingPersonnelIds, onSubmit, onClose }: Props = $props();

	let selectedPersonnelId = $state('');
	let startDate = $state(new Date().toISOString().split('T')[0]);
	let saving = $state(false);

	const availablePersonnel = $derived(
		personnel
			.filter((p) => !existingOnboardingPersonnelIds.includes(p.id))
			.sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
	);

	const canSave = $derived(!!selectedPersonnelId && !!startDate);

	async function handleSave() {
		if (!canSave || saving) return;
		saving = true;
		try {
			onSubmit(selectedPersonnelId, startDate);
			onClose();
		} finally {
			saving = false;
		}
	}
</script>

<Modal title="Start Onboarding" {onClose} width="450px" titleId="start-onboarding-title">
	<div class="form-group">
		<label class="label" for="personnel-select">Person</label>
		<select id="personnel-select" class="select" bind:value={selectedPersonnelId}>
			<option value="">Select a person...</option>
			{#each availablePersonnel as p (p.id)}
				<option value={p.id}>{p.rank} {p.lastName}, {p.firstName}</option>
			{/each}
		</select>
	</div>
	<div class="form-group">
		<label class="label" for="start-date">Start Date</label>
		<input type="date" id="start-date" class="input" bind:value={startDate} />
	</div>
	{#snippet footer()}
		<div class="spacer"></div>
		<button class="btn btn-secondary" onclick={onClose}>Cancel</button>
		<button class="btn btn-primary" disabled={!canSave || saving} onclick={handleSave}>
			{#if saving}<Spinner />{/if}
			{saving ? 'Starting...' : 'Start Onboarding'}
		</button>
	{/snippet}
</Modal>
