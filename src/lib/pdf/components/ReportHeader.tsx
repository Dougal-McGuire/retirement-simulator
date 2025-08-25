import React from 'react'
import { View, Text } from '@react-pdf/renderer'
import { styles } from '../styles'

interface ReportHeaderProps {
  reportTitle: string
  reportDate: string
  reportId: string
  showLogo?: boolean
}

export const ReportHeader: React.FC<ReportHeaderProps> = ({
  reportTitle,
  reportDate,
  reportId,
  showLogo = true,
}) => {
  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        {showLogo && <View style={styles.logo} />}
        <Text style={styles.title}>{reportTitle}</Text>
      </View>
      <View style={styles.headerRight}>
        <Text style={styles.text}>Report Generated: {reportDate}</Text>
        <Text style={styles.smallText}>Report ID: {reportId}</Text>
      </View>
    </View>
  )
}