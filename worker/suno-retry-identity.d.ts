export interface SunoRetryIdentity { personaId?: string; personaModel?: 'style_persona' | 'voice_persona' }
export function sealSunoRetryIdentity(identity: SunoRetryIdentity, metadata: Record<string, unknown>, ownerId: string | null | undefined, secret: string | undefined): string | undefined;
export function resolveSunoRetryIdentity(metadata: Record<string, any>, ownerId: string | null | undefined, secret: string | undefined): SunoRetryIdentity;
