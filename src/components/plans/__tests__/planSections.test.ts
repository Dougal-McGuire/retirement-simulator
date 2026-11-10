import de from '@/i18n/messages/de.json'
import en from '@/i18n/messages/en.json'
import {
  COLUMN_GROUPS,
  DEFAULT_OPEN_GROUPS,
  isColumnGroup,
  panelForField,
} from '@/components/plans/planSections'

describe('column groups', () => {
  it('lists the five groups top to bottom, the panels keeping their body ids', () => {
    expect(COLUMN_GROUPS.map((group) => [group.id, group.bodyId])).toEqual([
      ['person', 'plan-editor-personal'],
      ['savings', 'plan-editor-income'],
      ['flows', 'plan-editor-expenses'],
      ['rule', 'plan-editor-withdrawal'],
      ['market', 'plan-editor-market'],
    ])
  })

  it('has a title and a header summary for every group in both languages', () => {
    for (const messages of [de, en]) {
      const column = messages.workspace.column
      for (const group of COLUMN_GROUPS) {
        expect((column.groups as Record<string, string>)[group.titleKey]).toEqual(
          expect.any(String)
        )
        expect((column.summary as Record<string, unknown>)[group.id]).toEqual(expect.any(String))
      }
    }
  })

  it('opens Zeit and Einnahmen & Ausgaben by default', () => {
    expect(DEFAULT_OPEN_GROUPS).toEqual(['person', 'flows'])
  })

  it('recognises group ids and nothing else', () => {
    for (const id of ['person', 'savings', 'flows', 'rule', 'market'])
      expect(isColumnGroup(id)).toBe(true)
    for (const junk of ['withdrawal', 'personal', '', null, undefined, 3]) {
      expect(isColumnGroup(junk)).toBe(false)
    }
  })
})

describe('panelForField', () => {
  it.each([
    ['editor-currentAge', 'person'],
    ['editor-legalRetirementAge', 'person'],
    ['editor-retirementAge', 'person'],
    ['editor-endAge', 'person'],
    ['editor-currentAssets', 'savings'],
    ['editor-annualSavings', 'savings'],
    ['editor-annualSavingsGrowthRate', 'savings'],
    ['editor-averageROI', 'market'],
    ['editor-roiVolatility', 'market'],
    ['editor-averageInflation', 'market'],
    ['editor-inflationVolatility', 'market'],
    ['editor-simulationRuns', 'market'],
    ['editor-capitalGainsTax', 'market'],
    ['editor-taxAllowanceAnnual', 'market'],
    ['editor-equityFundExemption', 'market'],
    ['editor-pensionTaxablePortion', 'market'],
    ['editor-pensionTaxRate', 'market'],
    ['editor-bondReturn', 'market'],
    ['editor-bondVolatility', 'market'],
    ['editor-equityAllocationStart', 'market'],
    ['editor-equityAllocationEnd', 'market'],
  ])('puts the real field id %s in the %s panel', (fieldId, panel) => {
    expect(panelForField(fieldId)).toBe(panel)
  })

  it.each([
    ['cashflow-name-new', 'flows'],
    ['cashflow-amount-food', 'flows'],
    ['market-model-historical', 'market'],
    ['glide-path-toggle', 'market'],
    ['household-type-couple', 'market'],
    ['tax-block', 'market'],
    ['planner-dsWithdrawalRate', 'withdrawal'],
    ['withdrawal-strategy-guytonKlinger', 'withdrawal'],
  ])('resolves the prefix of %s to %s', (fieldId, panel) => {
    expect(panelForField(fieldId)).toBe(panel)
  })

  it('does not know the ids the old map made up, or anything else', () => {
    expect(panelForField('editor-taxAllowance')).toBeUndefined()
    expect(panelForField('editor-partialExemption')).toBeUndefined()
    expect(panelForField('something-else')).toBeUndefined()
    expect(panelForField('')).toBeUndefined()
    expect(panelForField('toString')).toBeUndefined()
  })
})
