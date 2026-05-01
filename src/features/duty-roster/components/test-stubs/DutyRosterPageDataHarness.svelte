<script lang="ts">
	import type { AdvancedDutyRunSnapshotRecord } from '../../duty-roster.types';

	interface Props {
		data: {
			advancedDutySnapshots?: AdvancedDutyRunSnapshotRecord[];
		};
	}

	let { data }: Props = $props();
</script>

<div data-testid="snapshot-count">{data.advancedDutySnapshots?.length ?? 0}</div>
<div data-testid="snapshot-ids">{data.advancedDutySnapshots?.map((snapshot) => snapshot.id).join(',') ?? ''}</div>
