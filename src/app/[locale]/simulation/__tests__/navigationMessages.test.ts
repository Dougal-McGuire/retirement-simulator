import en from '../../../../../../messages/en.json'
import de from '../../../../../../messages/de.json'

describe('simulation navigation messages', () => {
  test.each([
    ['en', en],
    ['de', de],
  ] as const)('%s defines the simulation navigation label and compare tab', (_locale, messages) => {
    expect(messages.simulationCompact.navigationLabel).toBeTruthy()
    expect(messages.simulationCompact.compareButton).toBeTruthy()
  })
})
