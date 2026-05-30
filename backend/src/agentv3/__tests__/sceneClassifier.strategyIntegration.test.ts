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
});
