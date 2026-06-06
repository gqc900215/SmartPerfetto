// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 Gracker (Chris)
// This file is part of SmartPerfetto. See LICENSE for details.

import { describe, expect, it, jest } from '@jest/globals';
import type { IOrchestrator } from '../../agent/core/orchestratorTypes';
import {
  createRuntimeRegistry,
  productionRuntimeRegistry,
  type RuntimeEngineDefinition,
} from '../runtimeRegistry';
import {
  PRODUCTION_RUNTIME_DESCRIPTORS,
  getProductionEngineCapabilities,
  isProductionAgentRuntimeKind,
  listProductionRuntimeKinds,
  supportsRuntimeProviderType,
} from '../runtimeDescriptors';
import {
  type EngineCapabilities,
} from '../runtimeDescriptorTypes';

function fakeCapabilities(kind = 'fake-runtime'): EngineCapabilities {
  return {
    kind,
    displayName: 'Fake Runtime',
    production: false,
    publicRuntime: false,
  };
}

describe('runtime registry', () => {
  it('derives public production runtimes from descriptors', () => {
    const descriptorKinds = PRODUCTION_RUNTIME_DESCRIPTORS.map(descriptor => descriptor.kind);
    const expectedKinds = [
      'claude-agent-sdk',
      'openai-agents-sdk',
      'pi-agent-core',
      'opencode',
    ];

    expect(descriptorKinds).toEqual(expectedKinds);
    expect(listProductionRuntimeKinds()).toEqual(expectedKinds);
    expect(productionRuntimeRegistry.listRuntimeKinds()).toEqual(expectedKinds);
    expect(isProductionAgentRuntimeKind('claude-agent-sdk')).toBe(true);
    expect(isProductionAgentRuntimeKind('openai-agents-sdk')).toBe(true);
    expect(isProductionAgentRuntimeKind('pi-agent-core')).toBe(true);
    expect(isProductionAgentRuntimeKind('opencode')).toBe(true);
    expect(isProductionAgentRuntimeKind('fake-third-party-runtime')).toBe(false);
  });

  it('exposes slim runtime capabilities as descriptor truth', () => {
    const claude = productionRuntimeRegistry.getCapabilities('claude-agent-sdk');
    const openai = productionRuntimeRegistry.getCapabilities('openai-agents-sdk');
    const pi = productionRuntimeRegistry.getCapabilities('pi-agent-core');
    const opencode = productionRuntimeRegistry.getCapabilities('opencode');

    expect(claude).toBe(getProductionEngineCapabilities('claude-agent-sdk'));
    expect(openai).toBe(getProductionEngineCapabilities('openai-agents-sdk'));
    expect(pi).toBe(getProductionEngineCapabilities('pi-agent-core'));
    expect(opencode).toBe(getProductionEngineCapabilities('opencode'));
    expect(claude).toEqual({
      kind: 'claude-agent-sdk',
      displayName: 'Claude Agent SDK',
      production: true,
      publicRuntime: true,
    });
    expect(openai).toEqual({
      kind: 'openai-agents-sdk',
      displayName: 'OpenAI Agents SDK',
      production: true,
      publicRuntime: true,
    });
    expect(pi).toEqual({
      kind: 'pi-agent-core',
      displayName: 'Pi Agent Core',
      production: true,
      publicRuntime: true,
    });
    expect(opencode).toEqual({
      kind: 'opencode',
      displayName: 'OpenCode',
      production: true,
      publicRuntime: true,
    });
    for (const capabilities of [claude, openai, pi, opencode]) {
      expect(capabilities).not.toHaveProperty('toolTransport');
      expect(capabilities).not.toHaveProperty('continuationPolicy');
      expect(capabilities).not.toHaveProperty('snapshotState');
    }
  });

  it('derives provider compatibility from runtime descriptors', () => {
    expect(supportsRuntimeProviderType('anthropic', 'claude-agent-sdk')).toBe(true);
    expect(supportsRuntimeProviderType('deepseek', 'claude-agent-sdk')).toBe(true);
    expect(supportsRuntimeProviderType('deepseek', 'openai-agents-sdk')).toBe(true);
    expect(supportsRuntimeProviderType('openai', 'openai-agents-sdk')).toBe(true);
    expect(supportsRuntimeProviderType('openai', 'claude-agent-sdk')).toBe(false);
    expect(supportsRuntimeProviderType('custom', 'pi-agent-core')).toBe(true);
    expect(supportsRuntimeProviderType('custom', 'opencode')).toBe(true);
    expect(supportsRuntimeProviderType('anthropic', 'opencode')).toBe(false);
  });

  it('requires every production runtime to expose session-scoped cancellation', () => {
    const traceProcessorService = { kind: 'trace-processor' } as any;

    for (const kind of productionRuntimeRegistry.listRuntimeKinds()) {
      const orchestrator = productionRuntimeRegistry.createOrchestrator(kind, {
        traceProcessorService,
        selection: { kind, source: 'default' },
      });

      expect(typeof orchestrator.abortSession).toBe('function');
    }
  });

  it('creates runtimes through registered definitions', () => {
    const orchestrator = { analyze: jest.fn(), reset: jest.fn() } as unknown as IOrchestrator;
    const createOrchestrator = jest.fn((_input: any) => orchestrator);
    const definition: RuntimeEngineDefinition = {
      kind: 'fake-runtime',
      capabilities: fakeCapabilities('fake-runtime'),
      createOrchestrator,
    };
    const registry = createRuntimeRegistry([definition]);
    const traceProcessorService = { kind: 'trace-processor' } as any;
    const selection = { kind: 'fake-runtime', source: 'default' as const };

    expect(registry.createOrchestrator('fake-runtime', {
      traceProcessorService,
      selection,
    })).toBe(orchestrator);
    expect(createOrchestrator).toHaveBeenCalledWith({
      traceProcessorService,
      selection,
    });
  });

  it('fails closed for unknown, duplicate, and mismatched registrations', () => {
    const definition: RuntimeEngineDefinition = {
      kind: 'fake-runtime',
      capabilities: fakeCapabilities('fake-runtime'),
      createOrchestrator: jest.fn(() => ({}) as IOrchestrator),
    };
    const registry = createRuntimeRegistry([definition]);

    expect(() => registry.require('missing-runtime')).toThrow(
      'Unsupported agent runtime: missing-runtime',
    );
    expect(() => registry.register(definition)).toThrow(
      'Runtime already registered: fake-runtime',
    );
    expect(() => createRuntimeRegistry([{
      ...definition,
      kind: 'fake-runtime-alias',
    }])).toThrow(
      'Runtime registration mismatch: fake-runtime-alias != fake-runtime',
    );
  });
});
