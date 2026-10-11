<script lang="ts">
	import * as BulkImportWorkspace from './index.js';
	import { Button } from '$lib/components/ui/button/index.js';

	let workspace = $state<'steps' | 'other'>('steps');
	let step = $state<'upload' | 'importing' | 'review' | 'results'>('upload');
	let outsideNotice = $state(true);

	function switchStep() {
		step = step === 'upload' ? 'review' : 'upload';
	}
</script>

<Button onclick={switchStep}>Switch step from outside</Button>
<Button onclick={() => (step = 'results')}>Finish import from outside</Button>
{#if outsideNotice}
	<Button onclick={() => (outsideNotice = false)}>Dismiss outside notice</Button>
{/if}
{#if workspace === 'steps'}
	<BulkImportWorkspace.Root ariaLabel="Step import workspace" {step}>
		{#if step === 'upload'}
			<BulkImportWorkspace.Header step="Step 1" title="Upload file" />
			<Button onclick={() => (step = 'review')}>Parse file</Button>
			<Button onclick={() => (step = 'importing')}>Start import</Button>
		{:else if step === 'importing'}
			<BulkImportWorkspace.ProgressState title="Importing rows" />
		{:else if step === 'results'}
			<BulkImportWorkspace.ResultSummary status="success" items={[{ label: 'Saved', value: 2 }]} />
		{:else}
			<BulkImportWorkspace.Header step="Step 2" title="Review rows" />
			<Button onclick={() => (step = 'upload')}>Back</Button>
		{/if}
		<Button onclick={switchStep}>Switch step</Button>
		<Button onclick={() => (workspace = 'other')}>Open other workspace</Button>
	</BulkImportWorkspace.Root>
{:else}
	<BulkImportWorkspace.Root ariaLabel="Other import workspace" step="upload">
		<BulkImportWorkspace.Header title="Other import" />
	</BulkImportWorkspace.Root>
{/if}
