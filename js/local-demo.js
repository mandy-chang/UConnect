// A pretend version of Claude's services, so index.html works when you open it on your computer.
//
// Inside Claude, window.claude already exists and this file does nothing.
// Outside Claude it makes:
//   - a database that saves to this browser's localStorage, starting with the sample data
//   - a signed-in user: you, as the team lead, so the student dashboard works
//   - no AI (the recipe page shows a note instead), and no file saving (slips can still be printed)
//
// To start over with fresh sample data, run this in the browser console and reload:
//   localStorage.removeItem('uconnect_demo_db_v2')

(function () {
  if (window.claude && typeof window.claude.use === 'function') return;

  const STORAGE_KEY = 'uconnect_demo_db_v2'; // v2: real places near Union High

  // Every document lives in this Map, keyed by its path, like "stock/s_rice".
  const documents = new Map();
  const listeners = [];

  function loadDocuments() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved) {
        for (const path in saved) documents.set(path, saved[path]);
        return;
      }
    } catch (error) {
      // nothing saved yet, or it was broken
    }

    for (const id in SAMPLE_DATA.pantries) documents.set('pantries/' + id, SAMPLE_DATA.pantries[id]);
    for (const id in SAMPLE_DATA.stock) documents.set('stock/' + id, SAMPLE_DATA.stock[id]);
    saveDocuments();
  }

  function saveDocuments() {
    const everything = {};
    documents.forEach((data, path) => {
      everything[path] = data;
    });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(everything));
    } catch (error) {
      // storage is full or blocked, the demo still works until the page is closed
    }
  }

  function copy(data) {
    return JSON.parse(JSON.stringify(data));
  }

  // Merges changes into a document the way the real database's update() does.
  function mergeInto(target, changes) {
    for (const key in changes) {
      const value = changes[key];
      const bothAreObjects = value && typeof value === 'object' && !Array.isArray(value) &&
        target[key] && typeof target[key] === 'object' && !Array.isArray(target[key]);
      if (bothAreObjects) {
        mergeInto(target[key], value);
      } else {
        target[key] = value;
      }
    }
  }

  function documentSnapshot(path) {
    const data = documents.get(path);
    return {
      id: path.split('/').pop(),
      exists: data !== undefined,
      data: () => (data === undefined ? undefined : copy(data))
    };
  }

  // All documents directly inside a collection, like every "stock/..." document,
  // that pass the query's filters (only == and >= are needed here).
  function collectionSnapshot(path, filters) {
    const depth = path.split('/').length + 1;
    const docs = [];
    documents.forEach((data, docPath) => {
      if (!docPath.startsWith(path + '/') || docPath.split('/').length !== depth) return;
      const passes = (filters || []).every(([field, op, value]) => {
        if (op === '==') return data[field] === value;
        if (op === '>=') return data[field] >= value;
        return true;
      });
      if (passes) docs.push(documentSnapshot(docPath));
    });
    return { docs: docs, size: docs.length, empty: docs.length === 0 };
  }

  // After any change, save and tell every listener.
  function changed() {
    saveDocuments();
    setTimeout(() => {
      for (const listener of listeners) {
        listener.callback(snapshotFor(listener));
      }
    }, 0);
  }

  function snapshotFor(listener) {
    return listener.isCollection ? collectionSnapshot(listener.path, listener.filters) : documentSnapshot(listener.path);
  }

  function listen(path, isCollection, callback, filters) {
    const listener = { path: path, isCollection: isCollection, callback: callback, filters: filters };
    listeners.push(listener);
    setTimeout(() => callback(snapshotFor(listener)), 0);
    return () => {
      const index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    };
  }

  function doc(path) {
    return {
      id: path.split('/').pop(),
      path: path,
      async get() {
        return documentSnapshot(path);
      },
      async set(data) {
        documents.set(path, copy(data));
        changed();
      },
      async update(changes) {
        if (!documents.has(path)) {
          throw { code: 'invalid_argument', message: 'That document does not exist' };
        }
        mergeInto(documents.get(path), copy(changes));
        changed();
      },
      async delete() {
        documents.delete(path);
        changed();
      },
      // only one person on this computer, so the lease is always free
      async acquire() {
        return { acquired: true };
      },
      onSnapshot(callback) {
        return listen(path, false, callback);
      }
    };
  }

  function collection(path, filters) {
    filters = filters || [];
    return {
      path: path,
      doc(id) {
        return doc(path + '/' + (id || Math.random().toString(36).slice(2, 12)));
      },
      where(field, op, value) {
        return collection(path, filters.concat([[field, op, value]]));
      },
      async get() {
        return collectionSnapshot(path, filters);
      },
      onSnapshot(callback) {
        return listen(path, true, callback, filters);
      }
    };
  }

  const avatar = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44">' +
    '<rect width="44" height="44" rx="22" fill="#C8102E"/>' +
    '<text x="22" y="28" font-family="sans-serif" font-size="16" font-weight="700" fill="#fff" text-anchor="middle">TL</text>' +
    '</svg>'
  );

  const me = {
    id: 'u_local_demo',
    name: 'Team Lead (demo)',
    avatarUrl: avatar,
    color: '#C8102E',
    email: null,
    isOwner: true,
    canEdit: true
  };

  const user = {
    me: async () => me,
    id: async () => me.id,
    isOwner: async () => true,
    canEdit: async () => true,
    can: async () => true,
    profiles: async ids => {
      const profiles = {};
      for (const id of [].concat(ids)) {
        profiles[id] = { id: id, name: id === me.id ? me.name : '', avatarUrl: avatar, email: null };
      }
      return profiles;
    }
  };

  loadDocuments();

  const services = { db: { doc: doc, collection: collection }, user: user };
  window.claude = {
    use: async name => services[name] || null
  };

  console.info('UConnect is running in local demo mode. Data is saved in this browser only.');
})();
