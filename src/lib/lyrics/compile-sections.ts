/** Browser and API entry point for the worker's shared, pure lyrics policy. */
export { compileLyricsSections, mergeLyricsDescriptions, prepareLyricsSubmission, LyricsInstructionError, assertSafeVocalLyrics } from '../../../worker/lyrics-policy'
export type { CompiledLyricsSections, LyricsSubmissionInput, PreparedLyricsSubmission } from '../../../worker/lyrics-policy'
