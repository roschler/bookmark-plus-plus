
// Main script for Bookmark++ popup.

import {BookmarkRecord} from "./indexed-db/bookmark-record.js";
import {doReadyCheck} from "./ready-check.js";
import {conformErrorObjectMsg, isNonNullObjectAndNotArray, substituteWithoutEval} from "./misc.js";
import {prettyPrintBookmarkSearchResults, prettyPrintLlmAnswer} from "./text-formatting-helpers.js";

// Lock flag to prevent duplicate initialize application calls.
let bIsInitializing = false;
let bIsInitialized = false;

// This flag lets the page code know if the current page
//  had an existing bookmark, or not, when the popup page
//  loaded.
let g_bIsExistingBookmark = false;

let timeout;

// This is the default NBEST value for a bookmarks search.
const DEFAULT_BOOKMARKS_SEARCH_NBEST = 30;

// -------------------- BEGIN: LLM PROMPTS ------------

// This is the prompt used with the RAG/LLM operation
//  that happens when the user searches their bookmarks.
let g_PromptBookmarkSearchResults = "";

// -------------------- END  : LLM PROMPTS ------------

// -------------------- BEGIN: BookmarksDatabaseBridge ------------

// This class is the POPUP context interface to the
//  bookmark records "exposed" methods.  The bridge
//  is comprised of send-message + on-message-handler
//  tech.

export class BookmarksDatabaseBridge {
    /**
     * Ask the service worker to add a new bookmark.
     *
     * @param {BookmarkRecord} bookmarkRecordObj - A
     *  valid bookmark record object.
     *
     * @return {Promise<boolean>} - Returns TRUE if
     *  the operation succeeded, throws an error if
     *  not.
     */
    async addBookmark_async(bookmarkRecordObj) {
        const methodName = 'BookmarksDatabaseBridge' + '::' + `addBookmark_async`;
        const errPrefix = '(' + methodName + ') ';

        if (typeof bookmarkRecordObj === 'undefined'
            || !(bookmarkRecordObj instanceof BookmarkRecord))
            throw new Error(`${errPrefix}The value in the bookmarkRecordObj parameter is not a BookmarkRecord object.`);

        return new Promise((resolve, reject) => {
            try {
                // Prepare the message to send.
                const requestObj =
                    {
                        action: "addBookmark_async",
                        message: bookmarkRecordObj.toString()
                    }

                // Send message to the service worker.
                chrome.runtime.sendMessage(
                    requestObj,
                    (response) => {
                        if (chrome.runtime.lastError) {
                            // ERROR: Handle runtime errors during message transmission.
                            reject(new Error(`${errPrefix}Failed to communicate with the service worker: ${chrome.runtime.lastError.message}`));
                        } else {
                            // Check the response.
                            if (response === true) {
                                // SUCCESS
                                resolve(true);
                            } else {
                                reject(new Error(`${errPrefix}The service worker did not return a success code.`));
                            }
                        }
                    });
            } catch (error) {
                // Catch and handle any synchronous errors.
                reject(error);
            }
        });
    }

    /**
     * Ask the background script to execute a semantic search
     *  against the bookmark records using the given array
     *  of embedding codes.  NOTE: The background script
     *  will return the result asynchronously over the
     *  "message" bridge.
     *
     * @param {String} query - The query string to use for the search.
     * @param {Number} nBest - The number of matches to keep from a search.
     *  Values larger than MAX_NBEST are not allowed (see header
     *  notes).
     *
     * @returns {Promise<Boolean>} - Returns TRUE if the background
     *  script tells us that the search has begun, or FALSE if there
     *  are no bookmarks yet to search.
     */
    async requestSemanticBookmarkSearch_async(query, nBest = 30) {
        const methodName = 'BookmarksDatabaseBridge' + '::' + `requestSemanticBookmarkSearch_async`;
        const errPrefix = '(' + methodName + ') ';

        if (isEmptySafeString(query))
            throw new Error(`${errPrefix}The query parameter is empty or invalid.`);

        if (!Number.isSafeInteger(nBest) || nBest < 1)
            throw new Error(`${errPrefix}The nBest parameter must be a positive integer greater than or equal to 1.  Value given: ${nBest}`);

        return new Promise((resolve, reject) => {
            try {
                // Prepare the message to send.
                const requestObj = (
                    {
                        action: "semanticSearchBookmarks_async",
                        query: query,
                        nBest: nBest
                    }
                );

                // Send message to the service worker.
                chrome.runtime.sendMessage(
                    requestObj,
                    (response) => {
                        if (chrome.runtime.lastError) {
                            // Handle runtime errors during message transmission.
                            reject(new Error(`${errPrefix}Failed to communicate with the service worker: ${chrome.runtime.lastError.message}`));
                            return;
                        }

                        // Check the response.
                        if (response === null || response === '' || typeof response !== 'string') {
                            reject(new Error('Service worker returned an invalid or empty response.'));
                        } else {
                            // We should have received a TRUE if the search has begun, or FALSE if there are no bookmarks to search yet.
                            if (response === "true")
                                resolve(true);
                            else if (response === "false")
                                resolve(false)
                            else
                                // The background script most likely returned an
                                //  error message.
                                throw new Error(`${errPrefix}The background script returned the following error in response to our search bookmarks request: ${response}`);
                        }
                    });
            } catch (error) {
                // Catch and handle any synchronous errors.
                reject(error);
            }
        });
    }
}

// We need an instance of the database bridge for our work.
const g_BookmarksDatabaseBridge = new BookmarksDatabaseBridge();

// -------------------- END  : BookmarksDatabaseBridge ------------



// Debugging duplicate popup instantiation problem.
if (bIsInitializing) {
    console.log('POPUP SCRIPT: Ignoring duplicate popup script load attempt:', new Date().toISOString());
} else {
    console.log('POPUP SCRIPT: Popup script loading:', new Date().toISOString());

    bIsInitializing = true;

    const DEFAULT_TOPK_VALUE = 9; // = 9;
    const DEFAULT_NANO_TEMPERATURE_VALUE = 1 // = 1;

    const bVerbose_popup = false;

// The maximum number of words to use per chunk.  We need to
//  use a value that will in all cases result in a token count
//  less than MAX_TOKEN_COUNT_FOR_SUMMARIZER.
    const MAX_WORDS_PER_CHUNK = 600;

// The current maximum token count for Gemini Nano is 1024.
    const MAX_TOKEN_COUNT_FOR_SUMMARIZER = 1000;

// Track the number of add bookmark calls we make.
    let numAddBookmarkCalls = 0;

// One of the clear signs of a "noise" chunk is when
//  the word count to token count ratio is too low.  This
//  is the minimum ratio we will tolerate before tossing
//  out a "noise" chunk, which is typically something
//  like a footnotes section, etc.  The industry
//  rule of thumb is 0.7, so we use 0.4 to be
//  somewhat tolerant of outlier text yet still
//  filter out "noise" text.
    const MIN_WORD_COUNT_TO_TOKEN_COUNT_RATIO = 0.4;

    // let session_prompt = null;
    const bUsePromptApi = true;

    console.log(`POPUP SCRIPT: Top of popup script module...`);

// Summary generation busy flag.
    let bIsSummaryGenerating = false;

// Bookmark search generation busy flag.
    let bIsBookmarkSearchInProgress = false;

// The summary of the summaries will be put here when it is
//  generated.
    let summaryOfTheSummaries = null;

// This is the URL received from the content script, for the
//  page we are bookmarking.
    let urlToSrcPage = null;

    /**
     * Returns a string representation of the given object, with
     * null and undefined being returned as the empty string.
     *
     * @param {*} obj The object to convert.
     *
     * @return {string} A string representation of the {@code obj}.
     */
    function makeStringSafe(obj) {
        if (typeof obj == 'undefined' || obj == null)
            return '';

        return String(obj);
    }

    /**
     * Checks if a string is empty or contains only whitespaces.
     * @param {string} str The string to check.
     * @return {boolean} Whether {@code str} is empty or whitespace only.
     */
    function isEmptyOrWhitespaceString(str) {
        // testing length == 0 first is actually slower in all browsers (about the
        // same in Opera).
        // Since IE doesn't include non-breaking-space (0xa0) in their \s character
        // class (as required by section 7.2 of the ECMAScript spec), we explicitly
        // include it in the regexp to enforce consistent cross-browser behavior.
        return /^[\s\xa0]*$/.test(str);
    }

    /**
     * Checks if a string is null, undefined, empty or contains only whitespaces.
     * @param {*} str The string to check.
     * @return {boolean} Whether {@code str} is null, undefined, empty, or
     *     whitespace only.
     */
    function isEmptySafeString(str) {
        return isEmptyOrWhitespaceString(makeStringSafe(str));
    }

    /**
     * Send a "remote" (non-content script) request for the
     *  active page content to the background script.
     */
    function requestContentFromContentScript(callerId) {

        if (isEmptySafeString(callerId))
            throw new Error(`The callerId parameter is empty or invalid.`);

        const requestObj = {
            action: 'popupWantsContent'
        }

        console.log(`POPUP SCRIPT: Requesting active page content from the content script: "popupWantsContent".  CallerId: ${callerId}.`);

        chrome.runtime.sendMessage(requestObj);
    }

    /**
     * Hides the spinner element by adding the 'hidden' class.
     */
    function hideSpinner() {
        const spinner = document.getElementById('spinner');
        spinner.classList.add('hidden');
    }

    /**
     * Shows the spinner element by removing the 'hidden' class.
     *
     * @param {String} msg - The message to show next to the spinner.
     */
    function showSpinner(msg) {
        const errPrefix = `(showSpinner) `;

        if (isEmptySafeString(msg))
            throw new Error(`${errPrefix}The msg parameter is empty or invalid.`);

        const spinner = document.getElementById('spinner');
        spinner.classList.remove('hidden');

        setSpinnerMessage(msg);
    }

    /**
     * Maximum character count allowed for the input text.
     * This limit is based on the underlying model's token limit.
     * @constant {number}
     */
    const MAX_MODEL_CHARS = 4000;

    /**
     *
     * @param elementId
     * @return {HTMLElement} - Returns the DOM element with the specified
     *  ID, or throws an error if no element can be found.
     */
    function findDomElementOrDie(elementId) {
        const errPrefix = `(findDomElementOrDie) `;

        if (isEmptySafeString(elementId))
            throw new Error(`${errPrefix}The elementId parameter is empty or invalid.`);

        const domElement = document.querySelector(elementId);

        if (!domElement)
            throw new Error(`${errPrefix}Unable to find a DOM element with element ID: "${elementId}"`);

        return domElement;
    }

// Element references
    // -------------------- BEGIN: SELECTORS ------------

    // -------------------- BEGIN: GLOBAL SELECTORS (outside tabs) ------------


    const spinnerSpanSelector = findDomElementOrDie('#spinner-message-span');

    // -------------------- END  : GLOBAL SELECTORS (outside tabs) ------------


    // -------------------- BEGIN: ADD BOOKMARK (summarize) ------------

    const inputTextAreaSelector = findDomElementOrDie('#input');
    const summaryTypeSelectSelector = findDomElementOrDie('#type');
    const summaryFormatSelectSelector = findDomElementOrDie('#format');
    const summaryLengthSelectSelector = findDomElementOrDie('#length');
    const characterCountSpanSelector = findDomElementOrDie('#character-count');
    const characterCountExceededSpanSelector = findDomElementOrDie('#character-count-exceed');
    const summarizationUnsupportedDialogSelector = findDomElementOrDie('#summarization-unsupported');
    const summarizationUnavailableDialogSelector = findDomElementOrDie('#summarization-unavailable');
    const summaryTextSelector = findDomElementOrDie('#summary-text');
    const pageTitleSelector = findDomElementOrDie('#page_title');
    const userNoteSelector = findDomElementOrDie('#user_note');

    // -------------------- END  : ADD BOOKMARK (summarize) ------------

    // -------------------- BEGIN: SEARCH BOOKMARKS (selectors) ------------

    // The input element where the user types in their bookmarks
    //  search query.
    const searchQuerySelector = findDomElementOrDie('#search-query');

    // The text area for the LLM's response (Prompt API) to
    //  a user query.
    const llmAnswerSelector = findDomElementOrDie('#llm-answer-div-text');

    // The text area for the bookmarks (grounding attributions)
    //  from a bookmarks search.
    const searchResultsSelector = findDomElementOrDie('#search-results-div-text');

    // -------------------- END  : SEARCH BOOKMARKS ------------

    const doTaskButtonSelector = findDomElementOrDie('#do-task-btn')

    // -------------------- END  : SELECTORS ------------

    /**
     * Sets the text for the SPAN element we use to show
     *  status messages during an async operation.
     *
     * @param {String} msg - The message to show.
     */
    function setSpinnerMessage(msg) {
        const errPrefix = `(setSpinnerMessage) `;

        if (isEmptySafeString(msg))
            throw new Error(`${errPrefix}The msg parameter is empty or invalid.`);

        spinnerSpanSelector.textContent = msg;
    }

    // -------------------- BEGIN: ACTIVE TAB MANAGEMENT ------------

    let g_ActiveDivId = 'add-bookmark-container-div';

    function setActiveTab(containerDivId) {
        const errPrefix = `(setActiveTab) `;

        // Hide all container divs and remove "selected" from tab headers
        const allContainers = document.querySelectorAll(".tabbed-container-div");
        const allTabs = document.querySelectorAll(".tab-header-div");

        allContainers.forEach(container => {
            container.style.display = container.id === containerDivId ? "block" : "none";
        });

        allTabs.forEach(tab => {
            if (tab.getAttribute("data-target") === containerDivId) {
                tab.setAttribute("selected", "true"); // Add "selected" attribute to the active tab
            } else {
                tab.removeAttribute("selected"); // Remove "selected" attribute from inactive tabs
            }
        });

        // -------------------- BEGIN: SET DO TASK BUTTON TEXT ------------

        if (containerDivId === 'add-bookmark-container-div') {
            // -------------------- BEGIN: ADD BOOKMARK ------------

            doTaskButtonSelector.textContent =
                g_bIsExistingBookmark
                    ? 'ADD BOOKMARK'
                    : 'UPDATE BOOKMARK';
            doTaskButtonSelector.style.backgroundColor = "#007bff";

            // -------------------- END  : ADD BOOKMARK ------------
        } else if (containerDivId === 'search-bookmarks-container-div') {
            // -------------------- BEGIN: SEARCH BOOKMARKS ------------

            doTaskButtonSelector.textContent = 'SEARCH BOOKMARKS';

            doTaskButtonSelector.style.backgroundColor = "darkmagenta";

            // -------------------- END  : SEARCH BOOKMARKS ------------
        } else if (containerDivId === 'bulk-import-container-div') {
            // -------------------- BEGIN: BULK IMPORT ------------

            doTaskButtonSelector.textContent = 'BULK IMPORT';
            doTaskButtonSelector.style.backgroundColor = "brown";

            // -------------------- END  : BULK IMPORT ------------
        } else {
            // Unknown tab.
            throw new Error(`${errPrefix}We don't know how to handle an active tab ID of: ${containerDivId}`);
        }

        // -------------------- END  : SET DO TASK BUTTON TEXT ------------

        // Update the global active div ID
        g_ActiveDivId = containerDivId;
    }

    // -------------------- END  : ACTIVE TAB MANAGEMENT ------------

// -------------------- BEGIN: ADD BOOKMARK ------------

    /**
     * This function builds a bookmark records object, minus
     *  the embeddings array since the background script will
     *  generate those, for an add bookmark request to the
     *  background script.
     *
     * @return {Promise<void>}
     */
    async function doAddBookmark_async() {

        const errPrefix = `(doAddBookmark_async) `;

        // We must have a valid URL to the page being bookmarked.
        if (isEmptySafeString(urlToSrcPage))
            throw new Error(`The URL to the source page is empty.`);

        // Concatenate the page title, user note (if any), and
        //  summary of the summaries to create the bookmark text.
        const pageTitle = pageTitleSelector.value.trim();

        // The page title is mandatory.
        if (isEmptySafeString(pageTitle))
            throw new Error(`The page title is empty or invalid.`);

        // The user note is optional.
        const userNote = userNoteSelector.value.trim();

        // The summary of the summaries is mandatory.
        if (isEmptySafeString(summaryOfTheSummaries))
            throw new Error(`The summary of the summaries is empty or invalid.`);

        // Create a new bookmark records object.
        const bookmarkRecordObj =
            new BookmarkRecord(
                urlToSrcPage,
                pageTitle,
                summaryOfTheSummaries,
                userNote,
                // Background script will generate the embeddings
                //  for the concatenated text.
                null,
                // Background script will generate the embeddings
                //  for the title.
                null,
                // We are not using thumbnails at the moment to
                //  make searches faster (less memory usage).
                null
            );

        numAddBookmarkCalls++;

        console.info(`POPUP SCRIPT: Making REMOTE add-bookmark call #(${numAddBookmarkCalls})...`);

        // Make the request to the background script.
        const bResult =
            await g_BookmarksDatabaseBridge.addBookmark_async(bookmarkRecordObj);

        if (bResult) {
            alert('Done!');
        } else {
            console.error(`${errPrefix}The add-bookmark operation did not return a success code.`)
        }
    }

    /**
     * Handles the "ADD BOOKMARK" button click.
     *
     * If a summary is still generating (`bIsSummaryGenerating` is true),
     *  show an alert to the user and prevent further actions. Otherwise,
     *  call `doAddBookmark()` to perform the bookmark addition.
     *
     * The function uses a try/catch block to handle potential errors.
     *
     * @returns {Promise<boolean|null>} Returns FALSE if the summary
     *  is still generating, TRUE if the bookmark was successfully
     *  added, or NULL if an error occurred.
     */
    async function addBookmarkOrWaitWarning() {
        const errPrefix = `(addBookmarkOrWaitWarning) `;

        try {
            if (bIsSummaryGenerating) {
                alert("Please wait for the summary to finish generating.");
                return false;
            }

            await doAddBookmark_async();

            /*
            // Ask the background script to close the popup.
            // Prepare the message to send.
            const requestObj =
                {
                    action: "closePopup",
                    message: "Bookmark successfully added.  We are finished."
                }

            console.log(`POPUP SCRIPT:  Bookmark added.  Asking background script to close us (the popup).`);
             */

            return true;
        } catch (error) {
            console.error("An error occurred while adding the bookmark:", error);
            return null;
        }
    }

// -------------------- END  : ADD BOOKMARK ------------

    // -------------------- BEGIN: UPDATE ADD BOOKMARK TAB FROM BOOKMARK ------------

    /**
     * Given a bookmark object, update the appropriate UI elements
     *  on the ADD BOOKMARK tab to reflect its contents, and change
     *  the text on the ADD BOOKMARK button to UPDATE BOOKMARK. It
     *  also sets the g_bIsExistingBookmark flag to TRUE.
     *
     * @param {BookmarkRecord} bookmarkRecordObj - A valid
     *  bookmark record object.
     */
    function updateBookmarkTabFromObject(bookmarkRecordObj) {
        const errPrefix = `(updateBookmarkTabFromObject) `;

        if (typeof bookmarkRecordObj === 'undefined'
            || !(bookmarkRecordObj instanceof BookmarkRecord))
            throw new Error(`${errPrefix}The value in the bookmarkRecordObj parameter is not a BookmarkRecord object.`);

        //  Show the page title.
        pageTitleSelector.value = bookmarkRecordObj.pageTitle;

        // Show the user note.
        userNoteSelector.value = bookmarkRecordObj.userNote;

        // Show the summary text.
        summaryTextSelector.textContent = bookmarkRecordObj.summaryText;

        summaryOfTheSummaries = bookmarkRecordObj.summaryText;

        // Change the do-task button text to UPDATE BOOKMARK.
        doTaskButtonSelector.textContent = 'UPDATE BOOKMARK';

        // Set the flag.
        g_bIsExistingBookmark = true;
    }


    // -------------------- END  : UPDATE ADD BOOKMARK TAB FROM BOOKMARK ------------

// -------------------- BEGIN: SEARCH BOOKMARKS ------------

    /**
     * This function asks the background script to execute
     *  a bookmarks search.  The background script will
     *  send us the results asynchronously using the
     *  "message" protocol.
     *
     * @return {Promise<void>}
     */
    async function scheduleBookmarksSearch() {
        const errPrefix = `(scheduleBookmarksSearch) `;

        try {
            // -------------------- BEGIN: EXECUTE BOOKMARK SEARCH ------------

            // Set the busy flag.
            bIsBookmarkSearchInProgress = true;

            // Show the spinner.
            showSpinner(`Searching bookmarks...`);

            // Clear out old search results.
            llmAnswerSelector.textContent = '';
            searchResultsSelector.textContent = '';

            const searchQuery =
                searchQuerySelector.value;

            if (isEmptySafeString(searchQuery))
                throw new Error(`${errPrefix}The searchQuery variable is empty or invalid.`);

            // Make the request to the background script.
            // Prepare the message to send.
            const requestObj =
                {
                    action: "semanticSearchBookmarks_async",
                    message: "Bookmark search requested",
                    // The search query.
                    query: searchQuery.trim(),
                    // The maximum number of results to collect.
                    //  The results received may be less than
                    //  this if there were not enough matches.
                    nBest: DEFAULT_BOOKMARKS_SEARCH_NBEST
                }

            // Send message to the service worker.
            chrome.runtime.sendMessage(
                requestObj,
                (response) => {
                    if (chrome.runtime.lastError) {
                        // TODO: We are getting these errors intermittently
                        //  despite the bookmark search working properly.
                        //  So for now we only log the error, otherwise
                        //  it will overwrite the valid LLM answer.
                        /*
                        // ERROR: Show the error in the LLM answer box.
                        llmAnswerSelector.textContent =
                        `${errPrefix}Failed to communicate with the service worker: ${chrome.runtime.lastError.message}`;
                         */

                        console.warn(`${errPrefix}Failed to communicate with the service worker: ${chrome.runtime.lastError.message}`);

                        hideSpinner();
                    } else {
                        // Check the response.
                        if (response === true) {
                            llmAnswerSelector.textContent = `Waiting for search to complete...`;
                        } else if (response === false) {
                            // We don`t have any bookmarks yet to search.
                            llmAnswerSelector.textContent = `Please create some bookmarks first, so they can be searched.`;

                            hideSpinner();
                        } else {
                            // Assume it is an error response.  Just show it.
                            llmAnswerSelector.textContent = response;

                            hideSpinner();
                        }
                    }
                });
        } catch (err) {
            const errMsg = conformErrorObjectMsg(err);

            console.log(`${errPrefix}${errMsg}`);

            llmAnswerSelector.textContent = errMsg;

            hideSpinner();

            // Clear the busy flag.
            bIsBookmarkSearchInProgress = false;

            throw err;
        }
    }

// -------------------- END  : SEARCH BOOKMARKS ------------

    /**
     * Counts the number of space delimited words in a string.
     */
    function countWords(str) {

        if (typeof str !== 'string')
            throw new Error(`Invalid str parameter.  Not a string.`);

        return str.split(' ').length;
    }

    /**
     * Splits the input text into chunks of up to a specified number of words,
     * attempting not to split sentences when possible.
     *
     * If a sentence exceeds the maximum word limit, it will be split at the limit.
     *
     * @param {Object} sessionPrompt_summarize - A valid Prompt API object
     * @param {string} strText - The input text to be chunked.
     * @param {number} [numWordsPerChunk] - The maximum number of words per chunk.
     *
     * NOTE: The default is set to 700 words because currently the Chrome
     *  local LLM has a per-prompt limit of 1024 tokens.
     *
     * @returns {string[]} An array of text chunks.
     * @throws {Error} Throws an error if strText is not a non-empty string or if numWordsPerChunk is not a positive integer.
     */
    async function simpleChunkifyText(
        sessionPrompt_summarize,
        strText,
        numWordsPerChunk = MAX_WORDS_PER_CHUNK) {

        const errPrefix = `(simpleChunkifyText) `;

        if (typeof sessionPrompt_summarize !== 'object')
            throw new Error(`${errPrefix}The sessionPrompt_summarize  is not a valid object.`);

        // Validate input
        if (typeof strText !== 'string' || strText.trim() === '') {
            throw new Error("strText must be a non-empty string.");
        }

        if (!Number.isInteger(numWordsPerChunk) || numWordsPerChunk <= 0) {
            throw new Error("numWordsPerChunk must be an integer greater than zero.");
        }

        // Split text into sentences (includes punctuation)
        const sentenceRegex = /[^.!?]+[.!?]*/g;
        const sentences = strText.match(sentenceRegex);

        if (!sentences) return []; // Return an empty array if no sentences are found

        const chunks = [];
        let currentChunk = '';
        let currentWordCount = 0;
        let currentChunkNum = 0;

        // This function cleans up certain elements from web
        //  page text, like footnote related sub-text, etc.
        //  that greatly increase the token count of a chunk
        //  yet provide little value to a summary.
        //
        // NOTE: A negative side effect of removing BRACED
        //  content is that programming code will be removed,
        //  but given that at this time programming code
        //  frequently triggers an error from Gemini Nano
        //  regarding producing text in an "untested"
        //  language, it is an overall plus.
        function reduceTokenCount(chunkText) {
            // Validate that chunkText is a non-empty string, even after trimming
            if (typeof chunkText !== "string" || chunkText.trim() === "") {
                throw new Error("chunkText must be a non-empty string after trimming.");
            }

            // Static regex patterns for unwanted sub-strings
            const bracesRegex = /\{.*?\}/g;
            const squareBracketRegex = /\[.*?\]/g;
            const parenthesesRegex = /\(.*?\)/g;
            const multipleTabLfCr = /[\t\r\n]*\n{2}[\t\r\n]*/g;


            // Remove content encased in square brackets and parentheses
            const cleanedText = chunkText.replace(bracesRegex, "").replace(squareBracketRegex, "").replace(parenthesesRegex, "").replace(multipleTabLfCr, "");

            return cleanedText.trim();
        }

        // Add one chunk with token count check.
        async function addTheChunk(chunkTextIn, chunkNum) {
            if (isEmptySafeString(chunkTextIn))
                throw new Error(`(addTheChunk) The chunkTextIn parameter is empty or invalid.`);

            if (!Number.isSafeInteger(chunkNum) || chunkNum < 0)
                throw new Error(`(addTheChunk) The chunkNum parameter must be zero or a positive integer.  Value given: ${chunkNum}`);

            const wordCount = countWords(chunkTextIn);

            if (!Number.isSafeInteger(wordCount) || wordCount < 0)
                throw new Error(`(addTheChunk) The wordCount parameter must be zero or a positive integer.  Value given: ${wordCount} `);

            // Remove unnecessary text to reduce the token count.
            const chunkText = reduceTokenCount(chunkTextIn);

            // Make sure the chunk is not too long.
            console.log(`POPUP SCRIPT-addTheChunk: Counting tokens...`);

            const tokenCount =
                await sessionPrompt_summarize.countPromptTokens(chunkText);

            if (tokenCount < 1)
                throw new Error(`(addTheChunk) Received a zero token count value.`);

            // See if the chunk text fails the "noise" ratio check.
            const wordCountToTokenCountRatio = wordCount / tokenCount;

            if (wordCountToTokenCountRatio < MIN_WORD_COUNT_TO_TOKEN_COUNT_RATIO) {
                // Ignore the noisy chunk.
                console.log(`POPUP SCRIPT-addTheChunk: Ignoring NOISE chunk:\n ${chunkTextIn}`);
            } else {
                if (tokenCount > MAX_TOKEN_COUNT_FOR_SUMMARIZER)
                    throw new Error(`(addTheChunk) The current chunk length is too long(#${tokenCount}).  Maximum token count allowed: ${MAX_TOKEN_COUNT_FOR_SUMMARIZER}.`);

                console.log(`POPUP SCRIPT-addTheChunk: Token count: ${tokenCount}`);

                chunks.push(chunkText);

                currentChunkNum++;
            }
        }

        for (let i = 0; i < sentences.length; i++) {
            const sentence = sentences[i].trim();
            const sentenceWords = sentence.split(/\s+/);
            const sentenceWordCount = sentenceWords.length;

            // If the sentence itself is longer than numWordsPerChunk, split it
            if (sentenceWordCount > numWordsPerChunk) {
                let wordsProcessed = 0;
                while (wordsProcessed < sentenceWordCount) {
                    const wordsToAdd = sentenceWords.slice(wordsProcessed, wordsProcessed + numWordsPerChunk - currentWordCount);
                    currentChunk += (currentChunk ? ' ' : '') + wordsToAdd.join(' ');
                    currentWordCount += wordsToAdd.length;
                    wordsProcessed += wordsToAdd.length;

                    // If the current chunk reaches the limit, push it to chunks and reset
                    if (currentWordCount >= numWordsPerChunk) {
                        console.log(`Adding chunk #(${chunks.length}).  Length in words: ${countWords(currentChunk)}`)
                        await addTheChunk(currentChunk.trim(), currentChunkNum);
                        currentChunk = '';
                        currentWordCount = 0;
                    }
                }
                continue;
            }

            // Check if adding this sentence exceeds the word limit
            if (currentWordCount + sentenceWordCount > numWordsPerChunk) {
                // Push the current chunk to chunks and start a new chunk
                if (currentChunk) {
                    console.log(`Adding chunk #(${chunks.length}).  Length in words: ${countWords(currentChunk)}`)
                    await addTheChunk(currentChunk.trim(), currentChunkNum);
                }
                currentChunk = sentence;
                currentWordCount = sentenceWordCount;
            } else {
                // Add the sentence to the current chunk
                currentChunk += (currentChunk ? ' ' : '') + sentence;
                currentWordCount += sentenceWordCount;
            }
        }

        // Add any remaining text in the current chunk
        if (currentChunk) {
            console.log(`Adding chunk #(${chunks.length}).  Length in words: ${countWords(currentChunk)}`)
            await addTheChunk(currentChunk.trim(), currentChunkNum);
        }

        return chunks;
    }

    /**
     * Creates a summarization session. Downloads the model if necessary.
     *
     * @param {string} type - Type of summarization (e.g., 'short', 'detailed').
     * @param {string} format - Format for the summary (e.g., 'text', 'bullets').
     * @param {string} length - Desired length of the summary (e.g., 'short', 'long').
     * @param {Function} [downloadProgressCallback] - Optional callback for tracking download progress.
     * @returns {Promise<Object>} Resolves to the summarization session object.
     * @throws {Error} If AI summarization is not supported.
     */
    const createSummarizationSession = async (type, format, length, downloadProgressCallback) => {
        const canSummarize = await window.ai.summarizer.capabilities();
        if (canSummarize.available === 'no') {
            throw new Error('AI Summarization is not supported');
        }

        const summarizationSession = await window.ai.summarizer.create({type, format, length});
        if (canSummarize.available === 'after-download') {
            if (downloadProgressCallback) {
                summarizationSession.addEventListener('downloadprogress', downloadProgressCallback);
            }
            await summarizationSession.ready;
        }

        return summarizationSession;
    }

    /**
     * Summarize one chunk of text.
     *
     * @param {Object} sessionPrompt_summarize - A valid
     *  Prompt API object
     * @param {String} chunkText - The chunk of text to
     *  summarizer.
     * @param {Number} chunkNum - The ordinal chunk number
     *  for this chunk.
     *
     * @return {Promise<string>} - Returns the summary for the
     *  chunk of text.
     */
    async function doSummarizeOneChunk(
        sessionPrompt_summarize,
        chunkText,
        chunkNum) {
        const errPrefix = `(doSummarizeOneChunk) `;

        if (typeof sessionPrompt_summarize !== 'object')
            throw new Error(`${errPrefix}The sessionPrompt_summarize  is not a valid object.`);

        if (typeof chunkText !== 'string' || chunkText.length < 1)
            throw new Error(`The chunkText parameter is invalid or empty.`);

        if (!Number.isInteger(chunkNum) || chunkNum < 0)
            throw new Error(`The chunkNum parameter must be an integer greater than or equal to 0.`);

        // Create a summarization session.
        const session_summarize = await createSummarizationSession(
            summaryTypeSelectSelector.value,
            summaryFormatSelectSelector.value,
            summaryLengthSelectSelector.value,
        );

        console.log(`POPUP SCRIPT: Counting tokens...`);

        const tokenCount =
            await sessionPrompt_summarize.countPromptTokens(chunkText);

        if (tokenCount > MAX_TOKEN_COUNT_FOR_SUMMARIZER)
            throw new Error(`(doSummarizeOneChunk) The current chunk length is too long(#${tokenCount}).  Maximum token count allowed: ${MAX_TOKEN_COUNT_FOR_SUMMARIZER}.`);

        console.log(`POPUP SCRIPT: Token count: ${tokenCount}`);

        let chunkSummary = '';

        if (chunkText.length > 0) {
            if (bVerbose_popup)
                console.log(`Summarizing chunk #${chunkNum}:\n${chunkText}\n\n`);
            else
                console.log(`Summarizing chunk #${chunkNum}.  Chunk length: ${chunkText.length}\n`);

            chunkSummary = await session_summarize.summarize(chunkText);
        }

        session_summarize.destroy();

        return chunkSummary;
    }

    /**
     * Schedules the summarization process with a debounce delay.
     * Waits for the user to stop typing for 1 second before generating a summary.
     */
    function scheduleSummarization() {
        const errPrefix = `(scheduleSummarization) `;

        // If we have not initialized the page yet, then
        //  do not schedule summarization because the page
        //  may have an existing bookmark and in that context
        //  we will be called by the UI element event handlers
        //  when we load that content into the page elements.
        if (!bIsInitialized) {
            console.log(`${errPrefix}Ignoring call to schedule a summarization because we are in the page initialization phase.`);
            return;
        }

        try {
            clearTimeout(timeout);
            timeout = setTimeout(async () => {
                // -------------------- BEGIN: EXECUTE SUMMARY GENERATION PROCESS ------------

                const sessionPrompt_summarize =
                    await self.ai.languageModel.create({
                        temperature: Number(DEFAULT_NANO_TEMPERATURE_VALUE),
                        topK: Number(DEFAULT_TOPK_VALUE),
                    });

                // Set the busy flag.
                bIsSummaryGenerating = true;

                // Show the spinner.
                showSpinner('Generating summary, please wait...');

                summaryTextSelector.textContent = 'Generating summary...\n';

                // Chunkify the document text create an array of summaries from it.
                const arySummaries =
                    await doSummarize(
                        sessionPrompt_summarize,
                        inputTextAreaSelector.value,
                        (statusMsg) => {
                            summaryTextSelector.textContent += statusMsg;
                        });

                if (arySummaries.length < 1)
                    throw new Error(`The array of summaries is empty..`);

                summaryTextSelector.textContent = arySummaries.join(' ');

                //  Check for a length greater than 1.
                if (arySummaries.length <= 1) {
                    // No point in summarizing a single summary. The
                    //  single summary is the summary of the summaries.
                    summaryOfTheSummaries = arySummaries[0];
                } else {
                    const arySummaryOfTheSummaries = [];

                    // Now summarize the summaries.  Concatenate
                    //  the summary text.
                    for (let i = 0; i < arySummaries.length; i++) {
                        if (arySummaries[i].length > 0)
                            arySummaryOfTheSummaries.push(arySummaries[i]);
                    }

                    const summariesText =
                        arySummaryOfTheSummaries.join(' ');

                    summaryTextSelector.textContent +=
                        '\n\n==== SUMMARY OF THE SUMMARIES ====\n\n';

                    // Summarize the summaries.
                    const aryDerivativeSummaries =
                        await doSummarize(
                            sessionPrompt_summarize,
                            summariesText,
                            (statusMsg) => {
                                summaryTextSelector.textContent += statusMsg;
                            });

                    // Save it.
                    summaryOfTheSummaries = aryDerivativeSummaries.join('\n');

                    // -------------------- END  : EXECUTE SUMMARY GENERATION PROCESS ------------
                }

                // Display the summary of the summaries.
                // Replace the progress messages with the
                //  final overall summary.
                summaryTextSelector.textContent = summaryOfTheSummaries;

                // Clean up.
                console.log(`Summary of the summaries:\n${summaryOfTheSummaries}\n\n`);

                hideSpinner();

                // Clear the busy flag.
                bIsSummaryGenerating = false;
            }, 1000);
        } catch (err) {
            console.log(`Error during scheduleSummarization:\n${err}`);

            hideSpinner();

            // Clear the busy flag.
            bIsSummaryGenerating = false;

            throw err;
        }
    }


    /**
     * Summarize a text block.  Chunkify the text if necessary.
     *
     * @param {String} textToSummarize - The text to summarize.
     * @param {Function} funcStatusMessage - A function that
     *  will be called with status messages generated with
     *  during this summarization operation.
     * @param {Object} sessionPrompt_summarize - A valid Prompt
     *  API object
     *
     * @return {String[]} - Returns an array containing
     *  the summaries generated during the summarization
     *  operation.
     */
    async function doSummarize(
        sessionPrompt_summarize,
        textToSummarize,
        funcStatusMessage) {
        const errPrefix = `(doSummarize) `;

        if (typeof sessionPrompt_summarize !== 'object')
            throw new Error(`${errPrefix}The sessionPrompt_summarize  is not a valid object.`);
        if (typeof textToSummarize !== 'string' || textToSummarize.length < 0)
            throw new Error(`The textToSummarize input parameter is empty or invalid.`);
        if (typeof funcStatusMessage !== 'function')
            throw new Error(`The value in the funcStatusMessage parameter is not a function.`);

        const totalNumWordsToSummarize = countWords(textToSummarize);

        funcStatusMessage(`Total number of words to summarize: ${totalNumWordsToSummarize}\n\n`)

        const aryChunks =
            await simpleChunkifyText(
                sessionPrompt_summarize, textToSummarize);

        console.info(`aryChunks object:`);
        console.dir(aryChunks, {depth: null, colors: true});

        funcStatusMessage(`Number of chunks to process: ${aryChunks.length}...\n`);

        // This array will accumulate the summaries across chunks.
        const arySummaries = [];

        for (let i = 0; i < aryChunks.length; i++) {
            const chunkText = appendPeriodIfNoEosChar(aryChunks[i]);

            if (chunkText.length > 0) {
                let statusMsg = null;

                if (bVerbose_popup)
                    statusMsg = `Summarizing chunk #${i}:\n${chunkText}\n\n`;
                else
                    statusMsg = `Summarizing chunk #${i}.  Chunk length: ${chunkText.length}\n`;

                funcStatusMessage(statusMsg);
                const chunkSummary = await doSummarizeOneChunk(sessionPrompt_summarize, chunkText, i);

                if (chunkSummary.length > 0) {
                    arySummaries.push(appendPeriodIfNoEosChar(chunkSummary) + '\n');
                }

                funcStatusMessage(`Summarized chunk #${i}.  Number of words: ${chunkText.length}...\n`);
            }
        }

        return arySummaries;
    }

    // This function appends a period (".")
    //  to a string, but only if it does not already end
    //  with an end-of-sentence-character character.
    function appendPeriodIfNoEosChar(str) {
        const strTrimmed = str.trim();

        return /[.!?]$/.test(strTrimmed) ? strTrimmed : strTrimmed + '.';
    }

    /**
     * Load one of our LLM prompts for the Prompt API.
     *
     * @param {String} promptPrimaryFilename - The
     *  name of the prompt file to load from the
     *  "prompts" directory.
     *
     * @return {Promise<String>} - Returns the
     *  contents of the prompt text file on success,
     *  or throws an error if no prompt file with the given
     *  name could be found in the "prompts"
     *  directory.
     */
    async function loadPromptFile(promptPrimaryFilename) {
        const errPrefix = `(loadPromptFile) `;

        if (isEmptySafeString(promptPrimaryFilename))
            throw new Error(`${errPrefix}The promptPrimaryFilename parameter is empty or invalid.`);

        const fileUrl = chrome.runtime.getURL(`prompts/${promptPrimaryFilename.trim()}`);

        try {
            const response = await fetch(fileUrl);

            if (!response.ok) {
                throw new Error(`Failed to load file using prompt file name: ${promptPrimaryFilename}\nDetails: ${response.statusText}`);
            }

            const promptFileText =
                await response.text();

            console.log(`Prompt file loaded successfully: ${promptPrimaryFilename}`);

            return promptFileText;
        } catch (error) {
            const conformedErrMsg = conformErrorObjectMsg(error);

            const errMsg = `Error trying to load file using prompt file name: ${promptPrimaryFilename}\nDetails: ${conformedErrMsg}`;

            console.error(errMsg);

            throw error;
        }
    }

    /**
     * Initializes the application.
     * Checks the availability of the Summarization API, and sets up event listeners
     * for summarizing the text added to the input textarea.
     * If the API is unavailable or unsupported, it displays relevant dialogs.
     */
    const initializeApplication = async () => {
        // alert('Here');

        const summarizationApiAvailable = window.ai !== undefined && window.ai.summarizer !== undefined;

        console.log(`POPUP SCRIPT: InitializeApplication() called...`);

        if (!summarizationApiAvailable) {
            console.log(`POPUP SCRIPT: Showing summarization modal dialog...`);
            summarizationUnavailableDialogSelector.showModal();
            return;
        }

        const canSummarize = await window.ai.summarizer.capabilities();
        if (canSummarize.available === 'no') {
            summarizationUnsupportedDialogSelector.showModal();
            console.error(`POPUP SCRIPT: Summarization feature is not available...`);
            return;
        }

        // -------------------- BEGIN: EVENT LISTENERS FOR SUMMARIZATION UI CONTROLS ------------

        // Event listeners for UI controls
        summaryTypeSelectSelector.addEventListener('change', scheduleSummarization);
        summaryFormatSelectSelector.addEventListener('change', scheduleSummarization);
        summaryLengthSelectSelector.addEventListener('change', scheduleSummarization);

        inputTextAreaSelector.addEventListener('input', () => {
            // Update character count display
            characterCountSpanSelector.textContent = inputTextAreaSelector.value.length;
            if (inputTextAreaSelector.value.length > MAX_MODEL_CHARS) {
                characterCountSpanSelector.classList.add('tokens-exceeded');
                characterCountExceededSpanSelector.classList.remove('hidden');
            } else {
                characterCountSpanSelector.classList.remove('tokens-exceeded');
                characterCountExceededSpanSelector.classList.add('hidden');
            }
            scheduleSummarization();
        });


        // -------------------- END  : EVENT LISTENERS FOR SUMMARIZATION UI CONTROLS ------------

        /*
        // Ask the content script in the active tab
        //  to grab the YouTube transcript.
        // Find the active tab in the current window
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0].id) {
                // Send a message directly to the content script in the active tab
                chrome.tabs.sendMessage(tabs[0].id, { action: "grabTranscript", text: "Requesting video transcript." });
            }
        });

        // Create a connection with the active tab.
        document.addEventListener('DOMContentLoaded', () => {
            // Moved out of this event handler since race conditions
            //  lead to the connection being made when the content
            //  script is not fully loaded yet, leading to connection
            //  failures.
           // connectToActiveTab();
        });
        */

        // -------------------- BEGIN: LOAD LLM PROMPTS ------------

        console.log(`POPUP SCRIPT: Loading LLM prompt files.`);

        // Load the LLM prompt for bookmark search results.
        g_PromptBookmarkSearchResults = await loadPromptFile('prompt-bookmark-search-results.txt');

        // -------------------- END  : LOAD LLM PROMPTS ------------

        console.log(`POPUP SCRIPT: (initializeApplication) Application initialized.`);
        bIsInitialized = true;
    }

    /**
     * This function will execute the correct task based on which
     *  tab is currently active.
     *
     * @return {Promise<void>}.
     */
    async function doTaskForCurrentTab() {
        const errPrefix = `(doTaskForCurrentTab) `;

        if (g_ActiveDivId === 'add-bookmark-container-div') {
            // -------------------- BEGIN: ADD BOOKMARK ------------

            await addBookmarkOrWaitWarning();

            // -------------------- END  : ADD BOOKMARK ------------
        } else if (g_ActiveDivId === 'search-bookmarks-container-div') {
            // -------------------- BEGIN: SEARCH BOOKMARKS ------------

            // Make sure we have a search query.
            const testSearchQuery = searchQuerySelector.value;
            if (isEmptySafeString(testSearchQuery)) {
                alert('Please enter a search query first.');
            } else {
                await scheduleBookmarksSearch();
            }

            // -------------------- END  : SEARCH BOOKMARKS ------------
        } else if (g_ActiveDivId === 'bulk-import-container-div') {
            // -------------------- BEGIN: BULK IMPORT ------------

            alert(`Bulk import is not implemented  yet.`)
            // -------------------- END  : BULK IMPORT ------------
        } else {
            // Unknown tab.
            throw new Error(`${errPrefix}We don't know how to handle an active tab ID of: ${g_ActiveDivId}`);
        }
    }

    /**
     * This function processes the results of a bookmarks
     *  search operation and updates the search results
     *  tab appropriately.
     *
     * @param {Object} message - The message object received
     *  from the background script with the search results.
     *
     * @return {Promise<Boolean>} - This function returns
     *  a simple TRUE result.
     */
    async function processBookmarkSearchResults(message) {
        const errPrefix = `(processBookmarkSearchResults) `;

        if (!isNonNullObjectAndNotArray(message))
            throw new Error(`${errPrefix}The message parameter is not a valid object.`);

        showSpinner(`Processing bookmark search results...`);

        console.log(`${errPrefix} Processing received bookmark search results.`);

        // Recover the array of raw (prototype-less) bookmark
        //  record objects.
        const aryBookmarkRecordObjs_raw =
            JSON.parse(message.bookmark_search_results_str);

        if (!Array.isArray(aryBookmarkRecordObjs_raw))
            throw new Error(`${errPrefix}The RAW bookmark record objects array is not an array.`);

        // We must have the user query used for the search too.
        const userQuery = message.user_query;

        if (isEmptySafeString(userQuery))
            throw new Error(`${errPrefix}The user_query field is empty or invalid.`);

        console.log(`${errPrefix} Reconstituting bookmark record objects.`);

        // Reconstitute the bookmark record objects.
        const aryBookmarkRecordObjs = [];

        for (let ndx = 0; ndx < aryBookmarkRecordObjs_raw.length; ndx++) {
            const bookmarkRecordObj_raw =
                aryBookmarkRecordObjs_raw[ndx];

            aryBookmarkRecordObjs.push(BookmarkRecord.fromRaw(bookmarkRecordObj_raw));
        }

        if (aryBookmarkRecordObjs.length < 1) {
            llmAnswerSelector.textContent = `No matching bookmarks found.`;
        } else {
            // -------------------- BEGIN: PROMPT API CALL ------------

            // First, we need to "inject" the user query and
            //  concatenated array of page summary text elements
            //  into the prompt we give the Prompt API.

            console.log(`${errPrefix} Concatenating bookmark summaries.`);

            // Concatenate the page summary text elements.
            // Concatenate the page title, the user note,
            //  and the trimmed summaryText properties
            //  with "\n\n" as the separator to form the
            //  document we send the Prompt API for analysis.
            const documentText = aryBookmarkRecordObjs
                .map(record => {
                    // Ensure each record has a summaryText property and it's a string
                    if (!record || typeof record.summaryText !== 'string') {
                        throw new Error(`${errPrefix} Found a BookmarkRecord with an invalid summaryText property.`);
                    }

                    const bookmarkFullText =
                        `BOOKMARK: `
                        + record.pageTitle
                        + '\n'
                        + record.userNote
                        + '\n'
                    record.summaryText.trim(); // Trim the summaryText

                    /*
                    STYLE: Grounding attributions

                    const bookmarkFullText =
                        'GROUNDING ATTRIBUTION ID: ' + record.pageTitle
                        + '\n'
                        + 'GROUNDING ATTRIBUTION TEXT: ' + record.userNote
                        + '\n'
                        record.summaryText.trim(); // Trim the summaryText
                     */

                    return bookmarkFullText;
                })
                .join("\n\n"); // Join with two line feeds

            // Insert the needed values into the full LLM prompt.
            const context = {
                userQuery: userQuery,
                documentText: documentText
            }

            let fullLlmPrompt =
                substituteWithoutEval(
                    g_PromptBookmarkSearchResults,
                    (varName) => {
                        return context[varName]
                    });

            let fullResponse = "";

            console.log(`${errPrefix} Executing Prompt API call.`);

            showSpinner(`Analyzing with Prompt API...`);

            // Create a new session each time so that previous
            //  searches don't interfere with new ones, since
            //  the Prompt API appears to have a memory (i.e. -
            //  it's probably "chat based", not "AQA based").
            //
            // Create a prompt session.
            console.log(`POPUP SCRIPT: Creating a PROMPT API session\nTOPK: ${DEFAULT_TOPK_VALUE}\nTEMPERATURE:\n${DEFAULT_NANO_TEMPERATURE_VALUE}.`);

            const oneshotSessionPrompt =
                await self.ai.languageModel.create({
                    temperature: Number(DEFAULT_NANO_TEMPERATURE_VALUE),
                    topK: Number(DEFAULT_TOPK_VALUE),
                });

            try {

                // Now pass the summaries to the Prompt API as
                //  grounding attributions to complete the RAG/LLM
                //  operation.
                const stream = await oneshotSessionPrompt.promptStreaming(fullLlmPrompt);

                for await (const chunk of stream) {
                    // Accumulate the response.
                    fullResponse = chunk.trim();
                }

            } catch (err) {
                const errMsg =
                    errPrefix + conformErrorObjectMsg(err);

                console.error(`${errMsg} - try`);
            } finally {
                // Always destroy the session.
                oneshotSessionPrompt.destroy();
            }

            // -------------------- END  : PROMPT API CALL ------------

            console.log(`${errPrefix} Displaying LLM answer.`);

            showSpinner(`Displaying answer...`);

            // Display the LLM answer.
            let prettyPrintedLlmAnswer =
                prettyPrintLlmAnswer(fullResponse);

            // Add a note about the bookmark search results.
            prettyPrintedLlmAnswer += `<br/></br>Below are the bookmarks that are related to your query.`;

            console.log(`POPUP SCRIPT: LLM answer received:\n\n${prettyPrintedLlmAnswer}\n`);

            if (isEmptySafeString(prettyPrintedLlmAnswer)) {
                llmAnswerSelector.innerHTML = '(no LLM answer given)';
            } else {
                llmAnswerSelector.innerHTML = prettyPrintedLlmAnswer;
            }

            console.log(`${errPrefix} Formatting search results.`);

            // Display the matches in a formatted manner.
            const prettyPrintSearchResults =
                aryBookmarkRecordObjs.length < 1
                    ? `Empty search results`
                    : prettyPrintBookmarkSearchResults(aryBookmarkRecordObjs);

            console.log(`${errPrefix} Finished.`);

            searchResultsSelector.innerHTML = prettyPrintSearchResults;
        }

        return true;
    }

    console.log(`POPUP SCRIPT: Establishing onMessage listener...`);

    /**
     * Handles incoming messages in the popup.
     * Only processes messages from the active tab with an action of "contentScriptReady".
     *
     * @param {Object} message - The message received from another extension context.
     * @param {chrome.runtime.MessageSender} sender - An object containing information about the message sender.
     * @param {function} sendResponse - Function to call when you have a response.
     */
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        let bIsAsyncResponse = false;

        console.log("POPUP SCRIPT: Received new message:", message);

        if (sender.id !== chrome.runtime.id) {
            // Ignore messages that are not from the background script.
            console.log(`POPUP SCRIPT: Ignoring unwanted or undefined message.`);
        } else {
            // Is it a request action, or response message?
            if (message.action) {
                // -------------------- BEGIN: PROCESS REQUEST ------------

                const requestObj = message;

                if (requestObj.action === 'relayedPopupScriptReadyCheck') {
                    // Other scripts wants to know if we are ready.
                    sendResponse(`POPUP SCRIPT: The popup script is ready.`);
                } else {
                    console.log(`POPUP SCRIPT: Ignoring safely REQUEST action: ${requestObj.action}`);
                }

                // -------------------- END  : PROCESS REQUEST ------------
            } else {
                // -------------------- BEGIN: HANDLE MESSAGE ------------

                // Note:  If you don't establish a port connection with a
                //  content script, then only the background script can
                //  communicate with the content script via Chrome
                //  messaging.  That is why many of the message types
                //  in this gauntlet begin with "relayed", indicating they
                //  are content messages relayed to us by the background
                //  script.
                if (message.type === 'status') {
                    // Show status messages in the summary area.
                    summaryTextSelector.textContent = message.text;
                } else if (message.type === 'relayedTranscriptUnavailable') {
                    // The content script could not grab the transcript.
                    //  Show the error message in the text content area.
                    summaryTextSelector.textContent = message.text;

                    console.error(message.text);
                } else if (message.type === 'relayedTranscriptGrabbed') {
                    // We have received the text of the transcript.
                    console.log(`Transcript received.  Length: ${message.text.length}`);

                    //  Show the transcript the text content area.
                    inputTextAreaSelector.value = message.text;

                    // Schedule summarization.
                    scheduleSummarization();
                } else if (message.type === 'relayedContentUnavailable') {
                    // The content script could not grab the current content.
                    //  Show the error message in the text content area.
                    summaryTextSelector.textContent = message.text;

                    console.error(message.text);
                } else if (message.type === 'relayedContentGrabbed') {
                    // We have received the web page content.
                    console.log(`Content object received.`);

                    // The text field contains the original message object.
                    if (typeof message.text !== 'object')
                        throw new Error(`POPUP SCRIPT: The "message.text" field does not contain an object.`);

                    const orgMessageObj = message.text;

                    // The text field of the original message object
                    //  contains the stringified response object.

                    // Parse out the page details.
                    const contentObj = JSON.parse(orgMessageObj.text);

                    //  Show the page title.
                    pageTitleSelector.value = contentObj.pageTitle;

                    //  Put the page content in the input window
                    //   to summarize it.
                    inputTextAreaSelector.value = contentObj.pageContent;

                    // Save the content page URL.
                    urlToSrcPage = contentObj.urlToSrcPage;

                    console.log(`POPUP SCRIPT: Assigned content content page source URL to "urlToSrcPage": ${urlToSrcPage}`);

                    // -------------------- BEGIN: EXISTING BOOKMARK CHECK ------------

                    // First we check to see if the current page has an existing
                    //  bookmark.
                    try {
                        // Prepare the message to send.
                        const requestObj =
                            {
                                action: "retrieveBookmark_async",
                                message: `Requesting bookmark for URL: ${urlToSrcPage}`,
                                urlToSrcPage: urlToSrcPage
                            }

                        // Send message to the service worker.
                        chrome.runtime.sendMessage(
                            requestObj,
                            (response) => {
                                if (chrome.runtime.lastError) {
                                    // ERROR: Handle runtime errors during message transmission.
                                    console.error(`POPUP SCRIPT: Failed to communicate with the service worker while trying to retrieve a bookmark for URL: ${urlToSrcPage}.\nError details: ${chrome.runtime.lastError.message}`);
                                } else {
                                    // Check the response.
                                    if (response === null || response === '' || typeof response !== 'string') {
                                        // No existing bookmark was found.  Schedule
                                        //  a summarization call now.
                                        console.log(`POPUP SCRIPT: No bookmark found for page URL: ${urlToSrcPage}.  Scheduling a summarization call now.`);

                                        scheduleSummarization();
                                    } else {
                                        // We should have received a stringified bookmark
                                        //  record object.
                                        const bookmarkRecordObj =
                                            BookmarkRecord.fromString(response);

                                        console.log(`POPUP SCRIPT: Existing bookmark found for page URL: ${urlToSrcPage}.  Updating tab elements.`);

                                        // SUCCESS.  Fill in the relevant page
                                        //  elements.
                                        updateBookmarkTabFromObject(bookmarkRecordObj);
                                    }
                                }
                            });
                    } catch (error) {
                        const errMsg = conformErrorObjectMsg(error);

                        // Catch and handle any synchronous errors.
                        console.error(`POPUP SCRIPT: A top level error occurred while trying to retrieve a bookmark for URL: ${urlToSrcPage}.\nError details: ${errMsg}`);
                    }

                    // -------------------- END  : EXISTING BOOKMARK CHECK ------------

                } else if (message.type === 'bookmarkSearchResultsError') {
                    // The background script is telling us that the bookmarks
                    //  collection is empty so a search operation is
                    //  pointless.
                    llmAnswerSelector.textContent = message.message;
                } else if (message.type === 'bookmarkSearchResults') {
                    const errPrefix = `(message::bookmarkSearchResults) `;

                    /*
                    We have received the bookmark search results.
                     display them.  The background script should
                     have sent us a response payload that looks like
                     this:

                    const messageObj =
                        {
                            type: 'bookmarkSearchResults',
                            message: `Bookmark search completed successfully`,
                            bookmark_search_results_str: strStringifiedBookmarksArray,
                            llm_answer: `Not implemented yet.`
                        }
                     */
                    console.log(`${errPrefix} Content object received.  Processing received bookmarks and LLM answer.`);

                    processBookmarkSearchResults(message)
                        .then(result => {
                            console.log(`${errPrefix} Result from processBookmarkSearchResults: `, result);

                            hideSpinner();
                        })
                        .catch(err => {
                            // Convert the error to a promise rejection.
                            let errMsg =
                                errPrefix + conformErrorObjectMsg(err);

                            console.error(errMsg);

                            hideSpinner();
                        });

                } else {
                    console.log(`POPUP SCRIPT: Unknown MESSAGE type: ${message.type}`);
                }

                // -------------------- END  : HANDLE MESSAGE ------------
            }
        }

        return bIsAsyncResponse;
    });

    // -------------------- BEGIN: PAGE HANDLERS ------------

    document.addEventListener("DOMContentLoaded", () => {
        document.querySelectorAll(".tab-header-div").forEach(tab => {
            tab.addEventListener("click", () => {
                const containerDivId = tab.getAttribute("data-target");
                setActiveTab(containerDivId);
            });
        });
    });

    // -------------------- END  : PAGE HANDLERS ------------

    // Initialize the app if that has not been done yet.
    if (bIsInitialized) {
        console.log(`POPUP SCRIPT: Application has already been initialized.`);
    } else {
        // Start the application
        console.log(`Initializing the application.`);
        await initializeApplication();
    }

// -------------------- BEGIN: WAIT FOR OTHER SCRIPTS TO BE READY ------------

    let bIsBackgroundScriptIsNotReady = true;
    let bIsContentScriptIsNotReady = true;

    while (bIsBackgroundScriptIsNotReady || bIsContentScriptIsNotReady) {
        // Background script ready check.
        if (bIsBackgroundScriptIsNotReady) {
            bIsBackgroundScriptIsNotReady = !(await doReadyCheck('CONTENT SCRIPT', {action: 'backgroundScriptReadyCheck'}, 'background script'));
        }

        // Content script ready check.
        if (bIsContentScriptIsNotReady) {
            bIsContentScriptIsNotReady = !(await doReadyCheck('CONTENT SCRIPT', {action: 'remoteContentScriptReadyCheck'}, 'content script'));
        }

        // Wait 100ms.
        await new Promise(resolve => setTimeout(resolve, 100));
    }

// -------------------- END  : WAIT FOR OTHER SCRIPTS TO BE READY ------------

// -------------------- BEGIN: ESTABLISH ELEMENT HANDLERS ------------

    document.getElementById('do-task-btn').addEventListener('click', doTaskForCurrentTab);

// -------------------- END  : ESTABLISH ELEMENT HANDLERS ------------

// -------------------- BEGIN: REQUEST ACTIVE PAGE CONTENT ------------

    requestContentFromContentScript('After ready checks.');

// -------------------- END  : REQUEST ACTIVE PAGE CONTENT ------------

}

