/** JSON note returned by the current Personnel page, API and archive operations. */
export interface PersonnelLeaderNote {
	id: string;
	personnelId: string;
	/** Organization member label, stored author fallback, or Unknown leader. */
	author: string;
	text: string;
	/** Timestamp string. */
	createdAt: string;
	/** Timestamp string when archived; null when active. */
	archivedAt: string | null;
	/** Organization member label; null while active, or archived before attribution or by a Person archive. */
	archivedBy: string | null;
}
