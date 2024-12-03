// CONTEXT: Popup
//
// This module contains code that helps with interfacing
//  with the embeddings code interface provided by the
//  service worker (background script), from the popup
//  context.

/**
 * DEPRECATED: The service worker now does any
 *  embeddings operations required by an operation,
 *  like creating the embeddings for a search query.
 *
 * Asynchronously sends a message to the service worker to
 *  retrieve embeddings for a given string.
 *
 * @param {string} strSrcText - The input text to send to
 *  the service worker for embedding generation.
 * @returns {Promise<Number[]>} - A promise that resolves
 *  to a an array of numbers (embeddings), received
 *  from the the service worker.
 *
 * @throws {Error} - Throws an error if the input is invalid,
 *  the service worker returns null/empty, or if another issue occurs.
 */
export async function getEmbeddingsFromServiceWorker(strSrcText) {
    return new Promise((resolve, reject) => {
        try {
            // Validate the input.
            if (typeof strSrcText !== 'string' || strSrcText.trim() === '') {
                throw new Error('Input text must be a non-empty string after trimming.');
            }

            // Prepare the message to send.
            const message = {
                action: 'embeddings',
                text: strSrcText.trim(),
            };

            // Send message to the service worker.
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    // Handle runtime errors during message transmission.
                    reject(new Error(`Failed to communicate with the service worker: ${chrome.runtime.lastError.message}`));
                    return;
                }

                // Check the response.
                if (response === null || response === '' || typeof response !== 'string') {
                    reject(new Error('Service worker returned an invalid or empty response.'));
                } else {
                    // Parse out the array of numbers (embeddings).
                    const embeddings =
                        JSON.parse(response);

                    resolve(embeddings);
                }
            });
        } catch (error) {
            // Catch and handle any synchronous errors.
            reject(error);
        }
    });
}
