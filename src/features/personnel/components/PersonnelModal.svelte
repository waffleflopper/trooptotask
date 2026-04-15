<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { Group } from '$lib/stores/groups.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import SearchSelect from '$lib/components/ui/SearchSelect.svelte';

	interface Props {
		personnel?: Personnel | null;
		groups: Group[];
		onSubmit: (data: Omit<Personnel, 'id'>) => void | Promise<void>;
		onRemove?: (id: string) => void | Promise<void>;
		onClose: () => void;
	}

	let { personnel = null, groups, onSubmit, onRemove, onClose }: Props = $props();

	let rank = $state('SPC');
	let firstName = $state('');
	let lastName = $state('');
	let mos = $state('');
	let clinicRole = $state('');
	let ets = $state('');
	let deros = $state('');
	let groupId = $state('');
	let submitAttempted = $state(false);

	$effect(() => {
		rank = personnel?.rank ?? 'SPC';
		firstName = personnel?.firstName ?? '';
		lastName = personnel?.lastName ?? '';
		mos = personnel?.mos ?? '';
		clinicRole = personnel?.clinicRole ?? '';
		ets = personnel?.ets ?? '';
		deros = personnel?.deros ?? '';
		groupId = personnel?.groupId ?? '';
		submitAttempted = false;
	});

	const isEditing = $derived(!!personnel);
	const firstNameMissing = $derived(firstName.trim() === '');
	const lastNameMissing = $derived(lastName.trim() === '');
	const isValid = $derived(!firstNameMissing && !lastNameMissing);
	const firstNameError = $derived(submitAttempted && firstNameMissing ? 'Enter a first name.' : undefined);
	const lastNameError = $derived(submitAttempted && lastNameMissing ? 'Enter a last name.' : undefined);

	const selectedGroupName = $derived(groups.find((g) => g.id === groupId)?.name ?? '');
	let isSaving = $state(false);

	const rankOptions = [
		'GEN',
		'LTG',
		'MG',
		'BG',
		'COL',
		'LTC',
		'MAJ',
		'CPT',
		'1LT',
		'2LT',
		'CW5',
		'CW4',
		'CW3',
		'CW2',
		'WO1',
		'CSM',
		'SGM',
		'1SG',
		'MSG',
		'SFC',
		'SSG',
		'SGT',
		'CPL',
		'SPC',
		'PFC',
		'PV2',
		'PV1',
		'CIV'
	].map((r) => ({ value: r, label: r }));

	const groupOptions = $derived([
		{ value: '', label: 'No Group Assigned' },
		...groups.map((g) => ({ value: g.id, label: g.name }))
	]);

	function getErrorMessage(error: unknown): string {
		if (error instanceof Error && error.message.trim()) return error.message;
		return isEditing ? 'Failed to update personnel' : 'Failed to add personnel';
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		submitAttempted = true;
		if (!isValid || isSaving) return;

		isSaving = true;

		try {
			await onSubmit({
				rank,
				firstName: firstName.trim(),
				lastName: lastName.trim(),
				mos: mos.trim(),
				clinicRole: clinicRole.trim(),
				ets: ets.trim() || null,
				deros: deros.trim() || null,
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

	async function doArchive() {
		if (personnel && onRemove) {
			await onRemove(personnel.id);
			onClose();
		}
	}
</script>

<Modal title={isEditing ? 'Edit Personnel' : 'Add Personnel'} {onClose} titleId="personnel-title" canClose={!isSaving}>
	<form class="personnel-form" onsubmit={handleSubmit}>
		<FormField label="Rank" id="rank">
			<SearchSelect id="rank" options={rankOptions} bind:value={rank} placeholder="Select rank..." clearable={false} />
		</FormField>

		<div class="form-row">
			<FormField
				label="Last Name"
				id="lastName"
				placeholder="Smith"
				required
				error={lastNameError}
				bind:value={lastName}
			/>
			<FormField
				label="First Name"
				id="firstName"
				placeholder="John"
				required
				error={firstNameError}
				bind:value={firstName}
			/>
		</div>

		<div class="form-row">
			<FormField label="MOS / Job Title" id="mos" placeholder="e.g., 68W, 68C, RN" bind:value={mos} />
			<FormField label="Role" id="clinicRole" placeholder="e.g., Medic, Physician" bind:value={clinicRole} />
		</div>

		<div class="form-row">
			<FormField label="ETS" id="ets" type="date" bind:value={ets} />
			<FormField label="PCS / DEROS" id="deros" type="date" bind:value={deros} />
		</div>

		<FormField label="Group" id="group">
			<SearchSelect id="group" options={groupOptions} bind:value={groupId} placeholder="No Group Assigned" />
		</FormField>
	</form>

	{#snippet footer()}
		{#if isEditing && onRemove}
			<button
				type="button"
				class="btn btn-warning archive-btn"
				data-testid="personnel-archive"
				onclick={handleArchive}
				disabled={isSaving}
			>
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
		<button type="button" class="btn btn-secondary" onclick={onClose} disabled={isSaving}>Cancel</button>
		<button
			type="button"
			class="btn btn-primary"
			data-testid="personnel-save"
			disabled={isSaving}
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
		message="Archive {personnel.rank} {personnel.lastName}? They will be removed from active rosters, calendars, and reports, but their records remain available in archived personnel."
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
