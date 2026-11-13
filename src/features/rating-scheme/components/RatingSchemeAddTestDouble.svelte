<script lang="ts">
	import type { RatingSchemeEntrySaveData } from '$features/rating-scheme/utils/ratingSchemeEntryDraft';

	let { onSave }: { onSave: (data: RatingSchemeEntrySaveData, isCurrent: () => boolean) => Promise<void> } = $props();

	const data: RatingSchemeEntrySaveData = {
		ratedPersonId: 'rated-1',
		evalType: 'NCOER',
		raterPersonId: 'rater-2',
		raterName: null,
		seniorRaterPersonId: 'senior-1',
		seniorRaterName: null,
		intermediateRaterPersonId: null,
		intermediateRaterName: null,
		reviewerPersonId: null,
		reviewerName: null,
		ratingPeriodStart: '2027-01-01',
		ratingPeriodEnd: '2027-12-31',
		reportType: 'AN',
		notes: null
	};
	let error = $state('');
</script>

<button type="button" onclick={() => onSave(data, () => true).catch((failure: Error) => (error = failure.message))}
	>Add entry</button
>
{#if error}<p role="alert">{error}</p>{/if}
