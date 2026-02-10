import React from 'react'
import { Document, Page, View, Text } from '@react-pdf/renderer'
import type { Style } from '@react-pdf/types'
import { styles, tokens, page as pageConfig } from './styles'
import './fonts'

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

interface ReportPageProps {
  children: React.ReactNode
  header?: {
    left?: string
    right?: string
  }
  footer?: {
    left?: string
    showPageNumber?: boolean
    pageLabel?: string
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
  const pageStyles = style ? [basePageStyle, style].flat() : basePageStyle

  return (
    <Page size="A4" style={pageStyles}>
      {pageStyle !== 'cover' && header && (
        <View style={styles.header} fixed>
          <Text>{header.left || ''}</Text>
          <Text>{header.right || ''}</Text>
        </View>
      )}

      {children}

      {pageStyle !== 'cover' && footer && (
        <>
          <View style={styles.footer} fixed>
            <Text>{footer.left || ''}</Text>
          </View>
          {footer.showPageNumber && (
            <Text
              fixed
              style={styles.pageNumber}
              render={({ pageNumber, totalPages }) =>
                `${footer.pageLabel ?? 'Page'} ${pageNumber} / ${totalPages}`
              }
            />
          )}
        </>
      )}
    </Page>
  )
}

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
      <View
        style={{
          height: 150,
          backgroundColor: tokens.colors.accent[700],
          paddingHorizontal: pageConfig.margin.left,
          paddingTop: 34,
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            fontSize: 28,
            fontFamily: 'Helvetica-Bold',
            color: tokens.colors.white,
            marginBottom: 8,
          }}
        >
          {title}
        </Text>
        {subtitle && (
          <Text
            style={{
              maxWidth: 460,
              fontSize: 11,
              color: '#d7e8f0',
              lineHeight: 1.45,
            }}
          >
            {subtitle}
          </Text>
        )}
      </View>

      <View
        style={{
          paddingHorizontal: pageConfig.margin.left,
          paddingTop: 34,
          paddingBottom: pageConfig.margin.bottom,
          flex: 1,
        }}
      >
        {badge && (
          <View
            style={{
              alignSelf: 'flex-start',
              backgroundColor: tokens.colors.ink[900],
              paddingVertical: 4,
              paddingHorizontal: 10,
              marginBottom: 24,
            }}
          >
            <Text style={{ color: tokens.colors.white, fontSize: 9, fontFamily: 'Helvetica-Bold' }}>
              {badge}
            </Text>
          </View>
        )}

        {metadata && metadata.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 16 }}>
            {metadata.map((item, index) => (
              <View
                key={index}
                style={{
                  width: '50%',
                  paddingRight: 12,
                  marginBottom: 18,
                  borderBottomWidth: 0.5,
                  borderBottomColor: tokens.colors.ink[200],
                  paddingBottom: 10,
                }}
              >
                <Text
                  style={{
                    fontSize: 8,
                    letterSpacing: 0.4,
                    textTransform: 'uppercase',
                    fontFamily: 'Helvetica-Bold',
                    color: tokens.colors.ink[500],
                    marginBottom: 3,
                  }}
                >
                  {item.label}
                </Text>
                <Text style={{ fontSize: 10, color: tokens.colors.ink[700] }}>{item.value}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </ReportPage>
  )
}

export { Document, Page }
