<script lang="ts">
	import * as WorkflowPanel from './index.js';
</script>

<WorkflowPanel.Root aria-label="Workflow panel test">
	<WorkflowPanel.Header>
		<WorkflowPanel.Title>Training type setup</WorkflowPanel.Title>
		<WorkflowPanel.Description>Shared two-panel workflow shell.</WorkflowPanel.Description>
	</WorkflowPanel.Header>
	<WorkflowPanel.Content>
		<WorkflowPanel.Grid>
			<WorkflowPanel.Item selected>
				<strong>Annual qualification</strong>
				<span>Required</span>
			</WorkflowPanel.Item>
			<WorkflowPanel.Item>
				<strong>Configuration</strong>
				<span>Expiration, warning window, and applicability.</span>
			</WorkflowPanel.Item>
		</WorkflowPanel.Grid>
	</WorkflowPanel.Content>
</WorkflowPanel.Root>
