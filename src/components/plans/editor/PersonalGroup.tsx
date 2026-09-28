'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { AlertTriangle } from 'lucide-react'
import { LabeledNumberInput } from '@/components/forms/fields/LabeledNumberInput'
import { WizardSliderField } from '@/components/forms/fields/WizardSliderField'
import { timelineIssues } from '@/lib/validation/fieldValidation'
import { useSimulationParams, useUpdateParams } from '@/lib/stores/simulationStore'
import { PanelGroupBody, useEditorFormat, useInvalidFields } from './shared'

/** Panel `person`: Person & Zeitachse. */
export function PersonalGroup() {
  const t = useTranslations('planEditor')
  const tSetup = useTranslations('setup')
  const params = useSimulationParams()
  const updateParams = useUpdateParams()
  const { invalidFields, markInvalid } = useInvalidFields()
  const { formatInteger, ageRange, notANumber } = useEditorFormat()

  const workingYears = Math.max(0, params.retirementAge - params.currentAge)
  const retirementYears = Math.max(0, params.endAge - params.retirementAge)
  const retirementSliderMin = Math.max(50, Math.min(params.currentAge + 1, 69))

  // Cross-field checks. The wizard has had this callout since the first
  // release; the editor let the same four ages contradict each other in
  // silence, which is where "retire at 67, currently 100" came from.
  const ageIssues = useMemo(
    () =>
      timelineIssues({
        currentAge: params.currentAge,
        retirementAge: params.retirementAge,
        legalRetirementAge: params.legalRetirementAge,
        endAge: params.endAge,
      }),
    [params.currentAge, params.retirementAge, params.legalRetirementAge, params.endAge]
  )
  const personalFieldsInvalid = [
    'editor-currentAge',
    'editor-legalRetirementAge',
    'editor-endAge',
  ].some((field) => invalidFields[field])

  return (
    <PanelGroupBody
      id="plan-editor-personal"
      statsStale={personalFieldsInvalid}
      statsStaleNote={t('sections.staleStats')}
      stats={[
        {
          label: t('summary.workingYears'),
          value: t('summary.years', { count: workingYears }),
        },
        {
          label: t('summary.retirementYears'),
          value: t('summary.years', { count: retirementYears }),
        },
        {
          label: t('summary.pensionGap', { age: params.legalRetirementAge }),
          value: t('summary.years', {
            count: Math.max(0, params.legalRetirementAge - params.retirementAge),
          }),
        },
      ]}
    >
      <div className="grid gap-x-5 gap-y-6 @md:grid-cols-2">
        <LabeledNumberInput
          id="editor-currentAge"
          label={tSetup('personal.fields.currentAge.label')}
          value={params.currentAge}
          onChange={(value) => updateParams({ currentAge: value })}
          helpText={tSetup('personal.fields.currentAge.help')}
          className="w-full"
          min={16}
          max={100}
          rangeMessage={ageRange(16, 100)}
          invalidMessage={notANumber}
          onInvalidChange={(invalid) => markInvalid('editor-currentAge', invalid)}
        />
        <LabeledNumberInput
          id="editor-legalRetirementAge"
          label={tSetup('personal.fields.legalRetirementAge.label')}
          value={params.legalRetirementAge}
          onChange={(value) => updateParams({ legalRetirementAge: value })}
          helpText={tSetup('personal.fields.legalRetirementAge.help')}
          tooltip={tSetup('personal.fields.legalRetirementAge.tooltip')}
          className="w-full"
          min={60}
          max={75}
          rangeMessage={ageRange(60, 75)}
          invalidMessage={notANumber}
          onInvalidChange={(invalid) => markInvalid('editor-legalRetirementAge', invalid)}
        />
      </div>

      <WizardSliderField
        id="editor-retirementAge"
        label={tSetup('personal.fields.retirementAge.label')}
        value={params.retirementAge}
        onValueChange={(value) => updateParams({ retirementAge: value })}
        min={retirementSliderMin}
        max={70}
        step={1}
        valueLabel={formatInteger(params.retirementAge)}
        minLabel={formatInteger(retirementSliderMin)}
        maxLabel={formatInteger(70)}
        helpText={tSetup('personal.fields.retirementAge.help')}
      />

      {/* Cross-field callout, sitting between the fields it is about. */}
      {ageIssues.length > 0 && (
        <div
          role="alert"
          data-testid="editor-timeline-issues"
          className="ws-callout ws-callout-row"
          data-tone={ageIssues.some((issue) => issue.severity === 'error') ? 'danger' : 'warn'}
        >
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <div className="space-y-1">
            {ageIssues.map((issue) => (
              <p key={issue.id}>{tSetup(`validation.${issue.id}`)}</p>
            ))}
          </div>
        </div>
      )}

      <div className="@md:max-w-[50%]">
        <LabeledNumberInput
          id="editor-endAge"
          label={tSetup('personal.fields.endAge.label')}
          value={params.endAge}
          onChange={(value) => updateParams({ endAge: value })}
          helpText={tSetup('personal.fields.endAge.help')}
          className="w-full"
          min={65}
          max={110}
          rangeMessage={ageRange(65, 110)}
          invalidMessage={notANumber}
          onInvalidChange={(invalid) => markInvalid('editor-endAge', invalid)}
        />
      </div>
    </PanelGroupBody>
  )
}
