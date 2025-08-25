import { StyleSheet } from '@react-pdf/renderer'

export const styles = StyleSheet.create({
  // Page styles
  page: {
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    padding: 30,
    fontFamily: 'Helvetica',
    fontSize: 11,
    lineHeight: 1.5,
  },
  
  coverPage: {
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    padding: 50,
    fontFamily: 'Helvetica',
    justifyContent: 'space-between',
  },

  // Header styles
  header: {
    flexDirection: 'row',
    marginBottom: 20,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#1e40af',
  },

  headerLeft: {
    flex: 1,
  },

  headerRight: {
    alignItems: 'flex-end',
  },

  logo: {
    width: 60,
    height: 60,
    backgroundColor: '#1e40af',
    borderRadius: 8,
    marginBottom: 10,
  },

  // Typography
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e40af',
    marginBottom: 8,
  },

  subtitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 12,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1e40af',
    marginTop: 24,
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: '#1e40af',
    borderBottomStyle: 'solid',
  },

  heading: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 10,
    lineHeight: 1.3,
  },

  text: {
    fontSize: 11,
    color: '#374151',
    marginBottom: 8,
    lineHeight: 1.5,
  },

  smallText: {
    fontSize: 9,
    color: '#6b7280',
    marginBottom: 6,
    lineHeight: 1.4,
  },

  boldText: {
    fontWeight: 'bold',
    color: '#1f2937',
  },

  // Layout
  section: {
    marginBottom: 24,
    paddingBottom: 8,
  },

  row: {
    flexDirection: 'row',
    marginBottom: 12,
  },

  column: {
    flexDirection: 'column',
    flex: 1,
  },

  leftColumn: {
    flex: 1,
    paddingRight: 20,
    marginRight: 8,
  },

  rightColumn: {
    flex: 1,
    paddingLeft: 20,
    marginLeft: 8,
  },

  // Tables
  table: {
    width: '100%',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRightWidth: 0,
    borderBottomWidth: 0,
    marginBottom: 20,
    borderRadius: 4,
    overflow: 'hidden',
  },

  tableRow: {
    margin: 'auto',
    flexDirection: 'row',
  },

  tableHeader: {
    backgroundColor: '#f3f4f6',
    fontWeight: 'bold',
  },

  tableCol: {
    width: '25%',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderLeftWidth: 0,
    borderTopWidth: 0,
    padding: 10,
    minHeight: 30,
  },

  tableColWide: {
    width: '50%',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderLeftWidth: 0,
    borderTopWidth: 0,
    padding: 10,
    minHeight: 30,
  },

  tableCell: {
    fontSize: 10,
    textAlign: 'left',
  },

  tableCellCenter: {
    fontSize: 10,
    textAlign: 'center',
  },

  tableCellRight: {
    fontSize: 10,
    textAlign: 'right',
  },

  // Special elements
  highlight: {
    backgroundColor: '#dbeafe',
    padding: 16,
    borderRadius: 6,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#1e40af',
    borderLeftStyle: 'solid',
  },

  warning: {
    backgroundColor: '#fef3c7',
    padding: 16,
    borderRadius: 6,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
    borderLeftStyle: 'solid',
  },

  success: {
    backgroundColor: '#d1fae5',
    padding: 16,
    borderRadius: 6,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#10b981',
    borderLeftStyle: 'solid',
  },

  // Charts and graphics
  chartContainer: {
    width: '100%',
    minHeight: 200,
    marginBottom: 20,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'solid',
    backgroundColor: '#fafafa',
    borderRadius: 4,
  },

  chartTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: '#1f2937',
  },

  chartPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 4,
    padding: 20,
  },

  chartPlaceholderText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },

  chartPlaceholderSubtext: {
    fontSize: 10,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 10,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 30,
    right: 30,
    textAlign: 'center',
    color: '#6b7280',
    fontSize: 9,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 10,
  },

  pageNumber: {
    position: 'absolute',
    fontSize: 9,
    bottom: 30,
    right: 30,
    color: '#6b7280',
  },

  // Timeline styles
  timelineContainer: {
    flexDirection: 'column',
    marginVertical: 20,
  },

  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },

  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#1e40af',
    marginRight: 12,
  },

  timelineContent: {
    flex: 1,
  },

  timelineAge: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#1e40af',
    marginBottom: 2,
  },

  timelineEvent: {
    fontSize: 10,
    color: '#374151',
  },

  // Cover page specific
  coverTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1e40af',
    textAlign: 'center',
    marginTop: 100,
    marginBottom: 30,
  },

  coverSubtitle: {
    fontSize: 18,
    color: '#374151',
    textAlign: 'center',
    marginBottom: 50,
  },

  coverClient: {
    fontSize: 16,
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 20,
  },

  coverDate: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 100,
  },

  disclaimer: {
    fontSize: 8,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 1.3,
    marginTop: 'auto',
  },

  // Visual enhancements
  gradientHeader: {
    backgroundColor: '#1e40af',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderRadius: 6,
  },

  gradientHeaderText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },

  infoBox: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
    borderWidth: 1,
    borderStyle: 'solid',
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
  },

  criticalBox: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderStyle: 'solid',
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#dc2626',
  },

  successBox: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
    borderWidth: 1,
    borderStyle: 'solid',
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#16a34a',
  },

  metricCard: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderWidth: 1,
    borderStyle: 'solid',
    borderRadius: 8,
    padding: 16,
    margin: 4,
    flex: 1,
  },

  metricValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e40af',
    marginBottom: 4,
  },

  metricLabel: {
    fontSize: 10,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
})