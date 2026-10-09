<script lang="ts">
	import * as Tabs from './index.js';

	let value = $state('new');
</script>

<Tabs.Root bind:value>
	<Tabs.List aria-label="Feedback status">
		<Tabs.Trigger value="new">New</Tabs.Trigger>
		<Tabs.Trigger value="reviewed">Reviewed</Tabs.Trigger>
		<Tabs.Trigger value="resolved">Resolved</Tabs.Trigger>
	</Tabs.List>
	<Tabs.Content value="new">New items</Tabs.Content>
	<Tabs.Content value="reviewed">Reviewed items</Tabs.Content>
	<Tabs.Content value="resolved">Resolved items</Tabs.Content>
</Tabs.Root>
<button type="button">After tabs</button>
