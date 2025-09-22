import { ReportSection } from '@/components/report/ReportSection'
import styles from '@/components/report/ReportPrint.module.css'

interface TableOfContentsProps {
  title: string
  ariaLabel: string
  items: Array<{ id: string; label: string }>
}

export function TableOfContents({ title, ariaLabel, items }: TableOfContentsProps) {
  return (
    <ReportSection id="inhaltsverzeichnis" title={title} breakBefore="page">
      <nav aria-label={ariaLabel} data-print-visible>
        <ol
          className={styles.tocList}
          data-toc-list
          data-toc-item-class={styles.tocItem}
          data-toc-link-class={styles.tocLink}
        >
          {items.map((item) => (
            <li key={item.id} className={styles.tocItem} data-toc-item>
              <a href={`#${item.id}`} className={styles.tocLink} data-toc-link>
                {item.label}
              </a>
              <span className={styles.tocLeader} aria-hidden="true" />
              <span
                className={styles.tocPage}
                aria-hidden="true"
                data-toc-page
                data-target={`#${item.id}`}
              >
                —
              </span>
            </li>
          ))}
        </ol>
      </nav>
    </ReportSection>
  )
}
