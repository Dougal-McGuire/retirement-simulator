import { StyleSheet } from '@react-pdf/renderer'

// Design tokens - Optimized for fast PDF rendering
// IMPORTANT: Avoid opacity, transparency, and complex backgrounds
export const tokens = {
  // Typography
  fontFamily: {
    sans: 'Helvetica',
    serif: 'Times-Roman',
  },
  fontSize: {
    xs: 8,
    sm: 9,
    base: 10,
    md: 11,
    lg: 14,
    xl: 18,
    '2xl': 24,
    '3xl': 32,
  },
  fontWeight: {
    normal: 'normal' as const,
    medium: 'normal' as const,
    semibold: 'bold' as const,
    bold: 'bold' as const,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.4,
    relaxed: 1.6,
  },

  // Colors - Solid colors only, no transparency
  colors: {
    ink: {
      900: '#0f172a',
      800: '#1e293b',
      700: '#334155',
      600: '#475569',
      500: '#64748b',
      400: '#94a3b8',
      300: '#cbd5e1',
      200: '#e2e8f0',
      100: '#f1f5f9',
      50: '#f8fafc',
    },
    accent: {
      700: '#1d4ed8',
      600: '#2563eb',
      500: '#3b82f6',
      100: '#dbeafe',
      50: '#eff6ff',
    },
    success: {
      600: '#059669',
      100: '#d1fae5',
    },
    warning: {
      600: '#d97706',
      100: '#fef3c7',
    },
    danger: {
      600: '#dc2626',
      100: '#fee2e2',
    },
    white: '#ffffff',
    black: '#000000',
  },

  // Spacing (in points)
  spacing: {
    0: 0,
    1: 2,
    2: 4,
    3: 6,
    4: 8,
    5: 10,
    6: 12,
    8: 16,
    10: 20,
    12: 24,
    16: 32,
    20: 40,
    24: 48,
  },
} as const

// Page dimensions (A4 in points)
export const page = {
  width: 595.28,
  height: 841.89,
  margin: {
    top: 56,
    right: 50,
    bottom: 68,
    left: 50,
  },
  get contentWidth() {
    return this.width - this.margin.left - this.margin.right
  },
  get contentHeight() {
    return this.height - this.margin.top - this.margin.bottom
  },
}

// Shared styles - Optimized for vector PDF rendering
// NO opacity, NO complex backgrounds, NO filters
export const styles = StyleSheet.create({
  // Page - Plain white background
  page: {
    fontFamily: tokens.fontFamily.sans,
    fontSize: tokens.fontSize.base,
    lineHeight: tokens.lineHeight.normal,
    color: tokens.colors.ink[900],
    backgroundColor: tokens.colors.white,
    paddingTop: page.margin.top,
    paddingRight: page.margin.right,
    paddingBottom: page.margin.bottom,
    paddingLeft: page.margin.left,
  },
  pageCover: {
    fontFamily: tokens.fontFamily.sans,
    fontSize: tokens.fontSize.base,
    lineHeight: tokens.lineHeight.normal,
    color: tokens.colors.ink[900],
    backgroundColor: tokens.colors.white,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
  },

  // Typography
  h1: {
    fontSize: tokens.fontSize['3xl'],
    fontFamily: 'Helvetica-Bold',
    lineHeight: tokens.lineHeight.tight,
    color: tokens.colors.ink[900],
    marginBottom: tokens.spacing[4],
  },
  h2: {
    fontSize: tokens.fontSize['2xl'],
    fontFamily: 'Helvetica-Bold',
    lineHeight: tokens.lineHeight.tight,
    color: tokens.colors.ink[900],
    marginBottom: tokens.spacing[3],
  },
  h3: {
    fontSize: tokens.fontSize.xl,
    fontFamily: 'Helvetica-Bold',
    lineHeight: tokens.lineHeight.tight,
    color: tokens.colors.ink[900],
    marginBottom: tokens.spacing[2],
  },
  h4: {
    fontSize: tokens.fontSize.lg,
    fontFamily: 'Helvetica-Bold',
    lineHeight: tokens.lineHeight.tight,
    color: tokens.colors.ink[900],
    marginBottom: tokens.spacing[2],
  },
  body: {
    fontSize: tokens.fontSize.base,
    lineHeight: tokens.lineHeight.relaxed,
    color: tokens.colors.ink[700],
  },
  bodyLarge: {
    fontSize: tokens.fontSize.md,
    lineHeight: tokens.lineHeight.relaxed,
    color: tokens.colors.ink[700],
  },
  caption: {
    fontSize: tokens.fontSize.sm,
    lineHeight: tokens.lineHeight.normal,
    color: tokens.colors.ink[500],
  },
  label: {
    fontSize: tokens.fontSize.xs,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: tokens.colors.ink[500],
  },

  // Layout
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  rowCenter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  col: {
    flexDirection: 'column',
  },
  flex1: {
    flex: 1,
  },

  // Grid layouts
  grid2: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  grid3: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridItem2: {
    width: '48%',
    marginRight: '2%',
    marginBottom: tokens.spacing[4],
  },
  gridItem3: {
    width: '31%',
    marginRight: '2%',
    marginBottom: tokens.spacing[4],
  },

  // Cards & surfaces - Simple borders, no complex backgrounds
  card: {
    backgroundColor: tokens.colors.white,
    borderWidth: 1,
    borderColor: tokens.colors.ink[200],
    padding: tokens.spacing[6],
    marginBottom: tokens.spacing[4],
  },
  cardBordered: {
    backgroundColor: tokens.colors.white,
    borderWidth: 1,
    borderColor: tokens.colors.ink[200],
    padding: tokens.spacing[6],
    marginBottom: tokens.spacing[4],
  },
  surface: {
    backgroundColor: tokens.colors.white,
    borderWidth: 1,
    borderColor: tokens.colors.ink[200],
    padding: tokens.spacing[6],
  },

  // KPI display
  kpiValue: {
    fontSize: tokens.fontSize['2xl'],
    fontFamily: 'Helvetica-Bold',
    color: tokens.colors.ink[900],
    marginBottom: tokens.spacing[1],
  },
  kpiLabel: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.ink[600],
    marginBottom: tokens.spacing[1],
  },
  kpiDescription: {
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.ink[500],
    lineHeight: tokens.lineHeight.normal,
  },

  // Badges - Solid colors only
  badge: {
    paddingVertical: tokens.spacing[1],
    paddingHorizontal: tokens.spacing[3],
    backgroundColor: tokens.colors.ink[900],
  },
  badgeText: {
    fontSize: tokens.fontSize.xs,
    fontFamily: 'Helvetica-Bold',
    color: tokens.colors.white,
  },
  badgeSuccess: {
    backgroundColor: tokens.colors.success[600],
  },
  badgeWarning: {
    backgroundColor: tokens.colors.warning[600],
  },
  badgeDanger: {
    backgroundColor: tokens.colors.danger[600],
  },

  // Tables - Simple lines only
  table: {
    marginVertical: tokens.spacing[4],
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.ink[300],
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: tokens.colors.ink[200],
    minHeight: 24,
    alignItems: 'center',
  },
  tableRowAlt: {
    // No background - keeps PDF simple and fast
  },
  tableCell: {
    paddingVertical: tokens.spacing[2],
    paddingHorizontal: tokens.spacing[3],
    fontSize: tokens.fontSize.sm,
  },
  tableCellHeader: {
    paddingVertical: tokens.spacing[3],
    paddingHorizontal: tokens.spacing[3],
    fontSize: tokens.fontSize.xs,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    color: tokens.colors.ink[600],
  },

  // Callouts - Simple left border, no background
  callout: {
    borderLeftWidth: 3,
    borderLeftColor: tokens.colors.accent[600],
    paddingLeft: tokens.spacing[4],
    paddingVertical: tokens.spacing[3],
    marginVertical: tokens.spacing[4],
  },
  calloutWarning: {
    borderLeftColor: tokens.colors.warning[600],
  },
  calloutDanger: {
    borderLeftColor: tokens.colors.danger[600],
  },
  calloutSuccess: {
    borderLeftColor: tokens.colors.success[600],
  },

  // Lists
  listItem: {
    flexDirection: 'row',
    marginBottom: tokens.spacing[2],
    paddingLeft: tokens.spacing[2],
  },
  listBullet: {
    width: 16,
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.accent[600],
  },
  listContent: {
    flex: 1,
    fontSize: tokens.fontSize.sm,
    lineHeight: tokens.lineHeight.relaxed,
    color: tokens.colors.ink[700],
  },

  // Section
  section: {
    marginBottom: tokens.spacing[12],
  },
  sectionHeader: {
    marginBottom: tokens.spacing[6],
  },
  sectionLead: {
    fontSize: tokens.fontSize.md,
    lineHeight: tokens.lineHeight.relaxed,
    color: tokens.colors.ink[600],
    marginTop: tokens.spacing[2],
  },

  // Dividers - Simple vector lines
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.ink[200],
    marginVertical: tokens.spacing[6],
  },
  dividerThick: {
    borderBottomWidth: 2,
    borderBottomColor: tokens.colors.ink[300],
    marginVertical: tokens.spacing[8],
  },

  // Figures
  figure: {
    marginVertical: tokens.spacing[6],
  },
  figcaption: {
    marginTop: tokens.spacing[3],
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.ink[500],
    textAlign: 'center',
  },

  // Header/Footer
  header: {
    position: 'absolute',
    top: tokens.spacing[8],
    left: page.margin.left,
    right: page.margin.right,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.ink[400],
  },
  footer: {
    position: 'absolute',
    bottom: tokens.spacing[8],
    left: page.margin.left,
    right: page.margin.right,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.ink[400],
  },
  pageNumber: {
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.ink[500],
  },

  // Spacing utilities
  mb1: { marginBottom: tokens.spacing[1] },
  mb2: { marginBottom: tokens.spacing[2] },
  mb3: { marginBottom: tokens.spacing[3] },
  mb4: { marginBottom: tokens.spacing[4] },
  mb6: { marginBottom: tokens.spacing[6] },
  mb8: { marginBottom: tokens.spacing[8] },
  mt2: { marginTop: tokens.spacing[2] },
  mt4: { marginTop: tokens.spacing[4] },
  mt6: { marginTop: tokens.spacing[6] },
  gap2: { gap: tokens.spacing[2] },
  gap4: { gap: tokens.spacing[4] },
  gap6: { gap: tokens.spacing[6] },

  // Text utilities
  textCenter: { textAlign: 'center' },
  textRight: { textAlign: 'right' },
  fontSemibold: { fontFamily: 'Helvetica-Bold' },
  fontBold: { fontFamily: 'Helvetica-Bold' },
  textMuted: { color: tokens.colors.ink[500] },
  textAccent: { color: tokens.colors.accent[600] },
})

export default styles
