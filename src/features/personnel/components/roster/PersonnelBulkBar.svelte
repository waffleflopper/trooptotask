<script lang="ts">
	import { invalidate } from '$app/navigation';
	import ArchiveIcon from '@lucide/svelte/icons/archive';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import FolderInputIcon from '@lucide/svelte/icons/folder-input';
	import MessageSquarePlusIcon from '@lucide/svelte/icons/message-square-plus';
	import PencilLineIcon from '@lucide/svelte/icons/pencil-line';
	import SquareCheckIcon from '@lucide/svelte/icons/square-check';
	import XIcon from '@lucide/svelte/icons/x';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { stillInOrganizationLifetime, withinOrganizationLifetime } from '$lib/stores/core';
	import { toastStore, type ToastAction } from '$lib/stores/toast.svelte';
	import { reportClientFailure } from '$lib/stores/errorReportLedger';
	import type { PersonnelPageContext } from '../../contexts/PersonnelPageContext.svelte';
	import type { PersonnelBulkField, PersonnelFieldChange } from '../../contracts';
	import type { Personnel } from '../../personnel.types';
	import { personnelBulkFieldLabel } from '../../personnelFieldChange';
	import { rankOptionsFor } from '../../personnelDraft';
	import type { ComposerKind } from '../../rosterComposer';
	import { downloadRosterExport, rosterExportFilename, rosterExportRows } from '../../rosterExport';
	import { personnelStore } from '../../stores/personnel.svelte';
	import { ARCHIVE_UNDO_MS, archiveUndoAction } from '../../utils/archiveUndo';
	import { moveGroupMembers, undoGroupMoves, type GroupMoveUndo } from '../../utils/moveGroupMembers';
	import { saveRosterField } from '../../rosterFieldSave';
	import { buildGroupTree } from '../../groupTree';

	interface Props {
		ctx: PersonnelPageContext;
		people: readonly Personnel[];
		hidden: { count: number; by: 'search' | 'filter' | 'search and filter' };
		oncompose: (kind: ComposerKind) => void;
		onclear: () => void;
		onarchived: (result: { archivedIds: string[]; approvalRequestedIds: string[] }) => void;
		/** People an archive Undo brought back, so the roster shows them again. */
		onrestored: (ids: string[]) => void;
		isCurrent: (orgId: string) => boolean;
	}

	let { ctx, people, hidden, oncompose, onclear, onarchived, onrestored, isCurrent: rosterIsCurrent }: Props = $props();

	let busy = $state(false);
	let confirmingArchive = $state(false);
	/** The People the open Set field dialog is changing, fixed when it opened so a save does not reshuffle its review. */
	let fieldTargets = $state.raw<{ people: readonly Personnel[]; notEditable: number } | null>(null);

	const writable = $derived(people.filter((person) => ctx.canManagePersonnelRecord(person)));
	const exportable = $derived(people.filter((person) => ctx.canExportPersonnelRecord(person)));
	const archivable = $derived(people.filter((person) => ctx.canArchivePersonnelRecord(person)));
	const groupTree = $derived(buildGroupTree(ctx.groupOrder));
	const moveTargets = $derived([
		...groupTree.ordered.flatMap(({ id, name, level }) =>
			ctx.canManagePersonnelInGroup(id) ? [{ id, name, level, path: groupTree.label(id) }] : []
		),
		...(ctx.canManagePersonnelInGroup(null) ? [{ id: null, name: 'Unassigned', level: 0, path: 'Unassigned' }] : [])
	]);
	const indent = ['', 'pl-6', 'pl-10'];
	const groupNameOf = (id: string | null) => (id ? (groupTree.node(id)?.name ?? '') : '');

	/** How long a move offers Undo. */
	const MOVE_UNDO_MS = 10_000;
	const count = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;
	const skippedNote = (n: number) => (n > 0 ? ` · ${count(n)} skipped` : '');

	async function moveTo(target: { id: string | null; name: string; path: string }): Promise<void> {
		const orgId = ctx.orgId;
		const submitted = writable.map((person) => person.id);
		const selectedCount = people.length;
		const inLifetime = stillInOrganizationLifetime();
		const isCurrent = () => inLifetime() && rosterIsCurrent(orgId);
		busy = true;
		try {
			const result = await withinOrganizationLifetime(moveGroupMembers(orgId, submitted, target.id), isCurrent);
			const previousGroup = result.previousGroupIds;
			const changed = new Set(previousGroup.keys());
			for (const id of changed) ctx.peek.changed(id, { groupId: previousGroup.get(id) }, { groupId: target.id });
			if (changed.size) void ctx.signals.refresh([...changed]);
			personnelStore.updateLocalWhere(
				(person) => changed.has(person.id),
				(person) => ({ ...person, groupId: target.id, groupName: target.id ? target.name : '' })
			);
			const skipped = selectedCount - result.movedIds.length;
			const message = `Moved ${count(result.movedIds.length)} to ${target.path}${skippedNote(skipped)}`;
			if (changed.size === 0) toastStore.success(message);
			else
				toastStore.success(
					message,
					MOVE_UNDO_MS,
					undoMoveAction(
						orgId,
						[...previousGroup].map(([personnelId, from]) => ({
							personnelId,
							fromGroupId: target.id,
							toGroupId: from
						})),
						isCurrent
					)
				);
		} catch (caught) {
			if (isCurrent()) toastStore.error(caught instanceof Error ? caught.message : 'Unable to move People.');
		} finally {
			if (isCurrent()) busy = false;
		}
	}

	/** Puts the People a move changed back where they were, unless the roster or Organization has moved on. */
	function undoMoveAction(orgId: string, moves: GroupMoveUndo[], isCurrent: () => boolean): ToastAction {
		return {
			label: 'Undo',
			onClick: () => {
				if (!isCurrent()) return;
				void (async () => {
					try {
						const { restoredIds, changedIds } = await withinOrganizationLifetime(
							undoGroupMoves(orgId, moves),
							isCurrent
						);
						const restored = new Set(restoredIds);
						const back = new Map(moves.map((move) => [move.personnelId, move]));
						for (const id of restored)
							ctx.peek.changed(id, { groupId: back.get(id)?.fromGroupId }, { groupId: back.get(id)?.toGroupId });
						if (restored.size) void ctx.signals.refresh(restoredIds);
						personnelStore.updateLocalWhere(
							(person) => restored.has(person.id),
							(person) => ({
								...person,
								groupId: back.get(person.id)?.toGroupId ?? null,
								groupName: groupNameOf(back.get(person.id)?.toGroupId ?? null)
							})
						);
						const left = changedIds.length;
						const note = left
							? `${count(left)} changed since and ${left === 1 ? 'was' : 'were'} left where they are`
							: undefined;
						if (restored.size) toastStore.success(`Moved ${count(restored.size)} back`, undefined, undefined, note);
						else toastStore.warning('Nothing was moved back', undefined, undefined, note);
					} catch (caught) {
						if (isCurrent())
							toastStore.error(
								'Undo did not go through',
								undefined,
								undefined,
								caught instanceof Error ? caught.message : 'Nothing changed. Try again in a moment.'
							);
					}
				})();
			}
		};
	}

	function setField(change: PersonnelFieldChange, ids: string[]) {
		const orgId = ctx.orgId;
		return saveRosterField(fieldTargets?.people ?? [], change, ids, {
			orgId,
			isCurrent: () => rosterIsCurrent(orgId),
			peek: ctx.peek,
			refreshSignals: (changedIds) => void ctx.signals.refresh(changedIds)
		});
	}

	function fieldSaved(summary: { field: PersonnelBulkField; updated: number; alreadySet: number }): void {
		const left = (fieldTargets?.notEditable ?? 0) + summary.alreadySet;
		fieldTargets = null;
		toastStore.success(
			`Updated ${personnelBulkFieldLabel(summary.field)} for ${count(summary.updated)}${skippedNote(left)}`
		);
	}

	async function exportSelected(): Promise<void> {
		const orgId = ctx.orgId;
		const inLifetime = stillInOrganizationLifetime();
		const isCurrent = () => inLifetime() && rosterIsCurrent(orgId);
		const rows = rosterExportRows(
			exportable,
			(person) => ctx.signalRow(person),
			ctx.signals.statusTypes,
			ctx.groupOrder
		);
		const filename = rosterExportFilename(ctx.orgUrlSegment, ctx.data.asOf);
		const skipped = people.length - exportable.length;
		const exportedCount = exportable.length;
		busy = true;
		try {
			await downloadRosterExport(filename, rows);
			if (isCurrent() && skipped > 0) toastStore.info(`Exported ${count(exportedCount)}${skippedNote(skipped)}`);
		} catch (err) {
			if (isCurrent()) {
				reportClientFailure(err);
				toastStore.error('The export could not be created. Try again.');
			}
		} finally {
			if (isCurrent()) busy = false;
		}
	}

	async function archiveSelected(): Promise<void> {
		const orgId = ctx.orgId;
		const ids = archivable.map((person) => person.id);
		const skipped = people.length - ids.length;
		const inLifetime = stillInOrganizationLifetime();
		const isCurrent = () => inLifetime() && rosterIsCurrent(orgId);
		busy = true;
		try {
			const { bulkArchivePersonnel } = await import('../../utils/bulkArchivePersonnel');
			if (!isCurrent()) return;
			const result = await bulkArchivePersonnel(orgId, ids);
			if (!isCurrent()) return;
			confirmingArchive = false;
			onarchived(result);

			if (result.undo) {
				const archived = result.archivedIds.length;
				const requested = result.approvalRequestedIds.length;
				toastStore.success(
					[
						archived > 0 && `${archived} personnel archived`,
						requested > 0 &&
							`${requested} archival ${requested === 1 ? 'request' : 'requests'} submitted for admin approval`
					]
						.filter(Boolean)
						.join(' · '),
					ARCHIVE_UNDO_MS,
					archiveUndoAction(orgId, result.undo, isCurrent, onrestored)
				);
			} else {
				if (result.archivedIds.length > 0) toastStore.success(`${result.archivedIds.length} personnel archived`);
				if (result.approvalRequestedIds.length > 0) {
					toastStore.info(`${result.approvalRequestedIds.length} archival requests submitted for admin approval.`);
				}
			}
			if (result.errors.length > 0) {
				toastStore.error(`${result.errors.length} personnel could not be archived. Retry the selected personnel.`);
			}
			if (skipped > 0) toastStore.info(`${count(skipped)} you cannot archive were skipped.`);
			if (result.archivedIds.length > 0 || result.approvalRequestedIds.length > 0) {
				try {
					await invalidate('app:personnel-data');
				} catch {
					if (isCurrent())
						toastStore.warning(
							'Archive results were saved, but the roster could not be refreshed. Refresh to check the latest roster.'
						);
				}
			}
		} catch {
			if (isCurrent()) {
				confirmingArchive = false;
				toastStore.error(
					'Archive results could not be confirmed. Refresh to check the roster, then retry the selected personnel if needed.'
				);
			}
		} finally {
			if (isCurrent()) busy = false;
		}
	}

	const archiveMessage = $derived(
		[
			`Archive ${archivable.length} personnel? They will leave active rosters, calendars, and reports. Records are not erased, and some archives may require approval.`,
			hidden.count > 0 &&
				`This includes ${count(hidden.count)} your ${hidden.by} ${hidden.by === 'search and filter' ? 'hide' : 'hides'}.`,
			people.length > archivable.length &&
				`${count(people.length - archivable.length)} you cannot archive will be skipped.`
		]
			.filter(Boolean)
			.join(' ')
	);
</script>

<div
	role="toolbar"
	aria-label="Selected people"
	data-roster-bulk-bar
	class="flex h-13 max-w-full items-center gap-1.5 rounded-md border border-chrome-border bg-chrome pr-2 pl-4.5 text-chrome-text shadow-xl @max-3xl/roster:gap-0 @max-3xl/roster:pl-3"
>
	<span
		class="pr-1.5 text-[15px] leading-[18px] font-semibold whitespace-nowrap @max-3xl/roster:leading-4 @max-3xl/roster:whitespace-normal"
		aria-live="polite"
	>
		{people.length} selected
		{#if hidden.count > 0}
			<span
				class="font-normal whitespace-nowrap text-chrome-text-muted @max-3xl/roster:block @max-3xl/roster:text-[13px] @max-3xl/roster:leading-4"
			>
				<span class="@max-3xl/roster:hidden" aria-hidden="true">·</span>
				{hidden.count} hidden
				<span class="@max-3xl/roster:sr-only">by {hidden.by}</span>
			</span>
		{/if}
	</span>
	<span class="h-5.5 w-px shrink-0 bg-chrome-border" aria-hidden="true"></span>
	{#if writable.length > 0}
		<Button
			type="button"
			variant="accent"
			size="lg"
			disabled={busy}
			title="Follow-up for each"
			onclick={() => oncompose('follow-up')}
		>
			<SquareCheckIcon aria-hidden="true" /><span class="@max-3xl/roster:sr-only">Follow-up for each</span>
		</Button>
		<Button type="button" variant="ghost" size="lg" disabled={busy} title="Add note" onclick={() => oncompose('note')}>
			<MessageSquarePlusIcon class="@3xl/roster:hidden" aria-hidden="true" /><span class="@max-3xl/roster:sr-only"
				>Add note</span
			>
		</Button>
		<Button
			type="button"
			variant="ghost"
			size="lg"
			disabled={busy}
			title="Set field…"
			onclick={() => (fieldTargets = { people: writable, notEditable: people.length - writable.length })}
		>
			<PencilLineIcon class="@3xl/roster:hidden" aria-hidden="true" /><span class="@max-3xl/roster:sr-only"
				>Set field…</span
			>
		</Button>
		{#if moveTargets.length > 0}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger disabled={busy}>
					{#snippet child({ props })}
						<Button {...props} type="button" variant="ghost" size="lg" title="Move to Group">
							<FolderInputIcon class="@3xl/roster:hidden" aria-hidden="true" /><span class="@max-3xl/roster:sr-only"
								>Move to Group</span
							><ChevronDownIcon class="size-3 @max-3xl/roster:hidden" aria-hidden="true" />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content side="top" align="start" class="max-h-80">
					<DropdownMenu.Label>Move {count(writable.length)} to</DropdownMenu.Label>
					{#each moveTargets as target (target.id ?? '')}
						<DropdownMenu.Item
							class={indent[target.level] ?? 'pl-10'}
							aria-label={target.path}
							onSelect={() => void moveTo(target)}>{target.name}</DropdownMenu.Item
						>
					{/each}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{/if}
	{/if}
	{#if exportable.length > 0}
		<Button type="button" variant="ghost" size="lg" disabled={busy} title="Export" onclick={exportSelected}>
			<DownloadIcon class="@3xl/roster:hidden" aria-hidden="true" /><span class="@max-3xl/roster:sr-only">Export</span>
		</Button>
	{/if}
	{#if archivable.length > 0}
		<Button
			type="button"
			variant="ghost"
			size="lg"
			class="ml-2 @max-3xl/roster:ml-0"
			disabled={busy}
			title="Archive…"
			onclick={() => (confirmingArchive = true)}
		>
			<ArchiveIcon class="@3xl/roster:hidden" aria-hidden="true" /><span class="@max-3xl/roster:sr-only">Archive…</span>
		</Button>
	{/if}
	<span class="h-5.5 w-px shrink-0 bg-chrome-border" aria-hidden="true"></span>
	<Button
		type="button"
		variant="ghost"
		size="icon-lg"
		aria-label="Clear selection"
		title="Clear selection (Esc)"
		onclick={onclear}
	>
		<XIcon class="text-chrome-text-muted" aria-hidden="true" />
	</Button>
</div>

{#if confirmingArchive}
	{#await import('$lib/components/ui/confirm-dialog') then { ConfirmDialog }}
		<ConfirmDialog
			title="Archive Personnel"
			message={archiveMessage}
			confirmLabel="Archive"
			variant="default"
			loading={busy}
			onConfirm={archiveSelected}
			onCancel={() => (confirmingArchive = false)}
		/>
	{/await}
{/if}

{#if fieldTargets}
	{#await import('./PersonnelFieldDialog.svelte') then { default: PersonnelFieldDialog }}
		<PersonnelFieldDialog
			people={fieldTargets.people}
			notEditable={fieldTargets.notEditable}
			rankCodes={rankOptionsFor(ctx.data.rankCatalog ?? []).map((option) => option.value)}
			onsave={setField}
			ondone={fieldSaved}
			onclose={() => (fieldTargets = null)}
		/>
	{/await}
{/if}
