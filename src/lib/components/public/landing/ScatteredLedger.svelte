<script lang="ts">
	import { ease, fadeUp, reveal } from './reveal';
	import PublicHeading from '../PublicHeading.svelte';
	import PublicSection from '../PublicSection.svelte';
	import { body, monoLabel } from '../layout';

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
			home: 'TASKINGS'
		}
	];

	const columns =
		'lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1.5fr)_auto] lg:gap-x-6 xl:grid-cols-[356px_276px_minmax(0,1fr)_200px]';
</script>

<PublicSection class="gap-16 lg:gap-16">
	<PublicHeading lines={['SCATTERED ACROSS', 'EVERY TRACKER.']}>
		Every leader keeps their own copy. Before anyone can say who is ready, someone has to reconcile seven of them by
		hand.
	</PublicHeading>
	<table class="block w-full border-t-2 border-foreground" {@attach reveal}>
		<thead class="block max-lg:sr-only">
			<tr class={[columns, 'grid h-12 items-center border-b border-border text-left text-muted-foreground']}>
				<th class={[monoLabel, 'font-normal']}>WHERE IT LIVES TODAY</th>
				<th class={[monoLabel, 'font-normal']}>WHAT IT HOLDS</th>
				<th class={[monoLabel, 'font-normal']}>WHAT GOES WRONG</th>
				<th class={[monoLabel, 'pr-5 text-right font-normal']}>IN TROOPTOTASK</th>
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
					<td class="col-span-2 font-mono text-[0.8125rem] font-normal leading-4 lg:col-span-1">{row.source}</td>
					<td class="row-start-2 font-body text-lg font-normal leading-[1.375rem] lg:row-start-auto">{row.holds}</td>
					<td
						class={[
							body,
							'col-span-2 row-start-3 leading-[1.375rem] text-muted-foreground lg:col-span-1 lg:row-start-auto'
						]}
					>
						{row.fails}
					</td>
					<td class="col-start-2 row-start-2 lg:col-start-auto lg:row-start-auto">
						<span class={[monoLabel, 'flex items-center justify-end gap-3 whitespace-nowrap text-foreground']}>
							{row.home}
							<span
								class={[
									'size-2 shrink-0 rounded-[1px] bg-accent transition-colors duration-300 in-data-[reveal=pending]:bg-border',
									ease
								]}
								style:transition-delay="{700 + i * 160}ms"
								aria-hidden="true"
							></span>
						</span>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</PublicSection>
