<script lang="ts">
	import { ease, fadeUp, reveal } from './reveal';
	import PublicHeading from '../PublicHeading.svelte';
	import PublicSection from '../PublicSection.svelte';
	import { body, subhead } from '../layout';

	const trades = [
		{ chore: 'Reconciling three leave trackers', instead: 'On the range with their squad.' },
		{ chore: 'Rebuilding the training meeting slides', instead: 'Counseling a Soldier.' },
		{ chore: 'Texting around to find who has CQ', instead: 'In the motor pool.' },
		{ chore: 'Chasing expired training one name at a time', instead: 'Running the training itself.' },
		{ chore: 'Re-copying an in-processing checklist', instead: 'Sponsoring the new arrival.' }
	];
</script>

<PublicSection tone="dark" class="gap-16 lg:gap-20">
	<PublicHeading lines={['ADMIN TIME', 'IS SOLDIER TIME.']} tone="dark">
		Every hour spent reconciling trackers comes out of the same duty day as training, counseling and maintenance. Hand
		the bookkeeping to TroopToTask and the hour goes back to the formation.
	</PublicHeading>
	<ul class="m-0 list-none border-t border-chrome-border p-0" {@attach reveal}>
		{#each trades as trade, i (trade.chore)}
			<li
				class={[
					fadeUp,
					'grid gap-x-6 gap-y-2 border-b border-chrome-border py-5 lg:min-h-22 lg:grid-cols-[minmax(0,560px)_56px_minmax(0,1fr)] lg:items-center lg:py-4'
				]}
				style:transition-delay="{i * 100}ms"
			>
				<s
					class={[
						body,
						'text-chrome-text-muted line-through decoration-chrome-text-muted decoration-1 transition-[text-decoration-color] duration-500 in-data-[reveal=pending]:decoration-transparent',
						ease
					]}
					style:transition-delay="{400 + i * 100}ms"
				>
					<span class="sr-only">Instead of </span>{trade.chore}
				</s>
				<span class="hidden font-mono text-lg leading-[1.375rem] text-chrome-accent lg:block" aria-hidden="true">→</span
				>
				<p class={[subhead, 'm-0 text-chrome-text']}><span class="sr-only">they are </span>{trade.instead}</p>
			</li>
		{/each}
	</ul>
</PublicSection>
