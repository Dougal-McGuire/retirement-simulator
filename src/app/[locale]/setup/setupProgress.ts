type SetupProgress = {
  currentStep?: unknown
}

function isSetupProgress(value: unknown): value is SetupProgress {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseSetupProgressStep(savedProgress: string | null, stepCount: number) {
  if (!savedProgress) return null

  let parsed: unknown

  try {
    parsed = JSON.parse(savedProgress)
  } catch {
    return null
  }

  if (!isSetupProgress(parsed)) return null

  const { currentStep } = parsed

  if (typeof currentStep !== 'number' || !Number.isInteger(currentStep)) {
    return null
  }

  const maxStepIndex = Math.max(0, stepCount - 1)

  return Math.max(0, Math.min(currentStep, maxStepIndex))
}
