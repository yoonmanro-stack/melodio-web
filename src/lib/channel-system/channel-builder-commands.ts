import 'server-only'

import { getChannelBuilderService } from './channel-builder-service'
import {
  parseChannelDraft,
  parseDnaVersionInput,
  parseListenerIntentUpdate,
  parseUuid,
} from './channel-builder-input'

export async function saveChannelDraftCommand(input: unknown) {
  const draft = parseChannelDraft(input)
  const service = await getChannelBuilderService()
  return service.saveChannelDraft(draft)
}

export async function listChannelSummariesCommand() {
  const service = await getChannelBuilderService()
  return service.listChannelSummaries()
}

export async function createDnaVersionCommand(channelId: unknown, input: unknown) {
  const validChannelId = parseUuid(channelId, 'channelId')
  const { dna, changeSummary } = parseDnaVersionInput(input)
  const service = await getChannelBuilderService()
  return service.createDnaVersion(validChannelId, dna, changeSummary)
}

export async function updateListenerIntentCommand(
  channelId: unknown,
  profileId: unknown,
  input: unknown,
) {
  const validChannelId = parseUuid(channelId, 'channelId')
  const validProfileId = parseUuid(profileId, 'profileId')
  const profile = parseListenerIntentUpdate(input, validChannelId, validProfileId)
  const service = await getChannelBuilderService()
  return service.updateListenerIntent(profile)
}
