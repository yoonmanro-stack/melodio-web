'use server'

import {
  createDnaVersionCommand,
  saveChannelDraftCommand,
  updateListenerIntentCommand,
} from '@/lib/channel-system/channel-builder-commands'
import {
  mapChannelBuilderError,
  type ChannelBuilderErrorPayload,
} from '@/lib/channel-system/channel-builder-errors'

export type ChannelBuilderActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: ChannelBuilderErrorPayload }

async function actionResult<T>(operation: () => Promise<T>): Promise<ChannelBuilderActionResult<T>> {
  try {
    return { success: true, data: await operation() }
  } catch (error) {
    return { success: false, error: mapChannelBuilderError(error).payload }
  }
}

export async function saveChannelDraftAction(input: unknown) {
  return actionResult(() => saveChannelDraftCommand(input))
}

export async function createDnaVersionAction(channelId: string, input: unknown) {
  return actionResult(() => createDnaVersionCommand(channelId, input))
}

export async function updateListenerIntentAction(
  channelId: string,
  profileId: string,
  input: unknown,
) {
  return actionResult(() => updateListenerIntentCommand(channelId, profileId, input))
}
