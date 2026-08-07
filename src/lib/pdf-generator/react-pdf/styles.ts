import { StyleSheet } from '@react-pdf/renderer'
import { sansFamily } from './fonts'

const sans = sansFamily()

export const tokens = {
  fontFamily: {
    sans,
  },
  fontSize: {
    xs: 7,
    sm: 8,
    base: 9,
    md: 10,
    lg: 13,
    xl: 17,
    '2xl': 22,
    '3xl': 30,
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
      150: '#f0f2f5',
      100: '#f2f4f7',
      50: '#f9fafb',
    },
    /**
     * Accent scale derived from the app's `--neo-blue` (rgb 14 103 246) so the
     * report and the product read as one brand. Darker steps are print-safe
     * (>= 4.5:1 on white) and used for text; 600 is the pure app blue used for
     * rules, markers and data lines.
     */
    accent: {
      900: '#062a63',
      800: '#083a86',
      700: '#0a4aad',
      600: '#0e67f6',
      500: '#3d85f8',
      200: '#bcd6fd',
      100: '#dce8fe',
      50: '#eff5ff',
    },
    /**
     * Signature colours lifted straight from the app shell: near-black ink,
     * the neo-brutalist yellow used for badges/markers, and paper white.
     * Yellow is only ever used as a fill behind near-black text or as a rule,
     * never as ink — it does not carry contrast on white.
     */
    brand: {
      ink: '#05080f',
      yellow: '#f6c90e',
      yellowSoft: '#fdf4cd',
      yellowLine: '#e0b40a',
    },
    success: {
      700: '#05603a',
      600: '#067647',
      100: '#d1fadf',
      50: '#ecfdf3',
    },
    warning: {
      700: '#93370d',
      600: '#b54708',
      100: '#fef0c7',
      50: '#fffaeb',
    },
    danger: {
      700: '#912018',
      600: '#b42318',
      100: '#fee4e2',
      50: '#fef3f2',
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
  radius: {
    sm: 3,
    md: 5,
  },
} as const

export const page = {
  width: 595.28,
  height: 841.89,
  margin: {
    top: 64,
    right: 48,
    bottom: 58,
    left: 48,
  },
  get contentWidth() {
    return this.width - this.margin.left - this.margin.right
  },
}

export const styles = StyleSheet.create({
  page: {
    fontFamily: sans,
    fontWeight: 400,
    fontSize: tokens.fontSize.base,
    // NOTE: no page-level lineHeight — with a registered font, a Page-level
    // lineHeight prevents bottom-anchored fixed elements (the running footer)
    // from rendering in @react-pdf/renderer. Text styles set their own.
    color: tokens.colors.ink[900],
    backgroundColor: tokens.colors.white,
    paddingTop: page.margin.top,
    paddingRight: page.margin.right,
    paddingBottom: page.margin.bottom,
    paddingLeft: page.margin.left,
  },
  pageCover: {
    fontFamily: sans,
    fontWeight: 400,
    fontSize: tokens.fontSize.base,
    color: tokens.colors.ink[900],
    backgroundColor: tokens.colors.white,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
  },

  // ------------------------------------------------------------------
  // Typography
  // ------------------------------------------------------------------
  h1: {
    fontSize: tokens.fontSize['3xl'],
    fontWeight: 700,
    lineHeight: tokens.lineHeight.tight,
    color: tokens.colors.ink[900],
    marginBottom: tokens.spacing[3],
  },
  h2: {
    fontSize: tokens.fontSize.xl,
    fontWeight: 700,
    lineHeight: tokens.lineHeight.tight,
    color: tokens.colors.ink[900],
    marginBottom: tokens.spacing[2],
    letterSpacing: -0.2,
  },
  h3: {
    fontSize: tokens.fontSize.lg,
    fontWeight: 600,
    color: tokens.colors.ink[900],
    marginBottom: tokens.spacing[2],
  },
  h4: {
    fontSize: tokens.fontSize.md,
    fontWeight: 600,
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
    fontWeight: 600,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  overline: {
    fontSize: 7,
    color: tokens.colors.accent[700],
    fontWeight: 600,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: tokens.spacing[2],
  },

  // ------------------------------------------------------------------
  // Section header (numbered, ruled)
  // ------------------------------------------------------------------
  sectionHeaderBlock: {
    marginBottom: tokens.spacing[6],
    paddingBottom: tokens.spacing[4],
    borderBottomWidth: 1.4,
    borderBottomColor: tokens.colors.brand.ink,
  },
  /** The app's yellow marker square, reused as the section tick. */
  brandMark: {
    width: 7,
    height: 7,
    backgroundColor: tokens.colors.brand.yellow,
    marginRight: 5,
  },
  /** Card variant that carries the app accent on its top edge. */
  cardAccent: {
    borderWidth: 1,
    borderColor: tokens.colors.ink[200],
    borderTopWidth: 2,
    borderTopColor: tokens.colors.brand.yellow,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.white,
    padding: tokens.spacing[5],
    marginBottom: tokens.spacing[4],
  },
  sectionLead: {
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.ink[500],
    lineHeight: tokens.lineHeight.relaxed,
    marginTop: 1,
    maxWidth: 380,
  },

  // ------------------------------------------------------------------
  // Layout helpers
  // ------------------------------------------------------------------
  row: { flexDirection: 'row' },
  rowCenter: { flexDirection: 'row', alignItems: 'center' },
  col: { flexDirection: 'column' },

  grid2: { flexDirection: 'row', flexWrap: 'wrap' },
  grid3: { flexDirection: 'row', flexWrap: 'wrap' },
  gridItem2: { width: '48%', marginRight: '2%', marginBottom: tokens.spacing[4] },
  gridItem3: { width: '31%', marginRight: '2%', marginBottom: tokens.spacing[4] },

  // ------------------------------------------------------------------
  // Cards / surfaces
  // ------------------------------------------------------------------
  card: {
    borderWidth: 1,
    borderColor: tokens.colors.ink[200],
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.white,
    padding: tokens.spacing[5],
    marginBottom: tokens.spacing[4],
  },
  cardBordered: {
    borderWidth: 1,
    borderColor: tokens.colors.ink[200],
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.white,
    padding: tokens.spacing[5],
    marginBottom: tokens.spacing[4],
  },
  cardMuted: {
    borderWidth: 1,
    borderColor: tokens.colors.ink[200],
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.ink[50],
    padding: tokens.spacing[5],
    marginBottom: tokens.spacing[4],
  },
  surface: {
    borderWidth: 1,
    borderColor: tokens.colors.ink[200],
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.white,
    padding: tokens.spacing[5],
  },
  cardTitle: {
    fontSize: tokens.fontSize.md,
    fontWeight: 600,
    color: tokens.colors.ink[900],
    marginBottom: tokens.spacing[4],
  },

  // ------------------------------------------------------------------
  // KPI tiles
  // ------------------------------------------------------------------
  kpiValue: {
    fontSize: 17,
    fontWeight: 700,
    color: tokens.colors.ink[900],
    letterSpacing: -0.2,
    marginTop: tokens.spacing[2],
    lineHeight: 1.15,
  },
  kpiLabel: {
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.ink[500],
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  kpiDescription: {
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.ink[500],
    marginTop: tokens.spacing[2],
    lineHeight: 1.35,
  },

  // ------------------------------------------------------------------
  // Badges
  // ------------------------------------------------------------------
  badge: {
    backgroundColor: tokens.colors.ink[900],
    borderRadius: tokens.radius.sm,
    paddingVertical: 2.5,
    paddingHorizontal: tokens.spacing[3],
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.white,
    fontWeight: 600,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  badgeSuccess: { backgroundColor: tokens.colors.success[600] },
  badgeWarning: { backgroundColor: tokens.colors.warning[600] },
  badgeDanger: { backgroundColor: tokens.colors.danger[600] },

  // ------------------------------------------------------------------
  // Tables
  // ------------------------------------------------------------------
  table: { marginVertical: tokens.spacing[2] },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.ink[900],
    alignItems: 'flex-end',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: tokens.colors.ink[200],
    minHeight: 18,
    alignItems: 'center',
  },
  tableRowAlt: {
    backgroundColor: tokens.colors.ink[50],
  },
  tableRowTotal: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: tokens.colors.ink[900],
    borderBottomWidth: 0,
    minHeight: 20,
    alignItems: 'center',
  },
  tableCell: {
    paddingVertical: 4.5,
    paddingHorizontal: tokens.spacing[2],
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.ink[700],
  },
  tableCellHeader: {
    paddingVertical: 4,
    paddingHorizontal: tokens.spacing[2],
    fontSize: 6.5,
    color: tokens.colors.ink[500],
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },

  // ------------------------------------------------------------------
  // Callouts
  // ------------------------------------------------------------------
  callout: {
    borderLeftWidth: 2.5,
    borderLeftColor: tokens.colors.accent[600],
    backgroundColor: tokens.colors.ink[50],
    borderRadius: tokens.radius.sm,
    paddingLeft: tokens.spacing[4],
    paddingRight: tokens.spacing[4],
    paddingVertical: tokens.spacing[3],
  },
  calloutWarning: { borderLeftColor: tokens.colors.warning[600] },
  calloutDanger: { borderLeftColor: tokens.colors.danger[600] },
  calloutSuccess: { borderLeftColor: tokens.colors.success[600] },

  // ------------------------------------------------------------------
  // Lists
  // ------------------------------------------------------------------
  listItem: {
    flexDirection: 'row',
    marginBottom: tokens.spacing[2],
  },
  listBullet: {
    width: 14,
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.accent[700],
  },
  listContent: {
    flex: 1,
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.ink[700],
    lineHeight: tokens.lineHeight.relaxed,
  },

  section: { marginBottom: tokens.spacing[8] },
  sectionHeader: { marginBottom: tokens.spacing[4] },

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

  // ------------------------------------------------------------------
  // Figures
  // ------------------------------------------------------------------
  figure: {
    marginVertical: tokens.spacing[2],
    borderWidth: 1,
    borderColor: tokens.colors.ink[200],
    borderRadius: tokens.radius.md,
    padding: tokens.spacing[4],
  },
  figcaption: {
    marginTop: tokens.spacing[2],
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.ink[500],
    textAlign: 'center',
  },

  // ------------------------------------------------------------------
  // Running header / footer
  // ------------------------------------------------------------------
  header: {
    position: 'absolute',
    top: 24,
    left: page.margin.left,
    right: page.margin.right,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 0.75,
    borderBottomColor: tokens.colors.ink[200],
    paddingBottom: 6,
  },
  headerBrand: {
    fontSize: 7,
    fontWeight: 600,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: tokens.colors.ink[700],
  },
  headerMeta: {
    fontSize: 7,
    color: tokens.colors.ink[400],
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: page.margin.left,
    right: page.margin.right,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 0.75,
    borderTopColor: tokens.colors.ink[200],
    paddingTop: 6,
  },
  footerText: {
    fontSize: 7,
    color: tokens.colors.ink[400],
  },
  pageNumber: {
    fontSize: 7,
    color: tokens.colors.ink[500],
    textAlign: 'right',
  },

  // ------------------------------------------------------------------
  // Utility spacing / text helpers
  // ------------------------------------------------------------------
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
  fontSemibold: { fontWeight: 600 },
  fontBold: { fontWeight: 700 },
  textMuted: { color: tokens.colors.ink[500] },
  textAccent: { color: tokens.colors.accent[600] },
})

export default styles
