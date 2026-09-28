import en from '../../../../i18n/messages/en.json'
import de from '../../../../i18n/messages/de.json'
import { WORKSPACE_SECTIONS } from '@/components/workspace/workspaceNav'

describe('workspace section messages', () => {
  test.each([
    ['en', en],
    ['de', de],
  ] as const)(
    '%s names all five sections (title, short label, description)',
    (_locale, messages) => {
      const sections = messages.workspace.sections as Record<
        string,
        { title: string; short: string; description: string }
      >
      for (const id of WORKSPACE_SECTIONS) {
        expect(sections[id].title).toBeTruthy()
        expect(sections[id].short).toBeTruthy()
        expect(sections[id].description).toBeTruthy()
      }
      expect(messages.workspace.navigation).toBeTruthy()
    }
  )

  test('short labels stay short enough for 64px bottom-bar items', () => {
    for (const messages of [en, de]) {
      for (const id of WORKSPACE_SECTIONS) {
        const short = (messages.workspace.sections as Record<string, { short: string }>)[id].short
        expect(short.length).toBeLessThanOrEqual(9)
      }
    }
  })
})
