// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  getProviderTypesForRuntime,
  isProductionAgentRuntimeKind,
  supportsRuntimeProviderType,
} from '../../agentRuntime/runtimeDescriptors';
import type {
  AgentRuntimeKind,
  DualSurfaceProviderType,
  ProviderConfig,
  ProviderType,
} from './types';
import { DUAL_SURFACE_PROVIDER_TYPES } from './providerTypes';

export { DUAL_SURFACE_PROVIDER_TYPES };

export function isAgentRuntimeKind(value: unknown): value is AgentRuntimeKind {
  return isProductionAgentRuntimeKind(value);
}

export function isDualSurfaceProviderType(type: ProviderType): type is DualSurfaceProviderType {
  return DUAL_SURFACE_PROVIDER_TYPES.includes(type as DualSurfaceProviderType);
}

export function supportsAgentRuntimeType(type: ProviderType, runtime: AgentRuntimeKind): boolean {
  return supportsRuntimeProviderType(type, runtime);
}

export function assertAgentRuntimeSupported(type: ProviderType, runtime?: unknown): asserts runtime is AgentRuntimeKind | undefined {
  if (runtime === undefined || runtime === null) return;
  if (!isAgentRuntimeKind(runtime)) {
    throw new Error(`Invalid agent runtime: ${String(runtime)}`);
  }
  if (!getProviderTypesForRuntime(runtime).includes(type)) {
    throw new Error(`Provider type "${type}" does not support ${runtime}`);
  }
}

export function resolveProviderAgentRuntime(
  provider?: Pick<ProviderConfig, 'type' | 'connection'> | null,
): AgentRuntimeKind {
  const explicitRuntime = provider?.connection.agentRuntime;
  assertAgentRuntimeSupported(provider?.type ?? 'custom', explicitRuntime);
  if (explicitRuntime) return explicitRuntime;

  switch (provider?.type as ProviderType | undefined) {
    case 'openai':
    case 'ollama':
      return 'openai-agents-sdk';
    case 'custom':
      if (
        provider?.connection.openCodeModelJson ||
        provider?.connection.openCodeSdkModulePath
      ) {
        return 'opencode';
      }
      if (
        provider?.connection.openaiProtocol ||
        provider?.connection.openaiBaseUrl ||
        provider?.connection.openaiApiKey
      ) {
        const hasClaudeSurface = Boolean(
          provider.connection.claudeBaseUrl ||
          provider.connection.claudeApiKey ||
          provider.connection.claudeAuthToken,
        );
        return hasClaudeSurface ? 'claude-agent-sdk' : 'openai-agents-sdk';
      }
      return 'claude-agent-sdk';
    case 'anthropic':
    case 'bedrock':
    case 'vertex':
    default:
      return 'claude-agent-sdk';
  }
}

export function sharedKeyShouldUseClaudeAuthToken(type: ProviderType): boolean {
  return [
    'deepseek',
    'qwen',
    'qwen_coding',
    'kimi',
    'doubao',
    'minimax',
    'tencent_token_plan',
    'tencent_coding_plan',
    'hunyuan',
    'qianfan',
    'stepfun',
    'huawei',
  ].includes(type);
}
