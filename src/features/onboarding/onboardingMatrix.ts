import type {
	OnboardingStepProgress,
	OnboardingStepType,
	OnboardingTemplate,
	OnboardingTemplateStep,
	PersonnelOnboarding
} from './onboarding.types';
import { daysAtStage, isStepStalled, summarizePacket, type PacketSummary, type Today } from './onboardingStatus';

/**
 * What one packet shows for one template step. `stage` is a paperwork step
 * that has reached a stage, `open` is every other unfinished step, and
 * `missing` is a step the packet has no row for yet (it was added to the
 * template after the packet last synced).
 */
export type MatrixCell =
	| { kind: 'missing' }
	| { kind: 'done'; step: OnboardingStepProgress }
	| { kind: 'open'; step: OnboardingStepProgress }
	| {
			kind: 'stage';
			step: OnboardingStepProgress;
			stage: string;
			index: number;
			of: number;
			days: number;
			stalled: boolean;
	  };

export interface MatrixColumn {
	/** The template step's id, which each packet step row points back to. */
	id: string;
	name: string;
	stepType: OnboardingStepType;
	/** Soldiers in this grid who are not done with the step. */
	open: number;
	/** Soldiers in this grid who are stalled on the step. */
	stalled: number;
}

export interface MatrixRow {
	summary: PacketSummary;
	/** Every active step is done, so the row collapses to one line with Close out. */
	ready: boolean;
	/** One cell per grid column, in column order. */
	cells: MatrixCell[];
}

export interface MatrixGrid {
	template: OnboardingTemplate;
	columns: MatrixColumn[];
	/** Oldest start first. */
	rows: MatrixRow[];
}

export interface PacketMatrix {
	/** Templates with packets in the filtered set, most packets first. */
	grids: MatrixGrid[];
	/** Packets that belong to no grid because they have no template. */
	withoutTemplate: number;
}

function cellFor(step: OnboardingStepProgress | undefined, today: Today): MatrixCell {
	if (!step) return { kind: 'missing' };
	if (step.completed) return { kind: 'done', step };
	const stages = step.stages ?? [];
	const index = step.stepType === 'paperwork' && step.currentStage !== null ? stages.indexOf(step.currentStage) : -1;
	if (index < 0) return { kind: 'open', step };
	return {
		kind: 'stage',
		step,
		stage: stages[index],
		index: index + 1,
		of: stages.length,
		days: daysAtStage(step, today),
		stalled: isStepStalled(step, today)
	};
}

function byStartDate(a: PacketSummary, b: PacketSummary): number {
	return a.packet.startedAt.localeCompare(b.packet.startedAt) || a.packet.id.localeCompare(b.packet.id);
}

function buildGrid(
	template: OnboardingTemplate,
	packets: readonly PersonnelOnboarding[],
	templateSteps: readonly OnboardingTemplateStep[],
	today: Today
): MatrixGrid {
	const steps = templateSteps
		.filter((step) => step.templateId === template.id)
		.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
	const columns: MatrixColumn[] = steps.map((step) => ({
		id: step.id,
		name: step.name,
		stepType: step.stepType,
		open: 0,
		stalled: 0
	}));
	const rows = packets
		.map((packet) => summarizePacket(packet, today))
		.sort(byStartDate)
		.map<MatrixRow>((summary) => {
			const cells = columns.map((column) =>
				cellFor(
					summary.packet.steps.find((step) => step.active && step.templateStepId === column.id),
					today
				)
			);
			cells.forEach((cell, index) => {
				if (cell.kind === 'open' || cell.kind === 'stage') columns[index].open++;
				if (cell.kind === 'stage' && cell.stalled) columns[index].stalled++;
			});
			return { summary, ready: summary.status === 'ready', cells };
		});
	return { template, columns, rows };
}

/** One grid per template that has in-progress packets, built from the already filtered packets. */
export function buildPacketMatrix(
	packets: readonly PersonnelOnboarding[],
	templates: readonly OnboardingTemplate[],
	templateSteps: readonly OnboardingTemplateStep[],
	today: Today
): PacketMatrix {
	const byTemplate = new Map<string, PersonnelOnboarding[]>();
	let withoutTemplate = 0;
	for (const packet of packets) {
		const known = packet.templateId !== null && templates.some((template) => template.id === packet.templateId);
		if (!known) {
			withoutTemplate++;
			continue;
		}
		byTemplate.set(packet.templateId!, [...(byTemplate.get(packet.templateId!) ?? []), packet]);
	}
	const grids = templates
		.filter((template) => byTemplate.has(template.id))
		.map((template) => buildGrid(template, byTemplate.get(template.id)!, templateSteps, today))
		.sort((a, b) => b.rows.length - a.rows.length || a.template.name.localeCompare(b.template.name));
	return { grids, withoutTemplate };
}

function dayLabel(days: number): string {
	return days === 1 ? '1 day' : `${days} days`;
}

/** The accessible name of a cell: the step and where it stands. */
export function describeCell(cell: MatrixCell, stepName: string): string {
	switch (cell.kind) {
		case 'missing':
			return `${stepName}: not on this packet yet`;
		case 'done':
			return `${stepName}: done`;
		case 'open':
			return `${stepName}: open`;
		case 'stage':
			return `${stepName}: ${cell.stage}, stage ${cell.index} of ${cell.of}, ${dayLabel(cell.days)}${cell.stalled ? ', stalled' : ''}`;
	}
}

/** The one-line headline a cell's popover opens with. */
export function stepHeadline(step: OnboardingStepProgress, today: Today): string {
	if (step.completed) return 'Done';
	if (step.stepType === 'paperwork') {
		if (step.currentStage === null) return 'Not started';
		return `${step.currentStage} for ${dayLabel(daysAtStage(step, today))}`;
	}
	if (step.stepType === 'training') return 'Waiting on training record';
	return 'Open';
}
