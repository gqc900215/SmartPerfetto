// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 Gracker (Chris)
// This file is part of SmartPerfetto. See LICENSE for details.

import { describe, expect, it } from '@jest/globals';
import type { AnalysisResult } from '../../agent/core/orchestratorTypes';
import {
  applyFinalResultQualityGate,
  assessFinalResultQuality,
  hasDeliverableFinalReportHeading,
  looksLikePhaseSummaryFallback,
} from '../finalResultQualityGate';

function result(overrides: Partial<AnalysisResult>): AnalysisResult {
  return {
    sessionId: 'session-final-quality',
    success: true,
    findings: [],
    hypotheses: [],
    conclusion: [
      '# 启动性能分析报告',
      '',
      '## 综合结论',
      '',
      '启动类型为冷启动，TTID=1912ms，TTFD=2200ms。',
      '',
      '## 阶段耗时分解',
      '',
      '- startup_detail 显示 bindApplication self_ms=120ms。',
      '',
      '## 关键证据链',
      '',
      '- 根因编号 A5 对应 DEX/类加载开销。',
      '',
      '## 优化建议',
      '',
      '- [App层] 延后非首屏初始化。',
      '- [系统/平台层] 无需处理。',
    ].join('\n'),
    confidence: 0.8,
    rounds: 1,
    totalDurationMs: 1000,
    ...overrides,
  };
}

describe('final result quality gate', () => {
  it('recognizes deliverable report headings without Chinese word-boundary false negatives', () => {
    expect(hasDeliverableFinalReportHeading('# 启动性能分析报告\n\n## 综合结论')).toBe(true);
    expect(hasDeliverableFinalReportHeading('## 综合结论\n\n冷启动 TTID=1912ms。')).toBe(true);
    expect(hasDeliverableFinalReportHeading('### Phase 1 关键发现记录\n\nTTID=1912ms。')).toBe(false);
  });

  it('detects phase-summary fallback text as non-final output', () => {
    const fallback = [
      '## 综合结论',
      '',
      '完成综合结论输出。冷启动TTID=1912ms，主因是主线程模拟负载过重。',
      '',
      '## 分阶段证据摘要',
      '',
      '- 启动概览采集: 获取启动概览：冷启动dur=1338ms，TTID=1912ms。',
      '- 启动详情分析: 四象限：Q1=62.8%, Q4b=35.1%。',
      '- 综合结论: 完成综合结论输出。',
    ].join('\n');

    expect(looksLikePhaseSummaryFallback(fallback)).toBe(true);
    expect(assessFinalResultQuality({
      result: result({ conclusion: fallback }),
      query: '分析这个启动 trace',
    })?.code).toBe('plan_summary_fallback');

    expect(looksLikePhaseSummaryFallback([
      '## 综合结论',
      '',
      '主要瓶颈来自 ChaosTask，证据 art-30。',
      '',
      '## 分阶段证据摘要',
      '',
      '- p1: 获取启动概览，证据 art-2。',
      '- p2: 输出结论，证据 data:sql_table:current:abc。',
    ].join('\n'))).toBe(true);

    expect(looksLikePhaseSummaryFallback([
      '综合结论',
      '',
      '完成综合结论输出。',
      '',
      '分阶段证据摘要',
      '',
      '- 启动概览采集: 获取启动概览。',
      '- 综合结论: 完成综合结论输出。',
    ].join('\n'))).toBe(true);

    expect(looksLikePhaseSummaryFallback([
      '综合结论：',
      '完成综合结论输出。冷启动TTID=1912ms，主因是主线程模拟负载过重(A16)。',
      '',
      '分阶段证据摘要：',
      '启动概览采集: 获取启动概览：冷启动dur=1338ms，TTID=1912ms。',
      '启动类型验证: 确认为冷启动。',
      '启动详情分析: 四象限：Q1=62.8%,Q4b=35.1%。',
      '综合结论: 完成综合结论输出。',
    ].join('\n'))).toBe(true);

    expect(looksLikePhaseSummaryFallback([
      '## Final Conclusion',
      '',
      'Completed final conclusion output.',
      '',
      '## Evidence Summary By Phase',
      '',
      '- Overview collection: TTID=1912ms.',
    ].join('\n'))).toBe(true);

    expect(looksLikePhaseSummaryFallback([
      '## 综合结论',
      '',
      '完成综合结论输出。',
      '',
      '## 分阶段证据摘要',
      '',
      '- 启动概览采集: 获取启动概览。',
      '',
      '## 根因拆解',
      '',
      '主要来自启动阶段。',
      '',
      '## 优化建议',
      '',
      '建议优化启动任务。',
    ].join('\n'))).toBe(true);

    expect(looksLikePhaseSummaryFallback([
      '综合结论：完成综合结论输出。冷启动TTID=1912ms。',
      '分阶段证据摘要：启动概览采集: 获取启动概览：冷启动dur=1338ms。',
      '1. 启动详情分析: 四象限 Q1=62.8%。',
    ].join('\n'))).toBe(true);
  });

  it('does not flag a rich report that contains independent evidence sections', () => {
    const report = [
      '# 启动性能分析报告',
      '',
      '## 综合结论',
      '',
      '启动类型为冷启动，TTID=1912ms，TTFD=2200ms，主因是主线程模拟负载。ChaosTask self=456ms，LoadSimulator_ActivityInit self=249.8ms。',
      '',
      '## 阶段耗时分解',
      '',
      '- 启动概览采集: 获取启动概览，TTID=1912ms。',
      '- startup_detail 启动详情分析: 四象限 Q1=62.8%、Q4b=35.1%，关键 self_ms=456ms。',
      '',
      '## 关键证据链',
      '',
      '- 根因编号 A5：主线程类加载/模拟负载开销。',
      '- startup_detail 对应证据 ID art-10。',
      '- hot_slice_states 对应 data:sql_table:current:abc。',
      '',
      '## 优化建议',
      '',
      '- [App层] 降低启动期主线程模拟负载。',
      '- [系统/平台层] 当前无系统侧阻塞证据。',
    ].join('\n');

    expect(looksLikePhaseSummaryFallback(report)).toBe(false);
    expect(assessFinalResultQuality({
      result: result({ conclusion: report }),
      query: '分析这个启动 trace',
    })).toBeUndefined();

    const plainReport = [
      '综合结论：',
      '启动类型为冷启动，TTID=1912ms，TTFD=2200ms，主因是主线程模拟负载。',
      '',
      '阶段耗时分解：',
      'startup_detail 启动概览采集: 获取启动概览，TTID=1912ms，self_ms=456ms。',
      '',
      '关键证据链：',
      '根因编号 A5：主线程类加载/模拟负载开销。',
      'startup_detail 对应证据 ID art-10。',
      'hot_slice_states 对应 data:sql_table:current:abc。',
      '',
      '优化建议：',
      '[App层] 降低启动期主线程模拟负载。',
      '[系统/平台层] 当前无系统侧阻塞证据。',
    ].join('\n');

    expect(looksLikePhaseSummaryFallback(plainReport)).toBe(false);
    expect(assessFinalResultQuality({
      result: result({ conclusion: plainReport }),
      query: '分析这个启动 trace',
    })).toBeUndefined();
  });

  it('accepts startup reports that express phase timing as a root-cause tree and use spaced audience labels', () => {
    const report = [
      '## 综合结论',
      '',
      '启动类型为冷启动，dur=1338ms，TTID=1912ms，TTFD 不可用。',
      '',
      '### 根因分析树',
      '',
      '启动 1338ms (TTID=1912ms)',
      '├── [Phase 1] bindApplication = 576ms wall (self_ms=1.5ms)',
      '│   └── LoadSimulator_AppInit = 478ms wall (self_ms=207ms) ← A11',
      '├── [Phase 2] activityStart = 832ms wall (self_ms=5ms)',
      '│   └── SimulateInflation = 179ms (self_ms=175ms) ← A4',
      '└── [首帧后] MQ_Chain 阻塞器 = 573ms ← A17',
      '',
      '### 关键证据链',
      '',
      '- 根因编号 A11/A16/A4/A17 均有 data:skill:startup_detail:hot_slice_states 佐证。',
      '',
      '### 优化建议',
      '',
      '**[App 层]**',
      '',
      '- 延后 LoadSimulator 初始化。',
      '',
      '**[系统/平台层]**',
      '',
      '- 当前无系统侧阻塞证据。',
    ].join('\n');

    expect(assessFinalResultQuality({
      result: result({ conclusion: report }),
      query: '分析启动性能',
    })).toBeUndefined();
  });

  it('marks empty successful results as partial instead of normal completion', () => {
    const target = result({
      conclusion: '   ',
      confidence: 0.91,
    });

    const issue = applyFinalResultQualityGate({
      result: target,
      query: '分析这个 trace',
    });

    expect(issue?.code).toBe('empty_conclusion');
    expect(target.partial).toBe(true);
    expect(target.confidence).toBe(0.55);
    expect(target.terminationMessage).toContain('最终结果质量闸门');
  });

  it('flags process narration that leaked into the final conclusion', () => {
    const leaked = [
      '1. **冷启动**，dur=1338.65ms，原分类warm已被重分类为cold（R009）',
      '2. **TTID=1912.20ms > dur=1338.65ms**，差距573.55ms（R008触发）',
      '',
      '现在完成Phase 1，进入Phase 1.5验证启动类型，然后进入Phase 2深钻。',
      'Phase 2 已获取关键概要数据。现在进入 Phase 2.5。',
    ].join('\n');

    expect(assessFinalResultQuality({
      result: result({ conclusion: leaked }),
      query: '分析启动性能',
    })?.code).toBe('process_narration_conclusion');
  });

  it('flags structured interim markdown that has no deliverable final-report heading', () => {
    const interim = [
      '### Phase 1 关键发现记录',
      '',
      '- 冷启动 dur=1338ms，TTID=1912ms。',
      '- 主线程 Running=63%。',
      '',
      '### Phase 2 待验证项',
      '',
      '- 继续检查内存压力、Binder 和 CPU 频率。',
    ].join('\n');

    expect(assessFinalResultQuality({
      result: result({ conclusion: interim }),
      query: '分析启动性能',
    })?.code).toBe('missing_final_report_heading');
  });

  it('flags sparse unverified analysis conclusions and keeps concise factual answers alone', () => {
    expect(assessFinalResultQuality({
      result: result({
        conclusion: 'TTID=1912ms，主要是主线程模拟负载。',
        findings: [],
        conclusionContract: undefined,
      }),
      query: '分析这个启动 trace',
    })?.code).toBe('sparse_unverified_conclusion');

    expect(assessFinalResultQuality({
      result: result({
        conclusion: 'TTID=1912ms，主要是主线程模拟负载。',
        findings: [],
        claimVerificationResult: {
          schemaVersion: 'claim_verifier@1',
          status: 'failed',
          policy: 'block',
          passed: false,
          checkedClaimCount: 1,
          unsupportedClaimCount: 1,
          claimResults: [{ claimId: 'claim-ttid', status: 'unsupported' }],
          issues: [{
            claimId: 'claim-ttid',
            severity: 'error',
            code: 'unsupported_claim',
            message: 'No evidence matched this claim',
          }],
        },
      }),
      query: '分析这个启动 trace',
    })?.code).toBe('sparse_unverified_conclusion');

    expect(assessFinalResultQuality({
      result: result({
        conclusion: '应用包名是 com.example.demo。',
        findings: [],
        conclusionContract: undefined,
      }),
      query: '这个 trace 的应用包名是什么？',
    })).toBeUndefined();

    expect(assessFinalResultQuality({
      result: result({
        conclusion: '最慢函数是 ChaosTask，self_ms=456ms。',
        findings: [],
        conclusionContract: undefined,
      }),
      query: '哪个函数最慢？',
    })).toBeUndefined();

    expect(assessFinalResultQuality({
      result: result({
        conclusion: 'TTID=1912ms，主要是主线程模拟负载。',
        findings: [],
        conclusionContract: {
          schemaVersion: 'conclusion_contract_v1',
          mode: 'focused_answer',
          conclusions: [],
          clusters: [],
          evidenceChain: [{
            conclusionId: 'c1',
            text: 'startup_detail 显示 TTID=1912ms',
          }],
          claims: [{
            id: 'claim-ttid',
            text: 'TTID=1912ms',
            references: [{
              evidenceRefId: 'art-10',
              column: 'ttid_ms',
              value: 1912,
            }],
          }],
          uncertainties: [],
          nextSteps: [],
        },
      }),
      query: '分析这个启动 trace',
    })?.code).toBe('scene_contract_incomplete');

    expect(assessFinalResultQuality({
      result: result({
        conclusion: 'TTID=1912ms，主要是主线程模拟负载。',
        findings: [],
        conclusionContract: {
          schemaVersion: 'conclusion_contract_v1',
          mode: 'focused_answer',
          conclusions: [],
          clusters: [],
          evidenceChain: [],
          claims: [{
            id: 'claim-empty',
            text: 'TTID=1912ms',
            references: [],
          }],
          uncertainties: [],
          nextSteps: [],
        },
      }),
      query: '分析这个启动 trace',
    })?.code).toBe('sparse_unverified_conclusion');
  });

  it('flags jank reports that pass evidence checks but omit scene-required sections', () => {
    const shortJankReport = [
      '## 综合结论',
      '',
      'com.example.demo 滑动性能一般：347帧中7帧真实掉帧（2.02%），最长帧62.73ms。',
      '',
      '### 根因拆解',
      '',
      '**[CRITICAL] animation 回调同步执行 CustomScroll_longFrameLoad（6帧，85.7%）**',
      '- 每次57-59ms纯CPU操作，CPU效率98.4%，无IO/锁/Binder参与。',
      '',
      '### 优化建议',
      '',
      '- 将 CustomScroll_longFrameLoad 异步化或分帧执行。',
    ].join('\n');

    expect(assessFinalResultQuality({
      result: result({
        conclusion: shortJankReport,
        findings: [{
          severity: 'critical',
          title: 'animation 回调同步执行长任务',
          description: 'CustomScroll_longFrameLoad 造成掉帧',
          evidence: ['CPU效率98.4%'],
        } as any],
        claimVerificationResult: {
          schemaVersion: 'claim_verifier@1',
          status: 'passed',
          policy: 'record_only',
          passed: true,
          checkedClaimCount: 3,
          unsupportedClaimCount: 0,
          claimResults: [{ claimId: 'claim-jank', status: 'verified' }],
          issues: [],
        },
      }),
      query: '分析滑动性能',
    })?.code).toBe('scene_contract_incomplete');
  });

  it('does not apply scene final-report contracts to factual scrolling questions', () => {
    expect(assessFinalResultQuality({
      result: result({
        conclusion: '应用包名是 com.example.demo。',
        findings: [],
        conclusionContract: undefined,
      }),
      query: '这个滑动 trace 的应用包名是什么？',
      sceneType: 'scrolling',
    })).toBeUndefined();
  });

  it('does not accept empty mentions as satisfying scene-required sections', () => {
    const hollowReport = [
      '## 综合结论',
      '',
      'com.example.demo 滑动性能一般：347帧中7帧真实掉帧，最长帧62.73ms。',
      '',
      '## 根因拆解',
      '',
      '- 已知需要补充全帧根因分布和代表帧分析，但当前结论没有展开。',
      '',
      '## 关键证据链',
      '',
      '- process_slice_cpu_hotspots 显示 CPU效率98.4%。',
    ].join('\n');

    const issue = assessFinalResultQuality({
      result: result({
        conclusion: hollowReport,
        findings: [{ severity: 'critical', title: '长任务', description: 'CPU heavy', evidence: ['98.4%'] } as any],
      }),
      query: '分析滑动性能',
    });

    expect(issue?.code).toBe('scene_contract_incomplete');
    expect(issue?.message).toContain('全帧根因分布');
    expect(issue?.message).toContain('代表帧分析');
  });

  it('uses conclusion contract scene metadata when the query is generic', () => {
    const issue = assessFinalResultQuality({
      result: result({
        conclusion: [
          '## 综合结论',
          '',
          '347帧中7帧真实掉帧，最长帧62.73ms，主因是 CustomScroll_longFrameLoad。',
          '',
          '## 根因拆解',
          '',
          '- CPU效率98.4%。',
        ].join('\n'),
        findings: [{ severity: 'critical', title: '长任务', description: 'CPU heavy', evidence: ['98.4%'] } as any],
        conclusionContract: {
          schemaVersion: 'conclusion_contract_v1',
          mode: 'initial_report',
          conclusions: [],
          clusters: [],
          evidenceChain: [],
          uncertainties: [],
          nextSteps: [],
          metadata: { sceneId: 'jank' },
        },
      }),
      query: '分析这个 trace',
    });

    expect(issue?.code).toBe('scene_contract_incomplete');
  });

  it('accepts jank reports that keep root-cause distribution and representative-frame sections', () => {
    const richJankReport = [
      '## 综合结论',
      '',
      'com.example.demo 滑动性能一般：347帧中7帧真实掉帧（2.02%），最长帧62.73ms，最长连续丢帧 vsync_missed=7。',
      '',
      '## 全帧根因分布',
      '',
      '| 根因 | 帧数 | 占比 | 四象限/频率特征 |',
      '| --- | ---: | ---: | --- |',
      '| workload_heavy | 6 | 85.7% | MainThread Running，CPU效率98.4% |',
      '| freq_ramp_slow | 1 | 14.3% | 960MHz -> 2400MHz |',
      '',
      '## 代表帧分析',
      '',
      '- 代表帧 frame_id=59665234：帧耗时62.73ms，超预算7.5x，vsync_missed=7，关键slice为 CustomScroll_longFrameLoad。',
      '- 代表帧 frame_id=59665037：帧耗时18.66ms，频率爬升慢。',
      '',
      '## 关键证据链',
      '',
      '- process_slice_cpu_hotspots 显示 CustomScroll_longFrameLoad count=6，avg_cpu_ms=55.10。',
      '',
      '## 优化建议',
      '',
      '- 将主线程 animation 回调里的长任务异步化或分帧。',
    ].join('\n');

    expect(assessFinalResultQuality({
      result: result({ conclusion: richJankReport }),
      query: '分析滑动性能',
    })).toBeUndefined();
  });

  it('flags pipeline reports that omit rendering-stage and BufferQueue/Fence boundaries', () => {
    const hollowPipelineReport = [
      '# 渲染管线分析报告',
      '',
      '## 阶段边界',
      '',
      '- 需要补充每个阶段的证据。',
      '',
      '## 同步边界',
      '',
      '- 需要补充同步证据。',
    ].join('\n');

    const issue = assessFinalResultQuality({
      result: result({
        conclusion: hollowPipelineReport,
        findings: [{ severity: 'warning', title: '管线边界缺失', description: 'no details', evidence: ['BufferQueue'] } as any],
      }),
      query: '分析渲染管线 BufferQueue fence',
      sceneType: 'pipeline',
    });

    expect(issue?.code).toBe('scene_contract_incomplete');
    expect(issue?.message).toContain('渲染/显示阶段拆分');
    expect(issue?.message).toContain('BufferQueue/Fence 边界');
  });

  it('does not require BufferQueue/Fence sections for generic pipeline-identification reports', () => {
    const genericPipelineReport = [
      '# 渲染管线分析报告',
      '',
      '## 渲染/显示阶段拆分',
      '',
      '| 阶段 | 证据 | 结论 |',
      '| --- | --- | --- |',
      '| Main/UI | Choreographer#doFrame 6.1ms | 主线程阶段正常 |',
      '| RenderThread | DrawFrame 4.3ms | RT 阶段正常 |',
      '| BufferQueue | queueBuffer 1.2ms | producer 提交阶段正常 |',
      '| SurfaceFlinger/SF | commit/composite 3.2ms | SF 合成阶段正常 |',
      '| HWC/display | VSync=16.67ms | display 阶段正常 |',
      '',
      '## 管线类型结论',
      '',
      '- 当前 trace 可按 Main/UI -> RenderThread -> BufferQueue -> SurfaceFlinger -> HWC/display 拆分。',
    ].join('\n');

    expect(assessFinalResultQuality({
      result: result({ conclusion: genericPipelineReport }),
      query: '分析渲染管线类型',
      sceneType: 'pipeline',
    })).toBeUndefined();
  });

  it('routes pure graphics-memory pipeline gaps to the graphics boundary instead of BufferQueue/Fence', () => {
    const graphicsReportWithoutBoundary = [
      '# 渲染管线分析报告',
      '',
      '## 渲染/显示阶段拆分',
      '',
      '| 阶段 | 证据 | 结论 |',
      '| --- | --- | --- |',
      '| Main/UI | Choreographer#doFrame 6.1ms | 主线程阶段正常 |',
      '| RenderThread | DrawFrame 4.3ms | RT 阶段正常 |',
      '| SurfaceFlinger/SF | commit/composite 3.2ms | SF 合成阶段正常 |',
      '| HWC/display | presentDisplay 5.1ms | display 阶段正常 |',
      '',
      '## 图形资源观察',
      '',
      '- GraphicBuffer 数量偏多，需要进一步确认。',
    ].join('\n');

    const issue = assessFinalResultQuality({
      result: result({ conclusion: graphicsReportWithoutBoundary }),
      query: 'GraphicBuffer dma-buf 图形内存证据怎么分析',
      sceneType: 'pipeline',
    });

    expect(issue?.code).toBe('scene_contract_incomplete');
    expect(issue?.message).toContain('图形内存/刷新策略边界');
    expect(issue?.message).not.toContain('BufferQueue/Fence 边界');
  });

  it('flags HWC/SF overlay pipeline reports that omit the conditional boundary', () => {
    const reportWithoutPolicyBoundary = [
      '# 渲染管线分析报告',
      '',
      '## 渲染/显示阶段拆分',
      '',
      '| 阶段 | 证据 | 结论 |',
      '| --- | --- | --- |',
      '| Main/UI | Choreographer#doFrame 6.1ms | 主线程阶段正常 |',
      '| RenderThread | DrawFrame 4.3ms | RT 阶段正常 |',
      '| BufferQueue | queueBuffer 1.2ms | producer 提交阶段正常 |',
      '| SurfaceFlinger/SF | commit/composite 3.2ms | SF 合成阶段正常 |',
      '| HWC/display | HWC overlay 命中，presentDisplay 5.1ms | display 阶段正常 |',
    ].join('\n');

    const issue = assessFinalResultQuality({
      result: result({ conclusion: reportWithoutPolicyBoundary }),
      query: 'HWC overlay 怎么分析',
      sceneType: 'pipeline',
    });

    expect(issue?.code).toBe('scene_contract_incomplete');
    expect(issue?.message).toContain('图形内存/刷新策略边界');
    expect(issue?.message).not.toContain('BufferQueue/Fence 边界');
  });

  it('accepts graphics-memory pipeline reports without a BufferQueue/Fence section when no fence evidence is requested', () => {
    const graphicsOnlyReport = [
      '# 渲染管线分析报告',
      '',
      '## 渲染/显示阶段拆分',
      '',
      '| 阶段 | 证据 | 结论 |',
      '| --- | --- | --- |',
      '| Main/UI | Choreographer#doFrame 6.1ms | 主线程阶段正常 |',
      '| RenderThread | DrawFrame 4.3ms | RT 阶段正常 |',
      '| SurfaceFlinger/SF | commit/composite 3.2ms | SF 合成阶段正常 |',
      '| HWC/display | presentDisplay 5.1ms | display 阶段正常 |',
      '',
      '## 图形内存/刷新策略边界',
      '',
      '- GraphicBuffer/dma-buf 是图形物理内存证据，不能仅凭渲染 slice 判断。',
      '- SurfaceFlinger dumpsys 缺失，当前只能标注 evidence missing；confidence 为中等。',
      '- 本结论只覆盖 graphics memory 边界，不声明同步等待。',
    ].join('\n');

    expect(assessFinalResultQuality({
      result: result({ conclusion: graphicsOnlyReport }),
      query: 'GraphicBuffer dma-buf 图形内存证据怎么分析',
      sceneType: 'pipeline',
    })).toBeUndefined();
  });

  it('accepts HWC/SF policy pipeline reports that satisfy the conditional boundary', () => {
    const hwcPolicyReport = [
      '# 渲染管线分析报告',
      '',
      '## 渲染/显示阶段拆分',
      '',
      '| 阶段 | 证据 | 结论 |',
      '| --- | --- | --- |',
      '| Main/UI | Choreographer#doFrame 6.1ms | 主线程阶段正常 |',
      '| RenderThread | DrawFrame 4.3ms | RT 阶段正常 |',
      '| BufferQueue | queueBuffer 1.2ms | producer 提交阶段正常 |',
      '| SurfaceFlinger/SF | commit/composite 3.2ms | SF 合成阶段正常 |',
      '| HWC/display | HWC overlay policy 命中，presentDisplay 5.1ms | display 阶段正常 |',
      '',
      '## 图形内存/刷新策略边界',
      '',
      '- HWC overlay policy 属于 SurfaceFlinger/HWC 合成策略边界，不能等同 BufferQueue 或上屏完成。',
      '- 缺失 dumpsys SurfaceFlinger layer policy 时只能标注 evidence missing；confidence 为中等。',
    ].join('\n');

    expect(assessFinalResultQuality({
      result: result({ conclusion: hwcPolicyReport }),
      query: 'SurfaceFlinger HWC overlay policy 怎么分析',
      sceneType: 'pipeline',
    })).toBeUndefined();
  });

  it('accepts pipeline reports that split rendering stages and fence semantics', () => {
    const richPipelineReport = [
      '# 渲染管线分析报告',
      '',
      '## 渲染/显示阶段拆分',
      '',
      '| 阶段 | 证据 | 结论 |',
      '| --- | --- | --- |',
      '| Main/UI | Choreographer#doFrame 8.1ms | 主线程未超预算 |',
      '| RenderThread | DrawFrame 5.4ms | RT 正常提交 |',
      '| BufferQueue | queueBuffer 快、dequeueBuffer P95=9.2ms | producer 提交不慢，但复用 buffer 存在等待 |',
      '| SurfaceFlinger/SF | commit/composite 4.8ms，FrameTimeline present late 3帧 | SF 合成有轻微延迟 |',
      '| HWC/display | presentDisplay P95=7.1ms，VSync=8.33ms | 高刷新率预算下接近上限 |',
      '',
      '## BufferQueue/Fence 边界',
      '',
      '- queueBuffer 不等于上屏；它只证明 producer submission。',
      '- dequeueBuffer 等待更接近 release fence/backpressure。',
      '- acquire fence 影响 SF latch，present fence 影响可见上屏，release fence 影响 producer 复用。',
      '- BLAST Transaction 到达和 SurfaceFlinger latch 是独立阶段，不能混用。',
      '',
      '## 图形内存/刷新策略边界',
      '',
      '- 当前没有 GraphicBuffer/dma-buf 图形内存证据，不能把 BufferQueue 槽位等待写成 graphics memory 泄漏。',
      '- refresh-rate policy 证据来自 VSYNC-sf，ARR/VRR 和 setFrameRate 只是策略 hint；缺失 SurfaceFlinger dumpsys 时置信度为中等。',
      '',
      '## 推荐路径',
      '',
      '- 继续用 fence_wait_decomposition、present_fence_timing、vsync_config 和 surfaceflinger_analysis 复核。',
    ].join('\n');

    expect(assessFinalResultQuality({
      result: result({ conclusion: richPipelineReport }),
      query: '分析渲染管线 BufferQueue fence',
      sceneType: 'pipeline',
    })).toBeUndefined();
  });

  it('flags memory reports that omit evidence scope and memory-type boundaries', () => {
    const shortMemoryReport = [
      '# 内存分析报告',
      '',
      '## 综合结论',
      '',
      'PSS 持续上涨，可能存在泄漏，需要优化内存。',
    ].join('\n');

    const issue = assessFinalResultQuality({
      result: result({
        conclusion: shortMemoryReport,
        findings: [{
          severity: 'warning',
          title: '内存上涨',
          description: 'PSS trend increased',
          evidence: ['PSS +120MB'],
        } as any],
      }),
      query: '分析内存上涨和 GC 抖动',
      sceneType: 'memory',
    });

    expect(issue?.code).toBe('scene_contract_incomplete');
    expect(issue?.message).toContain('内存证据范围');
    expect(issue?.message).toContain('内存类型拆分');
    expect(issue?.message).toContain('置信度与缺失证据');
  });

  it('accepts memory reports that separate evidence source, memory type, and missing proof', () => {
    const richMemoryReport = [
      '# 内存分析报告',
      '',
      '## 综合结论',
      '',
      'PSS/RSS 在 60s 窗口内上涨 120MB，GC pause 频繁，但当前证据只能支持内存压力候选，不能直接判定泄漏。',
      '',
      '## 证据范围',
      '',
      '- 证据来源：PSS、RSS、Java Heap、GC、LMK 窗口统计可用；Native Heap、Graphics/dma-buf、heap graph 缺失。',
      '',
      '## 内存类型拆分',
      '',
      '- Java Heap 增长 80MB，GC churn 增加；Native Heap 和 Graphics-dma-buf 当前没有直接证据。',
      '- RSS/PSS 同步上涨，LMK/freezer/OOM 事件未在窗口内命中。',
      '',
      '## 置信度与缺失证据',
      '',
      '- 证据不足：没有 heap graph 和 dmabuf 采样，高内存不等于泄漏，LMK/freezer/OOM 需要区分。',
      '- 建议采集 heap graph、smaps/dmabuf 和更长窗口趋势后再提升置信度。',
      '',
      '## 优化建议',
      '',
      '- 先按 Java 分配热点和缓存生命周期排查，并补充 Native/Graphics 证据。',
    ].join('\n');

    expect(assessFinalResultQuality({
      result: result({ conclusion: richMemoryReport }),
      query: '分析内存上涨和 GC 抖动',
      sceneType: 'memory',
    })).toBeUndefined();
  });

  it('flags io reports that turn fsync into database root cause without boundaries', () => {
    const shortIoReport = [
      '# I/O 分析报告',
      '',
      '## 综合结论',
      '',
      '主线程 fsync 很慢，所以数据库是根因，需要优化 DB。',
    ].join('\n');

    const issue = assessFinalResultQuality({
      result: result({
        conclusion: shortIoReport,
        findings: [{
          severity: 'warning',
          title: 'fsync stall',
          description: 'main thread fsync 120ms',
          evidence: ['blocked_function=do_fsync dur=120ms'],
        } as any],
      }),
      query: '分析 SQLite fsync 为什么导致卡顿',
      sceneType: 'io',
    });

    expect(issue?.code).toBe('scene_contract_incomplete');
    expect(issue?.message).toContain('I/O 证据类型');
    expect(issue?.message).toContain('文件/数据库/Provider 边界');
    expect(issue?.message).toContain('置信度与补证');
  });

  it('accepts io reports that separate evidence class, API boundary, and missing proof', () => {
    const richIoReport = [
      '# I/O 分析报告',
      '',
      '## 综合结论',
      '',
      '主线程在窗口内出现 D-state 和 fsync 等待，但当前只能支持 I/O 等待候选，不能直接判定 SQLite 数据库是业务根因。',
      '',
      '## I/O 证据类型',
      '',
      '- 证据类型：D-state 主线程文件 I/O 命中 do_fsync 120ms；block I/O 队列等待可用，page fault 未见明显集中。',
      '',
      '## 文件/数据库/Provider 边界',
      '',
      '- File I/O 有 fsync 证据；SQLite/Room、SharedPreferences/QueuedWork、ContentProvider/CursorWindow/MediaProvider 证据缺失。',
      '- 需要区分路径栈证据和 DB slice；当前不能把 fsync 自动升级为 SQLite 根因。',
      '',
      '## 置信度与补证',
      '',
      '- 置信度中等：D-state/fsync 与卡顿窗口重叠，但业务根因需要 SQLite/数据库 stack 或 provider-side trace 补证。',
      '- 下一步建议采集 Java/native stack、SQLite/Room trace、block I/O 和路径信息。',
    ].join('\n');

    expect(assessFinalResultQuality({
      result: result({ conclusion: richIoReport }),
      query: '分析 SQLite fsync 为什么导致卡顿',
      sceneType: 'io',
    })).toBeUndefined();
  });

  it('flags interaction reports that omit ACK, focus/window, and display boundaries', () => {
    const shortInteractionReport = [
      '# 点击响应分析报告',
      '',
      '## 综合结论',
      '',
      '点击响应慢，主要是输入延迟 180ms，需要优化主线程。',
    ].join('\n');

    const issue = assessFinalResultQuality({
      result: result({
        conclusion: shortInteractionReport,
        findings: [{
          severity: 'warning',
          title: 'input latency',
          description: 'total_latency_dur=180ms',
          evidence: ['android.input total_latency_dur=180ms'],
        } as any],
      }),
      query: '分析点击响应慢',
      sceneType: 'interaction',
    });

    expect(issue?.code).toBe('scene_contract_incomplete');
    expect(issue?.message).toContain('输入阶段拆分');
    expect(issue?.message).toContain('ACK/焦点/窗口边界');
    expect(issue?.message).toContain('置信度与缺失证据');
  });

  it('accepts interaction reports that separate input stages, queues, and present evidence', () => {
    const richInteractionReport = [
      '# 点击响应分析报告',
      '',
      '## 综合结论',
      '',
      '已完成 ACK 的点击事件平均 dispatch-to-ACK 为 180ms，当前不能直接写成上屏延迟。',
      '',
      '## 输入阶段拆分',
      '',
      '- dispatch=42ms，handling=96ms，ACK/FINISHED=42ms；FrameTimeline present 缺失，因此 display/上屏不适用。',
      '',
      '## ACK/焦点/窗口边界',
      '',
      '- 区分 iq/oq/wq、FINISHED ACK、stale、InputChannel、focused window 和 target window；当前 wait queue/wq 与 stale 日志缺失，不能把它们写成 App 业务根因。',
      '',
      '## 置信度与缺失证据',
      '',
      '- android.input completed-event 可用；dumpsys/logcat、WindowManager/InputDispatcher focus 和 FrameTimeline present 缺失。需要补证后才能提升置信度。',
    ].join('\n');

    expect(assessFinalResultQuality({
      result: result({ conclusion: richInteractionReport }),
      query: '分析点击响应慢',
      sceneType: 'interaction',
    })).toBeUndefined();
  });

  it('uses click_response conclusion metadata as the interaction final-report contract', () => {
    const issue = assessFinalResultQuality({
      result: result({
        conclusion: [
          '# 点击响应分析报告',
          '',
          '## 综合结论',
          '',
          '点击响应慢，total_latency_dur=180ms。',
        ].join('\n'),
        findings: [{ severity: 'warning', title: 'input latency', description: '180ms' } as any],
        conclusionContract: {
          schemaVersion: 'conclusion_contract_v1',
          mode: 'initial_report',
          conclusions: [],
          clusters: [],
          evidenceChain: [],
          uncertainties: [],
          nextSteps: [],
          metadata: { sceneId: 'click_response' },
        },
      }),
      query: '分析这个 trace',
    });

    expect(issue?.code).toBe('scene_contract_incomplete');
    expect(issue?.message).toContain('interaction 场景 Final Report Contract');
  });

  it('flags scroll response reports that omit latency scope and frame-linkage confidence', () => {
    const shortScrollResponseReport = [
      '# 滑动响应分析报告',
      '',
      '## 综合结论',
      '',
      '滑动从 ACTION_MOVE 到首帧 120ms，端到端上屏慢，需要优化。',
    ].join('\n');

    const issue = assessFinalResultQuality({
      result: result({
        conclusion: shortScrollResponseReport,
        findings: [{
          severity: 'warning',
          title: 'scroll response latency',
          description: 'response_latency_ms=120',
          evidence: ['scroll_response_latency response_latency_ms=120'],
        } as any],
      }),
      query: '分析滑动响应慢',
      sceneType: 'scroll_response',
    });

    expect(issue?.code).toBe('scene_contract_incomplete');
    expect(issue?.message).toContain('响应延迟口径');
    expect(issue?.message).toContain('输入目标与队列边界');
    expect(issue?.message).toContain('FrameTimeline/上屏置信度');
  });

  it('accepts scroll response reports that state scope, queue boundaries, and frame confidence', () => {
    const richScrollResponseReport = [
      '# 滑动响应分析报告',
      '',
      '## 综合结论',
      '',
      '本次只证明 ACTION_MOVE-to-first-frame 候选响应为 120ms，不能直接写成 panel present。',
      '',
      '## 响应延迟口径',
      '',
      '- 已区分 dispatch-to-ACK、ACTION_MOVE 到 first frame/首帧候选、input-to-present；present 缺失，不能把候选首帧当真实上屏。',
      '',
      '## 输入目标与队列边界',
      '',
      '- target window/focused window、InputChannel、FINISHED ACK、iq/oq/wq 和 stale 均需要额外证据；当前缺失 dumpsys/logcat，因此不能定因窗口队列。',
      '',
      '## FrameTimeline/上屏置信度',
      '',
      '- FrameTimeline frame_id 关联缺失，RenderThread/SF present 链接缺失；当前只可作为 first-frame 候选，置信度中等。',
    ].join('\n');

    expect(assessFinalResultQuality({
      result: result({ conclusion: richScrollResponseReport }),
      query: '分析滑动响应慢',
      sceneType: 'scroll_response',
    })).toBeUndefined();
  });

  it('does not override runtime results that are already marked partial', () => {
    expect(assessFinalResultQuality({
      result: result({
        conclusion: '   ',
        partial: true,
        terminationMessage: 'runtime already degraded this result',
      }),
      query: '分析这个 trace',
    })).toBeUndefined();
  });
});
