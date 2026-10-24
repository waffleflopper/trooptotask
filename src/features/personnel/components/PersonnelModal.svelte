<script lang="ts">
	import type { Personnel } from '../personnel.types';
	import type { RankCatalogEntry } from '$features/personnel/contracts';
	import type { Group } from '$features/personnel/contracts';
	import {
		defaultNewPersonnelRank,
		groupOptionsFor,
		personnelDraftChanges,
		personnelDraftOf,
		personnelPayloadOf,
		personnelSaveErrorMessage,
		rankOptionsFor,
		validatePersonnelDraft
	} from '$features/personnel/personnelDraft';
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

	const activeRankOptions = $derived(rankOptionsFor(rankCatalog));
	const rankOptions = $derived(rankOptionsFor(rankCatalog, personnel?.rank));

	const isEditing = $derived(!!personnel);
	const allowGroupClear = $derived(isEditing || allowUnassigned);
	let draft = $state(untrack(() => personnelDraftOf(personnel, defaultNewPersonnelRank(activeRankOptions))));
	const openingDraft = untrack(() => ({ ...draft }));
	let submitAttempted = $state(false);
	const dirty = $derived(personnelDraftChanges(openingDraft, draft, groups).length > 0);

	const errors = $derived(validatePersonnelDraft(draft, { isEditing, allowUnassigned, groups }));
	const isValid = $derived(Object.keys(errors).length === 0);
	const groupError = $derived(submitAttempted ? errors.groupId : undefined);
	const rankError = $derived(submitAttempted ? errors.rank : undefined);
	const firstNameError = $derived(submitAttempted ? errors.firstName : undefined);
	const lastNameError = $derived(submitAttempted ? errors.lastName : undefined);

	let isSaving = $state(false);
	let isArchiving = $state(false);
	const busy = $derived(isSaving || isArchiving);

	const groupOptions = $derived(groupOptionsFor(groups, allowGroupClear));

	async function handleSubmit(e: Event) {
		e.preventDefault();
		submitAttempted = true;
		if (!isValid || busy) return;

		isSaving = true;

		try {
			await onSubmit(personnelPayloadOf(draft, groups));
			if (disposed) return;
			toastStore.success(isEditing ? 'Personnel updated' : 'Personnel added');
			onClose();
		} catch (error) {
			if (!disposed) toastStore.error(personnelSaveErrorMessage(error, isEditing));
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

<AppDialog.Root open {busy} closeBlocked={dirty} {onClose}>
	<AppDialog.Content>
		<AppDialog.Header class="px-4 pt-4">
			<AppDialog.Title>{isEditing ? 'Edit Personnel' : 'Add Personnel'}</AppDialog.Title>
		</AppDialog.Header>

		<AppDialog.Body>
			<form id="personnel-form" class="grid gap-4" onsubmit={handleSubmit}>
				<fieldset class="contents" disabled={busy}>
					<Field.Root data-invalid={rankError ? true : undefined}>
						<Field.Label for="rank">Rank</Field.Label>
						<Combobox.Root items={rankOptions} bind:value={draft.rank} label="Rank" autoHighlight>
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
							<Input id="lastName" placeholder="Smith" required bind:value={draft.lastName} />
							{#if lastNameError}<Field.Error>{lastNameError}</Field.Error>{/if}
						</Field.Root>
						<Field.Root data-invalid={firstNameError ? true : undefined}>
							<Field.Label for="firstName">First Name</Field.Label>
							<Input id="firstName" placeholder="John" required bind:value={draft.firstName} />
							{#if firstNameError}<Field.Error>{firstNameError}</Field.Error>{/if}
						</Field.Root>
					</div>

					<div class="grid gap-4 sm:grid-cols-2">
						<Field.Root>
							<Field.Label for="mos">MOS / Job Title</Field.Label>
							<Input id="mos" placeholder="e.g., 68W, 68C, RN" bind:value={draft.mos} />
						</Field.Root>
						<Field.Root>
							<Field.Label for="clinicRole">Duty Role</Field.Label>
							<Input id="clinicRole" placeholder="e.g., Squad Leader, Medic" bind:value={draft.clinicRole} />
						</Field.Root>
					</div>

					<div class="grid gap-4 sm:grid-cols-2">
						<Field.Root>
							<Field.Label for="ets">ETS</Field.Label>
							<DatePicker id="ets" bind:value={draft.ets} placeholder="Select ETS" />
						</Field.Root>
						<Field.Root>
							<Field.Label for="deros">PCS / DEROS</Field.Label>
							<DatePicker id="deros" bind:value={draft.deros} placeholder="Select PCS / DEROS" />
						</Field.Root>
					</div>

					<Field.Root data-invalid={groupError ? true : undefined}>
						<Field.Label for="group">Group</Field.Label>
						<Combobox.Root items={groupOptions} bind:value={draft.groupId} label="Group" autoHighlight>
							<Combobox.Trigger
								id="group"
								clearable={allowGroupClear}
								placeholder={allowGroupClear ? 'No Group Assigned' : 'Select Group...'}
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
		variant="default"
		loading={isArchiving}
		onConfirm={doArchive}
		onCancel={() => (showArchiveConfirm = false)}
	/>
{/if}
