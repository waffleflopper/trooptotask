<script lang="ts">
	import type { Personnel, TrainingType, PersonnelTraining } from '../types';
	import { getTrainingStatus } from '../utils/trainingStatus';

	interface Props {
		personnel: Personnel[];
		trainingTypes: TrainingType[];
		trainings: PersonnelTraining[];
		onCellClick: (person: Personnel, type: TrainingType, training: PersonnelTraining | undefined) => void;
	}

	let { personnel, trainingTypes, trainings, onCellClick }: Props = $props();

	// Create a map for quick training lookup
	const trainingMap = $derived(() => {
		const map = new Map<string, PersonnelTraining>();
		for (const t of trainings) {
			map.set(`${t.personnelId}-${t.trainingTypeId}`, t);
		}
		return map;
	});

	function getTraining(personnelId: string, typeId: string) {
		return trainingMap().get(`${personnelId}-${typeId}`);
	}
</script>

<div class="matrix-container">
	<table class="matrix">
		<thead>
			<tr>
				<th class="name-header">Personnel</th>
				{#each trainingTypes as type (type.id)}
					<th class="type-header">
						<span class="type-name" style="background-color: {type.color}">
							{type.name}
						</span>
					</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each personnel as person (person.id)}
				<tr>
					<td class="name-cell">
						<span class="person-rank">{person.rank}</span>
						{person.lastName}, {person.firstName}
					</td>
					{#each trainingTypes as type (type.id)}
						{@const training = getTraining(person.id, type.id)}
						{@const statusInfo = getTrainingStatus(training, type, person)}
						<td class="status-cell">
							<button
								class="status-badge"
								style="background-color: {statusInfo.color}"
								onclick={() => onCellClick(person, type, training)}
							>
								{statusInfo.label}
							</button>
							{#if training}
								<span class="completion-date">{training.completionDate}</span>
							{/if}
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.matrix-container {
		overflow: auto;
		max-height: 100%;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		background: var(--color-surface);
	}

	.matrix {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--font-size-sm);
	}

	.matrix thead {
		position: sticky;
		top: 0;
		z-index: 10;
		background: var(--color-surface);
	}

	.matrix th,
	.matrix td {
		padding: var(--spacing-sm);
		border-bottom: 1px solid var(--color-border);
		text-align: center;
		white-space: nowrap;
	}

	.name-header,
	.name-cell {
		position: sticky;
		left: 0;
		background: var(--color-surface);
		z-index: 5;
		text-align: left;
		min-width: 180px;
		border-right: 2px solid var(--color-border);
		color: var(--color-text);
	}

	.name-header {
		z-index: 15;
	}

	.type-header {
		min-width: 100px;
		vertical-align: bottom;
	}

	.type-name {
		display: inline-block;
		padding: var(--spacing-xs) var(--spacing-sm);
		border-radius: var(--radius-sm);
		color: white;
		font-weight: 500;
		font-size: var(--font-size-sm);
	}

	.person-rank {
		display: inline-block;
		font-weight: 600;
		color: var(--color-text-muted);
		min-width: 35px;
		margin-right: var(--spacing-xs);
	}

	.status-cell {
		vertical-align: middle;
	}

	.status-badge {
		display: inline-block;
		padding: var(--spacing-xs) var(--spacing-sm);
		border-radius: var(--radius-sm);
		color: white;
		font-weight: 500;
		font-size: var(--font-size-sm);
		cursor: pointer;
		border: none;
		transition: opacity 0.15s ease;
	}

	.status-badge:hover {
		opacity: 0.8;
	}

	.completion-date {
		display: block;
		font-size: 10px;
		color: var(--color-text-muted);
		margin-top: 2px;
	}

	tr:hover .name-cell,
	tr:hover td {
		background-color: var(--color-bg);
	}

	tr:hover .name-cell {
		background-color: var(--color-bg);
	}
</style>
