<script lang="ts">
	import { Button } from '../button/index.js';
	import * as ButtonGroup from '../button-group/index.js';
	import * as WorkspaceToolbar from './index.js';

	let viewMode = $state<'month' | 'long-range'>('month');
	let search = $state('');
	let gapsOnly = $state(false);

	const activeCount = $derived((search ? 1 : 0) + (gapsOnly ? 1 : 0));
</script>

<WorkspaceToolbar.Root ariaLabel="Test workspace toolbar" data-testid="workspace-toolbar">
	<WorkspaceToolbar.Group label="View mode">
		<ButtonGroup.Root aria-label="View toggle" data-testid="view-toggle">
			<Button
				variant={viewMode === 'month' ? 'secondary' : 'outline'}
				aria-pressed={viewMode === 'month'}
				onclick={() => (viewMode = 'month')}
			>
				Month
			</Button>
			<Button
				variant={viewMode === 'long-range' ? 'secondary' : 'outline'}
				aria-pressed={viewMode === 'long-range'}
				onclick={() => (viewMode = 'long-range')}
			>
				Long range
			</Button>
		</ButtonGroup.Root>
	</WorkspaceToolbar.Group>

	<WorkspaceToolbar.Group label="Filters" {activeCount}>
		<Button variant={gapsOnly ? 'secondary' : 'outline'} aria-pressed={gapsOnly} onclick={() => (gapsOnly = !gapsOnly)}>
			Gaps only
		</Button>
		<input type="search" aria-label="Search roster" placeholder="Search..." bind:value={search} />
	</WorkspaceToolbar.Group>

	<WorkspaceToolbar.Group label="Actions" zone="actions" data-testid="actions-zone">
		<Button>Add status</Button>
		<Button variant="outline" disabled>Import</Button>
		<Button variant="outline" disabled aria-label="Syncing roster">Loading</Button>
	</WorkspaceToolbar.Group>
</WorkspaceToolbar.Root>

<p data-testid="toolbar-state">{viewMode}|{gapsOnly ? 'gaps' : 'all'}|{search || 'empty'}</p>
