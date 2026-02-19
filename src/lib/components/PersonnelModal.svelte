<script lang="ts">
	import type { Personnel } from '../types';
	import type { Group } from '../stores/groups.svelte';
	import Modal from './Modal.svelte';

	interface Props {
		personnel?: Personnel | null;
		groups: Group[];
		onSubmit: (data: Omit<Personnel, 'id'>) => void;
		onRemove?: (id: string) => void;
		onClose: () => void;
	}

	let { personnel = null, groups, onSubmit, onRemove, onClose }: Props = $props();

	let rank = $state(personnel?.rank ?? 'SPC');
	let firstName = $state(personnel?.firstName ?? '');
	let lastName = $state(personnel?.lastName ?? '');
	let mos = $state(personnel?.mos ?? '');
	let clinicRole = $state(personnel?.clinicRole ?? '');
	let groupId = $state(personnel?.groupId ?? '');

	const isEditing = $derived(!!personnel);
	const isValid = $derived(firstName.trim() !== '' && lastName.trim() !== '');

	const selectedGroupName = $derived(groups.find((g) => g.id === groupId)?.name ?? '');

	function handleSubmit(e: Event) {
		e.preventDefault();
		if (!isValid) return;

		onSubmit({
			rank,
			firstName: firstName.trim(),
			lastName: lastName.trim(),
			mos: mos.trim(),
			clinicRole: clinicRole.trim(),
			groupId: groupId || null,
			groupName: selectedGroupName
		});
		onClose();
	}

	function handleRemove() {
		if (
			personnel &&
			onRemove &&
			confirm(
				`Are you sure you want to remove ${personnel.rank} ${personnel.lastName}? This action cannot be undone.`
			)
		) {
			onRemove(personnel.id);
			onClose();
		}
	}
</script>

<Modal title={isEditing ? 'Edit Personnel' : 'Add Personnel'} {onClose} titleId="personnel-title">
	<form class="personnel-form" onsubmit={handleSubmit}>
		<div class="form-group">
			<label class="label" for="rank">Rank</label>
			<select id="rank" class="select" bind:value={rank}>
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
		</div>

		<div class="form-row">
			<div class="form-group">
				<label class="label" for="lastName">Last Name <span class="required">*</span></label>
				<input
					id="lastName"
					type="text"
					class="input"
					bind:value={lastName}
					placeholder="Smith"
					required
				/>
			</div>
			<div class="form-group">
				<label class="label" for="firstName">First Name <span class="required">*</span></label>
				<input
					id="firstName"
					type="text"
					class="input"
					bind:value={firstName}
					placeholder="John"
					required
				/>
			</div>
		</div>

		<div class="form-row">
			<div class="form-group">
				<label class="label" for="mos">MOS / Job Title</label>
				<input id="mos" type="text" class="input" bind:value={mos} placeholder="e.g., 68W, 68C, RN" />
			</div>
			<div class="form-group">
				<label class="label" for="clinicRole">Role</label>
				<input
					id="clinicRole"
					type="text"
					class="input"
					bind:value={clinicRole}
					placeholder="e.g., Medic, Physician"
				/>
			</div>
		</div>

		<div class="form-group">
			<label class="label" for="group">Group</label>
			<select id="group" class="select" bind:value={groupId}>
				<option value="">No Group Assigned</option>
				{#each groups as g}
					<option value={g.id}>{g.name}</option>
				{/each}
			</select>
		</div>

		<!-- Preview -->
		<div class="preview">
			<span class="preview-label">Preview:</span>
			<span class="preview-rank">{rank}</span>
			<span class="preview-name">{lastName || 'Last'}, {firstName || 'First'}</span>
			{#if mos}
				<span class="preview-mos">{mos}</span>
			{/if}
			{#if clinicRole}
				<span class="preview-role">{clinicRole}</span>
			{/if}
		</div>
	</form>

	{#snippet footer()}
		{#if isEditing && onRemove}
			<button type="button" class="btn btn-danger" onclick={handleRemove}>
				<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
					<path
						fill-rule="evenodd"
						d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
						clip-rule="evenodd"
					/>
				</svg>
				Remove
			</button>
		{/if}
		<div class="spacer"></div>
		<button type="button" class="btn btn-secondary" onclick={onClose}>Cancel</button>
		<button type="button" class="btn btn-primary" disabled={!isValid} onclick={handleSubmit}>
			{isEditing ? 'Save Changes' : 'Add Personnel'}
		</button>
	{/snippet}
</Modal>

<style>
	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--spacing-md);
	}

	.required {
		color: #dc2626;
	}

	.preview {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-md);
		background: var(--color-bg);
		border-radius: var(--radius-md);
		margin-top: var(--spacing-sm);
		font-size: var(--font-size-sm);
	}

	.preview-label {
		color: var(--color-text-muted);
	}

	.preview-rank {
		font-weight: 700;
		color: var(--color-primary);
	}

	.preview-name {
		font-weight: 500;
	}

	.preview-mos {
		color: var(--color-primary);
		font-weight: 500;
	}

	.preview-role {
		padding: 2px var(--spacing-sm);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
	}

	.btn-danger {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
	}

	.spacer {
		flex: 1;
	}
</style>
