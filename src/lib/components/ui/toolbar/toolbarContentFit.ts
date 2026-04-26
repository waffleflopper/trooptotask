interface LeadingContentFitInput {
	containerWidth: number;
	paddingInline: number;
	gapWidth: number;
	leadingWidth: number;
	actionsWidth: number;
	overflowWidth?: number;
	slotCount: number;
}

export function isToolbarLeadingContentCrowded({
	containerWidth,
	paddingInline,
	gapWidth,
	leadingWidth,
	actionsWidth,
	overflowWidth = 0,
	slotCount
}: LeadingContentFitInput): boolean {
	const gapTotal = slotCount > 1 ? gapWidth * (slotCount - 1) : 0;
	const occupiedWidth = paddingInline + gapTotal + leadingWidth + actionsWidth + overflowWidth;

	return occupiedWidth > containerWidth;
}
