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
    brand?: string
    left?: string
    right?: string
  }
  footer?: {
    left?: string
    center?: string
    showPageNumber?: boolean
    pageLabel?: string
    pageOfLabel?: string
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
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View
              style={{
                width: 5.5,
                height: 5.5,
                backgroundColor: tokens.colors.accent[600],
                borderRadius: 1,
                marginRight: 5,
              }}
            />
            <Text style={styles.headerBrand}>{header.brand ?? header.left ?? ''}</Text>
          </View>
          <Text style={styles.headerMeta}>{header.right || ''}</Text>
        </View>
      )}

      {children}

      {pageStyle !== 'cover' && footer && (
        <View style={styles.footer} fixed>
          <Text style={[styles.footerText, { flex: 1 }]}>{footer.left || ''}</Text>
          <Text style={[styles.footerText, { flex: 1, textAlign: 'center' }]}>
            {footer.center || ''}
          </Text>
          {footer.showPageNumber ? (
            <Text
              style={[styles.pageNumber, { flex: 1 }]}
              render={({ pageNumber, totalPages }) =>
                `${footer.pageLabel ?? 'Page'} ${pageNumber} ${footer.pageOfLabel ?? 'of'} ${totalPages}`
              }
            />
          ) : (
            <Text style={[styles.footerText, { flex: 1 }]} />
          )}
        </View>
      )}
    </Page>
  )
}

// ---------------------------------------------------------------------------
// Cover page
// ---------------------------------------------------------------------------

export interface CoverStat {
  label: string
  value: string
  caption?: string
}

interface CoverPageProps {
  brand: string
  classification?: string
  overline?: string
  title: string
  subtitle?: string
  badge?: string
  badgeTone?: 'success' | 'warning' | 'danger'
  stats?: CoverStat[]
  hero?: React.ReactNode
  heroCaption?: string
  metadata?: Array<{ label: string; value: string }>
  disclaimer?: string
}

const BADGE_TONES: Record<NonNullable<CoverPageProps['badgeTone']>, string> = {
  success: '#2ea77b',
  warning: '#d99a2b',
  danger: '#d16158',
}

export function CoverPage({
  brand,
  classification,
  overline,
  title,
  subtitle,
  badge,
  badgeTone = 'success',
  stats,
  hero,
  heroCaption,
  metadata,
  disclaimer,
}: CoverPageProps) {
  const inset = pageConfig.margin.left

  return (
    <ReportPage pageStyle="cover">
      {/* Top brand band */}
      <View
        style={{
          backgroundColor: tokens.colors.accent[800],
          paddingHorizontal: inset,
          paddingTop: 36,
          paddingBottom: 40,
        }}
      >
        {/* Brand row */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 52,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View
              style={{
                width: 8,
                height: 8,
                backgroundColor: '#7fc4d8',
                borderRadius: 1.5,
                marginRight: 6,
              }}
            />
            <Text
              style={{
                fontSize: 8,
                fontWeight: 600,
                letterSpacing: 1.6,
                textTransform: 'uppercase',
                color: tokens.colors.white,
              }}
            >
              {brand}
            </Text>
          </View>
          {classification && (
            <Text
              style={{
                fontSize: 7,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
                color: '#9ec7d6',
              }}
            >
              {classification}
            </Text>
          )}
        </View>

        {overline && (
          <Text
            style={{
              fontSize: 7.5,
              fontWeight: 600,
              letterSpacing: 1.8,
              textTransform: 'uppercase',
              color: '#7fc4d8',
              marginBottom: 10,
            }}
          >
            {overline}
          </Text>
        )}

        <Text
          style={{
            fontSize: 31,
            fontWeight: 700,
            letterSpacing: -0.4,
            lineHeight: 1.12,
            color: tokens.colors.white,
            marginBottom: 12,
          }}
        >
          {title}
        </Text>

        {subtitle && (
          <Text
            style={{
              maxWidth: 400,
              fontSize: 9.5,
              color: '#c3dde8',
              lineHeight: 1.55,
              marginBottom: badge ? 16 : 0,
            }}
          >
            {subtitle}
          </Text>
        )}

        {badge && (
          <View
            style={{
              alignSelf: 'flex-start',
              flexDirection: 'row',
              alignItems: 'center',
              borderWidth: 1,
              borderColor: '#4a7f97',
              borderRadius: 3,
              paddingVertical: 4,
              paddingHorizontal: 9,
            }}
          >
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: BADGE_TONES[badgeTone],
                marginRight: 6,
              }}
            />
            <Text
              style={{
                color: tokens.colors.white,
                fontSize: 8,
                fontWeight: 600,
                letterSpacing: 0.6,
              }}
            >
              {badge}
            </Text>
          </View>
        )}
      </View>

      {/* Body */}
      <View style={{ paddingHorizontal: inset, paddingTop: 26, flex: 1 }}>
        {/* Stat tiles */}
        {stats && stats.length > 0 && (
          <View style={{ flexDirection: 'row', marginBottom: 22 }}>
            {stats.map((stat, index) => (
              <View
                key={index}
                style={{
                  flex: 1,
                  marginRight: index < stats.length - 1 ? 10 : 0,
                  borderWidth: 1,
                  borderColor: tokens.colors.ink[200],
                  borderRadius: tokens.radius.md,
                  borderTopWidth: 2,
                  borderTopColor: tokens.colors.accent[600],
                  paddingVertical: 10,
                  paddingHorizontal: 10,
                }}
              >
                <Text
                  style={{
                    fontSize: 6.5,
                    fontWeight: 600,
                    letterSpacing: 0.8,
                    textTransform: 'uppercase',
                    color: tokens.colors.ink[500],
                  }}
                >
                  {stat.label}
                </Text>
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    letterSpacing: -0.2,
                    color: tokens.colors.ink[900],
                    marginTop: 5,
                  }}
                >
                  {stat.value}
                </Text>
                {stat.caption && (
                  <Text style={{ fontSize: 6.5, color: tokens.colors.ink[500], marginTop: 3 }}>
                    {stat.caption}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Hero graphic */}
        {hero && (
          <View
            style={{
              borderWidth: 1,
              borderColor: tokens.colors.ink[200],
              borderRadius: tokens.radius.md,
              padding: 12,
            }}
          >
            {hero}
            {heroCaption && (
              <Text
                style={{
                  marginTop: 6,
                  fontSize: 6.5,
                  color: tokens.colors.ink[500],
                  textAlign: 'center',
                }}
              >
                {heroCaption}
              </Text>
            )}
          </View>
        )}

        <View style={{ flex: 1 }} />

        {/* Metadata strip */}
        {metadata && metadata.length > 0 && (
          <View
            style={{
              flexDirection: 'row',
              borderTopWidth: 1,
              borderTopColor: tokens.colors.ink[900],
              paddingTop: 12,
              marginBottom: 12,
            }}
          >
            {metadata.map((item, index) => (
              <View key={index} style={{ flex: 1, paddingRight: 10 }}>
                <Text
                  style={{
                    fontSize: 6.5,
                    letterSpacing: 0.8,
                    textTransform: 'uppercase',
                    fontWeight: 600,
                    color: tokens.colors.ink[500],
                    marginBottom: 3,
                  }}
                >
                  {item.label}
                </Text>
                <Text style={{ fontSize: 8.5, fontWeight: 500, color: tokens.colors.ink[800] }}>
                  {item.value}
                </Text>
              </View>
            ))}
          </View>
        )}

        {disclaimer && (
          <Text
            style={{
              fontSize: 6.5,
              color: tokens.colors.ink[400],
              lineHeight: 1.5,
              marginBottom: 26,
            }}
          >
            {disclaimer}
          </Text>
        )}
      </View>
    </ReportPage>
  )
}

export { Document, Page }
