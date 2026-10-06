export interface CompiledLyricsSections {
  lyricsPrompt: string;
  styleDescriptions: string[];
}
export interface LyricsSubmissionInput {
  stylePrompt: string;
  lyricsPrompt?: string | null;
  lyricsSections?: unknown;
  isInstrumental?: boolean;
  /** A server-resolved solo identity; other strings and duet keep their existing style. */
  vocalGender?: string;
  /** Reserve space for provider headers by passing a lower budget. Maximum 1000. */
  maxStyleChars?: number;
}
export interface PreparedLyricsSubmission extends CompiledLyricsSections {
  stylePrompt: string;
}
export function compileLyricsSections(sections: unknown): CompiledLyricsSections;
export function mergeLyricsDescriptions(stylePrompt: string, descriptions: readonly string[], maxChars?: number): string;
export function prepareLyricsSubmission(input: LyricsSubmissionInput): PreparedLyricsSubmission;
export class LyricsInstructionError extends Error {
  code: 'lyrics_instruction_in_content';
}
/** Reject clear standalone production blocks; never rewrite actual lyrics. */
export function assertSafeVocalLyrics(lyrics: string): void;
