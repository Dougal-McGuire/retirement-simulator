export const defaultPdfConfig = {
  locale: 'de-DE',
  score_weights: { success_pct: 0.6, spend_rate: 0.25, liquidity: 0.15 },
  bridge_cash_bucket_years: 2,
  label_bands: { needs_attention: [0, 59], moderate: [60, 79], strong: [80, 100] },
  // Map categories to Needs/Wants/Luxuries (future use)
  category_bucket_map: {
    Healthcare: 'Needs',
    'Food & Groceries': 'Needs',
    Utilities: 'Needs',
    'Home Repairs': 'Needs',
    Vacations: 'Wants',
    Entertainment: 'Wants',
    Car: 'Wants',
    Shopping: 'Luxuries',
  },
}
