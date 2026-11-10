/**
 * Version of the calculation as a user experiences it: bumped when the engine
 * gives a stored plan visibly different numbers than the release before.
 *
 * It is not the plan schema (`PLAN_SCHEMA_VERSION`): the stored plan is read
 * exactly as before, only what is computed from it moved. The store keeps the
 * version next to the success rates it remembers per plan; rates from an
 * older version are set aside and explained once (`CalcChangeNotice`) instead
 * of being shown as if this engine had produced them.
 *
 * 1: releases up to 2026-11-09.
 * 2: withdrawal rules spend other income, success needs every year funded,
 *    one tax assessment per year, real series at the closing price level
 *    (docs/specs/2026-11-09-withdrawal-rules-with-income.md).
 */
export const CALC_VERSION = 2
