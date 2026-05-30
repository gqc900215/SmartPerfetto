// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 Gracker (Chris)
// This file is part of SmartPerfetto. See LICENSE for details.

/**
 * Integration coverage for real on-disk strategy frontmatter.
 *
 * `sceneClassifier.test.ts` mocks `getRegisteredScenes()` to pin matcher
 * mechanics. This file proves newly added strategy keywords are actually
 * loaded from `backend/strategies/*.strategy.md`.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { classifyScene } from '../sceneClassifier';
import { invalidateStrategyCache } from '../strategyLoader';

describe('classifyScene with real strategy frontmatter', () => {
  beforeAll(() => {
    invalidateStrategyCache();
  });

  it('routes pure storage, SQLite, SharedPreferences, and provider queries to io', () => {
    expect(classifyScene('SQLite 查询很慢，怀疑 WAL checkpoint 阻塞')).toBe('io');
    expect(classifyScene('Room migration 导致数据库打开慢')).toBe('io');
    expect(classifyScene('SharedPreferences QueuedWork.waitToFinish 卡住')).toBe('io');
    expect(classifyScene('MediaProvider scoped storage 访问很慢')).toBe('io');
  });

  it('does not steal higher-priority startup, ANR, media, or network scenes', () => {
    expect(classifyScene('启动阶段 SQLite fsync 很慢')).toBe('startup');
    expect(classifyScene('ANR 中 SharedPreferences QueuedWork 卡住')).toBe('anr');
    expect(classifyScene('MediaCodec video decode stutter')).toBe('media');
    expect(classifyScene('network traffic is high')).toBe('network');
  });

  it('routes pure input-dispatch queue questions to interaction', () => {
    expect(classifyScene('InputDispatcher wait queue wq 没有收到 FINISHED ACK，输入延迟很高')).toBe('interaction');
  });

  it('keeps no-focused-window ANR on the ANR strategy', () => {
    expect(classifyScene('INPUT_DISPATCHING_TIMEOUT_NO_FOCUSED_WINDOW ANR')).toBe('anr');
    expect(classifyScene('no focused window ANR during launch')).toBe('anr');
  });

  it('routes pure BufferQueue, fence, and refresh-policy questions to pipeline', () => {
    expect(classifyScene('BufferQueue release fence 和 dequeueBuffer backpressure 怎么看')).toBe('pipeline');
    expect(classifyScene('SurfaceFlinger present fence latency 怎么看')).toBe('pipeline');
    expect(classifyScene('刷新率 ARR VRR 改变帧预算的 policy 怎么分析')).toBe('pipeline');
    expect(classifyScene('GraphicBuffer 和 BufferQueue 槽位是不是同一个证据')).toBe('pipeline');
  });

  it('keeps explicit frame-drop phrasing on scrolling without broad frame keyword matches', () => {
    expect(classifyScene('analyze frame drops in this trace')).toBe('scrolling');
    expect(classifyScene('frame drop in this trace')).toBe('scrolling');
  });

  it('keeps scene-specific BufferQueue and graphics-memory queries on their stronger scenes', () => {
    expect(classifyScene('滑动卡顿里 BufferQueue release fence 等待')).toBe('scrolling');
    expect(classifyScene('启动阶段 queueBuffer release fence 等待')).toBe('startup');
    expect(classifyScene('dmabuf graphics memory leak OOM')).toBe('memory');
    expect(classifyScene('game fence wait GPU frame pacing')).toBe('game');
    expect(classifyScene('点击响应慢 present latency')).toBe('interaction');
  });
});
