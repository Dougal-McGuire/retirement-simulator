import { parseSetupProgressStep } from './setupProgress'

describe('parseSetupProgressStep', () => {
  const stepCount = 4

  it('returns null for missing or malformed cached progress', () => {
    expect(parseSetupProgressStep(null, stepCount)).toBeNull()
    expect(parseSetupProgressStep('not-json', stepCount)).toBeNull()
    expect(parseSetupProgressStep('[]', stepCount)).toBeNull()
    expect(parseSetupProgressStep('{"currentStep":"1"}', stepCount)).toBeNull()
    expect(parseSetupProgressStep('{"currentStep":1.5}', stepCount)).toBeNull()
  })

  it('clamps integer cached progress into the setup step range', () => {
    expect(parseSetupProgressStep('{"currentStep":-1}', stepCount)).toBe(0)
    expect(parseSetupProgressStep('{"currentStep":2}', stepCount)).toBe(2)
    expect(parseSetupProgressStep('{"currentStep":99}', stepCount)).toBe(3)
  })
})
