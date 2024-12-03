// background.js - Handles requests from the UI, runs the model, then sends back a response

import { pipeline, env } from '@xenova/transformers';
import {BookmarksDbLiaison, isValidEmbeddingsArray} from "./indexed-db/liaison-indexed-db.js";
import {getEmbeddings_async} from "./embeddings/embeddings-for-service-worker.js";
import {BookmarkRecord} from "./indexed-db/bookmark-record.js";
import {conformErrorObjectMsg, isEmptySafeString} from "./misc.js";

const CONSOLE_CATEGORY = 'BACKGROUND SCRIPT';

// Enable local models
env.allowLocalModels = true;

// Set the path to our local models in the Chrome extension
//  storage area.
env.localModelPath = chrome.runtime.getURL('models/');

// Due to a bug in onnxruntime-web, we must disable multithreading for now.
// See https://github.com/microsoft/onnxruntime/issues/14445 for more information.
env.backends.onnx.wasm.numThreads = 1;

// Busy flag for adding a bookmark.
let bIsAddBookmarkInProgress = false;

// Busy flag for searching through bookmarks.
let bIsSearchBookmarksInProgress = false;

// Busy flag for retrieving a bookmark.
let bIsRetrieveBookmarkInProgress = false;

// The window ID for our popup, if it is active.
let popupWindowId = null;

// -------------------- BEGIN: CLASSIFICATION ------------

/**
 * Pipeline for text classification
 */
class PipelineSingleton_text_classification {
    static task = 'text-classification';
    static model = 'Xenova/distilbert-base-uncased-finetuned-sst-2-english';
    static instance = null;

    static async getInstance(progress_callback = null) {
        if (this.instance === null) {
            this.instance = pipeline(this.task, this.model, { progress_callback });
        }

        return this.instance;
    }
}

// Create generic classify function, which will be reused for the different types of events.
const classify = async (text) => {
    // Get the pipeline instance. This will load and build the model when run for the first time.
    let model =
        await PipelineSingleton_text_classification.getInstance(
            (data) => {
                // You can track the progress of the pipeline creation here.
                // e.g., you can send `data` back to the UI to indicate a progress bar
                console.log('progress', data)
            });

    // Actually run the model on the input text
    let result = await model(text);
    return result;
};


// -------------------- END  : CLASSIFICATION ------------

////////////////////// 1. Context Menus //////////////////////
//
// Add a listener to create the initial context menu items,
// context menu items only need to be created at runtime.onInstalled
chrome.runtime.onInstalled.addListener(function () {
    /*
    // Register a context menu item that will only show up for selection text.
    chrome.contextMenus.create({
        id: 'classify-selection',
        title: 'Classify "%s"',
        contexts: ['selection'],
    });

     */
});

// -------------------- BEGIN: POPUP WINDOW LIFETIME MANAGEMENT ------------

// Event handler that will fire when the popup is removed.
chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId === popupWindowId) {
        console.log(`BACKGROUND SCRIPT: Popup window removed event fired.`);
        popupWindowId = null;
    }
});

// Close the popup programmatically
function closePopup() {
    if (popupWindowId) {
        chrome.windows.remove(popupWindowId, () => {
            console.log(`BACKGROUND SCRIPT: Popup closed via function call.`);
        });
    }
}

/**
 * Event handler for clicking on the extension icon.
 */
chrome.action.onClicked.addListener(() => {
    if (popupWindowId) {
        // console.log(`BACKGROUND SCRIPT: Popup already open, focusing...`);
        // chrome.windows.update(popupWindowId, { focused: true });

        // Close the popup if the extension icon is clicked while
        //  it is active.
        console.log(`BACKGROUND SCRIPT: Scheduling popup close due to second extension icon click.`);
        setTimeout(closePopup, 100);
        return;
    }

    console.log(`BACKGROUND SCRIPT: Creating and showing popup due to extension icon click.`);

    // Create and show the popup window.
    chrome.windows.create(
        {
            url: "popup.html",
            type: "popup",
            width: 800,
            height: 800
        },
        (window) => {
            console.log(`BACKGROUND SCRIPT: Popup created.  Window ID: ${window}`);

            // Save the popup window ID so we can close it later.
            popupWindowId = window.id;
        }
    );
});

// -------------------- END  : POPUP WINDOW LIFETIME MANAGEMENT ------------

// Perform inference when the user clicks a context menu
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    // Ignore context menu clicks that are not for classifications (or when there is no input)
    if (info.menuItemId !== 'classify-selection' || !info.selectionText)
        return;

    // Perform classification on the selected text
    let result = await classify(info.selectionText);

    // Do something with the result
    chrome.scripting.executeScript({
        target: { tabId: tab.id },    // Run in the tab that the user clicked in
        args: [result],               // The arguments to pass to the function
        function: (result) => {       // The function to run
            // NOTE: This function is run in the context of the web page, meaning that `document` is available.
            console.log('result', result)
            console.log('document', document)
        },
    });
});

//////////////////////////////////////////////////////////////

////////////////////// 2. Message Events /////////////////////
//
// Listen for messages from the UI, process it, and send the result back.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    let bIsAsyncResponse = false;

    console.log(`BACKGROUND SCRIPT: sender:`, sender);
    console.log(`BACKGROUND SCRIPT: "message" object received:`)
    console.log(message);

    // if (message.action !== 'classify') return; // Ignore messages that are not meant for classification.

    // Is it an action request or a message response?
    if (message.action) {
        // Note:  If you don't establish a port connection with a
        //  content script, then only this script (the background
        //  script) can communicate with the content script via Chrome
        //  messaging.  That is why many of the message types
        //  SENT by the background script, as part of this gauntlet
        //  begin with "relayed", indicating they are content messages
        //  received by us that we are relaying to other scripts,
        //  like the popup script, etc.

        // -------------------- BEGIN: PROCESS ACTION REQUEST ------------

        const requestObj = message;

        if (requestObj.action === 'backgroundScriptReadyCheck') {
            // Other scripts wants to know if we are ready.
            sendResponse(`BACKGROUND SCRIPT: The background script is ready.`);
        } else if (requestObj.action === 'popupScriptReadyCheck') {
            // The content script wants to know if the popup script
            // is ready.  Relay the request.
            sendResponse(`BACKGROUND SCRIPT: Received "popupScriptReadyCheck" message from CONTENT script.  Relaying the request to the POPUP script.`);

            const requestObj =
                {
                    action: 'relayedPopupScriptReadyCheck',
                }

            chrome.runtime.sendMessage(requestObj);
        } else if (requestObj.action === 'remoteContentScriptReadyCheck') {
            // The popup script wants to know if the content script
            // is ready.  Relay the request.
            const statusMsg = `BACKGROUND SCRIPT: Received "remoteContentScriptReadyCheck" message from other non-content script.  Relaying the request to the CONTENT script.`;

            console.log(statusMsg);

            sendResponse(statusMsg);

            const requestObj =
                {
                    action: 'relayedContentScriptReadyCheck',
                }

            chrome.runtime.sendMessage(requestObj);
        } else if (requestObj.action === 'embeddings') {
            // -------------------- BEGIN: EMBEDDINGS ------------

            // Run model prediction asynchronously
            (async function () {
                // Perform embeddings call on the given text.
                // let result = await classify(requestObj.text);
                let result = await getEmbeddings_async(requestObj.text);

                // Send stringified response back to UI
                sendResponse(JSON.stringify(result));
            })();

            bIsAsyncResponse = true; // Tell the caller we will send the response asynchronously.

            // -------------------- END  : EMBEDDINGS ------------
        } else if (requestObj.action === 'popupWantsContent') {
            // -------------------- BEGIN: POPUP WANTS CONTENT ------------

            // The popup wants the current page content.  Request the
            //  current content from the content script.
            console.log(`BACKGROUND SCRIPT: requesting content from the active tab.`);

            const requestObj =
                {
                    action: 'grabContent'
                }

            // Get the active tab.
            //
            // Since we create the popup ourselves, we need to exclude
            //  the popup window, which is the current window, from
            //  the query list.
            // chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            chrome.tabs.query({active: true, windowType: "normal"}, (tabs) => {
                if (!tabs || !Array.isArray(tabs) || tabs.length < 1) {
                    const errMsg = `BACKGROUND SCRIPT: No active tab found during grabContent request.`;

                    // Let the caller know there is no active tab to
                    //  grab content from.
                    const msgObj =
                        {
                            type: 'relayedContentUnavailable',
                            text: errMsg
                        }

                    // Log the error.
                    console.error(errMsg);

                    chrome.runtime.sendMessage(msgObj)
                } else {
                    const activeTab = tabs[0];

                    if (!activeTab)
                        throw new Error(`BACKGROUND SCRIPT: The activeTab variable is unassigned.`);

                    const tabTitle =
                        isEmptySafeString(activeTab.title)
                            ? '(active tab does not have a title)'
                            : activeTab.title;

                    console.log(`BACKGROUND SCRIPT: Request page content for tab: ${activeTab.title}`);

                    // Send a message to the active tab
                    chrome.tabs.sendMessage(
                        activeTab.id,
                        requestObj,
                        (response) => {
                            if (chrome.runtime.lastError) {
                                // -------------------- BEGIN: SEND MESSAGE ERROR ------------

                                const errMsg =
                                    `BACKGROUND SCRIPT: Failed to communicate with the content script: ${chrome.runtime.lastError.message}`;

                                // Let the caller know we could not grab the content
                                //  using an asynchronously sent message, instead of
                                //  returning it via this callback function.
                                const msgObj =
                                    {
                                        type: 'relayedContentUnavailable',
                                        text: errMsg
                                    }

                                // Log the error.
                                console.error(errMsg);

                                chrome.runtime.sendMessage(msgObj);

                                // -------------------- END  : SEND MESSAGE ERROR ------------
                            } else {
                                // -------------------- BEGIN: PROCESS SEND MESSAGE RESPONSE ------------

                                // Check the response.  It should contain
                                //  a stringified content object.
                                if (response === null || response === '' || typeof response !== 'object') {
                                    // Failed.  Notify the sender.
                                    const errMsg =
                                        'Content script returned an empty or invalid response.';

                                    // Let the caller know we could not grab the content
                                    //  using an asynchronously sent message, instead of
                                    //  returning it via this callback function.
                                    const msgObj =
                                        {
                                            type: 'relayedContentUnavailable',
                                            text: errMsg
                                        }

                                    // Log the error.
                                    console.error(errMsg);

                                    chrome.runtime.sendMessage(msgObj);
                                } else {
                                    // Success.  Pass the received content on to the
                                    //  popup.
                                    const msgObj =
                                        {
                                            type: 'relayedContentGrabbed',
                                            text: response
                                        }

                                    console.log(`BACKGROUND SCRIPT: Sending relayed content to POPUP.`);

                                    chrome.runtime.sendMessage(msgObj);
                                }

                                // -------------------- END  : PROCESS SEND MESSAGE RESPONSE ------------
                            }
                        });
                }
            });

            // -------------------- END  : POPUP WANTS CONTENT ------------
        } else if (requestObj.action === 'popupWantsToClose') {
            console.log(`BACKGROUND SCRIPT: Received action: ${requestObj.action}`);

            closePopup();

        } else if (requestObj.action === 'retrieveBookmark_async') {
            // -------------------- BEGIN: RETRIEVE BOOKMARK ------------
            bIsAsyncResponse = true;

            console.log(`BACKGROUND SCRIPT: Received action: ${requestObj.action}`);

            // Do not allow nested RETRIEVE BOOKMARK calls.
            if (bIsRetrieveBookmarkInProgress) {
                console.warn('BACKGROUND SCRIPT: Nested retrieve-bookmark call ignored.')

                sendResponse(false); // Let the message sender know the operation failed.
            } else {
                try {
                    console.log('BACKGROUND SCRIPT: Beginning retrieve-bookmark operation.')

                    const requestedUrlToSrcPage = requestObj.urlToSrcPage;

                    // We must have a valid URL to the page we are requesting
                    //  a bookmark for.
                    if (isEmptySafeString(requestedUrlToSrcPage))
                        throw new Error(`BACKGROUND SCRIPT: The requested URL to the source page field is empty.`);

                    // Set the busy flag.
                    bIsRetrieveBookmarkInProgress = true;

                    // Retrieve the bookmark.
                    g_BookmarkDbLiaisonObj.retrieveBookmark_async(requestedUrlToSrcPage)
                        .then(result => {
                            // SUCCESS
                            console.info(CONSOLE_CATEGORY, `retrieve-bookmark operation SUCCEEDED.`);

                            // Send the stringified result if a bookmark was found
                            //  or FALSE if it was not.
                            if (result === null) {
                                console.info(CONSOLE_CATEGORY, `Responding to caller with FALSE because no bookmark was found with URL: ${requestedUrlToSrcPage}.`);

                                sendResponse(false);
                            } else {
                                console.info(CONSOLE_CATEGORY, `Responding to caller with an existing bookmark record fo URL: ${requestedUrlToSrcPage}.`);

                                sendResponse(JSON.stringify(result));
                            }

                            // Clear the busy flag.
                            bIsRetrieveBookmarkInProgress = false;
                        })
                        .catch(err => {
                            const errMsg = conformErrorObjectMsg(err);
                            console.info(CONSOLE_CATEGORY, `retrieve-bookmark operation failed.  Details:\n${errMsg}`);

                            sendResponse(false); // Let the message sender know the operation failed.

                            // Clear the busy flag.
                            bIsRetrieveBookmarkInProgress = false;
                        });
                } catch (err) {
                    const errMsg = conformErrorObjectMsg(err);

                    console.info(CONSOLE_CATEGORY, `retrieve-bookmark operation failed.  Details:\n${errMsg}`);

                    sendResponse(false); // Let the message sender know the operation failed.

                    // Clear the busy flag.
                    bIsRetrieveBookmarkInProgress = false;
                }
            }

            // -------------------- END  : RETRIEVE BOOKMARK ------------
          } else if (requestObj.action === 'addBookmark_async') {
            // -------------------- BEGIN: ADD BOOKMARK ------------

            console.log(`BACKGROUND SCRIPT: Received action: ${requestObj.action}`);

            // Do not allow nested add bookmark calls.
            if (bIsAddBookmarkInProgress) {
                console.warn('BACKGROUND SCRIPT: Nested add-bookmark call ignored.')

                sendResponse(false); // Let the message sender know the operation failed.
            } else {
                bIsAsyncResponse = true; // Tell the caller we will send the response asynchronously.

                try {
                    console.log('BACKGROUND SCRIPT: Beginning add-bookmark operation.')

                    // Set the busy flag.
                    bIsAddBookmarkInProgress = true;

                    // We should have received a stringified bookmark record object.
                    //  Parse it now to a prototype-less bookmark record
                    //  object, without the embeddings.  If the embeddings
                    //  field is filled in, it will be ignored since we
                    //  handle that here.
                    const bookmarkRecordObj =
                        BookmarkRecord.fromString(requestObj.message);

                    g_BookmarkDbLiaisonObj.addBookmark_async(bookmarkRecordObj)
                        .then(result => {
                            // SUCCESS
                            console.info(CONSOLE_CATEGORY, `add-bookmark operation SUCCEEDED.`);

                            // Send the result of the operation back to the message
                            //  sender.
                            sendResponse(result);

                            // Clear the busy flag.
                            bIsAddBookmarkInProgress = false;
                        })
                        .catch(err => {
                            const errMsg = conformErrorObjectMsg(err);
                            console.info(CONSOLE_CATEGORY, `add-bookmark operation failed.  Details:\n${errMsg}`);

                            sendResponse(false); // Let the message sender know the operation failed.

                            // Clear the busy flag.
                            bIsAddBookmarkInProgress = false;
                        });
                } catch (err) {
                    const errMsg = conformErrorObjectMsg(err);

                    console.info(CONSOLE_CATEGORY, `add-bookmark operation failed.  Unable to recover the bookmark record object from the requestObj.  Details:\n${errMsg}`);

                    sendResponse(false); // Let the message sender know the operation failed.

                    // Clear the busy flag.
                    bIsAddBookmarkInProgress = false;
                }
            }

            // -------------------- END  : ADD BOOKMARK ------------
        } else if (requestObj.action === 'semanticSearchBookmarks_async') {
            // -------------------- BEGIN: SEMANTIC BOOKMARK SEARCH ------------

            console.log(`BACKGROUND SCRIPT: Received action: ${requestObj.action}`);

            try {
                // We should have received a query and an N best value.
                if (isEmptySafeString(requestObj.query))
                    throw new Error(`The requestObj.query property is empty or invalid.`);

                if (!Number.isSafeInteger(requestObj.nBest) || requestObj.nBest < 1)
                    throw new Error(`The requestObj.nBest must be an integer greater than or equal to 1.  Value given: ${requestObj.nBest}`);

                // If there are no bookmarks yet to search, send
                //  the response of FALSE to let the popup script know that.
                if (g_BookmarkDbLiaisonObj.isEmptyBookmarksCollection()) {
                    sendResponse(false);
                } else {
                    bIsAsyncResponse = true; // Tell the caller we will send the response asynchronously.

                    // Start the search, but push the execution context
                    //  out of this message handler.
                    setTimeout(async () => {
                        try {
                            let awaitErrMsg = '(none)';
                            let bErrorOccurred = false;

                            const result =
                                await g_BookmarkDbLiaisonObj.semanticSearchBookmarks_async(
                                    requestObj.query,
                                    requestObj.nBest)
                                    .catch(err => {
                                        bErrorOccurred = true;

                                        awaitErrMsg = conformErrorObjectMsg(err);
                                        console.info(CONSOLE_CATEGORY, `Semantic bookmark search operation failed.  Details:\n${awaitErrMsg}`);
                                    });

                            if (bErrorOccurred) {
                                // Let the catch block handle it.
                                throw new Error(awaitErrMsg);
                            } else {
                                // The result should be an array of bookmark record objects (BookmarkRecord[])
                                if (!Array.isArray(result))
                                    throw new Error(`The result variable value is not an array.`);
                                if (result.length < 1)
                                    throw new Error(`The result array is empty`);

                                // SUCCESS
                                console.info(CONSOLE_CATEGORY, `Semantic bookmark search completed successfully.  Broadcasting results to the popup script.`);

                                // Send the results of the operation to the popup
                                //  script, asynchronously over the "message" bridge.
                                const messageObj =
                                    {
                                        type: 'bookmarkSearchResults',
                                        message: `Bookmark search completed successfully`,
                                        bookmark_search_results_str: JSON.stringify(result),
                                        user_query: requestObj.query
                                    }

                                chrome.runtime.sendMessage(messageObj);
                            }
                        } catch(err) {
                            const errMsg = conformErrorObjectMsg(err);
                            // Send the error to the popup script.
                            const messageObj =
                                {
                                    type: 'bookmarkSearchResultsError',
                                    message: `(setTimeout) Semantic bookmark search operation failed. Details:\n${errMsg}`
                                }

                            sendResponse(messageObj);
                        }
                    }, 100);
                }
            } catch (err) {
                const errMsg = conformErrorObjectMsg(err);

                // Send the error to the popup script.
                const messageObj =
                    {
                        type: 'bookmarkSearchResultsError',
                        message: `Semantic bookmark search operation failed. Details:\n${errMsg}`
                    }

                sendResponse(messageObj);
            }

            // -------------------- END  : SEMANTIC BOOKMARK SEARCH ------------
        } else {
            console.warn(`BACKGROUND SCRIPT: Received REQUEST action: ${requestObj.action}`);
        }

        // -------------------- END  : PROCESS ACTION REQUEST ------------
    } else {
        // -------------------- BEGIN: HANDLE MESSAGE ------------

        if (message.type === 'embeddings') {
            // -------------------- BEGIN: EMBEDDINGS ------------

            // Run model prediction asynchronously
            (async function () {
                // Perform embeddings call on the given text.
                // let result = await classify(message.text);
                let result = await getEmbeddings_async(message.text);

                // Send response back to UI
                sendResponse(result);
            })();

            bIsAsyncResponse = true; // Tell the caller we will send the response asynchronously.

            // -------------------- END  : EMBEDDINGS ------------
        } else if (message.type === 'contentScriptReady') {
            // -------------------- BEGIN: CONTENT IS READY ------------

            console.log(`BACKGROUND SCRIPT: Received MESSAGE type: ${message.type}`);

            // Copy the broadcast to the popup script.
            const messageObj =
                {
                    type: "relayedContentScriptIsReady",
                    message: "Notifying popup script that the content script is ready."
                }

            chrome.runtime.sendMessage(messageObj);

            console.log(`BACKGROUND SCRIPT: message rebroadcast for popup script's benefit: ${message.type}`);

            // -------------------- END  : CONTENT IS READY ------------
        } else if (message.type === 'relayedContentScriptIsReady') {
            // -------------------- BEGIN: (RELAYED) CONTENT IS READY ------------

            // This block is solely for ignoring our rebroadcast
            //  of the content is ready message, so the "unknown
            //  action" ELSE block below doesn't throw an error.
            console.log(`BACKGROUND SCRIPT: Received MESSAGE type: ${message.type}`);

            console.log(`BACKGROUND SCRIPT: Ignoring our rebroadcast/relayed content is ready message: ${message.type}`);

            // -------------------- END  : (RELAYED) CONTENT IS READY ------------
        } else if (message.type === 'popupScriptReady') {
            // -------------------- BEGIN: POPUP IS READY ------------

            console.log(`BACKGROUND SCRIPT: Received action: ${message.type}`);

            // Copy the broadcast to the content script.
            const messageObj =
                {
                    type: "relayedPopupScriptIsReady",
                    message: "Notifying content script that the popup script is ready."
                }

            chrome.runtime.sendMessage(messageObj);

            console.log(`BACKGROUND SCRIPT: message rebroadcast for popup script's benefit: ${message.type}`);

            // -------------------- END  : POPUP IS READY ------------
        } else if (message.type === 'relayedPopupScriptIsReady') {
            // -------------------- BEGIN: (RELAYED) POPUP IS READY ------------

            // This block is solely for ignoring our rebroadcast
            //  of the popup is ready message, so the "unknown
            //  action" ELSE block below doesn't throw an error.
            console.log(`BACKGROUND SCRIPT: Received MESSAGE type: ${message.type}`);

            console.log(`BACKGROUND SCRIPT: Ignoring our rebroadcast/relayed popup is ready message: ${message.type}`);

            // -------------------- END  : (RELAYED) POPUP IS READY ------------
        } else {
            console.warn(`BACKGROUND SCRIPT: Received unknown MESSAGE type: ${message.type}`);
        }

        // -------------------- END  : HANDLE MESSAGE ------------
    }

    return bIsAsyncResponse;
});
//////////////////////////////////////////////////////////////

// -------------------- BEGIN: INITIALIZE BOOKMARKS LIAISONS ------------

const g_BookmarkDbLiaisonObj = new BookmarksDbLiaison();

console.info(CONSOLE_CATEGORY, `Initializing bookmark liaison.`);

await g_BookmarkDbLiaisonObj.initializeBookmarkCache();

console.info(CONSOLE_CATEGORY, `Bookmark liaison initialized.`);

// -------------------- END  : INITIALIZE BOOKMARKS LIAISONS ------------