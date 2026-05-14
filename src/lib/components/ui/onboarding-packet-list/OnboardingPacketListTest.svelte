<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Stepper from '$lib/components/ui/stepper';
	import * as OnboardingPacketList from './index';

	let {
		readOnly = false,
		loading = false
	}: {
		readOnly?: boolean;
		loading?: boolean;
	} = $props();

	let expanded = $state('packet-a');
	let notesOpen = $state(false);
	let checkboxComplete = $state(false);
	let changeCount = $state(0);
</script>

<p data-testid="expanded-value">{expanded}</p>
<p data-testid="change-count">{changeCount}</p>

<OnboardingPacketList.Root bind:value={expanded} onValueChange={() => (changeCount += 1)}>
	<OnboardingPacketList.Item value="packet-a">
		<OnboardingPacketList.Trigger>
			<OnboardingPacketList.Summary>
				<OnboardingPacketList.SummaryTitle title="Jordan Lee" meta={['Initial Entry', 'HQ', 'Started May 1, 2026']} />
				{#snippet progress()}
					<OnboardingPacketList.Progress value={2} max={4} />
				{/snippet}
			</OnboardingPacketList.Summary>
		</OnboardingPacketList.Trigger>
		<OnboardingPacketList.Content>
			<OnboardingPacketList.Actions>
				<Button size="sm" disabled={readOnly || loading}>{loading ? 'Saving...' : 'Mark Complete'}</Button>
				<Button size="sm" variant="outline" disabled={readOnly}>Re-sync</Button>
			</OnboardingPacketList.Actions>
			<OnboardingPacketList.StepList>
				<OnboardingPacketList.Step
					label="Complete sponsor brief"
					typeLabel="Checkbox"
					tone="checkbox"
					state={checkboxComplete ? 'complete' : 'incomplete'}
				>
					{#snippet status()}
						<Checkbox aria-label="Mark sponsor brief complete" bind:checked={checkboxComplete} disabled={readOnly} />
					{/snippet}
					<OnboardingPacketList.Notes bind:open={notesOpen} count={2}>
						<OnboardingPacketList.NoteInput value="" onAdd={() => undefined} />
						<OnboardingPacketList.Note text="Bring packet to S1." time="May 1" />
						<OnboardingPacketList.Note text="Sponsor assigned." time="May 2" />
					</OnboardingPacketList.Notes>
				</OnboardingPacketList.Step>

				<OnboardingPacketList.Step label="Cyber Awareness" typeLabel="Training" tone="training" state="incomplete">
					{#snippet status()}
						<OnboardingPacketList.StatusIcon state="incomplete" label="Incomplete" />
						<Button href="/training" variant="outline" size="sm">Record Training</Button>
					{/snippet}
				</OnboardingPacketList.Step>

				<OnboardingPacketList.Step label="Finance packet" typeLabel="Paperwork" tone="paperwork" state="pending">
					{#snippet status()}
						<Stepper.Root
							steps={[
								{ value: 'Issued', label: 'Issued', completed: true },
								{ value: 'Submitted', label: 'Submitted' },
								{ value: 'Reviewed', label: 'Reviewed' }
							]}
							value="Submitted"
						>
							<Stepper.List class="gap-0 overflow-visible pb-0">
								<Stepper.Item value="Issued" completed>
									<Stepper.Trigger class="min-h-0 gap-1 rounded-md p-1">
										<Stepper.Indicator class="size-4 text-[9px] [&>svg]:size-2.5" />
										<Stepper.Label class="max-w-20 truncate font-mono text-xs font-medium uppercase"
											>Issued</Stepper.Label
										>
									</Stepper.Trigger>
								</Stepper.Item>
								<Stepper.Item value="Submitted">
									<Stepper.Trigger class="min-h-0 gap-1 rounded-md p-1">
										<Stepper.Indicator class="size-4 text-[9px] [&>svg]:size-2.5" />
										<Stepper.Label class="max-w-20 truncate font-mono text-xs font-medium uppercase">
											Submitted
										</Stepper.Label>
									</Stepper.Trigger>
								</Stepper.Item>
								<Stepper.Item value="Reviewed">
									<Stepper.Trigger class="min-h-0 gap-1 rounded-md p-1">
										<Stepper.Indicator class="size-4 text-[9px] [&>svg]:size-2.5" />
										<Stepper.Label class="max-w-20 truncate font-mono text-xs font-medium uppercase">
											Reviewed
										</Stepper.Label>
									</Stepper.Trigger>
								</Stepper.Item>
							</Stepper.List>
						</Stepper.Root>
					{/snippet}
				</OnboardingPacketList.Step>

				<OnboardingPacketList.Step
					label="Legacy welcome form"
					typeLabel="Removed"
					tone="inactive"
					state="inactive"
					inactiveNote="Removed from template"
				/>
			</OnboardingPacketList.StepList>
		</OnboardingPacketList.Content>
	</OnboardingPacketList.Item>

	<OnboardingPacketList.Item value="packet-b">
		<OnboardingPacketList.Trigger>
			<OnboardingPacketList.Summary>
				<OnboardingPacketList.SummaryTitle title="Morgan Price" meta={['Officer Transfer', 'A Co']} />
				{#snippet progress()}
					<OnboardingPacketList.Progress value={3} max={3} label="3/3 complete" />
				{/snippet}
			</OnboardingPacketList.Summary>
		</OnboardingPacketList.Trigger>
		<OnboardingPacketList.Content>
			<OnboardingPacketList.StepList>
				<OnboardingPacketList.Step label="All steps complete" typeLabel="Checkbox" tone="checkbox" state="complete">
					{#snippet status()}
						<OnboardingPacketList.StatusIcon state="complete" label="Complete" />
					{/snippet}
					<OnboardingPacketList.Notes count={0} readOnly />
				</OnboardingPacketList.Step>
			</OnboardingPacketList.StepList>
		</OnboardingPacketList.Content>
	</OnboardingPacketList.Item>
</OnboardingPacketList.Root>
