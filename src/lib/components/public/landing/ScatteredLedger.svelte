<script lang="ts">
	import { ease, fadeUp, reveal } from './reveal';
	import SectionIntro from './SectionIntro.svelte';
	import { band, body, container, label } from './type';

	const rows = [
		{
			source: 'LEAVE_TRACKER_FINAL_v7.xlsx',
			holds: 'Leave, TDY and appointments',
			fails: '#REF! in the totals row',
			home: 'CALENDAR'
		},
		{
			source: 'DTMS_export_SEP (2).csv',
			holds: 'Training due dates',
			fails: 'Exported three weeks ago',
			home: 'TRAINING'
		},
		{
			source: 'Messages · PLT LEADERSHIP',
			holds: 'Who has CQ tonight',
			fails: '“Which spreadsheet is current?”',
			home: 'CALENDAR'
		},
		{
			source: 'Counseling tracker.xlsx',
			holds: 'Rating chains and thru dates',
			fails: 'NCOER six days late before anyone noticed',
			home: 'EVALS'
		},
		{
			source: 'Hallway whiteboard',
			holds: 'In-processing checklist',
			fails: 'Erased Friday with three Soldiers half done',
			home: 'ONBOARDING'
		},
		{
			source: 'Training Meeting WK42 (final)(2).pptx',
			holds: 'The readiness slides',
			fails: 'Rebuilt by hand every week',
			home: 'TRAINING REPORTS'
		},
		{
			source: 'Outlook · Inbox (214)',
			holds: 'Tasking requirements',
			fails: 'RE: RE: FW: TASKING — BMC LANE SUPPORT',
			home: 'TASKINGS · NEXT',
			upcoming: true
		}
	];

	const columns =
		'lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1.5fr)_auto] lg:gap-x-6 xl:grid-cols-[356px_276px_minmax(0,1fr)_200px]';
</script>

<section class="bg-background text-foreground">
	<div class={[container, band, 'flex flex-col gap-16']}>
		<SectionIntro
			eyebrow="THE ANSWER EXISTS"
			lines={['SCATTERED ACROSS', 'EVERY TRACKER.']}
			lead="Every leader keeps their own copy. Before anyone can answer the question, someone has to reconcile seven of them by hand."
		/>
		<table class="block w-full border-t-2 border-foreground" {@attach reveal}>
			<thead class="block max-lg:sr-only">
				<tr class={[columns, 'grid h-12 items-center border-b border-border text-left text-muted-foreground']}>
					<th class={[label, 'font-normal']}>WHERE IT LIVES TODAY</th>
					<th class={[label, 'font-normal']}>WHAT IT HOLDS</th>
					<th class={[label, 'font-normal']}>WHAT GOES WRONG</th>
					<th class={[label, 'pr-5 text-right font-normal']}>IN TROOPTOTASK</th>
				</tr>
			</thead>
			<tbody class="block">
				{#each rows as row, i (row.source)}
					<tr
						class={[
							columns,
							fadeUp,
							'grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-b border-border py-4 lg:min-h-16 lg:items-center lg:py-0'
						]}
						style:transition-delay="{i * 80}ms"
					>
						<td class="col-span-2 font-mono text-[0.8125rem] leading-4 lg:col-span-1">{row.source}</td>
						<td class="font-body text-lg leading-[1.375rem]">{row.holds}</td>
						<td
							class={[
								body,
								'col-span-2 row-start-3 leading-[1.375rem] text-muted-foreground lg:col-span-1 lg:row-start-auto'
							]}
						>
							{row.fails}
						</td>
						<td class="row-start-2 lg:row-start-auto">
							<span
								class={[
									label,
									'flex items-center justify-end gap-3',
									row.upcoming ? 'text-muted-foreground' : 'text-foreground'
								]}
							>
								{row.home}
								{#if row.upcoming}
									<span class="size-2 shrink-0 rounded-[1px] border border-muted-foreground" aria-hidden="true"></span>
								{:else}
									<span
										class={[
											'size-2 shrink-0 rounded-[1px] bg-accent transition-colors duration-300 in-data-[reveal=pending]:bg-border',
											ease
										]}
										style:transition-delay="{700 + i * 160}ms"
										aria-hidden="true"
									></span>
								{/if}
							</span>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>
