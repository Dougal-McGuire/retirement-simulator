import {
  ASSUMPTION_PANELS,
  adjacentPanels,
  assumptionPanel,
  isAssumptionPanel,
  panelForField,
} from '@/components/plans/planSections'

describe('assumption panels', () => {
  it('lists the four panels in walking order with their stable body ids', () => {
    expect(ASSUMPTION_PANELS.map((panel) => [panel.id, panel.bodyId])).toEqual([
      ['person', 'plan-editor-personal'],
      ['savings', 'plan-editor-income'],
      ['flows', 'plan-editor-expenses'],
      ['market', 'plan-editor-market'],
    ])
    expect(assumptionPanel('flows').messageKey).toBe('cashFlows')
  })

  it('recognises panel ids and nothing else', () => {
    for (const id of ['person', 'savings', 'flows', 'market'])
      expect(isAssumptionPanel(id)).toBe(true)
    for (const junk of ['withdrawal', 'personal', '', null, undefined, 3]) {
      expect(isAssumptionPanel(junk)).toBe(false)
    }
  })

  it('walks the panels in order with no wrap-around', () => {
    expect(adjacentPanels('person')).toEqual({ previous: undefined, next: 'savings' })
    expect(adjacentPanels('savings')).toEqual({ previous: 'person', next: 'flows' })
    expect(adjacentPanels('flows')).toEqual({ previous: 'savings', next: 'market' })
    expect(adjacentPanels('market')).toEqual({ previous: 'flows', next: undefined })
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
