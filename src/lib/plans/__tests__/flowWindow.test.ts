import type { CashFlow } from '@/types'
import en from '@/i18n/messages/en.json'
import de from '@/i18n/messages/de.json'
import {
  flowWindow,
  flowWindowKey,
  flowWindowLabel,
  monthFormatter,
  type FlowWindowTranslator,
} from '../flowWindow'

const context = { currentAge: 45, legalRetirementAge: 67 }

/**
 * The real catalogs, resolved the way `useTranslations('setup.cashFlows')`
 * resolves these plain-argument messages (next-intl ships ESM only, which
 * this Jest setup does not load).
 */
const translator = (locale: 'en' | 'de'): FlowWindowTranslator => {
  const window = (locale === 'en' ? en : de).setup.cashFlows.window as Record<string, string>
  return (key, values) =>
    window[key.replace(/^window\./, '')].replace(/\{(\w+)\}/g, (_match, name: string) =>
      String(values[name])
    )
}

const formatMonth = (locale: string) =>
  monthFormatter({
    dateTime: (value, options) => new Intl.DateTimeFormat(locale, options).format(value),
  })

const flow = (overrides: Partial<CashFlow>): CashFlow => ({
  id: 'x',
  kind: 'expense',
  name: 'X',
  amount: 100,
  frequency: 'monthly',
  ...overrides,
})

const label = (locale: 'en' | 'de', entry: CashFlow, ctx = context) =>
  flowWindowLabel(entry, ctx, translator(locale), { formatMonth: formatMonth(locale) })

describe('flowWindowLabel', () => {
  it.each([
    ['lifetime', flow({}), 'Whole plan', 'Gesamter Plan'],
    ['range', flow({ startAge: 80, endAge: 90 }), 'Age 80–90', 'Alter 80–90'],
    ['from', flow({ startAge: 70 }), 'From age 70', 'Ab Alter 70'],
    ['until', flow({ endAge: 75 }), 'Until age 75', 'Bis Alter 75'],
    ['once', flow({ kind: 'income', frequency: 'once', startAge: 62 }), 'At age 62', 'Mit 62'],
    [
      'once without an age (current age)',
      flow({ kind: 'income', frequency: 'once' }),
      'At age 45',
      'Mit 45',
    ],
    [
      'pension without a start (statutory age)',
      flow({ kind: 'pension' }),
      'From age 67',
      'Ab Alter 67',
    ],
    ['pension with an end', flow({ kind: 'pension', endAge: 85 }), 'Age 67–85', 'Alter 67–85'],
  ])('%s', (_name, entry, english, german) => {
    expect(label('en', entry)).toBe(english)
    expect(label('de', entry)).toBe(german)
  })

  it('names the payment month of a one-off when it has one', () => {
    const entry = flow({ kind: 'income', frequency: 'once', startAge: 62, startDate: '2042-05' })
    expect(label('en', entry)).toBe('May 2042 · age 62')
    expect(label('de', entry)).toBe('Mai 2042 · Alter 62')
    // Without a month formatter, by age alone.
    expect(flowWindowLabel(entry, context, translator('en'))).toBe('At age 62')
  })

  it("leaves an unset end unset whatever the plan's horizon", () => {
    const entry = flow({ startAge: 70 })
    expect(label('de', entry, { currentAge: 30, legalRetirementAge: 67 })).toBe('Ab Alter 70')
    expect(flowWindow(flow({}), context)).toEqual({ type: 'lifetime' })
  })
})

describe('flowWindowKey', () => {
  const samples: CashFlow[] = [
    flow({}),
    flow({ startAge: 80, endAge: 90 }),
    flow({ startAge: 70 }),
    flow({ startAge: 67 }),
    flow({ endAge: 75 }),
    flow({ kind: 'pension' }),
    flow({ kind: 'pension', startAge: 67 }),
    flow({ kind: 'pension', startAge: 63 }),
    flow({ kind: 'income', frequency: 'once', startAge: 62 }),
    flow({ kind: 'income', frequency: 'once', startAge: 62, startDate: '2042-05' }),
    flow({ kind: 'income', frequency: 'once' }),
  ]

  it('is equal exactly when the labels read the same, in both languages', () => {
    for (const a of samples) {
      for (const b of samples) {
        const sameKey = flowWindowKey(a, context) === flowWindowKey(b, context)
        expect(label('en', a) === label('en', b)).toBe(sameKey)
        expect(label('de', a) === label('de', b)).toBe(sameKey)
      }
    }
  })
})
