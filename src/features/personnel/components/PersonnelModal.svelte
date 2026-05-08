<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { Group } from '$lib/stores/groups.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import SearchCombobox from '$lib/components/ui/SearchCombobox.svelte';
	import ArchiveIcon from '@lucide/svelte/icons/archive';
	import { untrack } from 'svelte';

	interface Props {
		personnel?: Personnel | null;
		groups: Group[];
		onSubmit: (data: Omit<Personnel, 'id'>) => void | Promise<void>;
		onRemove?: (id: string) => void | Promise<void>;
		onClose: () => void;
	}

	let { personnel = null, groups, onSubmit, onRemove, onClose }: Props = $props();

	let rank = $state(untrack(() => personnel?.rank ?? 'SPC'));
	let firstName = $state(untrack(() => personnel?.firstName ?? ''));
	let lastName = $state(untrack(() => personnel?.lastName ?? ''));
	let mos = $state(untrack(() => personnel?.mos ?? ''));
	let clinicRole = $state(untrack(() => personnel?.clinicRole ?? ''));
	let ets = $state(untrack(() => personnel?.ets ?? ''));
	let deros = $state(untrack(() => personnel?.deros ?? ''));
	let groupId = $state(untrack(() => personnel?.groupId ?? ''));
	let submitAttempted = $state(false);

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

<Dialog.Root open onOpenChange={(open) => !open && !isSaving && onClose()}>
	<Dialog.Content showCloseButton={!isSaving}>
		<Dialog.Header>
			<Dialog.Title>{isEditing ? 'Edit Personnel' : 'Add Personnel'}</Dialog.Title>
		</Dialog.Header>

		<form id="personnel-form" class="grid gap-4" onsubmit={handleSubmit}>
			<div class="grid gap-2">
				<Label for="rank">Rank</Label>
				<SearchCombobox
					id="rank"
					options={rankOptions}
					bind:value={rank}
					placeholder="Select rank..."
					clearable={false}
				/>
			</div>

			<div class="grid gap-4 sm:grid-cols-2">
				<div class="grid gap-2">
					<Label for="lastName">Last Name</Label>
					<Input
						id="lastName"
						placeholder="Smith"
						required
						aria-invalid={!!lastNameError}
						aria-describedby={lastNameError ? 'lastName-error' : undefined}
						bind:value={lastName}
					/>
					{#if lastNameError}<p id="lastName-error">{lastNameError}</p>{/if}
				</div>
				<div class="grid gap-2">
					<Label for="firstName">First Name</Label>
					<Input
						id="firstName"
						placeholder="John"
						required
						aria-invalid={!!firstNameError}
						aria-describedby={firstNameError ? 'firstName-error' : undefined}
						bind:value={firstName}
					/>
					{#if firstNameError}<p id="firstName-error">{firstNameError}</p>{/if}
				</div>
			</div>

			<div class="grid gap-4 sm:grid-cols-2">
				<div class="grid gap-2">
					<Label for="mos">MOS / Job Title</Label>
					<Input id="mos" placeholder="e.g., 68W, 68C, RN" bind:value={mos} />
				</div>
				<div class="grid gap-2">
					<Label for="clinicRole">Duty Role</Label>
					<Input id="clinicRole" placeholder="e.g., Squad Leader, Medic" bind:value={clinicRole} />
				</div>
			</div>

			<div class="grid gap-4 sm:grid-cols-2">
				<div class="grid gap-2">
					<Label for="ets">ETS</Label>
					<DatePicker id="ets" bind:value={ets} placeholder="Select ETS" />
				</div>
				<div class="grid gap-2">
					<Label for="deros">PCS / DEROS</Label>
					<DatePicker id="deros" bind:value={deros} placeholder="Select PCS / DEROS" />
				</div>
			</div>

			<div class="grid gap-2">
				<Label for="group">Group</Label>
				<SearchCombobox id="group" options={groupOptions} bind:value={groupId} placeholder="No Group Assigned" />
			</div>
		</form>

		<Dialog.Footer>
			{#if isEditing && onRemove}
				<Button
					type="button"
					variant="destructive"
					data-testid="personnel-archive"
					onclick={handleArchive}
					disabled={isSaving}
				>
					<ArchiveIcon />
					Archive
				</Button>
			{/if}
			<Button type="button" variant="outline" onclick={onClose} disabled={isSaving}>Cancel</Button>
			<Button type="submit" form="personnel-form" data-testid="personnel-save" disabled={isSaving}>
				{#if isSaving}
					Saving...
				{:else}
					{isEditing ? 'Save Changes' : 'Add Personnel'}
				{/if}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

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
