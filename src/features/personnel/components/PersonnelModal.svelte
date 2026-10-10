<script lang="ts">
	import type { Personnel } from '../personnel.types';
	import type { RankCatalogEntry } from '$features/personnel/contracts';
	import type { Group } from '$features/personnel/contracts';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { ConfirmDialog } from '$lib/components/ui/confirm-dialog';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import * as Combobox from '$lib/components/ui/combobox';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import ArchiveIcon from '@lucide/svelte/icons/archive';
	import { onDestroy, untrack } from 'svelte';

	interface Props {
		personnel?: Personnel | null;
		groups: Group[];
		allowUnassigned?: boolean;
		rankCatalog?: RankCatalogEntry[];
		onSubmit: (data: Omit<Personnel, 'id'>) => void | Promise<void>;
		onRemove?: (id: string) => boolean | Promise<boolean>;
		onClose: () => void;
	}

	let {
		personnel = null,
		groups,
		allowUnassigned = true,
		rankCatalog = [],
		onSubmit,
		onRemove,
		onClose
	}: Props = $props();
	let disposed = false;
	onDestroy(() => {
		disposed = true;
	});

	const COMMON_NEW_PERSONNEL_RANK = 'SPC';

	function normalizeRankCode(value: string): string {
		return value.trim().toUpperCase();
	}

	const activeRankOptions = $derived(
		rankCatalog.filter((entry) => entry.state === 'active').map((entry) => ({ value: entry.code, label: entry.code }))
	);
	const rankOptions = $derived.by(() => {
		if (
			!personnel?.rank ||
			activeRankOptions.some((option) => normalizeRankCode(option.value) === normalizeRankCode(personnel.rank))
		) {
			return activeRankOptions;
		}

		return [{ value: personnel.rank, label: personnel.rank }, ...activeRankOptions];
	});

	function defaultNewPersonnelRank(options: Array<{ value: string; label: string }>): string {
		return options.find((option) => normalizeRankCode(option.value) === COMMON_NEW_PERSONNEL_RANK)?.value ?? '';
	}

	let rank = $state(untrack(() => personnel?.rank ?? defaultNewPersonnelRank(activeRankOptions)));
	let firstName = $state(untrack(() => personnel?.firstName ?? ''));
	let lastName = $state(untrack(() => personnel?.lastName ?? ''));
	let mos = $state(untrack(() => personnel?.mos ?? ''));
	let clinicRole = $state(untrack(() => personnel?.clinicRole ?? ''));
	let ets = $state(untrack(() => personnel?.ets ?? ''));
	let deros = $state(untrack(() => personnel?.deros ?? ''));
	let groupId = $state(untrack(() => personnel?.groupId ?? ''));
	let submitAttempted = $state(false);

	const isEditing = $derived(!!personnel);
	const rankMissing = $derived(rank.trim() === '');
	const firstNameMissing = $derived(firstName.trim() === '');
	const lastNameMissing = $derived(lastName.trim() === '');
	const groupMissing = $derived(!isEditing && !allowUnassigned && !groups.some((group) => group.id === groupId));
	const isValid = $derived(!rankMissing && !firstNameMissing && !lastNameMissing && !groupMissing);
	const groupError = $derived(submitAttempted && groupMissing ? 'Select a permitted Group.' : undefined);
	const rankError = $derived(submitAttempted && rankMissing ? 'Select a rank.' : undefined);
	const firstNameError = $derived(submitAttempted && firstNameMissing ? 'Enter a first name.' : undefined);
	const lastNameError = $derived(submitAttempted && lastNameMissing ? 'Enter a last name.' : undefined);

	const selectedGroupName = $derived(groups.find((g) => g.id === groupId)?.name ?? '');
	let isSaving = $state(false);
	let isArchiving = $state(false);
	const busy = $derived(isSaving || isArchiving);

	const groupOptions = $derived([
		...(isEditing || allowUnassigned ? [{ value: '', label: 'No Group Assigned' }] : []),
		...groups.map((g) => ({ value: g.id, label: g.name }))
	]);

	function getErrorMessage(error: unknown): string {
		if (error instanceof Error && error.message.trim()) return error.message;
		return isEditing ? 'Failed to update personnel' : 'Failed to add personnel';
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		submitAttempted = true;
		if (!isValid || busy) return;

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
			if (disposed) return;
			toastStore.success(isEditing ? 'Personnel updated' : 'Personnel added');
			onClose();
		} catch (error) {
			if (!disposed) toastStore.error(getErrorMessage(error));
		} finally {
			if (!disposed) isSaving = false;
		}
	}

	let showArchiveConfirm = $state(false);

	function handleArchive() {
		showArchiveConfirm = true;
	}

	async function doArchive() {
		if (!personnel || !onRemove || busy) return;
		isArchiving = true;
		try {
			if (await onRemove(personnel.id)) onClose();
		} catch (error) {
			toastStore.error(error instanceof Error && error.message.trim() ? error.message : 'Failed to archive personnel');
		} finally {
			isArchiving = false;
			showArchiveConfirm = false;
		}
	}
</script>

<AppDialog.Root open {busy} {onClose}>
	<AppDialog.Content>
		<AppDialog.Header class="px-4 pt-4">
			<AppDialog.Title>{isEditing ? 'Edit Personnel' : 'Add Personnel'}</AppDialog.Title>
		</AppDialog.Header>

		<AppDialog.Body>
			<form id="personnel-form" class="grid gap-4" onsubmit={handleSubmit}>
				<fieldset class="contents" disabled={busy}>
					<Field.Root data-invalid={rankError ? true : undefined}>
						<Field.Label for="rank">Rank</Field.Label>
						<Combobox.Root items={rankOptions} bind:value={rank} label="Rank" autoHighlight>
							<Combobox.Trigger id="rank" placeholder="Select rank..." aria-label="Rank" />
							<Combobox.Content>
								<Combobox.Search placeholder="Select rank..." />
								<Combobox.Empty>No ranks found.</Combobox.Empty>
								<Combobox.List />
							</Combobox.Content>
						</Combobox.Root>
						{#if rankError}<Field.Error>{rankError}</Field.Error>{/if}
					</Field.Root>

					<div class="grid gap-4 sm:grid-cols-2">
						<Field.Root data-invalid={lastNameError ? true : undefined}>
							<Field.Label for="lastName">Last Name</Field.Label>
							<Input id="lastName" placeholder="Smith" required bind:value={lastName} />
							{#if lastNameError}<Field.Error>{lastNameError}</Field.Error>{/if}
						</Field.Root>
						<Field.Root data-invalid={firstNameError ? true : undefined}>
							<Field.Label for="firstName">First Name</Field.Label>
							<Input id="firstName" placeholder="John" required bind:value={firstName} />
							{#if firstNameError}<Field.Error>{firstNameError}</Field.Error>{/if}
						</Field.Root>
					</div>

					<div class="grid gap-4 sm:grid-cols-2">
						<Field.Root>
							<Field.Label for="mos">MOS / Job Title</Field.Label>
							<Input id="mos" placeholder="e.g., 68W, 68C, RN" bind:value={mos} />
						</Field.Root>
						<Field.Root>
							<Field.Label for="clinicRole">Duty Role</Field.Label>
							<Input id="clinicRole" placeholder="e.g., Squad Leader, Medic" bind:value={clinicRole} />
						</Field.Root>
					</div>

					<div class="grid gap-4 sm:grid-cols-2">
						<Field.Root>
							<Field.Label for="ets">ETS</Field.Label>
							<DatePicker id="ets" bind:value={ets} placeholder="Select ETS" />
						</Field.Root>
						<Field.Root>
							<Field.Label for="deros">PCS / DEROS</Field.Label>
							<DatePicker id="deros" bind:value={deros} placeholder="Select PCS / DEROS" />
						</Field.Root>
					</div>

					<Field.Root data-invalid={groupError ? true : undefined}>
						<Field.Label for="group">Group</Field.Label>
						<Combobox.Root items={groupOptions} bind:value={groupId} label="Group" autoHighlight>
							<Combobox.Trigger
								id="group"
								clearable={isEditing || allowUnassigned}
								placeholder={isEditing || allowUnassigned ? 'No Group Assigned' : 'Select Group...'}
								aria-label="Group"
							/>
							<Combobox.Content>
								<Combobox.Search placeholder="Search Groups..." />
								<Combobox.Empty>No groups found.</Combobox.Empty>
								<Combobox.List />
							</Combobox.Content>
						</Combobox.Root>
						{#if groupError}<Field.Error>{groupError}</Field.Error>{/if}
					</Field.Root>
				</fieldset>
			</form>
		</AppDialog.Body>

		<AppDialog.Footer>
			{#if isEditing && onRemove}
				<Button
					type="button"
					variant="destructive"
					data-testid="personnel-archive"
					onclick={handleArchive}
					disabled={busy}
				>
					<ArchiveIcon />
					Archive
				</Button>
			{/if}
			<Button type="button" variant="outline" onclick={onClose} disabled={busy}>Cancel</Button>
			<Button type="submit" form="personnel-form" data-testid="personnel-save" disabled={busy}>
				{#if isSaving}
					Saving...
				{:else}
					{isEditing ? 'Save Changes' : 'Add Personnel'}
				{/if}
			</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

{#if showArchiveConfirm && personnel}
	<ConfirmDialog
		title="Archive Personnel"
		message="Archive {personnel.rank} {personnel.lastName}? They will be removed from active rosters, calendars, and reports, but their records remain available in archived personnel."
		confirmLabel="Archive"
		variant="warning"
		loading={isArchiving}
		onConfirm={doArchive}
		onCancel={() => (showArchiveConfirm = false)}
	/>
{/if}
