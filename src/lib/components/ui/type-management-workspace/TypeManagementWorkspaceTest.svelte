<script lang="ts">
	import * as TypeManagementWorkspace from './index.js';
	import { Button } from '$lib/components/ui/button';
</script>

<TypeManagementWorkspace.Root aria-label="Type management workspace test">
	<TypeManagementWorkspace.Layout>
		<TypeManagementWorkspace.List aria-label="Types">
			<TypeManagementWorkspace.ItemList role="listbox" aria-label="Types">
				<TypeManagementWorkspace.ListItem
					title="Annual Qualification"
					description="Expires after 12 months"
					color="#8a5800"
					selected
					onselect={() => undefined}
				>
					{#snippet actions()}
						<Button variant="outline" size="icon" type="button" aria-label="Move annual qualification up">
							<span aria-hidden="true">↑</span>
						</Button>
					{/snippet}
				</TypeManagementWorkspace.ListItem>
			</TypeManagementWorkspace.ItemList>
		</TypeManagementWorkspace.List>
		<TypeManagementWorkspace.Detail>
			<TypeManagementWorkspace.MobileBack onclick={() => undefined}>Types</TypeManagementWorkspace.MobileBack>
			<TypeManagementWorkspace.Stack>
				<TypeManagementWorkspace.DetailHeader title="Annual Qualification" color="#8a5800">
					{#snippet actions()}
						<Button variant="outline" size="sm" type="button">Edit</Button>
					{/snippet}
				</TypeManagementWorkspace.DetailHeader>
				<TypeManagementWorkspace.FormSection title="Basics">
					<p>Shared section chrome, route-owned controls.</p>
				</TypeManagementWorkspace.FormSection>
				<TypeManagementWorkspace.Description>Shared detail copy.</TypeManagementWorkspace.Description>
				<TypeManagementWorkspace.Disclosure title="Advanced targeting" description="Collapsed shared controls">
					<TypeManagementWorkspace.ChoiceGroup>
						<Button variant="outline" size="sm" type="button">Infantry</Button>
					</TypeManagementWorkspace.ChoiceGroup>
				</TypeManagementWorkspace.Disclosure>
				<TypeManagementWorkspace.Choice>
					<p>Shared choice chrome, route-owned option controls.</p>
				</TypeManagementWorkspace.Choice>
				<TypeManagementWorkspace.FactList>
					<TypeManagementWorkspace.Fact label="Expiration">12 months</TypeManagementWorkspace.Fact>
				</TypeManagementWorkspace.FactList>
			</TypeManagementWorkspace.Stack>
		</TypeManagementWorkspace.Detail>
	</TypeManagementWorkspace.Layout>
</TypeManagementWorkspace.Root>
