type GeneratedSongFormOptions = {
  ordinarySong: boolean
  presetId?: string
}

const ORDINARY_FORM = ['intro', 'verse', 'chorus', 'verse', 'chorus', 'outro'] as const
const PERFORMANCE_FORM = ['intro', 'verse', 'pre-chorus', 'chorus', 'verse', 'pre-chorus', 'chorus', 'outro'] as const

/** Validate auto-generated complete songs without rewriting any authored words. */
export function validateGeneratedSongForm(sections: unknown, options: GeneratedSongFormOptions): boolean {
  // Dedicated short-form and viral generators have their own structure contracts.
  if (!options.ordinarySong) return true
  const expected = options.presetId === 'brazilian-funk-kpop-performance' ? PERFORMANCE_FORM : ORDINARY_FORM
  if (!Array.isArray(sections) || sections.length !== expected.length) return false
  return sections.every((section, index) => {
    if (!section || typeof section !== 'object' || section.type !== expected[index]
      || typeof section.content !== 'string') return false
    // Intro and Outro can resolve instrumentally; the sung development cannot be empty.
    return expected[index] === 'intro' || expected[index] === 'outro' || Boolean(section.content.trim())
  })
}
