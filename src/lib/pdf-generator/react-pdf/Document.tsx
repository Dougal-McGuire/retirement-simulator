import React from 'react'
import { Document, Page, View, Text } from '@react-pdf/renderer'
import type { Style } from '@react-pdf/types'
import { styles, tokens, page as pageConfig } from './styles'
import './fonts'

// ============================================================================
// Report Document - Optimized for fast PDF rendering
// ============================================================================

interface ReportDocumentProps {
  children: React.ReactNode
  title?: string
  author?: string
  subject?: string
}

export function ReportDocument({
  children,
  title = 'Retirement Plan Report',
  author = 'Retirement Simulator',
  subject = 'Monte Carlo Retirement Analysis',
}: ReportDocumentProps) {
  return (
    <Document
      title={title}
      author={author}
      subject={subject}
      creator="Retirement Simulator"
      producer="@react-pdf/renderer"
    >
      {children}
    </Document>
  )
}

// ============================================================================
// Report Page - Simple vector-based layout
// ============================================================================

interface ReportPageProps {
  children: React.ReactNode
  header?: {
    left?: string
    right?: string
  }
  footer?: {
    left?: string
    showPageNumber?: boolean
  }
  pageStyle?: 'default' | 'cover'
  style?: Style | Style[]
}

export function ReportPage({
  children,
  header,
  footer,
  pageStyle = 'default',
  style,
}: ReportPageProps) {
  const basePageStyle = pageStyle === 'cover' ? styles.pageCover : styles.page
  const showHeader = pageStyle !== 'cover' && header
  const showFooter = pageStyle !== 'cover' && footer
  
  // Combine styles only if additional style is provided
  const pageStyles = style ? [basePageStyle, style].flat() : basePageStyle

  return (
    <Page size="A4" style={pageStyles}>
      {showHeader && (
        <View style={styles.header} fixed>
          <Text>{header?.left || ''}</Text>
          <Text>{header?.right || ''}</Text>
        </View>
      )}

      {children}

      {showFooter && (
        <View style={styles.footer} fixed>
          <Text>{footer?.left || ''}</Text>
          {footer?.showPageNumber && (
            <Text
              style={styles.pageNumber}
              render={({ pageNumber, totalPages }) =>
                `Page ${pageNumber} of ${totalPages}`
              }
            />
          )}
        </View>
      )}
    </Page>
  )
}

// ============================================================================
// Cover Page - Clean design, no complex backgrounds
// ============================================================================

interface CoverPageProps {
  title: string
  subtitle?: string
  metadata?: Array<{ label: string; value: string }>
  badge?: string
}

export function CoverPage({
  title,
  subtitle,
  metadata,
  badge,
}: CoverPageProps) {
  return (
    <ReportPage pageStyle="cover">
      {/* Simple accent line at top - vector, not background */}
      <View
        style={{
          height: 6,
          backgroundColor: tokens.colors.accent[600],
        }}
      />

      {/* Cover content */}
      <View
        style={{
          flex: 1,
          paddingHorizontal: pageConfig.margin.left,
          paddingTop: 100,
          paddingBottom: pageConfig.margin.bottom,
        }}
      >
        {/* Title */}
        <View style={{ marginBottom: 24 }}>
          <Text
            style={{
              fontSize: 36,
              fontFamily: 'Helvetica-Bold',
              color: tokens.colors.ink[900],
              lineHeight: 1.2,
            }}
          >
            {title}
          </Text>
        </View>

        {/* Subtitle */}
        {subtitle && (
          <View style={{ marginBottom: 32, maxWidth: 400 }}>
            <Text
              style={{
                fontSize: 14,
                color: tokens.colors.ink[600],
                lineHeight: 1.6,
              }}
            >
              {subtitle}
            </Text>
          </View>
        )}

        {/* Badge */}
        {badge && (
          <View style={{ marginBottom: tokens.spacing[10] }}>
            <View
              style={{
                backgroundColor: tokens.colors.ink[900],
                paddingVertical: tokens.spacing[2],
                paddingHorizontal: tokens.spacing[4],
                alignSelf: 'flex-start',
              }}
            >
              <Text
                style={{
                  fontSize: tokens.fontSize.sm,
                  fontFamily: 'Helvetica-Bold',
                  color: tokens.colors.white,
                }}
              >
                {badge}
              </Text>
            </View>
          </View>
        )}

        {/* Metadata grid */}
        {metadata && metadata.length > 0 && (
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              marginTop: 'auto',
              paddingTop: tokens.spacing[16],
            }}
          >
            {metadata.map((item, index) => (
              <View key={index} style={{ width: '50%', marginBottom: tokens.spacing[4] }}>
                <Text
                  style={{
                    fontSize: tokens.fontSize.xs,
                    fontFamily: 'Helvetica-Bold',
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                    color: tokens.colors.ink[400],
                    marginBottom: tokens.spacing[1],
                  }}
                >
                  {item.label}
                </Text>
                <Text
                  style={{
                    fontSize: tokens.fontSize.sm,
                    color: tokens.colors.ink[700],
                  }}
                >
                  {item.value}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Footer */}
      <View
        style={{
          position: 'absolute',
          bottom: tokens.spacing[8],
          left: pageConfig.margin.left,
          right: pageConfig.margin.right,
        }}
      >
        <Text
          style={{
            fontSize: tokens.fontSize.xs,
            color: tokens.colors.ink[400],
          }}
        >
          Confidential - For personal use only
        </Text>
      </View>
    </ReportPage>
  )
}

export { Document, Page }
