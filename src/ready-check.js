import {isEmptySafeString} from "./misc.js";

/**
 * This function executes a send-message based ready check
 *  using the given parameters.
 *
 * @param {String} contextPrefix - A label to describe the
 *  calling script (i.e. - the context).
 * @param {Object} readyCheckMsgObj - The object to send
 *  using sendMessage().
 * @param {String} targetScriptName - A label to describe
 *  the target script (e.g. - background script, etc.).
 *
 * @return {Promise<boolean>} - Returns TRUE if the
 *  target script reported that it was ready, FALSE if
 *  not.
 */
export async function doReadyCheck(contextPrefix, readyCheckMsgObj, targetScriptName) {
    let errPrefix = `(doReadyCheck) `;

    if (isEmptySafeString(contextPrefix))
        throw new Error(`${errPrefix}The contextPrefix parameter is empty or invalid.`);

    errPrefix = `(${contextPrefix}::doReadyCheck) `;

    if (typeof readyCheckMsgObj !== 'object')
        throw new Error(`${errPrefix}The readyCheckMsgObj parameter is invalid.`);
    if (isEmptySafeString(targetScriptName))
        throw new Error(`${errPrefix}The targetScriptName parameter is empty or invalid.`);

    return new Promise((resolve, reject) => {
        // Broadcast message.
        chrome.runtime.sendMessage(readyCheckMsgObj, (response) => {
            if (chrome.runtime.lastError) {
                console.log(`${contextPrefix}: Non-fatal error while waiting for "${targetScriptName}" script to be ready.  Last error: ${chrome.runtime.lastError}.`);
                resolve(false);
            } else {
                // Check the response.
                if (response === null || response === '' || typeof response !== 'string') {
                    console.log(`${contextPrefix}: Waiting for "${targetScriptName}" script to be ready.`);

                    resolve(false);
                } else {
                    // The target script is ready.
                    console.log(`${contextPrefix}: The "${targetScriptName}" script is ready.  Message received: ${response}`);
                    resolve(true);
                }
            }
        });
    });
}