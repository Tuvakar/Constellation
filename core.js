(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.ConstellationCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function isPlainObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function finiteNumber(value, fallback) {
        return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    }

    function mergeGenshinState(parsed, getDefaultState) {
        if (!isPlainObject(parsed)) return getDefaultState();
        const defaults = getDefaultState();
        const merged = Object.assign({}, defaults, parsed);
        merged.resin = Object.assign({}, defaults.resin, isPlainObject(parsed.resin) ? parsed.resin : {});
        merged.resin.current = Math.max(0, finiteNumber(merged.resin.current, defaults.resin.current));
        merged.resin.max = (!merged.resin.max || merged.resin.max === 160) ? 200 : finiteNumber(merged.resin.max, 200);
        merged.resin.lastSetAt = typeof merged.resin.lastSetAt === 'string' ? merged.resin.lastSetAt : defaults.resin.lastSetAt;
        merged.pityState = isPlainObject(parsed.pityState) ? parsed.pityState : {};
        Object.keys(defaults.pityState).forEach(function (key) {
            merged.pityState[key] = Object.assign({}, defaults.pityState[key], isPlainObject(merged.pityState[key]) ? merged.pityState[key] : {});
        });
        merged.dailyTasks = Array.isArray(parsed.dailyTasks) ? parsed.dailyTasks : defaults.dailyTasks;
        merged.weeklyTasks = Array.isArray(parsed.weeklyTasks) ? parsed.weeklyTasks : defaults.weeklyTasks;
        merged.primogemCount = Math.max(0, finiteNumber(parsed.primogemCount, defaults.primogemCount));
        merged.primogemGoal = Math.max(0, finiteNumber(parsed.primogemGoal, defaults.primogemGoal));
        merged.dailyStreak = Math.max(0, finiteNumber(parsed.dailyStreak, defaults.dailyStreak));
        merged.calendarDisplayYear = finiteNumber(parsed.calendarDisplayYear, defaults.calendarDisplayYear);
        merged.userItemOverrides = isPlainObject(parsed.userItemOverrides) ? parsed.userItemOverrides : {};
        merged.stateVersion = defaults.stateVersion;
        return merged;
    }

    function mergeNteState(parsed, getDefaultState) {
        if (!isPlainObject(parsed)) return getDefaultState();
        const defaults = getDefaultState();
        const merged = Object.assign({}, defaults, parsed);
        merged.resin = Object.assign({}, defaults.resin, isPlainObject(parsed.resin) ? parsed.resin : {});
        merged.resin.current = Math.max(0, finiteNumber(merged.resin.current, defaults.resin.current));
        merged.resin.max = 240;
        merged.resin.lastSetAt = typeof merged.resin.lastSetAt === 'string' ? merged.resin.lastSetAt : defaults.resin.lastSetAt;
        merged.cityStamina = Object.assign({}, defaults.cityStamina, isPlainObject(parsed.cityStamina) ? parsed.cityStamina : {});
        merged.cityStamina.current = Math.max(0, finiteNumber(merged.cityStamina.current, defaults.cityStamina.current));
        merged.cityStamina.max = 700;
        merged.cityStamina.lastSetAt = typeof merged.cityStamina.lastSetAt === 'string' ? merged.cityStamina.lastSetAt : defaults.cityStamina.lastSetAt;
        merged.pityState = isPlainObject(parsed.pityState) ? parsed.pityState : {};
        merged.dailyTasks = Array.isArray(parsed.dailyTasks) ? parsed.dailyTasks : defaults.dailyTasks;
        merged.weeklyTasks = Array.isArray(parsed.weeklyTasks) ? parsed.weeklyTasks : defaults.weeklyTasks;
        merged.pixelCount = Math.max(0, finiteNumber(parsed.pixelCount, defaults.pixelCount));
        merged.pixelGoal = Math.max(0, finiteNumber(parsed.pixelGoal, defaults.pixelGoal));
        merged.dailyStreak = Math.max(0, finiteNumber(parsed.dailyStreak, defaults.dailyStreak));
        merged.calendarDisplayYear = finiteNumber(parsed.calendarDisplayYear, defaults.calendarDisplayYear);
        merged.userItemOverrides = isPlainObject(parsed.userItemOverrides) ? parsed.userItemOverrides : {};
        merged.stateVersion = defaults.stateVersion;
        return merged;
    }

    function createStorage(storage) {
        return {
            get: function (key, fallback) {
                try {
                    const value = storage.getItem(key);
                    if (value === null) return fallback;
                    return JSON.parse(value);
                } catch (error) {
                    return { __storageError: error, __fallback: fallback };
                }
            },
            getRaw: function (key) {
                try { return storage.getItem(key); }
                catch (error) { return { __storageError: error }; }
            },
            set: function (key, value) {
                try {
                    storage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
                    return { ok: true };
                } catch (error) {
                    return { ok: false, error: error };
                }
            },
            remove: function (key) {
                try { storage.removeItem(key); return { ok: true }; }
                catch (error) { return { ok: false, error: error }; }
            }
        };
    }

    function normalizeWishes(wishes) {
        if (!Array.isArray(wishes)) return [];
        const seen = new Set();
        return wishes.filter(function (wish) {
            if (!isPlainObject(wish)) return false;
            const id = typeof wish.id === 'string' || typeof wish.id === 'number' ? String(wish.id) : '';
            const name = typeof wish.name === 'string' ? wish.name.trim().toLowerCase() : '';
            const time = typeof wish.time === 'string' ? wish.time : '';
            const type = typeof wish.gacha_type !== 'undefined' ? String(wish.gacha_type) : '';
            const key = id ? 'id:' + id : 'data:' + [type, name, time].join('|');
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function storageErrorMessage(error) {
        if (!error) return 'Browser storage is unavailable.';
        if (error.name === 'QuotaExceededError') return 'Browser storage is full. Export a backup or remove old data.';
        return 'Could not access browser storage. Your latest changes may not be saved.';
    }

    return {
        isPlainObject: isPlainObject,
        finiteNumber: finiteNumber,
        mergeGenshinState: mergeGenshinState,
        mergeNteState: mergeNteState,
        createStorage: createStorage,
        normalizeWishes: normalizeWishes,
        storageErrorMessage: storageErrorMessage
    };
});
