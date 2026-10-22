<script lang="ts">
	import type { Component } from 'svelte';
	import type { Personnel } from '$features/personnel/contracts';
	import { recordTrainingCompletions, type TrainingType } from '$features/training';
	import type { TrainingBatchRecord } from '$features/training/contracts';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import { actionablePersonnel } from '../../sections/dashboardAccess';
	import type { NeedsYouPanelProps } from '../../sections/needsYou';

	type RecordClassDialog = Component<{
		trainingType: TrainingType;
		people: readonly Personnel[];
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

	function onSave(records: TrainingBatchRecord[]) {
		return save(async () => {
			const result = await recordTrainingCompletions(orgId, records);
			const saved = [...result.inserted, ...result.updated];
			// Only a record now current takes its Person off the expired row; an old completion date can stay expired.
			const current = saved
				.filter((record) => record.expirationDate === null || record.expirationDate >= today)
				.map((record) => record.personnelId);
			if (current.length > 0) {
				updates.putRecord(orgId, {
					list: 'trainingCompletions',
					trainingTypeId: trainingType.id,
					personnelIds: current
				});
			}
			if (saved.length > 0) updates.refreshSummary();
			if (result.errors.length > 0) {
				const failed = result.errors.map((error) => {
					const person = recordable.find((candidate) => candidate.id === records[error.index]?.personnelId);
					return person ? `${person.lastName}: ${error.message}` : error.message;
				});
				throw new Error(`${result.errors.length} not recorded. ${failed.join('; ')}`);
			}
		});
	}
</script>

<Dialog {trainingType} people={recordable} {today} {onSave} onClose={close} />
