export function subjectDetails(input: {
	subjectType: string;
	subjectId: string;
	subjectLabel?: string | null;
}): Record<string, string> {
	const details: Record<string, string> = {
		subject_type: input.subjectType,
		subject_id: input.subjectId
	};

	if (input.subjectLabel) {
		details.subject_label = input.subjectLabel;
	}

	return details;
}

export function reviewerDetails(userId: string | null | undefined): Record<string, string> {
	if (!userId) return {};
	return { reviewer_user_id: userId };
}
