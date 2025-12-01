import React from 'react'
import { View, Text, Svg, Path, G, Rect, Line } from '@react-pdf/renderer'
import { styles, tokens } from './styles'
import type { Style } from '@react-pdf/types'

// Helper to combine styles safely (filters out undefined)
function mergeStyles(base: Style, additional?: Style | Style[]): Style | Style[] {
  if (!additional) return base
  if (Array.isArray(additional)) return [base, ...additional]
  return [base, additional]
}

// ============================================================================
// Typography Components - Using built-in PDF fonts
// ============================================================================

interface TextProps {
  children: React.ReactNode
  style?: Style | Style[]
}

export function H1({ children, style }: TextProps) {
  return <Text style={mergeStyles(styles.h1, style)}>{children}</Text>
}

export function H2({ children, style }: TextProps) {
  return <Text style={mergeStyles(styles.h2, style)}>{children}</Text>
}

export function H3({ children, style }: TextProps) {
  return <Text style={mergeStyles(styles.h3, style)}>{children}</Text>
}

export function H4({ children, style }: TextProps) {
  return <Text style={mergeStyles(styles.h4, style)}>{children}</Text>
}

export function Body({ children, style }: TextProps) {
  return <Text style={mergeStyles(styles.body, style)}>{children}</Text>
}

export function BodyLarge({ children, style }: TextProps) {
  return <Text style={mergeStyles(styles.bodyLarge, style)}>{children}</Text>
}

export function Caption({ children, style }: TextProps) {
  return <Text style={mergeStyles(styles.caption, style)}>{children}</Text>
}

export function Label({ children, style }: TextProps) {
  return <Text style={mergeStyles(styles.label, style)}>{children}</Text>
}

// ============================================================================
// Layout Components
// ============================================================================

interface LayoutProps {
  children: React.ReactNode
  style?: Style | Style[]
}

export function Row({ children, style }: LayoutProps) {
  return <View style={mergeStyles(styles.row, style)}>{children}</View>
}

export function Col({ children, style }: LayoutProps) {
  return <View style={mergeStyles(styles.col, style)}>{children}</View>
}

interface GridProps extends LayoutProps {
  columns?: 2 | 3
}

export function Grid({ children, columns = 2, style }: GridProps) {
  return (
    <View style={mergeStyles(columns === 2 ? styles.grid2 : styles.grid3, style)}>
      {children}
    </View>
  )
}

export function GridItem({ children, columns = 2, style }: GridProps) {
  return (
    <View style={mergeStyles(columns === 2 ? styles.gridItem2 : styles.gridItem3, style)}>
      {children}
    </View>
  )
}

// ============================================================================
// Card Components - Simple borders, no complex backgrounds
// ============================================================================

interface CardProps extends LayoutProps {
  variant?: 'default' | 'bordered'
}

export function Card({ children, style }: CardProps) {
  return <View style={mergeStyles(styles.card, style)}>{children}</View>
}

export function Surface({ children, style }: LayoutProps) {
  return <View style={mergeStyles(styles.surface, style)}>{children}</View>
}

// ============================================================================
// KPI Components
// ============================================================================

interface KPIProps {
  label: string
  value: string
  description?: string
  style?: Style | Style[]
}

export function KPI({ label, value, description, style }: KPIProps) {
  return (
    <View style={mergeStyles(styles.surface, style)}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
      {description && <Text style={styles.kpiDescription}>{description}</Text>}
    </View>
  )
}

// ============================================================================
// Badge Component - Solid colors only
// ============================================================================

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger'
  style?: Style | Style[]
}

export function Badge({ children, variant = 'default', style }: BadgeProps) {
  const variantStyles: Record<string, Style> = {
    default: {},
    success: styles.badgeSuccess,
    warning: styles.badgeWarning,
    danger: styles.badgeDanger,
  }
  const combinedBase = [styles.badge, variantStyles[variant] || {}] as Style[]

  return (
    <View style={style ? [...combinedBase, ...(Array.isArray(style) ? style : [style])] : combinedBase}>
      <Text style={styles.badgeText}>{children}</Text>
    </View>
  )
}

// ============================================================================
// Table Components - Simple vector lines
// ============================================================================

interface TableProps {
  children: React.ReactNode
  style?: Style | Style[]
}

export function Table({ children, style }: TableProps) {
  return <View style={mergeStyles(styles.table, style)}>{children}</View>
}

interface TableRowProps {
  children: React.ReactNode
  header?: boolean
  alt?: boolean
  style?: Style | Style[]
}

export function TableRow({ children, header, style }: TableRowProps) {
  // Removed alt background for faster rendering
  const rowStyle = header ? styles.tableHeader : styles.tableRow
  return <View style={mergeStyles(rowStyle, style)}>{children}</View>
}

interface TableCellProps {
  children: React.ReactNode
  header?: boolean
  width?: string | number
  align?: 'left' | 'center' | 'right'
  style?: Style | Style[]
}

export function TableCell({ children, header, width, align, style }: TableCellProps) {
  const cellStyle = header ? styles.tableCellHeader : styles.tableCell
  const alignStyle: Style = align ? { textAlign: align } : {}
  const widthStyle: Style = width ? { width } : { flex: 1 }
  const combinedBase = { ...cellStyle, ...widthStyle, ...alignStyle } as Style

  return (
    <View style={mergeStyles(combinedBase, style)}>
      <Text style={header ? styles.tableCellHeader : undefined}>{children}</Text>
    </View>
  )
}

// ============================================================================
// Callout Component - Simple left border
// ============================================================================

interface CalloutProps {
  children: React.ReactNode
  variant?: 'info' | 'warning' | 'danger' | 'success'
  style?: Style | Style[]
}

export function Callout({ children, variant = 'info', style }: CalloutProps) {
  const variantStyles: Record<string, Style> = {
    info: {},
    warning: styles.calloutWarning,
    danger: styles.calloutDanger,
    success: styles.calloutSuccess,
  }
  const combinedBase = [styles.callout, variantStyles[variant] || {}] as Style[]

  return (
    <View style={style ? [...combinedBase, ...(Array.isArray(style) ? style : [style])] : combinedBase}>
      {children}
    </View>
  )
}

// ============================================================================
// List Components
// ============================================================================

interface ListItemProps {
  children: React.ReactNode
  bullet?: string
  style?: Style | Style[]
}

export function ListItem({ children, bullet = '-', style }: ListItemProps) {
  return (
    <View style={mergeStyles(styles.listItem, style)}>
      <Text style={styles.listBullet}>{bullet}</Text>
      <Text style={styles.listContent}>{children}</Text>
    </View>
  )
}

// ============================================================================
// Section Component
// ============================================================================

interface SectionProps {
  id?: string
  title: string
  lead?: string
  children: React.ReactNode
  style?: Style | Style[]
}

export function Section({ title, lead, children, style }: SectionProps) {
  return (
    <View style={mergeStyles(styles.section, style)}>
      <View style={styles.sectionHeader}>
        <H2>{title}</H2>
        {lead && <Text style={styles.sectionLead}>{lead}</Text>}
      </View>
      {children}
    </View>
  )
}

// ============================================================================
// Divider Component - Simple vector line
// ============================================================================

interface DividerProps {
  thick?: boolean
  style?: Style | Style[]
}

export function Divider({ thick, style }: DividerProps) {
  return <View style={mergeStyles(thick ? styles.dividerThick : styles.divider, style)} />
}

// ============================================================================
// Figure Wrapper
// ============================================================================

interface FigureProps {
  caption?: string
  children: React.ReactNode
  style?: Style | Style[]
}

export function Figure({ caption, children, style }: FigureProps) {
  return (
    <View style={mergeStyles(styles.figure, style)}>
      {children}
      {caption && <Text style={styles.figcaption}>{caption}</Text>}
    </View>
  )
}

// ============================================================================
// SVG Components for vector graphics
// ============================================================================

export { Svg, Path, G, Rect, Line }

// Re-export tokens for external use
export { tokens }
