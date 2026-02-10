import { StyleSheet } from '@react-pdf/renderer'

export const tokens = {
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
  lineHeight: {
    tight: 1.2,
    normal: 1.4,
    relaxed: 1.55,
  },
  colors: {
    ink: {
      900: '#101828',
      800: '#1d2939',
      700: '#344054',
      600: '#475467',
      500: '#667085',
      400: '#98a2b3',
      300: '#d0d5dd',
      200: '#eaecf0',
      100: '#f2f4f7',
      50: '#f9fafb',
    },
    accent: {
      700: '#0b4f6c',
      600: '#126782',
      500: '#1b7f9c',
      100: '#d8edf4',
      50: '#eef8fb',
    },
    success: {
      600: '#067647',
      100: '#d1fadf',
    },
    warning: {
      600: '#b54708',
      100: '#fef0c7',
    },
    danger: {
      600: '#b42318',
      100: '#fee4e2',
    },
    white: '#ffffff',
  },
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
  },
} as const

export const page = {
  width: 595.28,
  height: 841.89,
  margin: {
    top: 58,
    right: 46,
    bottom: 54,
    left: 46,
  },
  get contentWidth() {
    return this.width - this.margin.left - this.margin.right
  },
}

export const styles = StyleSheet.create({
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
    color: tokens.colors.ink[900],
    backgroundColor: tokens.colors.white,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
  },

  h1: {
    fontSize: tokens.fontSize['3xl'],
    fontFamily: 'Helvetica-Bold',
    lineHeight: tokens.lineHeight.tight,
    color: tokens.colors.ink[900],
    marginBottom: tokens.spacing[3],
  },
  h2: {
    fontSize: tokens.fontSize.xl,
    fontFamily: 'Helvetica-Bold',
    lineHeight: tokens.lineHeight.tight,
    color: tokens.colors.ink[900],
    marginBottom: tokens.spacing[2],
  },
  h3: {
    fontSize: tokens.fontSize.lg,
    fontFamily: 'Helvetica-Bold',
    color: tokens.colors.ink[900],
    marginBottom: tokens.spacing[2],
  },
  h4: {
    fontSize: tokens.fontSize.md,
    fontFamily: 'Helvetica-Bold',
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
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.ink[500],
  },
  label: {
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.ink[500],
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },

  row: { flexDirection: 'row' },
  rowCenter: { flexDirection: 'row', alignItems: 'center' },
  col: { flexDirection: 'column' },

  grid2: { flexDirection: 'row', flexWrap: 'wrap' },
  grid3: { flexDirection: 'row', flexWrap: 'wrap' },
  gridItem2: { width: '48%', marginRight: '2%', marginBottom: tokens.spacing[4] },
  gridItem3: { width: '31%', marginRight: '2%', marginBottom: tokens.spacing[4] },

  card: {
    borderWidth: 1,
    borderColor: tokens.colors.ink[200],
    backgroundColor: tokens.colors.white,
    padding: tokens.spacing[4],
    marginBottom: tokens.spacing[3],
  },
  cardBordered: {
    borderWidth: 1,
    borderColor: tokens.colors.ink[200],
    backgroundColor: tokens.colors.white,
    padding: tokens.spacing[4],
    marginBottom: tokens.spacing[3],
  },
  surface: {
    borderWidth: 1,
    borderColor: tokens.colors.ink[200],
    backgroundColor: tokens.colors.white,
    padding: tokens.spacing[4],
  },

  kpiValue: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    color: tokens.colors.ink[900],
    marginTop: tokens.spacing[1],
    marginBottom: tokens.spacing[1],
  },
  kpiLabel: {
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.ink[500],
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  kpiDescription: {
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.ink[500],
  },

  badge: {
    backgroundColor: tokens.colors.ink[900],
    paddingVertical: tokens.spacing[1],
    paddingHorizontal: tokens.spacing[3],
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.white,
    fontFamily: 'Helvetica-Bold',
  },
  badgeSuccess: { backgroundColor: tokens.colors.success[600] },
  badgeWarning: { backgroundColor: tokens.colors.warning[600] },
  badgeDanger: { backgroundColor: tokens.colors.danger[600] },

  table: { marginVertical: tokens.spacing[2] },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.ink[300],
    paddingBottom: 2,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: tokens.colors.ink[200],
    minHeight: 20,
    alignItems: 'center',
  },
  tableRowAlt: {},
  tableCell: {
    paddingVertical: tokens.spacing[2],
    paddingHorizontal: tokens.spacing[2],
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.ink[700],
  },
  tableCellHeader: {
    paddingVertical: tokens.spacing[2],
    paddingHorizontal: tokens.spacing[2],
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.ink[600],
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  callout: {
    borderLeftWidth: 3,
    borderLeftColor: tokens.colors.accent[600],
    paddingLeft: tokens.spacing[3],
    paddingVertical: tokens.spacing[2],
  },
  calloutWarning: { borderLeftColor: tokens.colors.warning[600] },
  calloutDanger: { borderLeftColor: tokens.colors.danger[600] },
  calloutSuccess: { borderLeftColor: tokens.colors.success[600] },

  listItem: {
    flexDirection: 'row',
    marginBottom: tokens.spacing[2],
  },
  listBullet: {
    width: 14,
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.accent[600],
  },
  listContent: {
    flex: 1,
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.ink[700],
    lineHeight: tokens.lineHeight.relaxed,
  },

  section: { marginBottom: tokens.spacing[8] },
  sectionHeader: { marginBottom: tokens.spacing[4] },
  sectionLead: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.ink[600],
    lineHeight: tokens.lineHeight.relaxed,
  },

  divider: {
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.ink[200],
    marginVertical: tokens.spacing[4],
  },
  dividerThick: {
    borderBottomWidth: 2,
    borderBottomColor: tokens.colors.ink[300],
    marginVertical: tokens.spacing[4],
  },

  figure: {
    marginVertical: tokens.spacing[2],
    borderWidth: 1,
    borderColor: tokens.colors.ink[200],
    padding: tokens.spacing[3],
  },
  figcaption: {
    marginTop: tokens.spacing[2],
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.ink[500],
    textAlign: 'center',
  },

  header: {
    position: 'absolute',
    top: 22,
    left: page.margin.left,
    right: page.margin.right,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.ink[500],
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: page.margin.left,
    right: page.margin.right,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.ink[500],
  },
  pageNumber: {
    position: 'absolute',
    bottom: 20,
    right: page.margin.right,
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.ink[500],
    textAlign: 'right',
  },

  mb1: { marginBottom: tokens.spacing[1] },
  mb2: { marginBottom: tokens.spacing[2] },
  mb3: { marginBottom: tokens.spacing[3] },
  mb4: { marginBottom: tokens.spacing[4] },
  mb6: { marginBottom: tokens.spacing[6] },
  mb8: { marginBottom: tokens.spacing[8] },
  mt2: { marginTop: tokens.spacing[2] },
  mt4: { marginTop: tokens.spacing[4] },
  mt6: { marginTop: tokens.spacing[6] },
  gap2: {},
  gap4: {},
  gap6: {},
  textCenter: { textAlign: 'center' },
  textRight: { textAlign: 'right' },
  fontSemibold: { fontFamily: 'Helvetica-Bold' },
  fontBold: { fontFamily: 'Helvetica-Bold' },
  textMuted: { color: tokens.colors.ink[500] },
  textAccent: { color: tokens.colors.accent[600] },
})

export default styles
