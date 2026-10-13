<script lang="ts">
	import * as TypeManagementWorkspace from './index.js';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	const types = [
		{ title: 'Annual Qualification', description: 'Expires after 12 months', disabled: false },
		{ title: 'CPR', description: 'Expires after 24 months', disabled: false },
		{ title: 'Range Day', description: 'Archived', disabled: true }
	];
	let { onkeydown, textControls = false }: { onkeydown?: (event: KeyboardEvent) => void; textControls?: boolean } =
		$props();
	let selected = $state('Annual Qualification');
</script>

<TypeManagementWorkspace.Root aria-label="Type management workspace test">
	<TypeManagementWorkspace.Layout>
		<TypeManagementWorkspace.List aria-label="Types">
			<TypeManagementWorkspace.ItemList aria-label="Types" {...onkeydown ? { onkeydown } : {}}>
				{#each types as type (type.title)}
					<TypeManagementWorkspace.ListItem
						title={type.title}
						description={type.description}
						color="#8a5800"
						disabled={type.disabled}
						selected={selected === type.title}
						onselect={() => (selected = type.title)}
					>
						{#snippet actions()}
							{#if textControls}
								<Input aria-label="Note for {type.title}" />
								<span contenteditable="true" role="textbox" aria-label="Memo for {type.title}" tabindex="-1"></span>
							{/if}
							<Button variant="outline" size="icon" type="button" aria-label="Move {type.title} up">
								<span aria-hidden="true">↑</span>
							</Button>
							<Button variant="outline" size="icon" type="button" aria-label="Delete {type.title}">
								<span aria-hidden="true">×</span>
							</Button>
						{/snippet}
					</TypeManagementWorkspace.ListItem>
				{/each}
			</TypeManagementWorkspace.ItemList>
		</TypeManagementWorkspace.List>
		<TypeManagementWorkspace.Detail>
			<TypeManagementWorkspace.MobileBack onclick={() => undefined}>Types</TypeManagementWorkspace.MobileBack>
			<TypeManagementWorkspace.Stack>
				<TypeManagementWorkspace.DetailHeader title="Annual Qualification" color="#8a5800" />
				<TypeManagementWorkspace.FormSection title="Basics">
					<p>Shared section chrome, route-owned controls.</p>
				</TypeManagementWorkspace.FormSection>
				<TypeManagementWorkspace.Description>Shared detail copy.</TypeManagementWorkspace.Description>
				<TypeManagementWorkspace.Disclosure title="Advanced targeting" description="Collapsed shared controls">
					<p>Route-owned targeting controls.</p>
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
