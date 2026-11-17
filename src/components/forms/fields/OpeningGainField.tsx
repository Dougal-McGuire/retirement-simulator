import { useTranslations } from 'next-intl'
import { useMoney } from '@/lib/hooks/useMoney'
import { LabeledNumberInput } from './LabeledNumberInput'

interface OpeningGainFieldProps {
  id: string
  assets: number
  gain: number
  onChange: (gain: number) => void
  onInvalidChange: (invalid: boolean) => void
}

/** The same signed euro amount and implied acquisition cost in setup and the editor. */
export function OpeningGainField({
  id,
  assets,
  gain,
  onChange,
  onInvalidChange,
}: OpeningGainFieldProps) {
  const t = useTranslations('setup')
  const money = useMoney()

  return (
    <LabeledNumberInput
      id={id}
      label={t('assets.fields.initialUnrealizedGain.label')}
      value={gain}
      onChange={onChange}
      helpText={t('assets.fields.initialUnrealizedGain.help', { basis: money.full(assets - gain) })}
      helpPlacement="inline"
      unit={t('units.currency')}
      groupThousands
      max={assets}
      disabled={assets === 0}
      rangeMessage={t('assets.fields.initialUnrealizedGain.range')}
      invalidMessage={t('validation.notANumber')}
      onInvalidChange={onInvalidChange}
    />
  )
}
