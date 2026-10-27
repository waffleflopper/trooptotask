<script lang="ts" module>
	import type { ComponentProps } from 'svelte';
	import SetupStepFooter from './SetupStepFooter.svelte';

	export type SetupFooterProps = ComponentProps<typeof SetupStepFooter>;
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as RadioGroup from '$lib/components/ui/radio-group/index.js';
	import { FEATURE_SWITCHES } from '$lib/access/featureSwitches';
	import { FEATURE_ROWS } from '../featuresSettings';
	import { SETUP_STEPS } from './registry';
	import { getSetupFlow } from './setupFlow.svelte';

	type Choice = 'now' | 'later' | 'off';

	let {
		setUpHint,
		laterHint,
		setUp,
		footer = {}
	}: {
		/** What Set it up now leads to on this step. */
		setUpHint: string;
		/** What Later leaves in place on this step. */
		laterHint: string;
		/** The step's editor or entry point, shown while Set it up now is chosen and the feature is on. */
		setUp: Snippet;
		/** The footer while Set it up now is chosen and the feature is on. */
		footer?: SetupFooterProps;
	} = $props();

	const flow = getSetupFlow();
	const id = $props.id();
	const step = untrack(() => SETUP_STEPS.find((entry) => entry.key === flow.current?.key)!);
	const feature = step.featureSwitch!;
	const label = FEATURE_SWITCHES[feature].label;
	const row = FEATURE_ROWS.find((entry) => entry.key === feature)!;

	const consequences = [
		['On', row.description],
		['Off', row.offDescription],
		['Reversible', 'Turn it back on any time in Settings › Features. This step stays in the list, marked Off.']
	] as const;

	const off = $derived(flow.isFeatureOff(feature));
	const earlier = (): Choice => (flow.state.answers[step.key] === 'later' ? 'later' : 'now');
	let choice = $state<Choice>(untrack(() => (flow.isFeatureOff(feature) ? 'off' : earlier())));

	const choices: { value: Choice; title: string; hint: () => string }[] = [
		{ value: 'now', title: 'Set it up now', hint: () => setUpHint },
		{ value: 'later', title: 'Later', hint: () => laterHint },
		{
			value: 'off',
			title: 'We won’t use it',
			hint: () => `Turns ${label} off for everyone. Records are kept, and you can turn it back on in Settings.`
		}
	];

	const activeFooter = $derived.by((): SetupFooterProps => {
		if (choice === 'now') return off ? {} : footer;
		if (choice === 'later') {
			if (!off) return { save: () => flow.answer(step.key, 'later'), note: `${label} stays on` };
			return {
				save: async () => {
					if (await flow.switchFeature(feature, true)) await flow.answer(step.key, 'later');
				},
				continueLabel: `Turn on ${label} and continue`
			};
		}
		if (off) return {};
		return {
			save: async () => {
				await flow.switchFeature(feature, false);
			},
			continueLabel: `Turn off ${label} and continue`,
			note: 'No data is removed'
		};
	});

	async function turnOn() {
		await flow.turnFeatureOn(feature);
		if (!flow.isFeatureOff(feature) && choice === 'off') choice = earlier();
	}
</script>

{#snippet turnOnButton()}
	<Button variant="outline" class="self-start" disabled={flow.pending} onclick={turnOn}>Turn {label} back on</Button>
{/snippet}

<section class="flex flex-col gap-2 lg:gap-3.5" aria-labelledby="{id}-question">
	<h2 id="{id}-question" class="font-heading text-xl leading-6 font-bold lg:text-[22px] lg:leading-[26px]">
		Will your unit use {label}?
	</h2>
	<RadioGroup.Root
		aria-labelledby="{id}-question"
		class="grid-cols-1 gap-2 lg:grid-cols-3 lg:gap-3"
		bind:value={() => choice, (next) => (choice = next as Choice)}
	>
		{#each choices as option (option.value)}
			<label
				class="flex cursor-pointer gap-2.5 rounded-lg border border-border p-3 transition-colors has-data-[state=checked]:border-foreground has-data-[state=checked]:bg-background has-data-[state=checked]:ring-1 has-data-[state=checked]:ring-foreground lg:gap-3 lg:p-4"
			>
				<RadioGroup.Item value={option.value} class="mt-0.5" />
				<span class="flex min-w-0 flex-col gap-0.5 lg:gap-1.5">
					<span class="text-[15px] leading-5 font-semibold lg:text-base">{option.title}</span>
					<span class="text-[13px] leading-[18px] text-muted-foreground lg:text-sm lg:leading-5">{option.hint()}</span>
				</span>
			</label>
		{/each}
	</RadioGroup.Root>
</section>

{#if choice === 'off'}
	<section
		class="flex flex-col gap-1.5 rounded-lg border border-border bg-muted p-5"
		aria-labelledby="{id}-consequence"
	>
		<h2 id="{id}-consequence" class="pb-1 font-heading text-xl leading-6 font-bold">
			{off ? `${label} is off` : `What turning off ${label} does`}
		</h2>
		<dl class="flex flex-col">
			{#each consequences as [term, detail] (term)}
				<div class="flex flex-col gap-1 border-b border-border py-3 sm:flex-row sm:gap-4">
					<dt
						class="w-24 shrink-0 pt-[3px] font-mono text-[11px] leading-[14px] font-medium tracking-[0.08em] uppercase"
					>
						{term}
					</dt>
					<dd class="min-w-0 flex-1 text-[15px] leading-[22px]">{detail}</dd>
				</div>
			{/each}
		</dl>
		{#if off}
			<div class="pt-3">{@render turnOnButton()}</div>
		{/if}
	</section>
{:else if choice === 'now'}
	{#if off}
		<section class="flex flex-col gap-3 rounded-lg border border-border bg-muted p-5">
			<p class="text-[15px] leading-[22px]">{label} is off. Turn it back on to set it up.</p>
			{@render turnOnButton()}
		</section>
	{:else}
		{@render setUp()}
	{/if}
{/if}

<SetupStepFooter {...activeFooter} />
