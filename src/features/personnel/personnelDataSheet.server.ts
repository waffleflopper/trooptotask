import { z } from 'zod';
import { RequestFailure } from '$lib/errors';
import { applyExtendedInfoUpdate, prepareExtendedInfoUpdate } from './personnelExtendedInfo.server';
import { applyPersonnelRecordUpdate, preparePersonnelRecordUpdate } from './personnelRecordOperations.server';
import { failParse, fieldFromFailureReason } from './personnelFieldFailure';
import type { PersonnelDataSheetSaveResult } from './personnelExtendedInfo.types';
import { PersonnelDodIdConflict } from './personnelSheetPersistence';

type DataSheetContext = Parameters<typeof prepareExtendedInfoUpdate>[0] &
	Parameters<typeof preparePersonnelRecordUpdate>[0];

const fieldValues = z.record(z.string(), z.unknown());
const dataSheetInput = z.object({ basicInfo: fieldValues, extendedInfo: fieldValues });

/**
 * Saves a Person's basic info and extended info as one command. Both halves are validated and
 * authorized before either is written, so an invalid half leaves the record untouched. The two writes are
 * separate provider calls, so a database failure on the Person write after the sheet write leaves the sheet saved.
 * Saving again converges both.
 */
export async function savePersonnelDataSheet(
	ctx: DataSheetContext,
	personnelId: string,
	rawInput: unknown
): Promise<PersonnelDataSheetSaveResult> {
	const parsed = dataSheetInput.safeParse(rawInput);
	if (!parsed.success) failParse(parsed.error);
	const { basicInfo, extendedInfo } = parsed.data;

	let prepared;
	try {
		// Sheet preparation conceals a Person outside the saver's Groups before any other check can answer for them.
		const extended = await prepareExtendedInfoUpdate(ctx, { ...extendedInfo, personnelId });
		const basic = await preparePersonnelRecordUpdate(ctx, { ...basicInfo, id: personnelId });
		prepared = { extended, basic };
	} catch (error) {
		if (!(error instanceof RequestFailure)) throw error;
		const field = fieldFromFailureReason(error.reason);
		if (!field) throw error;
		return { saved: false, field, message: error.message };
	}

	// The Person write goes last because a name change replaces the slug the client navigates to.
	let savedExtendedInfo;
	try {
		savedExtendedInfo = await applyExtendedInfoUpdate(ctx, prepared.extended);
	} catch (error) {
		if (!(error instanceof PersonnelDodIdConflict)) throw error;
		return { saved: false, field: 'dodId', message: error.message };
	}
	const person = await applyPersonnelRecordUpdate(ctx, prepared.basic);
	return { saved: true, person, extendedInfo: savedExtendedInfo };
}
