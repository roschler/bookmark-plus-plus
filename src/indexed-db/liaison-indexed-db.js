// This class makes it easy to use the browser indexedDb
//  database.

import {BookmarkRecord} from "./bookmark-record.js";
import {getEmbeddingsFromServiceWorker} from "../embeddings-helpers.js";
import {getEmbeddings_async} from "../embeddings/embeddings-for-service-worker.js";
import {generateUniqueId, isEmptySafeString} from "../misc.js";

const CONSOLE_CATEGORY = 'bookmarks manager';

// This is the number of seconds to wait for the IndexedDB
//  database connection to be established.
const MAX_SECONDS_TO_WAIT_FOR_DATABASE_CONNECTION = 5;

// -------------------- BEGIN: JAVASCRIPT COSINE SIMILARITY ------------

/**
 * This function returns TRUE if the given embeddings array
 *  is valid, FALSE if not.  Note, if an embeddings array
 *  is empty it is considered invalid.
 *
 * @param {String} callerErrPrefix - The error prefix of the
 *  calling method/function.
 * @param {Array<number>} aryEmbeddings - An array that contains
 *  a list of embedding codes.
 */
export const isValidEmbeddingsArray = function(callerErrPrefix, aryEmbeddings) {
    let errPrefix = `(isValidEmbeddingsArray) `;

    if (isEmptySafeString(callerErrPrefix))
        throw new Error(`${errPrefix}The callerErrPrefix parameter is empty.`);

    // Use the caller's error prefix instead of ours.
    errPrefix = callerErrPrefix;

    if (!Array.isArray(aryEmbeddings)) {
        console.info(`methodName`, `${errPrefix} The aryEmbeddings parameter is not an array.`);
        return false;
    }

    if (aryEmbeddings.length < 1) {
        console.info(`methodName`, `${errPrefix} The aryEmbeddings parameter is an empty array.`);
        return false;
    }

    if (typeof aryEmbeddings[0] !== 'number'){
        console.info(`methodName`, `${errPrefix} The aryEmbeddings parameter contains elements that are not a numeric.`);
        return false;
    }

    // All checks passed.
    return true;
}

/**
 * This function calculates the similarity between two embeddings
 *  arrays using the cosine similarity algorithm.
 *
 * @param {Array<number>} aryEmbeddingsSrc - An array of
 *  embedding codes, typically taken from a dynamically
 *  changing input string like from a user's input.
 * @param {Array<number>} aryEmbeddingsTargetDoc - An array of
 *  embedding codes, typically taken from a document from
 *  a collection of documents.
 *
 * @return {Number} - Returns a number that indicates the
 *  distance between the two documents.  NOTE: This number
 *  is not really useful across different documents sets
 *  because it is a RELATIVE distance value and is not
 *  normalized in any way.
 */
const cosineSimilarity = function(aryEmbeddingsSrc, aryEmbeddingsTargetDoc) {
    const errPrefix = `(cosineSimilarity) `;

    if (!isValidEmbeddingsArray(errPrefix, aryEmbeddingsSrc))
        throw new Error(`${errPrefix}The aryEmbeddingSrc parameter does not contain a valid embeddings array.  Check the console for error details.`);
    if (!isValidEmbeddingsArray(errPrefix, aryEmbeddingsTargetDoc))
        throw new Error(`${errPrefix}The aryEmbeddingsTargetDoc parameter does not contain a valid embeddings array.  Check the console for error details.`);

    let dotProduct = 0;
    let mA = 0;
    let mB = 0;

    for (let i = 0; i < aryEmbeddingsSrc.length; i++) {
        dotProduct += aryEmbeddingsSrc[i] * aryEmbeddingsTargetDoc[i];
        mA += aryEmbeddingsSrc[i] * aryEmbeddingsSrc[i];
        mB += aryEmbeddingsTargetDoc[i] * aryEmbeddingsTargetDoc[i];
    }

    mA = Math.sqrt(mA);
    mB = Math.sqrt(mB);

    const denominator = mA * mB;

    // Check for an attempted divide by zero condition.
    if (denominator === 0.0)
        throw new Error(`${errPrefix}The denominator is zero.`);

    const similarity = dotProduct / denominator;

    return similarity;
}

/**
 * This object holds the match details for a single match
 *  created during a semantic search.
 *
 * @param {Number} similarityScore - The similarity score
 *  calculated for the source object against a search
 *  query.
 *
 * @param {Object} srcObj - An object that was the
 *  source for the text that was compared against
 *  the search query.
 *
 * @constructor
 */
function SemanticMatch(similarityScore, srcObj) {
    const self = this;
    const methodName = self.constructor.name + '::' + `constructor`;
    const errPrefix = '(' + methodName + ') ';

    if (typeof similarityScore !== 'number')
        throw new Error(`${errPrefix}The value in the similarityScore parameter is not a number.`);

    /** @property {String} - A randomly generated unique ID for this object. */
    this.id = generateUniqueId();

    /** @property {Date} - The date/time this object was created. */
    this.dtCreated = new Date();

    /** @property {Number} - The numeric score for this match. */
    this.similarityScore = similarityScore;

    /** @property {Object} - The object associated with the similarity score. */
    this.srcObj = srcObj;
}

// -------------------- END  : JAVASCRIPT COSINE SIMILARITY ------------

// This is the maximum value allowed for N-BEST arrays since we
//  do a linear search as part of a semantic match and we don't
//  want to do a search that results in a major CPU hog.
const MAX_NBEST = 100;
/**
 * Class representing a liaison to an IndexedDB database.
 */
export class IndexedDbLiaison {
    /**
     * @constructor
     *
     * Create an IndexedDbLiaison instance and establish
     *  a connection to the specified database.
     *
     * @param {String} [databaseName='my-database'] - The
     *  name of the IndexedDB database.
     */
    constructor(databaseName = 'my-database') {
        if (typeof databaseName !== 'string' || databaseName.trim() === '') {
            throw new Error('Invalid database name. Must be a non-empty string.');
        }

        this.db = null;
        this.objectStoreName = 'items';
        const request = indexedDB.open(databaseName, 1);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            db.createObjectStore(this.objectStoreName, { keyPath: 'key' });
        };

        request.onsuccess = (event) => {
            this.db = event.target.result;
        };

        request.onerror = (event) => {
            console.error('Error opening database:', event.target.errorCode);
        };
    }

    /**
     * Store an item into the database using the given key name.
     *
     * @param {String} keyName - The key name to use for storing
     * the item.
     *
     * @param {*} itemVal - The item value to store in the database.
     *
     * @returns {Promise<boolean>} A promise that resolves to
     *  TRUE when the item is successfully stored.
     */
    storeItem_async(keyName, itemVal) {
        return new Promise((resolve, reject) => {
            if (typeof keyName !== 'string' || keyName.trim() === '') {
                reject('Invalid key name. Must be a non-empty string.');
                return;
            }

            if (!this.db) {
                reject('Database connection not established');
                return;
            }

            const transaction = this.db.transaction([this.objectStoreName], 'readwrite');
            const objectStore = transaction.objectStore(this.objectStoreName);
            const item = { key: keyName, value: itemVal };
            const request = objectStore.put(item);

            request.onsuccess = () => {
                resolve(true);
            };

            request.onerror = (event) => {
                reject('Error storing item:', event.target.errorCode);
            };

            // Handle transaction errors
            transaction.onerror = () => {
                reject(new Error(`Transaction failed: ${transaction.error.message}`));
            };
        });
    }

    /**
     * Retrieve an item from the database using the given key name.
     *
     * @param {String} keyName - The key name to use for retrieving
     *  the item.
     *
     * @returns {Promise<*>} A promise that resolves to the item 
     *  value if the key exists or NULL if the key does not exist.
     */
    retrieveItem_async(keyName) {
        return new Promise((resolve, reject) => {
            if (typeof keyName !== 'string' || keyName.trim() === '') {
                reject('Invalid key name. Must be a non-empty string.');
                return;
            }

            if (!this.db) {
                reject('Database connection not established');
                return;
            }

            const transaction = this.db.transaction([this.objectStoreName], 'readonly');
            const objectStore = transaction.objectStore(this.objectStoreName);
            const request = objectStore.get(keyName);

            request.onsuccess = () => {
                const result = request.result;
                resolve(result ? result.value : null);
            };

            request.onerror = (event) => {
                reject(`Error retrieving item using key: ${keyName}`, event.target.errorCode);
            };

            // Handle transaction errors
            transaction.onerror = () => {
                reject(new Error(`Transaction failed: ${transaction.error.message}`));
            };
        });
    }

    /**
     * Retrieve all keys from the database.
     *
     * @returns {Promise<string[]>} A promise that resolves
     *  to an array of sorted keys or rejects with an error.
     */
    retrieveAllKeys_async() {
        return new Promise((resolve, reject) => {

            if (!this.db) {
                reject('Database connection not established');
                return;
            }

            const transaction = this.db.transaction([this.objectStoreName], 'readonly');
            const objectStore = transaction.objectStore(this.objectStoreName);

            // Use openCursor to get all keys
            const request = objectStore.openCursor();
            const keys = [];

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    keys.push(cursor.key);
                    cursor.continue();
                } else {
                    // Sort the keys alphabetically in a case-insensitive manner
                    keys.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
                    resolve(keys);
                }
            };

            request.onerror = (event) => {
                reject(`Error retrieving all keys: ${event.target.errorCode}`);
            };

            // Handle transaction errors
            transaction.onerror = () => {
                reject(new Error(`Transaction failed: ${transaction.error.message}`));
            };
        });
    }

    /**
     * Retrieve all values from the database, sorted
     *  by their associated keys.
     *
     * @returns {Promise<any[]>} A promise that resolves
     *  to an array of values sorted by their associated
     *  keys, or rejects with an error.
     */
    retrieveAllValues_async() {
        return new Promise((resolve, reject) => {

            if (!this.db) {
                reject('Database connection not established');
                return;
            }

            const transaction = this.db.transaction([this.objectStoreName], 'readonly');
            const objectStore = transaction.objectStore(this.objectStoreName);

            // Use openCursor to get all values along with their keys
            const request = objectStore.openCursor();
            const entries = []; // Array to store { key, value } pairs

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    entries.push({ key: cursor.key, value: cursor.value });
                    cursor.continue();
                } else {
                    // Sort the entries by key in a case-insensitive manner
                    entries.sort((a, b) => a.key.toLowerCase().localeCompare(b.key.toLowerCase()));

                    // Extract the values in sorted order
                    const sortedValues = entries.map(entry => entry.value);
                    resolve(sortedValues);
                }
            };

            request.onerror = (event) => {
                reject(`Error retrieving all values: ${event.target.errorCode}`);
            };

            // Handle transaction errors
            transaction.onerror = () => {
                reject(new Error(`Transaction failed: ${transaction.error.message}`));
            };
        });
    }

    /**
     * Delete an item from the database (and its value).
     *
     * @returns {Promise<String>} A promise that resolves to
     *  a status string that tells you what key was deleted.
     *  If no such item exists with the specified key, or
     *  if the operation fails, then the promise rejects.
     */
    deleteItem_async(keyName) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject('Database connection not established');
                return;
            }

            // Open a transaction on the object store
            const transaction = this.db.transaction(this.objectStoreName, 'readwrite');
            const objectStore = transaction.objectStore(this.objectStoreName);

            // Delete the item with the given key name
            const request = objectStore.delete(keyName);

            // Handle success
            request.onsuccess = () => {
                resolve(`Item with key "${keyName}" successfully deleted.`);
            };

            // Handle errors
            request.onerror = () => {
                reject(new Error(`Failed to delete item with key "${keyName}".`));
            };

            // Handle transaction errors
            transaction.onerror = () => {
                reject(new Error(`Transaction failed: ${transaction.error.message}`));
            };
        });
    }

    /**
     * Check if an object with the given name exists
     *  in the IndexedDB database.
     *
     * @param {String} objectName - The name of the
     *  object to check for existence.
     *
     * @returns {Promise<*>} A promise that resolves
     *  to TRUE if the object exists, otherwise FALSE.
     *
     * @throws {Error} If the input parameter is not
     *  a string or is an empty string.
     */
    isExistingObject_async(objectName) {
        // Input parameter checks
        if (typeof objectName !== 'string' || objectName.trim() === '') {
            throw new Error('The input parameter must be a non-empty string.');
        }

        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject('Database connection not established');
                return;
            }

            // Start a transaction and get the "objects" object store
            const transaction = this.db.transaction([this.objectStoreName], 'readonly');
            const objectStore = transaction.objectStore(this.objectStoreName);

            // Use the count method to check if the object with the given name exists
            const countRequest = objectStore.count(objectName);

            countRequest.onsuccess = () => {
                // Resolve the promise to true if the count is greater than zero, otherwise false.
                resolve(countRequest.result > 0);
            };

            countRequest.onerror = () => {
                // Reject the promise with an error message if the count operation fails
                reject(new Error('Failed to check if the object exists.'));
            };
        });
    }
}

/**
 * This class aggregates a IndexedDbLiaison object and provides
 *  a facade that deals with BookmarkRecord objects.
 */
export class BookmarksDbLiaison {

    /**
     * @constructor
     *
     * Create an BookmarksDbLiaison instance.
     *
     * @param {String} [databaseName='my-database'] - The name of the
     *  underlying IndexedDB database.
     */
    constructor(
         databaseName = 'my-database') {
        if (typeof databaseName !== 'string' || databaseName.trim() === '') {
            throw new Error('Invalid database name. Must be a non-empty string.');
        }

        // This flag lets other code know if the cache has been
        //  initialized.
        this.isCacheInitialized = false;

        // Create an instance of an IndexedDbLiaison object
        //  for our use.
        this.indexedDbLiaison = new IndexedDbLiaison(databaseName);

        // Keep a cache of all the bookmark objects.
        //  The initializeBookmarkCache() method will
        //  assign content to this property.
        this.cachedBookmarks = null;
    }

    /**
     * The internal function that will actually retrieve
     *  all the bookmarks from the database, sorted by their
     *  associated URLs.  It also initializes/updates the
     *  bookmark cache.
     *
     * @returns {Promise<Boolean>} A promise that
     *  resolves to TRUE if the retrieval succeeds,
     *  or FALSE if not.
     */
    async _internalRetrieveAllBookmarks_async() {
        // debugger;

        const aryStrBookmarkRecordObj =
            await this.indexedDbLiaison.retrieveAllValues_async();

        // Reset the content of the cached bookmarks property.
        this.cachedBookmarks = [];

        for (
                let ndx = 0;
                ndx < aryStrBookmarkRecordObj.length;
                ndx++) {

            // TODO: Comment out this code when done.  This code is here
            //  specifically to add the embeddings for the
            //  bookmark page title to the legacy raw bookmark record
            //  objects that don't have that field yet.
            /*
            let bookmarkRecordObj = null;

            // We need the raw object.
            const rawObj =
                JSON.parse(aryStrBookmarkRecordObj[ndx].value);

            if (!isValidEmbeddingsArray('_internalRetrieveAllBookmarks_async', rawObj.embeddingsArray_title )) {
                // Clear out the concatenated text embeddings.
                rawObj.embeddingsArray = null;
                // Add the missing field with a NULL value.
                rawObj.embeddingsArray_title = null;
                bookmarkRecordObj =
                    BookmarkRecord.fromRaw(rawObj);

                // Save it.
                this.isCacheInitialized = true;
                await this.addBookmark_async(bookmarkRecordObj);
                this.isCacheInitialized = false;
                */

            const bookmarkRecordObj
                = BookmarkRecord.fromString(aryStrBookmarkRecordObj[ndx].value);

            this.cachedBookmarks.push(bookmarkRecordObj);
        }

        // The bookmarks cache is now initialized.
        this.isCacheInitialized = true;

        return true;
    }

    /**
     * This function returns TRUE if the bookmarks cache is
     *  initialized but is EMPTY.  FALSE, if we have some
     *  bookmarks.
     *
     * @return {boolean}
     */
    isEmptyBookmarksCollection() {
        const methodName = 'BookmarksDbLiaison' + '::' + `isEmptyBookmarksCollection`;
        const errPrefix = '(' + methodName + ') ';

        // If this object has not been initialized, throw an error.
        if (!this.isCacheInitialized)
            throw new Error(`${errPrefix} This object has not been initialized yet.`);

        return this.cachedBookmarks.length < 1;
    }

    /**
     * Wait for the IndexedDbLiaison object we aggregate to
     *  establish the local IndexedDB database connection.
     *
     * @param maxSecondsToWait - The number of seconds to
     *  wait before giving up.
     *
     * @return {Promise<void>}
     *
     * @private
     */
    async _waitForDatabaseConnection(maxSecondsToWait) {
        if (typeof maxSecondsToWait !== 'number' || maxSecondsToWait < 1)
            throw new Error(`The maxSecondsToWait parameter is invalid or less than 1.`);

        let connected = false; // Variable to track the database connection status
        const dtStart = new Date(); // Start time
        let secondsElapsed = 0;

        while (!connected) {
            if (this.indexedDbLiaison.db !== null) {
                connected = true; // Database is connected
                break;
            }

            // Calculate the elapsed time
            const now = new Date();
            secondsElapsed = Math.floor((now - dtStart) / 1000);

            if (secondsElapsed > maxSecondsToWait) {
                throw new Error("Database connection failed. Wait time exceeded.");
            }

            console.log(`Waiting for database connection. Seconds elapsed: ${secondsElapsed}...`);

            // Wait for 1 second
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log("Database connection established.");
    }

    /**
     * This function MUST be called before calling any of
     *  the main methods.
     *
     * @return {Promise<Boolean>} - Returns TRUE if the
     *  operation succeeds, FALSE or an error if not.
     */
    async initializeBookmarkCache() {
        // We need to wait for the constructor of the
        //  IndexedDbLiaison to initialize the database
        //  connection.
        await this._waitForDatabaseConnection(MAX_SECONDS_TO_WAIT_FOR_DATABASE_CONNECTION)

        const bIsRetrievalSuccessful =
            await this._internalRetrieveAllBookmarks_async();

        if (!bIsRetrievalSuccessful)
            throw new Error(`The internal bulk retrieval operation failed.`);

        console.info(CONSOLE_CATEGORY, `Bookmarks cache initialized. Number of bookmarks: ${this.cachedBookmarks.length}`);

        return true;
    }

    /**
     * Add a bookmark to the bookmark records database using
     *  the given URL.  If the given bookmark records object
     *  does not have an embeddings array yet, that will be
     *  generated now.
     *
     * @param {BookmarkRecord} bookmarkRecordObj - The bookmark
     *  record object to store in the database.
     *
     * @returns {Promise<boolean>} A promise that resolves to
     *  TRUE when the item is successfully stored.
     */
    async addBookmark_async(bookmarkRecordObj) {
        const methodName = 'BookmarksDbLiaison' + '::' + `addBookmark_async`;
        const errPrefix = '(' + methodName + ') ';

        // If this object has not been initialized, throw an error.
        if (!this.isCacheInitialized)
            throw new Error(`This object has not been initialized yet.`);

        if (typeof bookmarkRecordObj === 'undefined'
            || !(bookmarkRecordObj instanceof BookmarkRecord))
            throw new Error(`${errPrefix}The value in the bookmarkRecordObj parameter is not a BookmarkRecord object.`);

        // The bookmark should have an empty embeddings array field
        //  for the concatenated text. (i.e. - it should be a new bookmark).
        if (isValidEmbeddingsArray(errPrefix, bookmarkRecordObj.embeddingsArray))
            throw new Error(`The embeddings array field for the concatenated text in the bookmark record object already has a value.  Expected a new bookmark record object, not an existing one.`);

        // The bookmark should have an empty embeddings array field
        //  for the concatenated text. (i.e. - it should be a new bookmark).
        if (isValidEmbeddingsArray(errPrefix, bookmarkRecordObj.embeddingsArray_title))
            throw new Error(`The embeddings array field for the title in the bookmark record object already has a value.  Expected a new bookmark record object, not an existing one.`);

        // Get the embeddings now for the concatenated text.
        bookmarkRecordObj.embeddingsArray =
            await getEmbeddings_async(bookmarkRecordObj.summaryText);

        // Get the embeddings now for the title.
        bookmarkRecordObj.embeddingsArray_title =
            await getEmbeddings_async(bookmarkRecordObj.pageTitle);

        // Now do a full validation of the bookmark record object
        //  with the constraint that it must have valid summary
        //  text and embeddings array fields.
        bookmarkRecordObj.validateMe(true);

        const urlToSrcPage =
            bookmarkRecordObj.urlToSrcPage.trim();

        if (isEmptySafeString(urlToSrcPage))
            throw new Error(`${errPrefix}The urlToSrcPage variable is empty or invalid.`);

        const strBookmarkRecordObj =
            JSON.stringify(bookmarkRecordObj);

        const bSuccessfulWrite =
            await this.indexedDbLiaison.storeItem_async(
                bookmarkRecordObj.urlToSrcPage,
                strBookmarkRecordObj);

        if (bSuccessfulWrite) {
            // Update the cache.
            this.cachedBookmarks.push(bookmarkRecordObj);
        }

        return bSuccessfulWrite;
    }

    /**
     * Retrieve a bookmark from the database using the
     *  given URL.
     *
     * @param {String} urlToSrcPage - The key URL for the
     *  desired bookmark.
     *
     * @returns {Promise<BookmarkRecord>|null} A promise that resolves to
     *  the bookmark record object if the URL exists or
     *  NULL if the key does not exist.
     */
    async retrieveBookmark_async(urlToSrcPage) {
        const methodName = 'BookmarksDbLiaison' + '::' + `retrieveBookmark_async`;
        const errPrefix = '(' + methodName + ') ';
        // If this object has not been initialized, throw an error.
        if (!this.isCacheInitialized)
            throw new Error(`This object has not been initialized yet.`);

        if (typeof urlToSrcPage !== 'string' || urlToSrcPage.trim() === '') {
            throw new Error('Invalid urlToSrcPage parameter. Must be a non-empty string.');
        }

        const bIsExistingBookmark =
            await this.indexedDbLiaison.isExistingObject_async(urlToSrcPage);

        if (!bIsExistingBookmark)
            return null;
        else {
            // Get the bookmark.
            const strBookmarkRecObj =
                await this.indexedDbLiaison.retrieveItem_async(urlToSrcPage);

            if (strBookmarkRecObj === null)
                throw new Error(`${errPrefix}Despite passing the existence check, the attempt to retrieve the bookmark with the following URL failed: ${urlToSrcPage}`);

            const bookmarkRecordObj =
                BookmarkRecord.fromString(strBookmarkRecObj);

            return bookmarkRecordObj;
        }
    }

    /**
     * Retrieve all bookmarks from the bookmarks cache, sorted
     *  by their associated URLs.
     *
     * @returns {BookmarkRecord[]} Returns a reference to the
     *  bookmarks cache.
     */
    getBookmarks() {
        // If this object has not been initialized, throw an error.
        if (!this.isCacheInitialized)
            throw new Error(`This object has not been initialized yet.`);

        // Return a reference to the cache.
        return this.cachedBookmarks;
    }

    /**
     * Delete a bookmark from the database.
     *
     * @returns {Promise<String>} A promise that resolves to
     *  a status string that tells you what bookmark was deleted.
     *  If no such bookmark exists with the specified URL, or
     *  if the operation fails, then the promise rejects.
     */
    async deleteBookmark_async(urlToSrcPage) {
        // If this object has not been initialized, throw an error.
        if (!this.isCacheInitialized)
            throw new Error(`This object has not been initialized yet.`);

        const bIsDeleted = this.indexedDbLiaison.deleteItem_async(urlToSrcPage);

        if (bIsDeleted) {
            // TODO: If speed is an issue, perhaps a strategy
            //  where the element is deleted from the array
            //  would be faster.  This is quick and safe.
            //
            // Rebuild the cache.
            await this._internalRetrieveAllBookmarks_async();
        } else {
            throw new Error(`Deletion operation failed for bookmark URL:\n${urlToSrcPage}.`);
        }
    }

    /**
     * Check if a bookmark with the given URL exists
     *  in the IndexedDB database.
     *
     * @param {String} urlToSrcPage - The URL for the
     *  web page whose bookmark record we want to
     *  check for existence.
     *
     * @returns {Promise<BookmarkRecord>} A promise that resolves
     *  to TRUE if the bookmark record exists, otherwise FALSE.
     *
     * @throws {Error} If the input parameter is not a string or is an empty string.
     */
    async isExistingBookmark_async(urlToSrcPage) {
        // If this object has not been initialized, throw an error.
        if (!this.isCacheInitialized)
            throw new Error(`This object has not been initialized yet.`);

        // Input parameter checks
        if (typeof urlToSrcPage !== 'string' || urlToSrcPage.trim() === '') {
            throw new Error('The urlToSrcPage parameter must be a non-empty string.');
        }

        return await this.indexedDbLiaison.isExistingObject_async(urlToSrcPage);
    }

    /**
     * Execute a semantic search against the bookmark records using the given
     *  array of embedding codes.
     *
     * @param {String} query - The query string to use for the search.
     * @param {Number} nBest - The number of matches to keep from a search.
     *  Values larger than MAX_NBEST are not allowed (see header
     *  notes).
     *
     * @return {Promise<BookmarkRecord[]>} - Returns a promise that resolves
     *  to the array of matching bookmarks, up to the nBest limit, or throws
     *  an error if a problem occurs.
     */
    async semanticSearchBookmarks_async(query, nBest=30) {
        // If this object has not been initialized, throw an error.
        if (!this.isCacheInitialized)
            throw new Error(`This object has not been initialized yet.`);

        if (typeof query !== 'string' || query.length < 1)
            throw new Error(`The query parameter value is empty or invalid.`);

        // Get the embeddings array for the query.
        const aryQueryEmbeddingsCodes =
            await getEmbeddings_async(query);

        if (!Array.isArray(aryQueryEmbeddingsCodes))
            throw new Error(`The aryQueryEmbeddingsCodes parameter value is not an array.`);
        if (aryQueryEmbeddingsCodes.length < 1)
            throw new Error(`The aryQueryEmbeddingsCodes array is empty.`);

        // An nBest value of zero is nonsensical.
        if (nBest === 0)
            throw new Error(`The nBest parameter is zero.`);

        if (nBest < 0)
            throw new Error(`The nBest parameter is negative.`);

        // Do not allow large nBest values since we do a linear search with each
        //  match and a large match array could therefore lead to a major
        //  performance problem.
        if (nBest > MAX_NBEST)
            throw new Error(`The N-BEST parameter is too large.  Maximum allowed: ${MAX_NBEST}`);

        // Initialize matches array.
        const arySemanticMatchScores = [];

        for (let ndx = 0; ndx < nBest; ndx++)
            arySemanticMatchScores.push(null);

        // Find the first slot with the lowest score in the matches array
        //  and return its index in the matches array.
        function findNdxOfLowestScore() {
            const errPrefix_2 = `(semanticSearchBookmarks::findNdxOfLowestScore) `;

            let retNdx = null;
            let lowestScoreSoFar = null;

            for (
                let matchNdx = 0;
                matchNdx < nBest;
                matchNdx++) {
                const currentMatchObj = arySemanticMatchScores[matchNdx];

                // An unassigned slot is the same as being the lowest score.
                if (currentMatchObj === null) {
                    retNdx = matchNdx;
                    break; // Done.
                }

                // If this is the first score comparison, OR if is not and
                //  the current match's similarity score is lower than
                //  the minimum score found so far, then assign
                //  the current match score to the lowest score so far
                //  and save the index of the match object.
                if (lowestScoreSoFar === null || currentMatchObj.similarityScore < lowestScoreSoFar) {
                    // Save the current score and source object as the new
                    //  minimum.
                    lowestScoreSoFar = currentMatchObj.similarityScore;
                    retNdx = matchNdx;
                }
            }

            return retNdx;
        }

        /**
         * Computes a composite relevance score for matching a query to a document,
         * emphasizing the title similarity when it's very high and de-emphasizing content similarity.
         *
         * @param {number} cosineSimilarityTitle - Cosine similarity between the query and the document title embeddings (range 0 to 1).
         * @param {number} cosineSimilarityContent - Cosine similarity between the query and the document content embeddings (range 0 to 1).
         * @param {number} [k=50] - Controls the sharpness of the transition in the sigmoid function.
         * @param {number} [threshold=0.85] - Title similarity threshold where the transition occurs.
         * @returns {number} The computed composite relevance score.
         */
        function computeRelevanceScore(
            cosineSimilarityTitle,
            cosineSimilarityContent,
            k = 50,
            threshold = 0.85
        ) {
            // Sigmoid function to calculate modulation factor
            function sigmoid(x) {
                return 1 / (1 + Math.exp(-x));
            }

            // Calculate modulation factor based on title similarity
            const modulationFactor = sigmoid(k * (cosineSimilarityTitle - threshold));

            // Compute relevance score by modulating content and title similarities
            const relevanceScore =
                (1 - modulationFactor) * cosineSimilarityContent +
                modulationFactor * cosineSimilarityTitle;

            return relevanceScore;
        }

        // Execute the search, keeping the N best matches as we go.
        for (
                let srcNdx = 0;
                srcNdx < this.cachedBookmarks.length;
                srcNdx++) {

            const bookmarkRecordObj = this.cachedBookmarks[srcNdx];

            // Execute a similarity score for the concatenated text.
            const similarityScore_concatenated_text =
                cosineSimilarity(
                    aryQueryEmbeddingsCodes,
                    bookmarkRecordObj.embeddingsArray);

            // Execute a similarity score for the page title.
            const similarityScore_title =
                cosineSimilarity(
                    aryQueryEmbeddingsCodes,
                    bookmarkRecordObj.embeddingsArray_title);

            // Create a hybrid score that give titles with a
            //  very high similarity to the user input a big
            //  boost.
            const similarityScore =
                computeRelevanceScore(
                    similarityScore_title,
                    similarityScore_concatenated_text);

            // const similarityScore =
                // similarityScore_title * similarityScore_concatenated_text;

            console.log(`Similarity score for:\nTitle: ${bookmarkRecordObj.pageTitle}\nScore: ${similarityScore_title}`);

            // Get the index of the match with the lowest score.
            const ndxOfLowestScore = findNdxOfLowestScore();

            const lowerScoreObj = arySemanticMatchScores[ndxOfLowestScore];

            // Is the current low score match unassigned OR is
            //  the current comparison's score higher?
            if (lowerScoreObj === null || similarityScore > lowerScoreObj.similarityScore) {
                // Yes.  Replace the lower score match with a new one
                arySemanticMatchScores[ndxOfLowestScore] =
                    new SemanticMatch(similarityScore, bookmarkRecordObj);
            }
        }

        // Remove NULL elements.
        const arySemanticMatchScores_filtered =
            arySemanticMatchScores.filter(element => element !== null);

        // Sort by score, descending order.
        arySemanticMatchScores_filtered.sort((a, b) => b.similarityScore - a.similarityScore);

        // Return the results as an array of bookmark record objects.
        const aryMatchingBookmarkRecordObjs = [];

        for (let ndx = 0; ndx < arySemanticMatchScores_filtered.length; ndx++) {
            // Ignore NULL entries.  That just means there weren't enough
            //  matches to fill up the array.
            if (arySemanticMatchScores_filtered[ndx])
                aryMatchingBookmarkRecordObjs.push(arySemanticMatchScores_filtered[ndx].srcObj);
        }

        return aryMatchingBookmarkRecordObjs;
    }
}

/*
// Usage example
(async () => {
    const indexedDbLiaison = new IndexedDbLiaison();
*/
