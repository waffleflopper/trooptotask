<script lang="ts" module>
	const WORST_FIRST_LIMIT = 5;

	function count(value: number, one: string, many = `${one}s`): string {
		return `${value.toLocaleString('en-US')} ${value === 1 ? one : many}`;
	}
</script>

<script lang="ts">
	import type { BriefingScope, TrainingBriefingDetail, TrainingBriefingReportData } from '../contracts';
	import { BRIEFING_ROWS_BY_LABELS, briefingFilterLabels } from '../utils/briefingFilterLabels';
	import { chunkPrintColumns, PRINT_ROW_NOUNS } from '../utils/trainingPrintLayout';
	import TrainingPrintDetail from './TrainingPrintDetail.svelte';
	import TrainingPrintForecast from './TrainingPrintForecast.svelte';
	import TrainingPrintMatrix from './TrainingPrintMatrix.svelte';

	interface Props {
		report: TrainingBriefingReportData;
		/** The loaded page of affected soldiers, captured with `report`; null when none is open. */
		detail: TrainingBriefingDetail | null;
	}

	let { report, detail }: Props = $props();

	const briefing = $derived(report.briefing);
	const bottomLine = $derived(briefing.bottomLine);
	const grid = $derived(briefing.grid);
	const input = $derived(report.input);
	const goal = $derived(briefing.forecast.goalPercent);
	const noun = $derived(PRINT_ROW_NOUNS[grid.rowsBy]);
	const filters = $derived(briefingFilterLabels(input, report.filterOptions));
	const horizonEnd = $derived(`${bottomLine.horizonEndLabel} ${bottomLine.horizonEnd.slice(0, 4)}`);
	const hasTypes = $derived(report.filterOptions.types.length > 0);
	const hasRequirements = $derived(hasTypes && bottomLine.today.percent !== null);
	const narrowed = $derived(
		input.viewId !== null || input.rank !== null || input.mos.length + input.roles.length + input.typeIds.length > 0
	);
	const context = $derived(
		[
			`As of ${bottomLine.asOfLabel}`,
			`to ${horizonEnd}`,
			`goal ${goal}%`,
			filters.find((filter) => filter.label === 'Group')?.value ?? 'All groups',
			count(grid.columns.length, 'type'),
			`rows by ${BRIEFING_ROWS_BY_LABELS[grid.rowsBy]}`,
			...(narrowed ? ['more filters on sheet 1'] : [])
		].join(' · ')
	);
	const counts = $derived([
		{ label: 'Ready', value: bottomLine.today.ready },
		{ label: 'Not ready, expired', value: bottomLine.expired },
		{ label: 'Not ready, not recorded', value: bottomLine.notRecorded },
		{ label: `Ready today, lapses by ${bottomLine.horizonEndLabel}`, value: bottomLine.lapsing }
	]);
	const chunks = $derived.by(() => {
		const split = chunkPrintColumns(grid.rows, (row) => row.label);
		return split.length > 0 ? split : [{ start: 0, columns: [] }];
	});
	const riskScale = $derived(Math.max(0, ...briefing.typeRisk.map((risk) => risk.notReady + risk.lapsing)));
	const worstFirst = $derived(
		briefing.typeRisk.filter((risk) => risk.notReady + risk.lapsing > 0).slice(0, WORST_FIRST_LIMIT)
	);

	function scopeLabel(scope: BriefingScope): string {
		if (scope.kind === 'focus') {
			const index = briefing.focus.areas.findIndex((area) => area.key === scope.key);
			return index === -1 ? 'Focus area' : `Focus ${index + 1} · ${briefing.focus.areas[index].title}`;
		}
		const row =
			scope.rowKey === null
				? `All ${noun.many}`
				: (grid.rows.find((candidate) => candidate.key === scope.rowKey)?.label ??
					BRIEFING_ROWS_BY_LABELS[grid.rowsBy]);
		const type = grid.columns.find((column) => column.typeId === scope.typeId)?.name ?? 'Training type';
		return `${row} · ${type}`;
	}

	function share(value: number): string {
		return `${(value * 100) / riskScale}%`;
	}
</script>

{#snippet eyebrow(text: string)}
	<p class="font-mono text-[9.5px] leading-3 uppercase tracking-[0.08em] text-muted-foreground">{text}</p>
{/snippet}

<article
	data-print-brief="training"
	class="hidden bg-white text-foreground print:block"
	aria-label={`${report.organizationName} training readiness brief`}
>
	<section class="table w-full table-fixed" aria-label="Brief">
		<header class="table-header-group break-inside-avoid">
			<div class="mb-[18px] flex items-end justify-between gap-8 border-b-2 border-foreground pb-2.5">
				<div class="flex min-w-0 flex-col gap-1">
					{@render eyebrow('Training readiness brief')}
					<h2 class="font-heading text-[30px] leading-[30px] font-bold tracking-[-0.01em] [overflow-wrap:anywhere]">
						{report.organizationName}
					</h2>
					<p class="font-serif text-[12.5px] leading-4">
						{count(bottomLine.soldierCount, 'soldier')} · as of {bottomLine.asOfLabel} · forecast through {horizonEnd}
						({input.horizonDays} days) · goal {goal}%
					</p>
				</div>
				<div
					class="flex max-w-[430px] flex-col items-end gap-[3px] text-right font-mono text-[9px] leading-[13px] uppercase tracking-[0.04em]"
				>
					<p class="text-muted-foreground">
						Filters · {filters.map(({ label, value }) => `${label} ${value}`).join(' · ')}
					</p>
					<p>Sheet 1 · Brief</p>
				</div>
			</div>
		</header>

		<div class="table-row-group">
			<div class="flex flex-col gap-[18px]">
				{#if !hasRequirements}
					<div class="flex flex-col gap-1 py-6">
						<h3 class="font-heading text-[19px] leading-[22px] font-semibold">
							{#if !hasTypes}
								{input.viewId ? 'This view has no required training types.' : 'No training types configured.'}
							{:else}
								{narrowed || input.groupId
									? 'No applicable requirements for these filters.'
									: 'No applicable requirements.'}
							{/if}
						</h3>
						<p class="font-serif text-[12.5px] leading-[17px]">
							{#if !hasTypes}
								{input.viewId ? 'Choose another view.' : 'Create training types first.'}
							{:else}
								No soldier in this selection is required to hold the selected training.
							{/if}
						</p>
					</div>
				{:else}
					<div class="flex gap-9 break-inside-avoid">
						<div class="flex min-w-[300px] flex-1 flex-col gap-2.5">
							{@render eyebrow('Bottom line')}
							<div class="flex items-end gap-[18px]">
								<div class="flex flex-col gap-1">
									<p class="font-heading text-[68px] leading-[58px] font-extrabold tracking-[-0.02em]">
										{bottomLine.today.percent}%
									</p>
									<p class="font-mono text-[9px] leading-3 uppercase tracking-[0.08em] text-muted-foreground">
										Ready today
									</p>
								</div>
								<div class="flex flex-col gap-1">
									<p class="font-heading text-[34px] leading-8 font-bold">
										<span aria-hidden="true">→</span>
										<span class="sr-only"
											>{bottomLine.horizon.percent === bottomLine.today.percent ? 'stays at' : 'falls to'}</span
										>
										{bottomLine.horizon.percent}%
									</p>
									<p class="font-mono text-[9px] leading-3 uppercase tracking-[0.08em] text-muted-foreground">
										By {bottomLine.horizonEndLabel}, if no one renews
									</p>
								</div>
							</div>
							<p class="font-serif text-[12.5px] leading-[17px]">{bottomLine.sentence}</p>
							<dl class="border-t border-foreground font-serif text-[12px] leading-4" aria-label="Requirement counts">
								{#each counts as item, index (item.label)}
									<div
										class={[
											'flex h-[22px] items-center justify-between border-b',
											index === counts.length - 1 ? 'border-foreground' : 'border-border'
										]}
									>
										<dt>{item.label}</dt>
										<dd class="font-mono font-semibold">{item.value.toLocaleString('en-US')}</dd>
									</div>
								{/each}
							</dl>
							<p class="font-mono text-[9px] leading-[13px] text-muted-foreground">
								Counts are requirements: {count(bottomLine.today.applicable, 'applicable soldier × training-type pair')}
								across {count(bottomLine.soldierCount, 'soldier')}. Percentages are ready ÷ applicable requirements, not
								soldiers.
							</p>
						</div>

						<div class="flex min-w-0 flex-[0_1_630px] flex-col gap-1.5">
							<div class="flex items-baseline justify-between gap-4">
								{@render eyebrow(`Forecast · next ${input.horizonDays} days`)}
								<p class="text-right font-mono text-[9px] leading-3 text-muted-foreground">
									Line: % ready if no one renews · Bars: requirements lapsing each week
								</p>
							</div>
							<h3 class="font-heading text-[19px] leading-[22px] font-semibold">
								{bottomLine.scopeName} readiness if no one renews
							</h3>
							<TrainingPrintForecast
								forecast={briefing.forecast}
								ariaLabel={`Forecast readiness from ${bottomLine.today.percent}% today to ${bottomLine.horizon.percent}% by ${bottomLine.horizonEndLabel}, with weekly lapses`}
							/>
							{#if worstFirst.length > 0}
								<div class="mt-2">
									<div class="flex items-baseline justify-between gap-4">
										{@render eyebrow('What · worst first')}
										<p class="text-right font-mono text-[9px] leading-3 text-muted-foreground">
											Top {worstFirst.length} of {count(briefing.typeRisk.length, 'type')} by not ready + lapsing · every
											type is on the matrix
										</p>
									</div>
									<table
										class="mt-1 w-full table-fixed border-collapse"
										aria-label="Training types with the most requirements not ready or lapsing"
									>
										<colgroup>
											<col class="w-5" />
											<col class="w-[330px]" />
											<col />
											<col class="w-16" />
											<col class="w-16" />
										</colgroup>
										<thead>
											<tr
												class="border-b border-foreground font-mono text-[9px] leading-3 uppercase tracking-[0.06em] text-muted-foreground [&>th]:pb-1 [&>th]:font-normal"
											>
												<th scope="col" class="text-left">#</th>
												<th scope="col" class="text-left">Type</th>
												<th scope="col"><span class="sr-only">Share</span></th>
												<th scope="col" class="text-right">Not ready</th>
												<th scope="col" class="text-right">By {bottomLine.horizonEndLabel}</th>
											</tr>
										</thead>
										<tbody>
											{#each worstFirst as risk, index (risk.typeId)}
												<tr class="border-b border-border">
													<td class="py-0.5 font-heading text-[13px] font-extrabold">{index + 1}</td>
													<th
														scope="row"
														class="py-0.5 pr-3 text-left font-serif text-[12px] leading-4 font-normal [overflow-wrap:anywhere]"
													>
														{risk.name}
													</th>
													<td class="py-0.5">
														<div class="flex h-2.5 gap-px [print-color-adjust:exact]" aria-hidden="true">
															{#if risk.notReady > 0}
																<span class="bg-foreground" style:width={share(risk.notReady)}></span>
															{/if}
															{#if risk.lapsing > 0}
																<span class="bg-(--training-print-bar)" style:width={share(risk.lapsing)}></span>
															{/if}
														</div>
													</td>
													<td class="py-0.5 text-right font-mono text-[12px] font-semibold">{risk.notReady}</td>
													<td class="py-0.5 text-right font-mono text-[12px]">{risk.lapsing}</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							{/if}
						</div>
					</div>

					<section
						class="flex break-inside-avoid flex-col gap-2.5 border-t-2 border-foreground pt-3"
						aria-label="Focus"
					>
						<div class="flex items-baseline justify-between gap-4">
							<div class="flex items-baseline gap-3">
								{@render eyebrow('Focus')}
								<h3 class="font-heading text-[19px] leading-[22px] font-semibold">Where training time buys the most</h3>
							</div>
							<p class="text-right font-mono text-[9px] leading-3 text-muted-foreground">
								What-if outcomes use the same {bottomLine.horizonEndLabel} forecast. Counts: requirements · unique soldiers.
							</p>
						</div>
						{#if briefing.focus.areas.length > 0}
							<ol class="flex gap-7">
								{#each briefing.focus.areas as area, index (area.key)}
									<li class="flex min-w-0 flex-1 gap-2.5">
										<span class="w-5 shrink-0 font-heading text-[28px] leading-[26px] font-extrabold" aria-hidden="true"
											>{index + 1}</span
										>
										<div class="flex min-w-0 flex-1 flex-col items-start gap-1.5">
											<h4 class="font-heading text-[16px] leading-[18px] font-semibold [overflow-wrap:anywhere]">
												{area.title}
											</h4>
											<p class="font-serif text-[12px] leading-4">{area.body}</p>
											<p
												class="border border-foreground px-[7px] py-[3px] font-mono text-[9.5px] leading-[13px] tracking-[0.03em]"
											>
												{area.whatIf.chip}
											</p>
											<p class="font-mono text-[9.5px] leading-3 text-muted-foreground">
												{count(area.requirementCount, 'requirement')} · {count(
													area.soldierCount,
													'soldier'
												)}{area.kind === 'wave' ? ` · ${area.firstLapseLabel}` : ''}
											</p>
										</div>
									</li>
								{/each}
							</ol>
						{:else}
							<p class="font-serif text-[12.5px] leading-[17px]">{briefing.focus.emptyMessage}</p>
						{/if}
					</section>
				{/if}
			</div>
		</div>
	</section>

	{#if hasRequirements}
		{#each chunks as chunk (chunk.start)}
			<TrainingPrintMatrix {report} {chunk} {context} />
		{/each}
	{/if}

	{#if detail && detail.rows.length > 0}
		<TrainingPrintDetail
			{detail}
			organizationName={report.organizationName}
			{context}
			scopeLabel={scopeLabel(detail.scope)}
			horizonEndLabel={bottomLine.horizonEndLabel}
		/>
	{/if}
</article>
