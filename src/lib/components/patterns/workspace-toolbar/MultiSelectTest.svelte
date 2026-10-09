<script lang="ts">
	import * as WorkspaceToolbar from './index.js';

	let mos = $state<string[]>([]);
</script>

<WorkspaceToolbar.MultiSelect
	label="MOS"
	ariaLabel="Filter by MOS"
	options={[
		{ value: '11B', label: '11B Infantry' },
		{ value: '25U', label: '25U Signal' },
		{ value: '68W', label: '68W Medic' }
	]}
	value={mos}
	onChange={(values) => (mos = values)}
/>
<output aria-label="Selected MOS">{mos.join(',')}</output>
