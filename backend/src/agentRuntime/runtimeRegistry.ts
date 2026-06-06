// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 Gracker (Chris)
// This file is part of SmartPerfetto. See LICENSE for details.

import type { IOrchestrator } from '../agent/core/orchestratorTypes';
import {
  PRODUCTION_RUNTIME_DESCRIPTORS,
} from './runtimeDescriptors';
import type {
  EngineCapabilities,
  RuntimeEngineDefinition,
  RuntimeFactoryInput,
} from './runtimeDescriptorTypes';
import {
  createPiAgentCoreRuntimeDefinition,
  EXPERIMENTAL_PI_AGENT_CORE_RUNTIME_KIND,
} from './piAgentCoreRuntime';
import {
  createOpenCodeRuntimeDefinition,
  EXPERIMENTAL_OPENCODE_RUNTIME_KIND,
} from './openCodeRuntime';
export type { RuntimeEngineDefinition, RuntimeFactoryInput } from './runtimeDescriptorTypes';

export class RuntimeRegistry {
  private readonly definitions = new Map<string, RuntimeEngineDefinition>();

  constructor(definitions: readonly RuntimeEngineDefinition[] = []) {
    for (const definition of definitions) {
      this.register(definition);
    }
  }

  register(definition: RuntimeEngineDefinition): void {
    if (definition.kind !== definition.capabilities.kind) {
      throw new Error(
        `Runtime registration mismatch: ${definition.kind} != ${definition.capabilities.kind}`,
      );
    }
    if (this.definitions.has(definition.kind)) {
      throw new Error(`Runtime already registered: ${definition.kind}`);
    }
    this.definitions.set(definition.kind, definition);
  }

  has(kind: string): boolean {
    return this.definitions.has(kind);
  }

  get(kind: string): RuntimeEngineDefinition | undefined {
    return this.definitions.get(kind);
  }

  require(kind: string): RuntimeEngineDefinition {
    const definition = this.get(kind);
    if (!definition) {
      throw new Error(`Unsupported agent runtime: ${kind}`);
    }
    return definition;
  }

  getCapabilities(kind: string): EngineCapabilities {
    return this.require(kind).capabilities;
  }

  createOrchestrator(kind: string, input: RuntimeFactoryInput): IOrchestrator {
    return this.require(kind).createOrchestrator(input);
  }

  listRuntimeKinds(): string[] {
    return Array.from(this.definitions.keys());
  }
}

const productionRuntimeDefinitions: readonly RuntimeEngineDefinition[] = PRODUCTION_RUNTIME_DESCRIPTORS;

export function createRuntimeRegistry(
  definitions: readonly RuntimeEngineDefinition[] = [],
): RuntimeRegistry {
  return new RuntimeRegistry(definitions);
}

export function createProductionRuntimeRegistry(): RuntimeRegistry {
  return createRuntimeRegistry(productionRuntimeDefinitions);
}

export const productionRuntimeRegistry = createProductionRuntimeRegistry();

export function createRuntimeRegistryForSelection(kind: string): RuntimeRegistry {
  if (kind === EXPERIMENTAL_PI_AGENT_CORE_RUNTIME_KIND) {
    return createRuntimeRegistry([
      ...productionRuntimeDefinitions,
      createPiAgentCoreRuntimeDefinition(EXPERIMENTAL_PI_AGENT_CORE_RUNTIME_KIND),
    ]);
  }
  if (kind === EXPERIMENTAL_OPENCODE_RUNTIME_KIND) {
    return createRuntimeRegistry([
      ...productionRuntimeDefinitions,
      createOpenCodeRuntimeDefinition(EXPERIMENTAL_OPENCODE_RUNTIME_KIND),
    ]);
  }
  return productionRuntimeRegistry;
}
