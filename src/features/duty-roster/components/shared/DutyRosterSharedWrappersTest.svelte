<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import {
		AuditTimeline,
		CorrectionSheet,
		DA6Matrix,
		DutyRosterStatusBadge,
		ManualChangePanel,
		WarningSummary,
		type AuditTimelineEvent,
		type DA6MatrixCell,
		type DA6MatrixColumn,
		type DA6MatrixFooterRow,
		type DA6MatrixMetadataItem,
		type DA6MatrixRow,
		type DutyRosterSoldierOption
	} from './index.js';

	const rows: DA6MatrixRow[] = [
		{ id: 'able', label: 'SGT Able', subtitle: 'Alpha' },
		{ id: 'baker', label: 'SSG Baker', subtitle: 'Bravo' }
	];

	const columns: DA6MatrixColumn[] = [
		{ id: 'jun-01', weekday: 'Mon', date: '1-Jun' },
		{ id: 'jun-02', weekday: 'Tue', date: '2-Jun' }
	];

	const cells: Record<string, Record<string, DA6MatrixCell>> = {
		able: {
			'jun-01': {
				display: 'X',
				kind: 'assigned',
				ariaLabel: 'SGT Able assigned on Mon 1-Jun. DA6 count 7.',
				chargeable: true,
				count: 7
			},
			'jun-02': {
				display: 'A',
				kind: 'exempt',
				ariaLabel: 'SGT Able authorized absence on Tue 2-Jun. Not chargeable.',
				chargeable: false,
				reason: 'Leave'
			}
		},
		baker: {
			'jun-01': {
				display: '6',
				kind: 'not-assigned',
				ariaLabel: 'SSG Baker available on Mon 1-Jun. DA6 count 6.',
				chargeable: true,
				count: 6
			},
			'jun-02': {
				display: 'D',
				kind: 'blocked',
				ariaLabel: 'SSG Baker other duty on Tue 2-Jun. Chargeable.',
				chargeable: true,
				reason: 'Staff detail'
			}
		}
	};

	const metadata: DA6MatrixMetadataItem[] = [{ label: 'Duty Position', value: 'Staff Duty NCO' }];
	const footers: DA6MatrixFooterRow[] = [{ label: 'Assigned Count', values: { 'jun-01': 1, 'jun-02': 0 } }];
	const soldiers: DutyRosterSoldierOption[] = [
		{ value: 'david-wilson', label: 'SSG David Wilson', description: '11B, Squad Leader' }
	];
	const events: AuditTimelineEvent[] = [
		{ id: 'accepted', timestamp: 'May 12, 2026 09:15', title: 'Run accepted', actor: 'SFC James Miller' }
	];
</script>

<DutyRosterStatusBadge status="correction-pending" />
<DutyRosterStatusBadge status="latest" />
<WarningSummary tone="warning" title="Warnings (1)" items={['1 unresolved date']} actionLabel="View Details" />
<DA6Matrix
	title="Test DA6 Matrix"
	description="DA6 component contract sample."
	{rows}
	{columns}
	{cells}
	{metadata}
	footerRows={footers}
	warning="Authorized absence pauses the count."
/>
<AuditTimeline {events} timezoneLabel="All times are local." />

<Sheet.Root open>
	<ManualChangePanel
		dateLabel="May 14, 2026 (Wednesday)"
		currentSoldier="SSG David Wilson"
		originalSoldier="SGT Michael Brown"
		riskItems={['Higher rank than original recommendation']}
		{soldiers}
		reasonRequired
	/>
</Sheet.Root>

<Sheet.Root open>
	<CorrectionSheet
		dateLabel="May 14, 2026 (Wed)"
		originalSoldier="SSG Daniel Warren"
		{soldiers}
		reasons={[{ value: 'unexpected-absence', label: 'Unexpected absence' }]}
	/>
</Sheet.Root>
