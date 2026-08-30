import en from '../../../../i18n/messages/en.json'
import de from '../../../../i18n/messages/de.json'

describe('simulation navigation messages', () => {
  test.each([
    ['en', en],
    ['de', de],
  ] as const)('%s defines all five simulation navigation labels', (_locale, messages) => {
    const compact = messages.simulationCompact
    expect(compact.tabs.overview).toBeTruthy()
    expect(compact.tabs.plan).toBeTruthy()
    expect(compact.tabs.cashflow).toBeTruthy()
    expect(compact.tabs.scenarios).toBeTruthy()
    expect(compact.compareButton).toBeTruthy()
  })
})
