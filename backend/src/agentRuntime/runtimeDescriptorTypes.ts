// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 Gracker (Chris)
// This file is part of SmartPerfetto. See LICENSE for details.

import type { IOrchestrator } from '../agent/core/orchestratorTypes';
import type { TraceProcessorService } from '../services/traceProcessorService';
import type { RuntimeSelection } from './runtimeSelection';
import type { AgentRuntimeKind } from './runtimeKinds';

export interface EngineCapabilities {
  kind: string;
  displayName: string;
  production: boolean;
  publicRuntime: boolean;
}

export interface RuntimeFactoryInput {
  traceProcessorService: TraceProcessorService;
  selection: RuntimeSelection<string>;
}

export interface RuntimeEngineDefinition {
  kind: string;
  capabilities: EngineCapabilities;
  createOrchestrator(input: RuntimeFactoryInput): IOrchestrator;
}

export interface RuntimeDiagnosticsInput<K extends string = string> {
  env: Record<string, string | undefined>;
  kind: K;
  selectedProviderId?: string | null;
}

export interface RuntimeEngineDescriptor<K extends AgentRuntimeKind = AgentRuntimeKind>
  extends RuntimeEngineDefinition {
  kind: K;
  displayName: string;
  production: true;
  publicRuntime: true;
  providerTypes: readonly string[];
  capabilities: EngineCapabilities & {
    kind: K;
    production: true;
    publicRuntime: true;
  };
  getDiagnostics(input: RuntimeDiagnosticsInput<K>): unknown;
}
