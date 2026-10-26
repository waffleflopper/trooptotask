<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { motionAllowed } from './reveal';
	import PublicHeading from '../PublicHeading.svelte';
	import PublicSection from '../PublicSection.svelte';
	import { monoLabel } from '../layout';

	const SQUAD = 9;
	const PLATOON = SQUAD * 3;
	const platoons = ['1ST PLATOON', '2ND PLATOON', '3RD PLATOON'];

	// Each tier covers a contiguous run of the 81 Soldier cells, platoon by platoon and squad by squad.
	const tiers = [
		{
			role: 'COMMANDER · 1SG',
			scope: 'The whole formation',
			leader: 'CPT MERCER · C CO',
			first: 0,
			count: PLATOON * 3
		},
		{
			role: 'PLATOON SERGEANT',
			scope: 'Their platoon',
			leader: 'SFC BRANDT · 2ND PLT',
			first: PLATOON,
			count: PLATOON
		},
		{
			role: 'SQUAD LEADER',
			scope: 'Their squad',
			leader: 'SSG REYES · 2ND PLT, 1ST SQD',
			first: PLATOON,
			count: SQUAD
		},
		{
			role: 'TEAM LEADER',
			scope: 'Their Soldiers',
			leader: 'SGT LIU · 2ND PLT, 1ST SQD, A TM',
			first: PLATOON,
			count: 4
		}
	];

	let active = $state(2);
	let held = $state(false);
	const tier = $derived(tiers[active]);

	function covers(cell: number) {
		return cell >= tier.first && cell < tier.first + tier.count;
	}

	function platoonOf(cell: number) {
		return Math.floor(cell / PLATOON);
	}

	function choose(index: number) {
		active = index;
		held = true;
	}

	const autoCycle: Attachment<HTMLElement> = (node) => {
		if (!motionAllowed()) return;
		let timer: ReturnType<typeof setInterval> | undefined;
		const observer = new IntersectionObserver(([entry]) => {
			clearInterval(timer);
			if (!entry.isIntersecting) return;
			timer = setInterval(() => {
				if (!held) active = (active + 1) % tiers.length;
			}, 2400);
		});
		observer.observe(node);
		return () => {
			observer.disconnect();
			clearInterval(timer);
		};
	};
</script>

<PublicSection tone="dark" class="gap-16 lg:gap-[72px]">
	<PublicHeading label="SCOPED ACCESS · BUILT IN" lines={['EVERY LEADER', 'OWNS THEIR PIECE.']} tone="dark" plain>
		Decentralized, like mission command. Squad leaders keep their own Soldiers current, and the commander sees one
		formation that is never out of sync.
	</PublicHeading>
	<div class="flex flex-col gap-12 xl:flex-row xl:items-start xl:gap-[88px]" {@attach autoCycle}>
		<div
			class="flex shrink-0 flex-col border-t border-chrome-border xl:w-[520px]"
			role="group"
			aria-label="Access tiers"
		>
			{#each tiers as t, i (t.role)}
				{@const on = i === active}
				<button
					type="button"
					aria-pressed={on}
					class={[
						'flex min-h-16 items-center gap-4 border-b border-l-2 border-b-chrome-border px-6 py-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-chrome-accent focus-visible:ring-inset',
						on
							? 'border-l-chrome-accent bg-chrome-surface text-chrome-text'
							: 'border-l-transparent text-chrome-text-muted'
					]}
					onpointerenter={() => choose(i)}
					onfocus={() => choose(i)}
					onclick={() => choose(i)}
				>
					<span class={[monoLabel, 'w-32 shrink-0 sm:w-[220px]']}>{t.role}</span>
					<span class="grow font-body text-lg leading-[1.375rem] font-light">{t.scope}</span>
					<span class={['font-heading text-lg leading-[1.375rem] font-bold', on && 'text-chrome-accent']}>
						{t.count}
					</span>
				</button>
			{/each}
		</div>
		<div class="flex flex-col gap-8">
			<div class="flex flex-wrap gap-8" aria-hidden="true">
				{#each platoons as name, p (name)}
					<div class="flex flex-col gap-3">
						<span
							class={[
								monoLabel,
								'transition-colors',
								platoonOf(tier.first) <= p && p <= platoonOf(tier.first + tier.count - 1)
									? 'text-chrome-text'
									: 'text-chrome-text-muted'
							]}
						>
							{name}
						</span>
						<div class="grid grid-cols-[repeat(9,18px)] gap-[5px]">
							{#each { length: PLATOON }, s (s)}
								{@const cell = p * PLATOON + s}
								<span
									class={[
										'size-[18px] rounded-[2px] border transition-colors duration-300',
										covers(cell)
											? 'border-chrome-accent bg-chrome-accent'
											: platoonOf(cell) === platoonOf(tier.first)
												? 'border-chrome-surface-muted bg-chrome-surface-muted'
												: 'border-chrome-border bg-chrome-surface'
									]}
								></span>
							{/each}
						</div>
					</div>
				{/each}
			</div>
			<p class="flex flex-wrap gap-x-6 gap-y-2">
				<span class={[monoLabel, 'text-chrome-text']}>{tier.leader}</span>
				<span class={[monoLabel, 'text-chrome-text-muted']}>SEES {tier.count} · UPDATES {tier.count}</span>
			</p>
		</div>
	</div>
</PublicSection>
