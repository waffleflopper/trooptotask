import type { PersonnelOnboarding } from './onboarding.types';

export const FORMER_MEMBER_LABEL = 'Former member';
export const UNNAMED_MEMBER_LABEL = 'Member';

/** Display names by user id, for the note authors a viewer may see. */
export type NoteAuthorLabels = Readonly<Record<string, string>>;
export type NoteAuthorLookup = (userId: string) => string;

/** Distinct note authors on these packets, without the viewer, whose own notes read "You". */
export function noteAuthorIds(packets: readonly PersonnelOnboarding[], viewerUserId: string): string[] {
	const authors = new Set<string>();
	for (const packet of packets) {
		for (const step of packet.steps) {
			for (const note of step.notes) authors.add(note.userId);
		}
	}
	authors.delete(viewerUserId);
	return [...authors];
}

/**
 * The labels found for the authors present on these packets, as plain data for the client.
 * A member with no email or name comes back labelled by their user id, which is never shown.
 */
export function pickNoteAuthorLabels(
	packets: readonly PersonnelOnboarding[],
	labels: ReadonlyMap<string, string>,
	viewerUserId: string
): NoteAuthorLabels {
	const picked: Record<string, string> = {};
	for (const userId of noteAuthorIds(packets, viewerUserId)) {
		const label = labels.get(userId);
		if (label !== undefined) picked[userId] = label === userId ? UNNAMED_MEMBER_LABEL : label;
	}
	return picked;
}

export function noteAuthorLookup(labels: NoteAuthorLabels, viewerUserId: string): NoteAuthorLookup {
	return (userId) => {
		if (userId === viewerUserId) return 'You';
		return Object.hasOwn(labels, userId) ? labels[userId] : FORMER_MEMBER_LABEL;
	};
}
