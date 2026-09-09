const DATABASE_NAME = 'portfolio-ifc-fragments';
const DATABASE_VERSION = 1;
const STORE_NAME = 'models';

const requestResult = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('Falha no armazenamento local.'));
});

/**
 * A deliberately small IndexedDB adapter. It stores only the compact Fragment
 * result, never the original IFC chosen by the user. Every operation can fail
 * independently so private mode or quota limits never block model loading.
 * IndexedDB transaction pattern: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB
 */
export class FragmentCache {
  constructor() {
    this.databasePromise = null;
  }

  async get(key) {
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, 'readonly');
    return requestResult(transaction.objectStore(STORE_NAME).get(key));
  }

  async put(entry) {
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    await requestResult(transaction.objectStore(STORE_NAME).put(entry));
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error('Falha ao concluir o cache local.'));
      transaction.onabort = () => reject(transaction.error || new Error('Cache local cancelado.'));
    });
  }

  async delete(key) {
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    await requestResult(transaction.objectStore(STORE_NAME).delete(key));
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error('Falha ao remover o cache local.'));
      transaction.onabort = () => reject(transaction.error || new Error('Remoção do cache local cancelada.'));
    });
  }

  async open() {
    if (this.databasePromise) return this.databasePromise;
    if (!('indexedDB' in window)) throw new Error('IndexedDB indisponível neste navegador.');
    this.databasePromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'hash' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Não foi possível abrir o cache local.'));
    });
    return this.databasePromise;
  }
}
