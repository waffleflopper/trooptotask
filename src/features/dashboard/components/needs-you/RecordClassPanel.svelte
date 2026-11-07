<script lang="ts">
	import type { Component } from 'svelte';
	import type { Personnel } from '$features/personnel/contracts';
	import {
		batchFailureMessage,
		getTrainingStatus,
		recordTrainingCompletions,
		type TrainingType
	} from '$features/training';
	import type { RecordClassCandidate, TrainingBatchRecord } from '$features/training/contracts';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import { actionablePersonnel } from '../../sections/dashboardAccess';
	import type { NeedsYouPanelProps } from '../../sections/needsYou';

	type RecordClassDialog = Component<{
		trainingType: TrainingType;
		candidates: readonly RecordClassCandidate[];
		today: string;
		onSave: (records: TrainingBatchRecord[]) => Promise<void>;
		onClose: () => void;
	}>;

	let {
		access,
		updates,
		save,
		close,
		orgId,
		trainingType,
		people,
		today,
		Dialog
	}: NeedsYouPanelProps & {
		orgId: string;
		trainingType: TrainingType;
		people: readonly Personnel[];
		today: string;
		Dialog: RecordClassDialog;
	} = $props();

	// The row lists everyone expired in scope; the dialog offers only those the viewer can record for.
	const recordable = $derived(actionablePersonnel(people, access, POLICY_ACTION_CATALOG.training.recordCompletions));
	const candidates = $derived(recordable.map((person) => ({ person, statusLabel: null, checked: true })));

	function onSave(records: TrainingBatchRecord[]) {
		return save(async () => {
			const result = await recordTrainingCompletions(orgId, records);
			const byId = new Map(recordable.map((person) => [person.id, person]));
			// An old completion date can leave a Person expired or due soon, so each row follows the status it now has.
			const saved = [...result.inserted, ...result.updated].flatMap((record) => {
				const person = byId.get(record.personnelId);
				return person
					? [{ personnelId: person.id, status: getTrainingStatus(record, trainingType, person, today).status }]
					: [];
			});
			if (saved.length > 0) {
				updates.putRecord(orgId, { list: 'trainingCompletions', trainingTypeId: trainingType.id, saved });
				updates.refreshSummary();
			}
			if (result.errors.length > 0) throw new Error(batchFailureMessage(records, result.errors, recordable));
		});
	}
</script>

<Dialog {trainingType} {candidates} {today} {onSave} onClose={close} />
