<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import XIcon from '@lucide/svelte/icons/x';
	import type { PersonnelLookup } from '$features/personnel/contracts';
	import type { EvalType } from '../rating-scheme.types';
	import { evalStatusBadge } from '../utils/evalStatusBadge';
	import {
		applyRatedPersonToLineDraft,
		buildRatingSchemeLineValues,
		createRatingSchemeLineDraft,
		missingLineFields,
		planRatingSchemeLineSave,
		type RatingSchemeLineSave,
		type RatingSchemeLineRequiredField
	} from '../utils/ratingSchemeLineDraft';
	import { spokenPersonLabel } from '../utils/personLabel';
	import type { RatingSchemeLine } from '../utils/ratingSchemeLines';
	import {
		removeIntermediateRaterFromDraft,
		removeReviewerFromDraft,
		type EvaluatorDraft
	} from '../utils/ratingSchemeEntryDraft';
	import EvalStatusBadge from './EvalStatusBadge.svelte';
	import EvaluatorField from './EvaluatorField.svelte';
	import * as Alert from '$lib/components/ui/alert';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import * as Combobox from '$lib/components/ui/combobox';
	import * as Field from '$lib/components/ui/field';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { Spinner } from '$lib/components/ui/spinner';
	import { toastStore } from '$lib/stores/toast.svelte';

	interface Props {
		orgId: string;
		/** The line as the stores hold it now; null adds a new line. */
		line: RatingSchemeLine | null;
		personnel: PersonnelLookup[];
		/** People who already have a listed scheme; a new line is for someone else. */
		listedPersonIds: ReadonlySet<string>;
		isCurrentWorkspace: () => boolean;
		onSave: (save: RatingSchemeLineSave, isCurrent: () => boolean) => Promise<void>;
		/** Resolves once the scheme was archived or restored. */
		onArchive: (ratingSchemeId: string, archived: boolean, isCurrent: () => boolean) => Promise<void>;
		onChangeRater: (line: RatingSchemeLine) => void;
		onClose: () => void;
	}

	let {
		orgId,
		line,
		personnel,
		listedPersonIds,
		isCurrentWorkspace,
		onSave,
		onArchive,
		onChangeRater,
		onClose
	}: Props = $props();
	let disposed = false;
	onDestroy(() => {
		disposed = true;
	});
	const isCurrent = () => !disposed && isCurrentWorkspace();

	function opened(): RatingSchemeLine | null {
		return line;
	}
	const openedDraft = createRatingSchemeLineDraft(opened());
	const openedValues = buildRatingSchemeLineValues(openedDraft);
	let draft = $state(createRatingSchemeLineDraft(opened()));
	const pristine = JSON.stringify(openedDraft);
	let saveAttempted = $state(false);
	let saving = $state(false);
	let saveError = $state('');
	let archiving = $state(false);
	let archiveError = $state('');
	const busy = $derived(saving || archiving);
	const dirty = $derived(JSON.stringify(draft) !== pristine);

	const missing = $derived(saveAttempted ? missingLineFields(draft) : []);
	const raterLocked = $derived(line !== null && line.open !== null);
	const archived = $derived(line?.archivedAt != null);
	const badge = $derived(line ? evalStatusBadge(line.open) : null);

	const people = $derived(
		[...personnel].sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
	);
	const personnelOptions = $derived(
		people.map((person) => ({ value: person.id, label: `${person.rank} ${person.lastName}, ${person.firstName}` }))
	);
	const ratedOptions = $derived(personnelOptions.filter((option) => !listedPersonIds.has(option.value)));
	const ratedPerson = $derived(personnel.find((person) => person.id === (line?.ratedPersonId ?? draft.ratedPersonId)));
	const ratedName = $derived(ratedPerson ? `${ratedPerson.rank} ${ratedPerson.lastName}` : 'this Soldier');
	const seniorLabel = $derived.by(() => {
		if (!line) return '';
		const person = personnel.find((candidate) => candidate.id === line.seniorRaterPersonId);
		return person ? `${person.rank} ${person.lastName}` : (line.seniorRaterName ?? '');
	});
	const raterName = $derived.by(() => {
		if (draft.rater.kind === 'person') {
			const personId = draft.rater.personId;
			const person = personnel.find((candidate) => candidate.id === personId);
			return person ? spokenPersonLabel(person) : 'Unknown';
		}
		return draft.rater.kind === 'external' ? draft.rater.name : 'Not set';
	});

	const fieldIds: Record<RatingSchemeLineRequiredField, string> = {
		ratedPerson: 'line-rated-soldier',
		rater: 'line-rater',
		seniorRater: 'line-senior-rater'
	};

	function failure(error: unknown, fallback: string): string {
		return error instanceof Error && error.message.trim() ? error.message : fallback;
	}

	async function save() {
		saveAttempted = true;
		if (busy || !isCurrent()) return;
		const absent = missingLineFields(draft);
		if (absent.length) {
			await tick();
			if (isCurrent()) document.getElementById(fieldIds[absent[0]])?.focus();
			return;
		}
		const values = buildRatingSchemeLineValues(draft);
		const patch = line ? planRatingSchemeLineSave(openedValues, values) : null;
		if (line && !patch) {
			onClose();
			return;
		}
		saveError = '';
		saving = true;
		try {
			await onSave(patch ? { kind: 'update', patch } : { kind: 'create', values }, isCurrent);
			if (!isCurrent()) return;
			toastStore.success(line ? 'Rating scheme line updated' : 'Added to the rating scheme');
			onClose();
		} catch (error) {
			if (isCurrent()) saveError = failure(error, line ? 'Failed to update the line' : 'Failed to add to the scheme');
		} finally {
			if (isCurrent()) saving = false;
		}
	}

	async function toggleArchive() {
		if (!line || busy || !isCurrent()) return;
		const next = !archived;
		archiveError = '';
		archiving = true;
		try {
			await onArchive(line.id, next, isCurrent);
		} catch (error) {
			if (isCurrent()) {
				archiveError = failure(
					error,
					next ? 'The rating scheme was not archived. Try again.' : 'The rating scheme was not restored. Try again.'
				);
			}
		} finally {
			if (isCurrent()) archiving = false;
		}
	}

	function ratedSoldierChanged(value: string | string[]) {
		if (Array.isArray(value)) return;
		draft.ratedPersonId = value;
		applyRatedPersonToLineDraft(draft, personnel);
	}

	const evalTypes: EvalType[] = ['OER', 'NCOER', 'WOER'];
</script>

{#snippet sectionTitle(title: string)}
	<h3 class="font-mono text-[0.6875rem] leading-3.5 font-medium tracking-[0.08em] text-muted-foreground uppercase">
		{title}
	</h3>
{/snippet}

{#snippet chainRow(
	label: string,
	id: string,
	evaluator: EvaluatorDraft,
	onChange: (next: EvaluatorDraft) => void,
	required?: RatingSchemeLineRequiredField,
	onRemove?: () => void
)}
	<Field.Root class="gap-1.5 sm:grid sm:grid-cols-[110px_minmax(0,1fr)] sm:items-start sm:gap-x-3">
		<Field.Label for={id} class="text-sm font-medium sm:h-9 sm:items-center">{label}</Field.Label>
		<div class="grid gap-1.5">
			<div class="flex items-center gap-1.5">
				<div class="min-w-0 flex-1">
					<EvaluatorField {id} {label} value={evaluator} people={personnelOptions} {onChange} class="h-9" />
				</div>
				{#if onRemove}
					<Button variant="ghost" size="icon-sm" aria-label="Remove {label.toLowerCase()}" onclick={onRemove}>
						<XIcon aria-hidden="true" />
					</Button>
				{/if}
			</div>
			{#if required && missing.includes(required)}<Field.Error>{label} is required.</Field.Error>{/if}
		</div>
	</Field.Root>
{/snippet}

<AppDialog.Root open {busy} closeBlocked={dirty} {onClose}>
	<AppDialog.Content presentation="sheet" size="wide">
		<AppDialog.Header
			class="gap-2 border-b px-7 pt-7 pb-5"
			eyebrow={line ? `Rating scheme line · SR ${seniorLabel || 'Not set'}` : 'New rating scheme line'}
		>
			<AppDialog.Title class="font-heading text-[34px] leading-[34px] font-extrabold uppercase">
				{#if line}
					{ratedPerson ? spokenPersonLabel(ratedPerson) : 'Unknown'}
				{:else}
					Add to scheme
				{/if}
			</AppDialog.Title>
			<AppDialog.Description class="flex flex-wrap items-center gap-x-2.5 gap-y-2 text-sm">
				{#if line && badge}
					<EvalStatusBadge {badge} />
					<a
						href="/org/{orgId}/evals?entry={badge.evaluationId}"
						class="rounded-sm text-[13px] underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
					>
						Open in Eval Tracker ›
					</a>
				{:else if line}
					{archived ? 'Archived. Off the rating scheme.' : 'No open evaluation.'}
				{:else}
					Pick the Soldier first. Eval type comes from their rank.
				{/if}
			</AppDialog.Description>
		</AppDialog.Header>

		<AppDialog.Body class="p-0">
			<fieldset class="contents" disabled={busy}>
				{#if !line}
					<section class="grid gap-3 border-b px-7 py-5.5">
						{@render sectionTitle('Rated Soldier')}
						<Field.Root>
							<Field.Label for={fieldIds.ratedPerson} class="sr-only">Rated Soldier</Field.Label>
							<Combobox.Root
								items={ratedOptions}
								bind:value={draft.ratedPersonId}
								label="Rated Soldier"
								autoHighlight
								onValueChange={ratedSoldierChanged}
							>
								<Combobox.Trigger id={fieldIds.ratedPerson} class="h-9" clearable placeholder="Search personnel..." />
								<Combobox.Content>
									<Combobox.Search placeholder="Search personnel..." />
									<Combobox.Empty>No one left to add.</Combobox.Empty>
									<Combobox.List />
								</Combobox.Content>
							</Combobox.Root>
							{#if missing.includes('ratedPerson')}<Field.Error>Rated Soldier is required.</Field.Error>{/if}
						</Field.Root>
					</section>
				{/if}

				<section class="grid gap-3 border-b px-7 py-5.5">
					{@render sectionTitle('Rating chain')}
					{#if raterLocked && line}
						<Field.Root class="gap-1.5 sm:grid sm:grid-cols-[110px_minmax(0,1fr)] sm:items-start sm:gap-x-3">
							<Field.Title class="text-sm font-medium sm:h-9 sm:items-center">Rater</Field.Title>
							<div class="flex items-center gap-2">
								<p
									class="flex h-9 min-w-0 flex-1 items-center truncate rounded-md border bg-muted px-2.5 text-sm"
									aria-label="Rater, locked while an evaluation is open"
								>
									{raterName}
								</p>
								<Button variant="outline" size="sm" disabled={busy || dirty} onclick={() => onChangeRater(line)}>
									Change rater
								</Button>
							</div>
						</Field.Root>
					{:else}
						{@render chainRow('Rater', fieldIds.rater, draft.rater, (next) => (draft.rater = next), 'rater')}
					{/if}
					{#if draft.showIntermediate}
						{@render chainRow(
							'Intermediate',
							'line-intermediate-rater',
							draft.intermediateRater,
							(next) => (draft.intermediateRater = next),
							undefined,
							() => removeIntermediateRaterFromDraft(draft)
						)}
					{/if}
					{@render chainRow(
						'Senior rater',
						fieldIds.seniorRater,
						draft.seniorRater,
						(next) => (draft.seniorRater = next),
						'seniorRater'
					)}
					{#if draft.showReviewer}
						{@render chainRow(
							'Reviewer',
							'line-reviewer',
							draft.reviewer,
							(next) => (draft.reviewer = next),
							undefined,
							() => removeReviewerFromDraft(draft)
						)}
					{/if}
					<p class="text-[13px] text-muted-foreground sm:pl-[122px]">
						Search the unit, or type a name that isn't in it to add an external rater.
					</p>
					{#if !draft.showIntermediate || !draft.showReviewer}
						<div class="flex flex-wrap gap-x-4 gap-y-1 sm:pl-[122px]">
							{#if !draft.showIntermediate}
								<Button
									variant="link"
									size="none"
									class="text-sm underline"
									onclick={() => (draft.showIntermediate = true)}
								>
									+ Intermediate rater
								</Button>
							{/if}
							{#if !draft.showReviewer}
								<Button
									variant="link"
									size="none"
									class="text-sm underline"
									onclick={() => (draft.showReviewer = true)}
								>
									+ Reviewer
								</Button>
							{/if}
						</div>
					{/if}
					{#if raterLocked}
						<div class="rounded-md border border-info/25 bg-info/8 px-3 py-2.5 text-[13px] leading-[18px]" role="note">
							{ratedName} has an open evaluation. Chain edits apply to it now. The rater changes only through Change rater,
							which closes it as a Change of Rater report.
						</div>
					{/if}
				</section>

				<section class="grid gap-2.5 border-b px-7 py-5.5">
					{@render sectionTitle('Eval type')}
					<ToggleGroup.Root
						type="single"
						class="w-full"
						aria-label="Eval type"
						bind:value={
							() => draft.evalType,
							(value) => {
								if (value) draft.evalType = value as EvalType;
							}
						}
					>
						{#each evalTypes as option (option)}
							<ToggleGroup.Item value={option} class="flex-1">{option}</ToggleGroup.Item>
						{/each}
					</ToggleGroup.Root>
					<p class="text-[13px] leading-[18px] text-muted-foreground">
						Comes from rank. Each new evaluation starts with this type.
					</p>
				</section>

				{#if line}
					<section class="grid gap-2.5 border-b px-7 py-5.5" aria-labelledby="scheme-listing">
						{@render sectionTitle('Rating scheme')}
						<div class="flex items-center gap-4">
							<div class="grid min-w-0 flex-1 gap-0.5">
								<p id="scheme-listing" class="text-sm font-semibold">
									{archived ? 'Archived' : 'On the rating scheme'}
								</p>
								<p class="text-[13px] leading-[18px] text-muted-foreground">
									{#if archived}
										Off the rating scheme. Restore to list {ratedName} again.
									{:else if line.open}
										Archive when {ratedName} leaves the unit. The open evaluation stays on Eval Tracker until it completes.
									{:else}
										Archive when {ratedName} leaves the unit.
									{/if}
								</p>
							</div>
							<Button variant="outline" size="sm" disabled={busy} onclick={toggleArchive}>
								{#if archiving}<Spinner />{/if}
								{archived ? 'Restore' : 'Archive'}
							</Button>
						</div>
						{#if archiveError}
							<Alert.Root variant="destructive" role="alert">
								<Alert.Title>The listing did not change</Alert.Title>
								<Alert.Description>{archiveError}</Alert.Description>
							</Alert.Root>
						{/if}
					</section>
				{/if}

				<section class="grid gap-2 px-7 py-5.5">
					<Field.Root>
						<div class="flex justify-between">
							<Field.Label for="line-notes">Notes</Field.Label>
							<span class="text-[13px] text-muted-foreground">Optional</span>
						</div>
						<Textarea
							id="line-notes"
							rows={3}
							bind:value={draft.notes}
							placeholder="Anything the next reader should know"
						/>
					</Field.Root>
				</section>
			</fieldset>
		</AppDialog.Body>

		{#if saveError}
			<Alert.Root variant="destructive" class="mx-7 mb-3 w-auto" role="alert">
				<Alert.Title>The line was not saved</Alert.Title>
				<Alert.Description>{saveError}</Alert.Description>
			</Alert.Root>
		{/if}

		<AppDialog.Footer class="items-center justify-end gap-2 border-t px-7 py-4">
			<Button variant="outline" onclick={onClose} disabled={busy}>Cancel</Button>
			<Button disabled={busy} onclick={save}>
				{#if saving}<Spinner />{/if}
				{line ? 'Save changes' : 'Add to scheme'}
			</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
