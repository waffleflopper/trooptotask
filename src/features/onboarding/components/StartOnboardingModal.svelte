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
	let selectedTemplateId = $state<string>('');
	let showAddPersonModal = $state(false);

	$effect(() => {
		if (!selectedTemplateId && templates[0]?.id) {
			selectedTemplateId = templates[0].id;
		}
	});

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

<Modal title="Start Onboarding" {onClose} width="560px" titleId="start-onboarding-title">
	<div class="modal-shell">
		<div class="modal-summary">
			<p class="eyebrow">New packet</p>
			<h3>Open a new onboarding record.</h3>
			<p>Choose the member, confirm the start date, and attach the template that should govern the checklist.</p>
		</div>

		<div class="form-section">
			<p class="section-label">Assignment</p>
			<div class="form-grid">
				{#if showTemplateSelector}
					<label class="field-block" for="template-select">
						<span class="label">Template</span>
						<select id="template-select" class="select" bind:value={selectedTemplateId}>
							{#each templates as t (t.id)}
								<option value={t.id}>{t.name}</option>
							{/each}
						</select>
					</label>
				{/if}

				<label class="field-block" for="start-date">
					<span class="label">Start Date</span>
					<input type="date" id="start-date" class="input" bind:value={startDate} />
				</label>
			</div>
		</div>

		<div class="form-section">
			<div class="section-head">
				<p class="section-label">Member</p>
				<button class="btn btn-sm btn-secondary" type="button" onclick={() => (showAddPersonModal = true)}
					>Add Person</button
				>
			</div>

			<SearchSelect
				id="personnel-select"
				options={availablePersonnel.map((p) => ({ value: p.id, label: `${p.rank} ${p.lastName}, ${p.firstName}` }))}
				bind:value={selectedPersonnelId}
				placeholder="Search for a member..."
			/>
		</div>

		{#if !hasTemplateSteps}
			<div class="warning-panel">
				<p class="warning-label">Template Required</p>
				<p>No onboarding steps are configured yet. Build the onboarding template before starting a packet.</p>
			</div>
		{/if}
	</div>

	{#snippet footer()}
		<div class="spacer"></div>
		<button class="btn btn-secondary" type="button" onclick={onClose}>Cancel</button>
		<button class="btn btn-primary" type="button" disabled={!canSave} onclick={handleSave}>Start Onboarding</button>
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
	.modal-shell {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.modal-summary,
	.form-section,
	.warning-panel {
		padding: var(--sp-3);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: var(--surface-panel);
	}

	.modal-summary {
		background: color-mix(in srgb, var(--surface-panel) 90%, var(--surface-subtle) 10%);
	}

	.eyebrow,
	.section-label,
	.warning-label {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.eyebrow {
		color: var(--amber);
	}

	.modal-summary h3 {
		margin: var(--sp-1) 0 0;
		font-family: var(--font-display);
		font-size: var(--text-2xl);
		font-weight: var(--font-weight-display);
		line-height: 0.95;
		text-transform: uppercase;
	}

	.modal-summary p:last-child {
		margin: var(--sp-2) 0 0;
		font-size: var(--text-sm);
		line-height: 1.55;
		color: var(--text-secondary);
	}

	.form-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: var(--sp-2);
	}

	.field-block {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
	}

	.section-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-2);
		margin-bottom: var(--sp-2);
	}

	.warning-panel {
		background: color-mix(in srgb, var(--amber-light) 82%, var(--surface-panel) 18%);
	}

	.warning-label {
		color: var(--amber-dark);
	}

	.warning-panel p:last-child {
		margin: var(--sp-1) 0 0;
		font-size: var(--text-sm);
		line-height: 1.5;
		color: var(--text-secondary);
	}

	@media (max-width: 640px) {
		.section-head {
			flex-direction: column;
			align-items: stretch;
		}
	}
</style>
