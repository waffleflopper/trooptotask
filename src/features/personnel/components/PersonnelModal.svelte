<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { Group } from '$lib/stores/groups.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';

	interface Props {
		personnel?: Personnel | null;
		groups: Group[];
		onSubmit: (data: Omit<Personnel, 'id'>) => void | Promise<void>;
		onRemove?: (id: string) => void;
		onClose: () => void;
	}

	let { personnel = null, groups, onSubmit, onRemove, onClose }: Props = $props();

	let rank = $state('SPC');
	let firstName = $state('');
	let lastName = $state('');
	let mos = $state('');
	let clinicRole = $state('');
	let groupId = $state('');

	$effect(() => {
		rank = personnel?.rank ?? 'SPC';
		firstName = personnel?.firstName ?? '';
		lastName = personnel?.lastName ?? '';
		mos = personnel?.mos ?? '';
		clinicRole = personnel?.clinicRole ?? '';
		groupId = personnel?.groupId ?? '';
	});

	const isEditing = $derived(!!personnel);
	const isValid = $derived(firstName.trim() !== '' && lastName.trim() !== '');

	const selectedGroupName = $derived(groups.find((g) => g.id === groupId)?.name ?? '');
	let isSaving = $state(false);

	function getErrorMessage(error: unknown): string {
		if (error instanceof Error && error.message.trim()) return error.message;
		return isEditing ? 'Failed to update personnel' : 'Failed to add personnel';
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!isValid || isSaving) return;

		isSaving = true;

		try {
			await onSubmit({
				rank,
				firstName: firstName.trim(),
				lastName: lastName.trim(),
				mos: mos.trim(),
				clinicRole: clinicRole.trim(),
				groupId: groupId || null,
				groupName: selectedGroupName
			});
			toastStore.success(isEditing ? 'Personnel updated' : 'Personnel added');
			onClose();
		} catch (error) {
			toastStore.error(getErrorMessage(error));
		} finally {
			isSaving = false;
		}
	}

	let showArchiveConfirm = $state(false);

	function handleArchive() {
		showArchiveConfirm = true;
	}

	function doArchive() {
		if (personnel && onRemove) {
			onRemove(personnel.id);
			onClose();
		}
	}
</script>

<Modal title={isEditing ? 'Edit Person' : 'Add Person'} {onClose} titleId="personnel-title">
	<form class="personnel-form" onsubmit={handleSubmit}>
		<FormField label="Rank" id="rank">
			<select id="rank" class="input" data-testid="personnel-rank" bind:value={rank}>
				<optgroup label="Commissioned Officer">
					{#each ['GEN', 'LTG', 'MG', 'BG', 'COL', 'LTC', 'MAJ', 'CPT', '1LT', '2LT'] as r}
						<option value={r}>{r}</option>
					{/each}
				</optgroup>
				<optgroup label="Warrant Officer">
					{#each ['CW5', 'CW4', 'CW3', 'CW2', 'WO1'] as r}
						<option value={r}>{r}</option>
					{/each}
				</optgroup>
				<optgroup label="NCO">
					{#each ['CSM', 'SGM', '1SG', 'MSG', 'SFC', 'SSG', 'SGT'] as r}
						<option value={r}>{r}</option>
					{/each}
				</optgroup>
				<optgroup label="Enlisted">
					{#each ['CPL', 'SPC', 'PFC', 'PV2', 'PV1'] as r}
						<option value={r}>{r}</option>
					{/each}
				</optgroup>
				<optgroup label="Civilian">
					<option value="CIV">CIV</option>
				</optgroup>
			</select>
		</FormField>

		<div class="form-row">
			<FormField label="Last Name" id="lastName" placeholder="Smith" required bind:value={lastName} />
			<FormField label="First Name" id="firstName" placeholder="John" required bind:value={firstName} />
		</div>

		<div class="form-row">
			<FormField label="MOS / Job Title" id="mos" placeholder="e.g., 68W, 68C, RN" bind:value={mos} />
			<FormField label="Role" id="clinicRole" placeholder="e.g., Medic, Physician" bind:value={clinicRole} />
		</div>

		<FormField label="Group" id="group" inputElement="select" bind:value={groupId}>
			<select id="group" class="input" bind:value={groupId}>
				<option value="">No Group Assigned</option>
				{#each groups as g}
					<option value={g.id}>{g.name}</option>
				{/each}
			</select>
		</FormField>

		<!-- Preview -->
		<div class="preview">
			<span class="preview-label">Roster Preview</span>
			<div class="preview-main">
				<span class="preview-rank">{rank}</span>
				<span class="preview-name">{lastName || 'Last'}, {firstName || 'First'}</span>
			</div>
			<div class="preview-meta">
				{#if mos}
					<span class="preview-detail">
						<span class="preview-detail-label">MOS</span>
						<span>{mos}</span>
					</span>
				{/if}
				{#if clinicRole}
					<span class="preview-detail">
						<span class="preview-detail-label">Role</span>
						<span>{clinicRole}</span>
					</span>
				{/if}
				{#if selectedGroupName}
					<span class="preview-detail">
						<span class="preview-detail-label">Group</span>
						<span>{selectedGroupName}</span>
					</span>
				{/if}
			</div>
		</div>
	</form>

	{#snippet footer()}
		{#if isEditing && onRemove}
			<button type="button" class="btn btn-warning archive-btn" data-testid="personnel-archive" onclick={handleArchive}>
				<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
					<path d="M4 3a2 2 0 100 4h12a2 2 0 100-4H4z" />
					<path
						fill-rule="evenodd"
						d="M3 8h14v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8zm5 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z"
						clip-rule="evenodd"
					/>
				</svg>
				Archive
			</button>
		{/if}
		<div class="spacer"></div>
		<button type="button" class="btn btn-secondary" onclick={onClose}>Cancel</button>
		<button
			type="button"
			class="btn btn-primary"
			data-testid="personnel-save"
			disabled={!isValid || isSaving}
			onclick={handleSubmit}
		>
			{#if isSaving}
				Saving...
			{:else}
				{isEditing ? 'Save Changes' : 'Add Personnel'}
			{/if}
		</button>
	{/snippet}
</Modal>

{#if showArchiveConfirm && personnel}
	<ConfirmDialog
		title="Archive Personnel"
		message="Archive {personnel.rank} {personnel.lastName}? They will be hidden from all active views."
		confirmLabel="Archive"
		variant="warning"
		onConfirm={doArchive}
		onCancel={() => (showArchiveConfirm = false)}
	/>
{/if}

<style>
	.personnel-form {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--sp-4);
	}

	.preview {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--sp-3);
		padding: var(--sp-4);
		background: color-mix(in srgb, var(--surface-subtle) 70%, var(--surface-panel) 30%);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
	}

	.preview-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--amber-dark);
	}

	.preview-main {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}

	.preview-rank {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--amber-dark);
	}

	.preview-name {
		font-family: var(--font-display);
		font-size: clamp(1.2rem, 1rem + 0.3vw, 1.5rem);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-primary);
	}

	.preview-meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}

	.preview-detail {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		min-height: 24px;
		padding: 3px 8px;
		background: var(--surface-panel);
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
		color: var(--text-secondary);
	}

	.preview-detail-label {
		font-family: var(--font-mono);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}

	.archive-btn {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}

	@media (max-width: 640px) {
		.form-row {
			grid-template-columns: 1fr;
		}
	}
</style>
