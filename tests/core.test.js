const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../core.js');

test('Genshin state merge upgrades resin caps and validates numbers', () => {
  const defaults = () => ({
    stateVersion: 3,
    resin: { current: 0, max: 200, lastSetAt: 'now' },
    pityState: {
      '301': { current5: 0, current4: 0, guaranteed: false }
    },
    dailyTasks: [],
    weeklyTasks: [],
    primogemCount: 0,
    primogemGoal: 16000,
    dailyStreak: 0,
    calendarDisplayYear: 2026,
    userItemOverrides: {}
  });

  const merged = core.mergeGenshinState({
    resin: { current: 12, max: 160, lastSetAt: 'later' },
    pityState: { '301': { current5: 7 } },
    primogemCount: -20
  }, defaults);

  assert.equal(merged.resin.max, 200);
  assert.equal(merged.resin.current, 12);
  assert.equal(merged.pityState['301'].current5, 7);
  assert.equal(merged.pityState['301'].guaranteed, false);
  assert.equal(merged.primogemCount, 0);
});

test('NTE state merge restores missing nested state', () => {
  const defaults = () => ({
    stateVersion: 1,
    resin: { current: 0, max: 240, lastSetAt: 'now' },
    cityStamina: { current: 0, max: 700, lastSetAt: 'now' },
    pityState: {},
    dailyTasks: [],
    weeklyTasks: [],
    pixelCount: 0,
    pixelGoal: 12800,
    dailyStreak: 0,
    calendarDisplayYear: 2026,
    userItemOverrides: {}
  });

  const merged = core.mergeNteState({
    pixelCount: 800,
    resin: { current: 20, max: 999 },
    cityStamina: { current: 50, max: 1 }
  }, defaults);

  assert.equal(merged.pixelCount, 800);
  assert.equal(merged.resin.max, 240);
  assert.equal(merged.resin.current, 20);
  assert.equal(merged.cityStamina.max, 700);
  assert.equal(merged.cityStamina.current, 50);
});

test('normalized wishes remove duplicate IDs and malformed records', () => {
  const normalized = core.normalizeWishes([
    { id: '1', name: 'A', gacha_type: '301', time: '2026-01-01' },
    { id: '1', name: 'A duplicate', gacha_type: '301', time: '2026-01-02' },
    null,
    { name: 'A', gacha_type: '301', time: '2026-01-01' }
  ]);

  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].id, '1');
});

test('createStorage reports quota errors instead of silently failing', () => {
  const error = new Error('storage full');
  error.name = 'QuotaExceededError';
  const storage = {
    setItem() { throw error; },
    getItem() { return null; },
    removeItem() {}
  };
  const repo = core.createStorage(storage);
  const result = repo.set('key', { value: 1 });

  assert.equal(result.ok, false);
  assert.match(core.storageErrorMessage(result.error), /storage is full/i);
});
