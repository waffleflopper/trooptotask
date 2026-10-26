<script lang="ts">
	import { ease, fadeUp, reveal } from './reveal';
	import PublicHeading from '../PublicHeading.svelte';
	import PublicSection from '../PublicSection.svelte';
	import { body, monoLabel } from '../layout';
</script>

<PublicSection tone="dark" class="gap-16 lg:gap-20">
	<PublicHeading label="WHY IT MATTERS" lines={['HALF A DUTY DAY,', 'GIVEN BACK.']} tone="dark" />
	<div class="flex flex-col gap-16 lg:flex-row lg:items-end lg:gap-20" {@attach reveal}>
		<figure class={[fadeUp, 'flex grow flex-col gap-10']}>
			<figcaption
				class="flex flex-col gap-3 border-b border-chrome-border pb-3 sm:flex-row sm:items-center sm:justify-between"
			>
				<span class={[monoLabel, 'text-chrome-text-muted']}>ONE LEADER'S DUTY DAY, IN THEIR WORDS</span>
				<span class="flex items-center gap-6">
					<span class={[monoLabel, 'flex items-center gap-2 text-chrome-text-muted']}>
						<span class="size-2 shrink-0 bg-chrome-surface-muted" aria-hidden="true"></span>ADMIN
					</span>
					<span class={[monoLabel, 'flex items-center gap-2 text-chrome-text-muted']}>
						<span class="size-2 shrink-0 bg-chrome-accent" aria-hidden="true"></span>WITH SOLDIERS
					</span>
				</span>
			</figcaption>
			<div class="flex flex-col gap-3">
				<div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
					<span class={[monoLabel, 'text-chrome-text-muted']}>BEFORE</span>
					<q class="font-body text-lg leading-[1.375rem] font-light text-chrome-text-muted italic">
						half my day on administrative tasks
					</q>
				</div>
				<div class="flex h-10 gap-0.5" aria-hidden="true">
					<div class="w-1/2 bg-chrome-surface-muted"></div>
					<div class="grow bg-chrome-accent/45"></div>
				</div>
			</div>
			<div class="flex flex-col gap-3">
				<div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
					<span class={monoLabel}>WITH TROOPTOTASK</span>
					<q class="font-body text-lg leading-[1.375rem] font-light italic">nearly all my day with the Soldiers</q>
				</div>
				<div class="flex h-10 gap-0.5" aria-hidden="true">
					<div
						class={[
							'w-[8%] bg-chrome-surface-muted transition-[width] delay-500 duration-[1400ms] in-data-[reveal=pending]:w-1/2',
							ease
						]}
					></div>
					<div class="grow bg-chrome-accent"></div>
				</div>
			</div>
			<div
				class="flex justify-between font-mono text-[0.8125rem] leading-4 font-normal text-chrome-text-muted"
				aria-hidden="true"
			>
				<span>0600</span><span>1200</span><span>1800</span>
			</div>
		</figure>
		<blockquote
			class={[fadeUp, 'flex shrink-0 flex-col gap-6 border-l-2 border-chrome-accent pl-8 delay-200 lg:w-[400px]']}
		>
			<p class={body}>
				Every hour a leader is not reconciling trackers is an hour on the range, in the motor pool or counseling a
				Soldier. That is readiness.
			</p>
			<footer class={[monoLabel, 'text-chrome-text-muted']}>WORDS · SFC, 1-43 ADA</footer>
		</blockquote>
	</div>
</PublicSection>
