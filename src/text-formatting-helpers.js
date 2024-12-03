// Some routines to make showing the various text elements
//  on our extension pages easier.

import {validateBookmarkRecordsObjArrayOrDie} from "./indexed-db/bookmark-record.js";

const MAX_SUMMARY_TEXT_DISPLAY_LEN = 300;

/**
 * Parses markdown in a string and returns HTML formatted text.
 * @param {string} text - The input text containing markdown.
 * @returns {string} The HTML formatted text.
 */
function parseMarkdown(text) {
    return text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\*(.*?)\*/g, '<i>$1</i>');
}

/**
 * Takes answer from the Prompt API LLM in a specific format
 *   and returns a string with HTML for human-friendly formatting.
 *
 * @param {string} strAnswer - The input string to be formatted.
 * @throws {Error} Throws an error if the input string is empty
 *  or not a string.
 *
 * @returns {string} The formatted HTML string.
 */
export function prettyPrintLlmAnswer(strAnswerIn) {
    const errPrefix = "(prettyPrintLlmAnswer) ";

    if (typeof strAnswerIn !== "string" || strAnswerIn.trim() === "") {
        throw new Error(`${errPrefix}The strAnswer parameter must be a non-empty string.`);
    }

    // We replace the word "document" with "search results"
    //  to make the text more context-sensitive.
    const strAnswer = strAnswerIn.replace(/\bdocuments?\b/gi, "search results");

    let html = "";
    const lines = strAnswer.split("\n");

    let inList = false;
    let listItems = "";
    for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith("*")) {
            const listItem = trimmedLine.substring(1).trim();
            if (!inList) {
                html += "<ul class='llm-answer-unordered-list'>";
                inList = true;
            }
            listItems += `<li class="llm-answer-list-item">${parseMarkdown(listItem)}</li>`;
        } else {
            if (inList) {
                html += listItems + "</ul>";
                inList = false;
                listItems = "";
            }
            html += parseMarkdown(trimmedLine) + "<br>";
        }
    }

    if (inList) {
        html += listItems + "</ul>";
    }

    return `<div class="formatted-answer">${html}</div>`;
}

/**
 * Takes an array of BookmarkRecord objects containing
 *  matching bookmarks from a bookmarks search (i.e. -
 *  grounding attributions) and creates the HTML for a
 *  bulleted list of hyperlinks.
 *
 * @param {BookmarkRecord[]} aryBookmarkRecObjs - The
 *  array of bookmark record objects that are/were the
 *  grounding attributions for an LLM call.
 * @param {Number} maxSummaryLen - The maximum display
 *  length for each bookmark's summary text.
 *
 * @throws {Error} Throws an error if the input is not an
 *  array of bookmark record objects.
 *
 * @returns {string} The HTML for a bulleted list of
 *  formatted HTML elements that display the relevant
 *  content of each bookmark record object.
 */
export function prettyPrintBookmarkSearchResults(
        aryBookmarkRecObjs,
        maxSummaryLen = MAX_SUMMARY_TEXT_DISPLAY_LEN) {
    const errPrefix = "(prettyPrintBookmarkSearchResults) ";

    // Validate the array of bookmark record objects.  FALSE
    //  means the array must not be empty.
    validateBookmarkRecordsObjArrayOrDie(aryBookmarkRecObjs, false);

    if (!Number.isSafeInteger(maxSummaryLen) || maxSummaryLen < 0)
        throw new Error(`${errPrefix}The maxSummaryLen parameter must be a positive integer greater than 0.  Value given: ${maxSummaryLen} `);

    // Remove duplicate bookmark record objects that
    //  have the same URL.
    let html = "<ul>";

    const noDupsObj = {};

    for (const bookmarkRecObj of aryBookmarkRecObjs) {
        // No duplicate URLs!
        const urlToSrcPage =
            bookmarkRecObj.urlToSrcPage.trim();

        if (
            typeof noDupsObj[urlToSrcPage] === 'undefined')
        {
            // Limit the length of the bookmark's summary text.
            const truncatedSummary =
                bookmarkRecObj.summaryText.length > maxSummaryLen
                    ? bookmarkRecObj.summaryText.slice(0, maxSummaryLen - 3) + "..."
                    : bookmarkRecObj.summaryText;

            bookmarkRecObj.truncatedSummary = truncatedSummary;
            const titleText = bookmarkRecObj.pageTitle;
            // Create a URL link.
            html += `<li><a href="${bookmarkRecObj.urlToSrcPage}" class="bookmark-link" target="_blank">${titleText}</a><div class="bookmark-summary">${truncatedSummary}</div></li>`;

            noDupsObj[urlToSrcPage] = true;
        }
    }

    html += "</ul>";

    return `<div class="formatted-attributions">${html}</div>`;
}
