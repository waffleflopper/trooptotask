<script lang="ts">
	import { ArrowDown, ArrowUp, Trash2 } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import * as TypeWorkspace from '$lib/components/ui/type-workspace/index.js';
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar/index.js';

	const typeWorkspaceItems = [
		{
			id: 'weapons',
			name: 'Weapons Qualification',
			color: '#8a5800',
			summary: 'Annual requirement, applies to all assigned personnel'
		},
		{
			id: 'cyber',
			name: 'Cyber Awareness',
			color: '#2f5d75',
			summary: 'Expires after 12 months, warning at 60 days'
		},
		{
			id: 'drivers',
			name: 'Driver Training',
			color: '#345b22',
			summary: 'Optional for staff sections, can be exempted'
		}
	];
	const selectedTypeWorkspaceItem = typeWorkspaceItems[0];
</script>

<section class="grid gap-4" aria-labelledby="type-workspace-title">
	<h2 id="type-workspace-title" class="text-xl font-semibold tracking-tight">Type workspace</h2>
	<TypeWorkspace.Root aria-label="Showroom type management workspace">
		<WorkspaceToolbar.Root ariaLabel="Showroom type workspace controls">
			<WorkspaceToolbar.Group label="Type workspace actions" zone="actions">
				<Button type="button">New type</Button>
				<Button variant="outline" type="button" disabled>Import disabled</Button>
			</WorkspaceToolbar.Group>
		</WorkspaceToolbar.Root>

		<TypeWorkspace.Layout>
			<TypeWorkspace.List aria-label="Type list preview">
				<TypeWorkspace.ItemList role="listbox" aria-label="Training type examples">
					{#each typeWorkspaceItems as item, index (item.id)}
						<TypeWorkspace.ListItem
							selected={item.id === selectedTypeWorkspaceItem.id}
							color={item.color}
							title={item.name}
							description={item.summary}
							role="option"
							aria-selected={item.id === selectedTypeWorkspaceItem.id}
							disabled={index === 2}
							onselect={() => undefined}
						>
							{#snippet actions()}
								<Button
									variant="outline"
									size="icon"
									type="button"
									aria-label={`Move ${item.name} up`}
									disabled={index === 0}
								>
									<ArrowUp aria-hidden="true" />
								</Button>
								<Button
									variant="outline"
									size="icon"
									type="button"
									aria-label={`Move ${item.name} down`}
									disabled={index === typeWorkspaceItems.length - 1}
								>
									<ArrowDown aria-hidden="true" />
								</Button>
							{/snippet}
						</TypeWorkspace.ListItem>
					{/each}
				</TypeWorkspace.ItemList>
			</TypeWorkspace.List>

			<TypeWorkspace.Detail aria-label="Selected type details">
				<TypeWorkspace.MobileBack onclick={() => undefined}>Type list</TypeWorkspace.MobileBack>
				<TypeWorkspace.Stack>
					<TypeWorkspace.DetailHeader title={selectedTypeWorkspaceItem.name} color={selectedTypeWorkspaceItem.color}>
						{#snippet actions()}
							<Button variant="outline" size="sm" type="button">Edit</Button>
						{/snippet}
					</TypeWorkspace.DetailHeader>

					<TypeWorkspace.Description>
						Showroom baseline for the shared manage-type workspace. Routes provide data and behavior; this chrome owns
						the visual pattern.
					</TypeWorkspace.Description>

					<TypeWorkspace.Form title="Basics">
						<Field.Root>
							<Field.Label for="type-workspace-name">Name</Field.Label>
							<Input id="type-workspace-name" value={selectedTypeWorkspaceItem.name} />
						</Field.Root>
						<Field.Root>
							<Field.Label for="type-workspace-description">Description</Field.Label>
							<Textarea
								id="type-workspace-description"
								value="Route-owned description field inside shared section chrome."
							/>
						</Field.Root>
					</TypeWorkspace.Form>

					<TypeWorkspace.Form title="Applicability">
						<TypeWorkspace.Description
							>Use presets first, then reveal targeting for exceptions.</TypeWorkspace.Description
						>
						<TypeWorkspace.ChoiceGroup aria-label="Applicability presets">
							<Button type="button" size="sm" variant="secondary">Everyone</Button>
							<Button type="button" size="sm" variant="outline">Optional</Button>
							<Button type="button" size="sm" variant="outline">Targeted</Button>
						</TypeWorkspace.ChoiceGroup>
						<TypeWorkspace.Disclosure
							title="Targeting"
							description="Shared searchable controls for broad targeting and exception sets."
						>
							<TypeWorkspace.GroupSelector
								title="Roles"
								values={['Infantry', 'Medical', 'Operations', 'Supply', 'Training Room']}
								selected={['Medical', 'Training Room']}
								onchange={() => undefined}
							/>
						</TypeWorkspace.Disclosure>
					</TypeWorkspace.Form>

					<TypeWorkspace.Form title="Expiration" layout="two-column">
						<Field.Root>
							<Field.Label for="type-workspace-duration">Months until expiration</Field.Label>
							<Input id="type-workspace-duration" type="number" value="12" />
						</Field.Root>
						<Field.Root>
							<Field.Label for="type-workspace-warning">Warning threshold</Field.Label>
							<Input id="type-workspace-warning" type="number" value="60" />
						</Field.Root>
					</TypeWorkspace.Form>

					<TypeWorkspace.FactList>
						<TypeWorkspace.Impact label="Applies to">All assigned personnel</TypeWorkspace.Impact>
						<TypeWorkspace.Impact label="Expiration policy">Expires after 12 months</TypeWorkspace.Impact>
						<TypeWorkspace.Impact label="Permission state">Edit allowed for training managers</TypeWorkspace.Impact>
					</TypeWorkspace.FactList>

					<TypeWorkspace.Actions>
						<Button variant="destructive" size="sm" type="button">
							<Trash2 aria-hidden="true" />
							Delete
						</Button>
						<TypeWorkspace.ActionSpacer />
						<Button variant="outline" size="sm" type="button">Cancel</Button>
						<Button size="sm" type="button">Save</Button>
					</TypeWorkspace.Actions>
				</TypeWorkspace.Stack>
			</TypeWorkspace.Detail>
		</TypeWorkspace.Layout>
	</TypeWorkspace.Root>
</section>
