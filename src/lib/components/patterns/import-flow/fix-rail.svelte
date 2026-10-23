<script lang="ts">
	import type { FlowSession } from './flowTypes';
	import type { QuestionKey } from './types';
	import RailQuestion from './rail-question.svelte';

	let {
		session,
		onCreate
	}: {
		session: FlowSession;
		onCreate: (key: QuestionKey, name: string) => Promise<{ refused: string } | null>;
	} = $props();

	const questions = $derived(session.review.questions);
</script>

{#if questions.length}
	<aside class="grid grid-cols-1 content-start gap-3" aria-labelledby="import-rail-heading">
		<h2
			id="import-rail-heading"
			class="font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase"
		>
			Fix once, apply to every row
		</h2>
		{#each questions as question (question.key)}
			<RailQuestion
				{question}
				noun={(question.reference && session.lane.references[question.reference]?.label) || 'value'}
				creating={session.creating.has(question.key)}
				onAnswer={(answer) => session.answer(question.key, answer)}
				onCreate={(name) => onCreate(question.key, name)}
			/>
		{/each}
	</aside>
{/if}
