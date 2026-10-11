<script lang="ts">
	import * as BulkImportWorkspace from './index.js';
	import { Button } from '$lib/components/ui/button/index.js';

	let step = $state<'upload' | 'review'>('upload');
</script>

<BulkImportWorkspace.Root ariaLabel="Step import workspace">
	{#if step === 'upload'}
		<BulkImportWorkspace.Header step="Step 1" title="Upload file" />
		<Button onclick={() => (step = 'review')}>Parse file</Button>
	{:else}
		<BulkImportWorkspace.Header step="Step 2" title="Review rows" />
		<Button onclick={() => (step = 'upload')}>Back</Button>
	{/if}
</BulkImportWorkspace.Root>
