import type { PropsWithChildren } from 'react'
import styles from '@/components/report/ReportPrint.module.css'

interface ReportSectionProps {
  id: string
  title: string
  lead?: string
  breakBefore?: 'page' | 'auto'
}

export function ReportSection({ id, title, lead, breakBefore = 'auto', children }: PropsWithChildren<ReportSectionProps>) {
  const sectionClass = breakBefore === 'page'
    ? `${styles.section} ${styles.breakBeforePage}`
    : styles.section

  return (
    <section id={id} aria-labelledby={`${id}-title`} data-section className={sectionClass}>
      <h2
        id={`${id}-title`}
        data-running-header
        data-toc-heading
        data-anchor={id}
        className={styles.breakInsideAvoid}
      >
        {title}
      </h2>
      {lead ? <p className={styles.lead}>{lead}</p> : null}
      {children}
    </section>
  )
}
