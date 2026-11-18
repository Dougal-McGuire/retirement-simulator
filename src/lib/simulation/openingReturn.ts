import type { SimulationParams } from '@/types'

type OpeningPortfolio = Pick<SimulationParams, 'currentAssets' | 'initialUnrealizedGain'>

/** A broker's unrealised return is relative to the acquisition cost. */
export function openingReturnPercent(portfolio: OpeningPortfolio): number | null {
  const gain = portfolio.initialUnrealizedGain ?? 0
  if (gain === 0) return 0
  const cost = portfolio.currentAssets - gain
  return cost > 0 ? (gain / cost) * 100 : null
}

/** For a positive market value the return must be strictly above −100%. */
export function gainFromOpeningReturn(assets: number, percent: number): number {
  return assets * (percent / (100 + percent))
}

/** Keep the portfolio's return, including a legacy holding with zero acquisition cost. */
export function resizeOpeningGain(portfolio: OpeningPortfolio, assets: number): number {
  if (assets === portfolio.currentAssets) return portfolio.initialUnrealizedGain ?? 0
  return portfolio.currentAssets > 0
    ? ((portfolio.initialUnrealizedGain ?? 0) / portfolio.currentAssets) * assets
    : 0
}
