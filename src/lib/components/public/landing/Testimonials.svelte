<script lang="ts">
	import { fadeUp, reveal } from './reveal';
	import PublicSection from '../PublicSection.svelte';
	import { body, display, monoLabel } from '../layout';

	const quotes = [
		{
			text: 'There are so many times in my career that I could really have benefited from this website.',
			source: 'CPT · FORT WAINWRIGHT'
		},
		{
			text: "It's like I have a cheat code. I went from spending half my day on administrative tasks to nearly all my day with the Soldiers.",
			source: 'SFC · FORT BLISS'
		}
	];
</script>

<PublicSection tone="dark" class="gap-16 lg:gap-16">
	<div class="flex flex-col gap-16" {@attach reveal}>
		<h2 class="sr-only">From leaders using TroopToTask</h2>
		<figure class={[fadeUp, 'flex flex-col gap-8']}>
			<blockquote class={[display, 'max-w-[1180px]']}>
				“IT REALLY FEELS LIKE OUR COMPANY'S MEDPROS AND TRAINING DELINQUENCIES
				<span class="block text-chrome-accent">DISAPPEARED OVERNIGHT.”</span>
			</blockquote>
			<figcaption class={[monoLabel, 'text-chrome-text-muted']}>COMPANY LEADERSHIP · GRAFENWÖHR, GERMANY</figcaption>
		</figure>
		<div class="grid gap-12 border-t border-chrome-border pt-10 md:grid-cols-2 md:gap-20">
			{#each quotes as quote, i (quote.source)}
				<figure class={[fadeUp, 'flex max-w-[560px] flex-col gap-4']} style:transition-delay="{200 + i * 120}ms">
					<blockquote class={body}>“{quote.text}”</blockquote>
					<figcaption class={[monoLabel, 'text-chrome-text-muted']}>{quote.source}</figcaption>
				</figure>
			{/each}
		</div>
	</div>
</PublicSection>
