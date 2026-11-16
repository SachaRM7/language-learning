// js/db.js — Couche IndexedDB

class Database {
  constructor() {
    this._db = null;
    this._listeners = [];
  }

  init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('helloarabic', 2);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains('preferences')) {
          db.createObjectStore('preferences', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('srs')) {
          const srsStore = db.createObjectStore('srs', { keyPath: 'key' });
          srsStore.createIndex('courseId', 'courseId', { unique: false });
          srsStore.createIndex('nextReview', 'nextReview', { unique: false });
        }
        if (!db.objectStoreNames.contains('favorites')) {
          db.createObjectStore('favorites', { keyPath: 'courseId' });
        }
        if (!db.objectStoreNames.contains('lessonProgress')) {
          const lpStore = db.createObjectStore('lessonProgress', { keyPath: 'key' });
          lpStore.createIndex('courseId', 'courseId', { unique: false });
        }
        if (!db.objectStoreNames.contains('stats')) {
          db.createObjectStore('stats', { keyPath: 'courseId' });
        }
        if (!db.objectStoreNames.contains('lessonDecks')) {
          db.createObjectStore('lessonDecks', { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => {
        this._db = event.target.result;
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }

  _store(name, mode = 'readonly') {
    return this._db.transaction(name, mode).objectStore(name);
  }

  _get(storeName, key) {
    return new Promise((resolve, reject) => {
      const req = this._store(storeName).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /** Écriture locale : horodate l'enregistrement et le signale à la synchro. */
  async _put(storeName, value) {
    const stamped = { ...value, _updatedAt: Date.now() };
    await this._putRaw(storeName, stamped);
    this._notify(storeName, stamped[KEY_PATHS[storeName]]);
  }

  /** Écriture sans signalement (utilisée pour appliquer les changements distants). */
  _putRaw(storeName, value) {
    return new Promise((resolve, reject) => {
      const req = this._store(storeName, 'readwrite').put(value);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  _deleteRaw(storeName, key) {
    return new Promise((resolve, reject) => {
      const req = this._store(storeName, 'readwrite').delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  _getAllKeys(storeName) {
    return new Promise((resolve, reject) => {
      const req = this._store(storeName).getAllKeys();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /** Abonnement aux écritures locales : cb(store, key, deleted) */
  onChange(cb) { this._listeners.push(cb); }

  _notify(storeName, key, deleted = false) {
    this._listeners.forEach(cb => { try { cb(storeName, key, deleted); } catch { /* ignore */ } });
  }

  _getAll(storeName) {
    return new Promise((resolve, reject) => {
      const req = this._store(storeName).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async getPreferences() {
    const prefs = await this._get('preferences', 'global');
    return prefs || {
      id: 'global',
      theme: 'system',
      lastCourse: null,
      showTranslit: true,
      showHarakats: true,
      defaultFrontSide: 'front',
      correctionLevel: 'flexible',
      autoPlay: false,
      audioSpeed: 1.0,
    };
  }

  async savePreferences(prefs) {
    await this._put('preferences', { ...prefs, id: 'global' });
  }

  async getSRS(courseId) {
    const all = await this._getAll('srs');
    return all.filter(e => e.courseId === courseId);
  }

  async updateSRS(courseId, cardId, data) {
    const key = `${courseId}:${cardId}`;
    await this._put('srs', { ...data, key, courseId, cardId });
  }

  async getDueWords(courseId) {
    const today = new Date().toISOString().slice(0, 10);
    const all = await this.getSRS(courseId);
    return all.filter(e => e.nextReview <= today);
  }

  async getFavorites(courseId) {
    const favs = await this._get('favorites', courseId);
    return favs || { courseId, words: [], lessons: [], phrases: [] };
  }

  async saveFavorites(courseId, favorites) {
    await this._put('favorites', { ...favorites, courseId });
  }

  async getLessonProgress(courseId, lessonId) {
    return await this._get('lessonProgress', `${courseId}:${lessonId}`) || null;
  }

  async getAllLessonProgress(courseId) {
    const all = await this._getAll('lessonProgress');
    return all.filter(e => e.courseId === courseId);
  }

  async saveLessonProgress(courseId, lessonId, data) {
    const key = `${courseId}:${lessonId}`;
    await this._put('lessonProgress', { ...data, key, courseId, lessonId });
  }

  async getStats(courseId) {
    const stats = await this._get('stats', courseId);
    return stats || {
      courseId,
      totalWordsEncountered: 0,
      totalWordsAcquired: 0,
      totalLessonsCompleted: 0,
      totalReviewSessions: 0,
      totalCorrectAnswers: 0,
      totalWrongAnswers: 0,
      currentStreak: 0,
      longestStreak: 0,
      lastActiveDate: null,
      weeklyActivity: [0, 0, 0, 0, 0, 0, 0],
      monthlyWords: [],
    };
  }

  async saveStats(courseId, data) {
    await this._put('stats', { ...data, courseId });
  }

  async saveLessonDeck(courseId, lessonId, deck) {
    const key = `${courseId}:${lessonId}`;
    const today = new Date().toISOString().slice(0, 10);
    const existing = await this._get('lessonDecks', key);
    await this._put('lessonDecks', {
      key,
      courseId,
      lessonId,
      deck,
      createdAt: existing?.createdAt || today,
      lastUsed: today,
    });
  }

  async getLessonDecks(courseId) {
    const all = await this._getAll('lessonDecks');
    return all.filter(e => e.courseId === courseId);
  }

  /** Efface toute la progression (SRS, leçons, stats, favoris, decks de leçon). Les préférences sont conservées. */
  async resetProgress() {
    const stores = ['srs', 'lessonProgress', 'stats', 'favorites', 'lessonDecks'];
    const keysByStore = Object.fromEntries(await Promise.all(stores.map(async n => [n, await this._getAllKeys(n)])));
    await new Promise((resolve, reject) => {
      const tx = this._db.transaction(stores, 'readwrite');
      stores.forEach(n => tx.objectStore(n).clear());
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    stores.forEach(n => keysByStore[n].forEach(k => this._notify(n, k, true)));
  }

  async deleteLessonDeck(courseId, lessonId) {
    const key = `${courseId}:${lessonId}`;
    await this._deleteRaw('lessonDecks', key);
    this._notify('lessonDecks', key, true);
  }
}

export const KEY_PATHS = {
  preferences: 'id', srs: 'key', favorites: 'courseId',
  lessonProgress: 'key', stats: 'courseId', lessonDecks: 'key',
};

export const db = new Database();
