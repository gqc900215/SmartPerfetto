// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 Gracker (Chris)
// This file is part of SmartPerfetto. See LICENSE for details.

import { describe, expect, it, jest } from '@jest/globals';
import type { ArchitectureInfo } from '../../agent/detectors/types';
import type {
  AnalysisPlanV3,
  ClaudeAnalysisContext,
  TraceCompleteness,
} from '../types';
import { buildSystemPromptParts, estimatePromptTokens, type PromptSegment } from '../claudeSystemPrompt';

const RAW_BASELINE_BUDGET_TOKENS = 1_000_000;

const FUTURE_TOKEN_TARGETS = {
  fullPromptTokens: 12_000,
  sceneCoreTokens: 4_000,
};

const EXPECTED_SEGMENT_LABELS = [
  'role',
  'output_language',
  'output_format',
  'architecture',
  'focus_apps',
  'trace_completeness',
  'knowledge_base',
  'base_methodology',
  'scene_strategy_core',
  'report_contract',
  'base_methodology_reference',
  'code_aware',
  'sub_agents',
  'selection_context',
  'comparison_context',
  'comparison_methodology',
  'pattern_context',
  'negative_pattern_context',
  'plan_history',
];

const M1_BASELINE_RANGES = {
  startup: {
    fullPromptTokens: [39_000, 41_000],
    stablePrefixTokens: [35_500, 37_500],
    volatileSuffixTokens: [3_300, 3_700],
    baseMethodologyTokens: [8_100, 8_700],
    sceneCoreTokens: [20_000, 21_500],
    reportContractTokens: [300, 500],
  },
  scrolling: {
    fullPromptTokens: [33_000, 35_000],
    stablePrefixTokens: [29_500, 31_500],
    volatileSuffixTokens: [3_300, 3_700],
    baseMethodologyTokens: [8_100, 8_700],
    sceneCoreTokens: [14_000, 15_500],
    reportContractTokens: [200, 400],
  },
} satisfies Record<'startup' | 'scrolling', Record<string, [number, number]>>;

function makeArchitecture(): ArchitectureInfo {
  return {
    type: 'FLUTTER',
    confidence: 0.94,
    evidence: [{ type: 'thread', value: '1.ui / 1.raster', weight: 0.9 }],
    flutter: {
      engine: 'IMPELLER',
      surfaceType: 'TEXTUREVIEW',
      versionHint: '3.29+',
      newThreadModel: true,
    },
    compose: {
      hasRecomposition: true,
      hasLazyLists: true,
      isHybridView: true,
      features: ['LazyColumn', 'AndroidView bridge'],
    },
    webview: {
      engine: 'CHROMIUM',
      surfaceType: 'TEXTUREVIEW',
      multiProcess: true,
    },
  };
}

function makeTraceCompleteness(): TraceCompleteness {
  return {
    available: [
      {
        id: 'frame_timeline',
        displayName: 'FrameTimeline',
        status: 'available',
        primaryTable: 'actual_frame_timeline_slice',
        rowEstimate: 240,
      },
      {
        id: 'startup',
        displayName: 'Android startup stdlib',
        status: 'available',
        primaryTable: 'android_startups',
        rowEstimate: 3,
      },
    ],
    missingConfig: [
      {
        id: 'gpu_work_period',
        displayName: 'GPU work period',
        status: 'missing_config_suspected',
        primaryTable: 'gpu_work_period',
        reason: 'GPU work period table is absent in this trace.',
      },
    ],
    notApplicable: [
      {
        id: 'power_rails',
        displayName: 'Power rails',
        status: 'not_applicable',
        primaryTable: 'counter',
        reason: 'Device did not expose rail counters.',
      },
    ],
    insufficient: [
      {
        id: 'thermal_throttling',
        displayName: 'Thermal throttling',
        status: 'insufficient_or_scene_absent',
        primaryTable: 'thermal_throttling',
        rowEstimate: 0,
        reason: 'Trace window is too short to establish thermal state.',
      },
    ],
    diagnosedAt: 1,
  };
}

function makePlan(index: number): AnalysisPlanV3 {
  return {
    phases: [
      {
        id: `p${index}-1`,
        name: '数据收集',
        goal: '获取场景概览、身份和关键指标',
        expectedTools: ['detect_architecture', 'invoke_skill', 'execute_sql', 'fetch_artifact'],
        expectedCalls: [{ tool: 'invoke_skill', skillId: index % 2 === 0 ? 'startup_analysis' : 'scrolling_analysis' }],
        status: 'completed',
        summary: '已获取概览指标与 artifact 摘要。',
      },
      {
        id: `p${index}-2`,
        name: '根因深钻',
        goal: '对 CRITICAL/HIGH 证据执行代表样本深钻',
        expectedTools: ['lookup_sql_schema', 'invoke_skill', 'execute_sql', 'fetch_artifact'],
        expectedCalls: [
          { tool: 'invoke_skill', skillId: 'jank_frame_detail' },
          { tool: 'invoke_skill', skillId: 'blocking_chain_analysis' },
        ],
        status: index === 1 ? 'in_progress' : 'completed',
        summary: index === 1 ? undefined : '已完成阻塞链和代表帧深钻。',
      },
      {
        id: `p${index}-3`,
        name: '综合结论',
        goal: '汇总证据、边界和建议',
        expectedTools: [],
        status: 'pending',
      },
    ],
    successCriteria: '最终报告必须给出直接证据、根因归属、缺失证据边界和可执行建议。',
    submittedAt: index,
    toolCallLog: [],
  };
}

function makeWorstCaseContext(sceneType: 'startup' | 'scrolling'): ClaudeAnalysisContext {
  return {
    query: sceneType === 'startup'
      ? '分析这个应用启动慢的根因，并对比参考 trace，结合源码线索给出建议'
      : '分析这个 Flutter 滑动卡顿的根因，并对比参考 trace，结合源码线索给出建议',
    sceneType,
    architecture: makeArchitecture(),
    packageName: 'com.example.smartperfetto.demo',
    focusApps: [
      { packageName: 'com.example.smartperfetto.demo', totalDurationNs: 8_500_000_000, switchCount: 180 },
      { packageName: 'com.android.systemui', totalDurationNs: 1_100_000_000, switchCount: 12 },
    ],
    focusMethod: 'frame_timeline',
    traceCompleteness: makeTraceCompleteness(),
    selectionContext: {
      kind: 'area',
      source: 'visible_window',
      startNs: 1_000_000_000,
      endNs: 4_500_000_000,
      durationNs: 3_500_000_000,
      trackCount: 4,
      tracks: [
        { uri: 'track://main', processName: 'com.example.smartperfetto.demo', threadName: 'main', pid: 100, tid: 101 },
        { uri: 'track://rt', processName: 'com.example.smartperfetto.demo', threadName: 'RenderThread', pid: 100, tid: 102 },
        { uri: 'track://raster', processName: 'com.example.smartperfetto.demo', threadName: '1.raster', pid: 100, tid: 103 },
        { uri: 'track://cpu0', cpu: 0 },
      ],
    },
    comparison: {
      referenceTraceId: 'trace-reference-token-baseline',
      referencePackageName: 'com.example.smartperfetto.demo',
      referenceArchitecture: { type: 'STANDARD', confidence: 0.82, evidence: [] },
      commonCapabilities: ['frame_timeline', 'startup', 'cpu_scheduling', 'binder_ipc'],
      capabilityDiff: {
        currentOnly: ['flutter_frame_timeline', 'gpu_work_period'],
        referenceOnly: ['android_frame_stats'],
      },
      compareAnchor: {
        type: 'interaction_window',
        currentRange: { startNs: 1_000_000_000, endNs: 4_500_000_000 },
        referenceRange: { startNs: 900_000_000, endNs: 4_400_000_000 },
      },
    },
    codeAwareMode: 'metadata_only',
    codebaseIds: ['demo-app', 'android-framework'],
    planHistory: [makePlan(1), makePlan(2), makePlan(3)],
    previousPlan: makePlan(4),
    knowledgeBaseContext: [
      '- android_frames: frame timeline view for jank attribution',
      '- android_startups: startup event overview',
      '- thread_slice: joined slice/thread/process view',
      '- android_binder_txns: binder client/server breakdown',
    ].join('\n'),
    patternContext: '## 历史分析经验\n\n类似 trace 中 RenderThread 与 GPU completion 的重叠常解释 TextureView 卡顿。',
    negativePatternContext: '## 历史踩坑记录\n\n不要把 fetch_artifact 摘要当作完整逐行证据。',
    availableAgents: ['system-expert', 'frame-expert'],
  };
}

function segmentTokens(segments: PromptSegment[], label: string): number {
  return segments
    .filter(segment => segment.label === label)
    .reduce((sum, segment) => sum + segment.estimatedTokens, 0);
}

function buildTokenReport(sceneType: 'startup' | 'scrolling') {
  const parts = buildSystemPromptParts(
    makeWorstCaseContext(sceneType),
    RAW_BASELINE_BUDGET_TOKENS,
  );
  const baseMethodologyTokens =
    segmentTokens(parts.segments, 'base_methodology')
    + segmentTokens(parts.segments, 'base_methodology_reference');

  return {
    sceneType,
    mode: 'M1_BASELINE_NO_HARD_GATE',
    targets: FUTURE_TOKEN_TARGETS,
    fullPromptTokens: estimatePromptTokens(parts.fullPrompt),
    stablePrefixTokens: estimatePromptTokens(parts.stablePrefix),
    volatileSuffixTokens: estimatePromptTokens(parts.volatileSuffix),
    methodology: {
      baseMethodologyTokens,
      sceneCoreTokens: segmentTokens(parts.segments, 'scene_strategy_core'),
      reportContractTokens: segmentTokens(parts.segments, 'report_contract'),
    },
    droppedLabels: parts.droppedLabels,
    truncatedLabels: parts.truncatedLabels,
    segments: parts.segments.map(segment => ({
      label: segment.label,
      tier: segment.tier,
      tokens: segment.estimatedTokens,
      chars: segment.charCount,
      droppable: segment.droppable,
      truncatable: segment.truncatable === true,
    })),
  };
}

function expectInRange(value: number, [min, max]: [number, number]): void {
  expect(value).toBeGreaterThanOrEqual(min);
  expect(value).toBeLessThanOrEqual(max);
}

describe('system prompt token regression with real strategy files', () => {
  it.each(['startup', 'scrolling'] as const)(
    'records M1 raw full-mode baseline for %s without mocking strategyLoader',
    sceneType => {
      const report = buildTokenReport(sceneType);
      const labels = report.segments.map(segment => segment.label);
      const ranges = M1_BASELINE_RANGES[sceneType];

      expect(labels).toEqual(EXPECTED_SEGMENT_LABELS);
      expect(report.droppedLabels).toEqual([]);
      expect(report.truncatedLabels).toEqual([]);
      expect(report.targets.fullPromptTokens).toBe(FUTURE_TOKEN_TARGETS.fullPromptTokens);
      expect(report.targets.sceneCoreTokens).toBe(FUTURE_TOKEN_TARGETS.sceneCoreTokens);
      expect(report.fullPromptTokens).toBeGreaterThan(FUTURE_TOKEN_TARGETS.fullPromptTokens);
      expect(report.methodology.sceneCoreTokens).toBeGreaterThan(FUTURE_TOKEN_TARGETS.sceneCoreTokens);
      expectInRange(report.fullPromptTokens, ranges.fullPromptTokens);
      expectInRange(report.stablePrefixTokens, ranges.stablePrefixTokens);
      expectInRange(report.volatileSuffixTokens, ranges.volatileSuffixTokens);
      expectInRange(report.methodology.baseMethodologyTokens, ranges.baseMethodologyTokens);
      expectInRange(report.methodology.sceneCoreTokens, ranges.sceneCoreTokens);
      expectInRange(report.methodology.reportContractTokens, ranges.reportContractTokens);

      console.info(`[SystemPromptTokenBaseline] ${JSON.stringify(report)}`);
    },
  );

  it('keeps scene core intact in M1 baseline mode while isolating the report contract', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const parts = (() => {
      try {
        return buildSystemPromptParts(makeWorstCaseContext('startup'));
      } finally {
        warnSpy.mockRestore();
      }
    })();
    const sceneCore = parts.segments.find(segment => segment.label === 'scene_strategy_core');
    const reportContract = parts.segments.find(segment => segment.label === 'report_contract');

    expect(parts.truncatedLabels).toEqual([]);
    expect(sceneCore?.truncatable).toBe(true);
    expect(sceneCore?.estimatedTokens).toBeGreaterThan(FUTURE_TOKEN_TARGETS.sceneCoreTokens);
    expect(reportContract?.droppable).toBe(false);
    expect(reportContract?.truncatable).toBeFalsy();
    expect(parts.fullPrompt).toContain('启动场景关键 Stdlib 表');
    expect(parts.fullPrompt).toContain('Final Report Contract');
    expect(parts.fullPrompt).toContain('启动类型与 TTID/TTFD');
  });

  it('can truncate scene core in opt-in budget mode without dropping the report contract', () => {
    const parts = buildSystemPromptParts(
      makeWorstCaseContext('startup'),
      25_000,
      { truncateSceneCore: true },
    );
    const sceneCore = parts.segments.find(segment => segment.label === 'scene_strategy_core');
    const reportContract = parts.segments.find(segment => segment.label === 'report_contract');

    expect(parts.truncatedLabels).toEqual(['scene_strategy_core']);
    expect(estimatePromptTokens(parts.fullPrompt)).toBeLessThanOrEqual(25_000);
    expect(sceneCore?.truncated).toBe(true);
    expect(sceneCore?.originalEstimatedTokens).toBeGreaterThan(sceneCore?.estimatedTokens ?? 0);
    expect(reportContract?.droppable).toBe(false);
    expect(reportContract?.truncatable).toBeFalsy();
    expect(parts.fullPrompt).toContain('Final Report Contract');
    expect(parts.fullPrompt).toContain('启动类型与 TTID/TTFD');
  });
});
