// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 Gracker (Chris)
// This file is part of SmartPerfetto. See LICENSE for details.

import { DUAL_SURFACE_PROVIDER_TYPES } from '../services/providerManager/providerTypes';
import type { AgentRuntimeKind } from './runtimeKinds';
import {
  CLAUDE_AGENT_RUNTIME_KIND,
  OPENAI_AGENT_RUNTIME_KIND,
  OPENCODE_RUNTIME_KIND,
  PI_AGENT_CORE_RUNTIME_KIND,
  isProductionAgentRuntimeKind,
  listProductionRuntimeKinds,
} from './runtimeKinds';
import type {
  EngineCapabilities,
  RuntimeDiagnosticsInput,
  RuntimeEngineDescriptor,
} from './runtimeDescriptorTypes';
import type { RuntimeSelection } from './runtimeSelection';

const CLAUDE_PROVIDER_TYPES = [
  'anthropic',
  'bedrock',
  'vertex',
  ...DUAL_SURFACE_PROVIDER_TYPES,
  'custom',
] as const;

const OPENAI_PROVIDER_TYPES = [
  'openai',
  'ollama',
  ...DUAL_SURFACE_PROVIDER_TYPES,
  'custom',
] as const;

const CUSTOM_ONLY_PROVIDER_TYPES = ['custom'] as const;

function createCapabilities<K extends AgentRuntimeKind>(
  kind: K,
  displayName: string,
): RuntimeEngineDescriptor<K>['capabilities'] {
  return {
    kind,
    displayName,
    production: true,
    publicRuntime: true,
  };
}

export const PRODUCTION_RUNTIME_DESCRIPTORS = [
  {
    kind: CLAUDE_AGENT_RUNTIME_KIND,
    displayName: 'Claude Agent SDK',
    production: true,
    publicRuntime: true,
    providerTypes: CLAUDE_PROVIDER_TYPES,
    capabilities: createCapabilities(CLAUDE_AGENT_RUNTIME_KIND, 'Claude Agent SDK'),
    createOrchestrator: ({ traceProcessorService, selection }) => {
      // Lazy load to keep providerManager runtime matrix imports cycle-free.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { createClaudeRuntime } = require('../agentv3') as typeof import('../agentv3');
      return createClaudeRuntime(
        traceProcessorService,
        undefined,
        selection as RuntimeSelection<AgentRuntimeKind>,
      );
    },
    getDiagnostics: ({ selectedProviderId }: RuntimeDiagnosticsInput<typeof CLAUDE_AGENT_RUNTIME_KIND>) => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getClaudeRuntimeDiagnostics } = require('../agentv3/claudeConfig') as typeof import('../agentv3/claudeConfig');
      return getClaudeRuntimeDiagnostics(selectedProviderId ?? null);
    },
  },
  {
    kind: OPENAI_AGENT_RUNTIME_KIND,
    displayName: 'OpenAI Agents SDK',
    production: true,
    publicRuntime: true,
    providerTypes: OPENAI_PROVIDER_TYPES,
    capabilities: createCapabilities(OPENAI_AGENT_RUNTIME_KIND, 'OpenAI Agents SDK'),
    createOrchestrator: ({ traceProcessorService, selection }) => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { createOpenAIRuntime } = require('../agentOpenAI') as typeof import('../agentOpenAI');
      return createOpenAIRuntime(
        traceProcessorService,
        selection as RuntimeSelection<AgentRuntimeKind>,
      );
    },
    getDiagnostics: ({ selectedProviderId }: RuntimeDiagnosticsInput<typeof OPENAI_AGENT_RUNTIME_KIND>) => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getOpenAIRuntimeDiagnostics } = require('../agentOpenAI') as typeof import('../agentOpenAI');
      return getOpenAIRuntimeDiagnostics(selectedProviderId ?? null);
    },
  },
  {
    kind: PI_AGENT_CORE_RUNTIME_KIND,
    displayName: 'Pi Agent Core',
    production: true,
    publicRuntime: true,
    providerTypes: CUSTOM_ONLY_PROVIDER_TYPES,
    capabilities: createCapabilities(PI_AGENT_CORE_RUNTIME_KIND, 'Pi Agent Core'),
    createOrchestrator: input => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { PiAgentCoreRuntime } = require('./piAgentCoreRuntime') as typeof import('./piAgentCoreRuntime');
      return new PiAgentCoreRuntime(
        input.traceProcessorService,
        input.selection as RuntimeSelection<typeof PI_AGENT_CORE_RUNTIME_KIND>,
      );
    },
    getDiagnostics: ({ env, kind }: RuntimeDiagnosticsInput<typeof PI_AGENT_CORE_RUNTIME_KIND>) => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getPiAgentCoreRuntimeDiagnostics } = require('./piAgentCoreRuntime') as typeof import('./piAgentCoreRuntime');
      return getPiAgentCoreRuntimeDiagnostics(env, kind);
    },
  },
  {
    kind: OPENCODE_RUNTIME_KIND,
    displayName: 'OpenCode',
    production: true,
    publicRuntime: true,
    providerTypes: CUSTOM_ONLY_PROVIDER_TYPES,
    capabilities: createCapabilities(OPENCODE_RUNTIME_KIND, 'OpenCode'),
    createOrchestrator: input => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { OpenCodeRuntime } = require('./openCodeRuntime') as typeof import('./openCodeRuntime');
      return new OpenCodeRuntime(input);
    },
    getDiagnostics: ({ env, kind }: RuntimeDiagnosticsInput<typeof OPENCODE_RUNTIME_KIND>) => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getOpenCodeRuntimeDiagnostics } = require('./openCodeRuntime') as typeof import('./openCodeRuntime');
      return getOpenCodeRuntimeDiagnostics(env, kind);
    },
  },
] as const satisfies readonly RuntimeEngineDescriptor[];

export {
  isProductionAgentRuntimeKind,
  listProductionRuntimeKinds,
  type AgentRuntimeKind,
  type EngineCapabilities,
  type RuntimeDiagnosticsInput,
  type RuntimeEngineDescriptor,
};

export function getProductionRuntimeDescriptor(kind: AgentRuntimeKind): RuntimeEngineDescriptor {
  const descriptor = PRODUCTION_RUNTIME_DESCRIPTORS.find(candidate => candidate.kind === kind);
  if (!descriptor) {
    throw new Error(`Unsupported agent runtime descriptor: ${kind}`);
  }
  return descriptor;
}

export function getProductionEngineCapabilities(kind: string): EngineCapabilities {
  if (!isProductionAgentRuntimeKind(kind)) {
    throw new Error(`Unsupported agent runtime capabilities: ${kind}`);
  }
  return getProductionRuntimeDescriptor(kind).capabilities;
}

export function getProviderTypesForRuntime(kind: AgentRuntimeKind): readonly string[] {
  return getProductionRuntimeDescriptor(kind).providerTypes;
}

export function supportsRuntimeProviderType(type: string, runtime: AgentRuntimeKind): boolean {
  return getProviderTypesForRuntime(runtime).includes(type);
}
