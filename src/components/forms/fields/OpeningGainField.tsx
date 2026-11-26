import { useTranslations } from 'next-intl'
import { useMoney } from '@/lib/hooks/useMoney'
import { openingReturnPercent, gainFromOpeningReturn } from '@/lib/simulation/openingReturn'
import { LabeledNumberInput } from './LabeledNumberInput'

interface OpeningGainFieldProps {
  id: string
  assets: number
  gain: number
  onChange: (gain: number) => void
  onInvalidChange: (invalid: boolean) => void
}

/** Both entry points accept the broker’s percentage and persist the original euro-based plan format. */
export function OpeningGainField({
  id,
  assets,
  gain,
  onChange,
  onInvalidChange,
}: OpeningGainFieldProps) {
  const t = useTranslations('setup')
  const money = useMoney()

  const rate = openingReturnPercent({ currentAssets: assets, initialUnrealizedGain: gain })

  return (
    <LabeledNumberInput
      id={id}
      label={t('assets.fields.initialUnrealizedGain.label')}
      value={rate === null ? NaN : Number(rate.toFixed(12))}
      onChange={(percent) => onChange(gainFromOpeningReturn(assets, percent))}
      helpText={
        rate === null
          ? t('assets.fields.initialUnrealizedGain.zeroBasis')
          : t('assets.fields.initialUnrealizedGain.help', { basis: money.full(assets - gain) })
      }
      helpPlacement="inline"
      unit="%"
      decimalPercent
      min={-99.99}
      max={100_000}
      disabled={assets === 0}
      rangeMessage={t('assets.fields.initialUnrealizedGain.range')}
      invalidMessage={t('validation.notANumber')}
      onInvalidChange={onInvalidChange}
    />
  )
}
