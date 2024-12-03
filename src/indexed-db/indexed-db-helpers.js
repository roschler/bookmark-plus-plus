// This module contains code to help with various IndexedDb operations.

// This module should be shareable between a parent page and an iframe.

import {IndexedDbLiaison} from "./liaison-indexed-db.js";
import {isEmptySafeString} from "../misc.js"

/**
 * This function validates a string for use as an IndexedDB
 *  key.  If it is not, an alert box is shown to the user
 *  with an error message.
 *
 * @param {String} projectName - The project name to validate.
 *
 * @return {boolean} - Returns TRUE if the project name is
 *  valid, otherwise FALSE.
 */
export function isValidIndexedDbKey(projectName) {
    const errPrefix = `(isValidIndexedDbKey) `;

    if (isEmptySafeString(projectName))
        return false;

    // Check for invalid characters (e.g., control characters)
    if (/[\x00-\x1F]/.test(projectName)) {
        alert('The project name contains invalid characters.');
        return false;
    }

    return true;
}

// DEPRECATED: The bookmarks liaison aggregates an instance
//  of this class so a global object is not needed.
//
// Create an instance of our indexedDB liaison class
//  to support our storage needs.
// export const g_IndexedDb = new IndexedDbLiaison();


