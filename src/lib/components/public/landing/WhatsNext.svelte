<script lang="ts">
	import { ease, fadeUp, reveal } from './reveal';
	import PublicHeading from '../PublicHeading.svelte';
	import PublicSection from '../PublicSection.svelte';
	import { body, display, monoLabel, title } from '../layout';

	const transcript =
		'Okafor is on leave Wednesday through Friday. Patel recerted CPR this morning, and I still need one more medic for the trauma lane Monday.';
	const words = transcript.split(' ');
	const typed = words.length * 45;

	const waveform = [
		3, 4.2, 4.1, 3.2, 8.3, 3.7, 14.1, 8, 3, 6.3, 7.1, 3, 3, 3.8, 4.6, 20.1, 7.8, 14.4, 3, 5.6, 4.6, 11.8, 3, 17.6, 3, 3,
		10.6, 8.3, 5.6, 3, 3.8, 3, 16.5, 7.2, 7.3, 3, 9.9, 6.4, 12.9, 11.8, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3,
		3
	];

	const changes = [
		{
			kind: 'CALENDAR · ADD STATUS',
			who: 'SGT Okafor, Daniel',
			what: 'Leave · Wed 21 – Fri 23 Oct',
			check: 'NO DUTY OR TASKING CONFLICTS',
			tone: 'border-l-success text-success-foreground'
		},
		{
			kind: 'TRAINING · LOG COMPLETION',
			who: 'SPC Patel, Ravi',
			what: 'CPR / BLS · completed today',
			check: 'CURRENT THROUGH OCT 2028',
			tone: 'border-l-info text-info-foreground'
		},
		{
			kind: 'TASKINGS · ASSIGN PERSON',
			who: 'SPC Fischer, Ana',
			what: 'Provide 4 trauma-lane medics · Mon 19 Oct',
			check: 'ALPHA · 68W · AVAILABLE · FILLS 4 OF 4',
			tone: 'border-l-accent text-accent-text'
		}
	];
	const cardsIn = typed + 300;
	const approved = cardsIn + changes.length * 350 + 600;

	const tasking = [
		{ name: 'STAFFED', value: '3 / 4 medics', short: false },
		{ name: 'EQUIPPED', value: '3 of 4 ready', short: true },
		{ name: 'ON TIME', value: 'Starts Mon 19 Oct', short: false }
	];

	const verbs = [
		{
			verb: 'ASK',
			prompt: 'Who can make the range Tuesday?',
			result: '→ 3 SOLDIERS',
			detail: 'AVAILABLE · QUAL EXPIRING'
		},
		{ verb: 'BRIEF', prompt: 'Build my training meeting slides.', result: '→ DECK DRAFTED', detail: 'FROM LIVE DATA' },
		{
			verb: 'FORECAST',
			prompt: 'Who still needs AFT and weapons qual before JPMRC?',
			result: '→ 12 SOLDIERS',
			detail: '8 AFT · 6 WEAPONS QUAL'
		},
		{ verb: 'FILL', prompt: 'Who covers the trauma lane?', result: '→ QUALIFIED', detail: 'AVAILABLE · FAIR ROTATION' }
	];
</script>

<PublicSection id="whats-next" class="gap-16 lg:gap-[72px]">
	<PublicHeading label="WHAT'S NEXT · IN DESIGN NOW" lines={['ADMIN UPDATES.', 'DONE IN SECONDS.']}>
		Built on the same foundation as everything above. These are being designed with leaders now and are not yet in the
		product.
	</PublicHeading>

	<div class="flex flex-col overflow-hidden rounded-lg border border-border lg:flex-row" {@attach reveal}>
		<div
			class="flex flex-col justify-between gap-12 border-b border-border p-6 sm:p-12 lg:w-[420px] lg:shrink-0 lg:border-r lg:border-b-0 xl:w-[520px]"
		>
			<div class="flex flex-col gap-4">
				<div class="flex items-center justify-between gap-4">
					<p class={[monoLabel, 'text-accent-text']}>DROP ZONE · AI</p>
					<p class={[monoLabel, 'text-muted-foreground']}>0:11 ELAPSED</p>
				</div>
				<h3 class={display}>JUST SAY IT.</h3>
				<p class={[body, 'text-muted-foreground']}>
					Talk through the changes the way you would tell your first sergeant. Drop Zone drafts the updates, and you
					approve them.
				</p>
			</div>
			<div class="flex flex-col gap-6">
				<div class="flex items-center gap-5" aria-hidden="true">
					<div
						class="flex size-14 shrink-0 items-center justify-center rounded-full bg-foreground shadow-[0_0_0_8px] shadow-accent/18"
					>
						<svg width="20" height="20" viewBox="0 0 24 24" class="stroke-background" fill="none" stroke-width="2">
							<rect x="9" y="3" width="6" height="11" rx="3" stroke-linecap="round" />
							<path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke-linecap="round" />
						</svg>
					</div>
					<div class="flex min-w-0 grow flex-col gap-2">
						<p class={[monoLabel, 'text-accent-text']}>● LISTENING</p>
						<svg viewBox="0 0 340 24" class="h-6 w-full max-w-[340px] fill-accent" preserveAspectRatio="xMinYMid meet">
							{#each waveform as height, i (i)}
								<rect x={i * 6} y={12 - height / 2} width="3" {height} rx="1.5" />
							{/each}
						</svg>
					</div>
				</div>
				<p class="font-body text-lg leading-7 font-normal">
					“{#each words as word, i (i)}<span
							class="transition-opacity duration-150 in-data-[reveal=pending]:opacity-0"
							style:transition-delay="{i * 45}ms">{word}</span
						>{i < words.length - 1 ? ' ' : ''}{/each}”
				</p>
			</div>
		</div>
		<div class="flex grow flex-col gap-4 bg-muted p-6 sm:p-12">
			<p class={[monoLabel, 'text-muted-foreground']}>3 CHANGES FOUND · REVIEW BEFORE SAVING</p>
			{#each changes as change, i (change.who)}
				<div
					class={[
						fadeUp,
						'flex flex-col items-start justify-between gap-4 rounded-md border-l-[3px] bg-background px-5 py-5 sm:flex-row sm:gap-6 sm:px-6',
						change.tone
					]}
					style:transition-delay="{cardsIn + i * 350}ms"
				>
					<div class="flex flex-col gap-1.5">
						<p class={monoLabel}>{change.kind}</p>
						<p class={[title, 'text-foreground']}>{change.who}</p>
						<p class="font-body text-lg leading-6 font-normal text-foreground">{change.what}</p>
						<p class="pt-1 font-mono text-[0.8125rem] font-normal leading-4 tracking-[0.06em]">✓ {change.check}</p>
					</div>
					<span
						class="grid h-7 shrink-0 place-items-center rounded-sm border border-border px-2.5 *:col-start-1 *:row-start-1"
					>
						<span
							class={[monoLabel, 'text-muted-foreground transition-opacity in-data-[reveal=shown]:opacity-0']}
							style:transition-delay="{approved + i * 150}ms">REVIEW</span
						>
						<span
							class={[
								monoLabel,
								'scale-150 text-success-foreground opacity-0 transition-[opacity,scale] duration-300 in-data-[reveal=shown]:scale-100 in-data-[reveal=shown]:opacity-100',
								ease
							]}
							style:transition-delay="{approved + i * 150}ms"
							aria-hidden="true">UPDATED</span
						>
					</span>
				</div>
			{/each}
			<div class="flex flex-col gap-4 pt-4 sm:flex-row sm:items-center sm:justify-between">
				<p class="font-body text-lg leading-[1.375rem] font-light text-muted-foreground">
					Nothing changes until you approve.
				</p>
				<div class="flex items-center gap-6" aria-hidden="true">
					<span class={[monoLabel, 'whitespace-nowrap text-muted-foreground']}>DISCARD</span>
					<span
						class={[
							monoLabel,
							'flex h-11 items-center rounded-lg bg-foreground px-5 whitespace-nowrap text-background'
						]}>APPROVE 3 CHANGES</span
					>
				</div>
			</div>
		</div>
	</div>

	<div class="flex flex-col gap-10 lg:flex-row lg:items-center lg:gap-20 lg:pt-14" {@attach reveal}>
		<div class={[fadeUp, 'flex shrink-0 flex-col gap-5 lg:w-[360px]']}>
			<p class={[monoLabel, 'text-accent-text']}>EVENTS & TASKINGS · IN DESIGN</p>
			<h3 class={title}>EVERY TASKING. TRACKED TO DONE.</h3>
			<p class={[body, 'text-muted-foreground']}>
				The tasking that arrived as a forwarded email becomes a tracked requirement, with an owner, the people it needs
				and the equipment it is waiting on. Leaders staff it from their own roster and see conflicts before they assign.
			</p>
			<dl class="border-t border-border">
				{#each tasking as row (row.name)}
					<div class="flex h-11 items-center justify-between border-b border-border">
						<dt class={[monoLabel, 'text-muted-foreground']}>{row.name}</dt>
						<dd
							class={[
								'font-mono text-[0.8125rem] leading-4 font-normal',
								row.short ? 'text-danger-foreground' : 'text-foreground'
							]}
						>
							{row.value}
						</dd>
					</div>
				{/each}
			</dl>
		</div>
		<div class={[fadeUp, 'grow overflow-hidden rounded-lg border border-border delay-150']}>
			<img
				src="/landing/events-taskings.webp"
				alt="Events and Taskings design: a list of active taskings with status, responsible group, people staffed, equipment readiness and next date."
				width="840"
				height="525"
				loading="lazy"
				class="block h-auto w-full"
			/>
		</div>
	</div>

	<div class="flex flex-col gap-10 lg:pt-14" {@attach reveal}>
		<div class="flex flex-col gap-3 border-t-2 border-foreground pt-5 sm:flex-row sm:items-baseline sm:justify-between">
			<p class={[monoLabel, 'text-accent-text']}>AI ACROSS THE PLATFORM · IN DESIGN</p>
			<p class="font-body text-lg leading-[1.375rem] font-light text-muted-foreground">
				Plain questions, answered from your unit's live data.
			</p>
		</div>
		<div class="grid grid-cols-1 gap-10 overflow-x-clip sm:grid-cols-2 xl:grid-cols-4 xl:gap-0">
			{#each verbs as item, i (item.verb)}
				<div class="flex flex-col gap-5 border-border xl:border-l xl:px-6 xl:first:border-l-0 xl:first:pl-0">
					<p
						class={[
							display,
							'origin-bottom-left text-accent xl:text-[length:min(4.625rem,6.6vw_-_1.375rem)] transition-[opacity,scale] duration-500 in-data-[reveal=pending]:scale-125 in-data-[reveal=pending]:opacity-0',
							ease
						]}
						style:transition-delay="{i * 220}ms"
					>
						{item.verb}
					</p>
					<p class={[body, 'italic sm:min-h-14']}>“{item.prompt}”</p>
					<div class="flex flex-col gap-1">
						<p class={monoLabel}>{item.result}</p>
						<p class={[monoLabel, 'text-muted-foreground']}>{item.detail}</p>
					</div>
				</div>
			{/each}
		</div>
	</div>
</PublicSection>
