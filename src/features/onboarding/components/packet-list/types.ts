export type PacketOutcome = 'completed' | 'cancelled';

/** One note as the expanded row shows it: the words, and who wrote them where and when. */
export interface PacketNoteEntry {
	text: string;
	byline: string;
}
