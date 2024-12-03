import {isValidEmbeddingsArray} from "./liaison-indexed-db.js";
import {isEmptySafeString} from "../misc.js";

/**
 * Class representing a bookmarked web page.
 */
export class BookmarkRecord {

    /**
     * Constructs a new BookmarkRecord.
     * @param {String} urlToSrcPage - The URL of the bookmarked page.
     *  Must be a non-empty string.
     * @param {String} pageTitle - The web page title.
     * @param {String} summaryText - The summary of the page. Must
     *  be a non-empty string.
     * @param {String} userNote - An custom note provided by the
     *  user.  May be empty.
     * @param {number[]} embeddingsArray - An array of embeddings
     *  vectors for the title concatenated with the user note
     *  and summary text. Must be a non-empty array of numbers or NULL.
     * @param {number[]} embeddingsArray_title - An array of embeddings
     *  vectors but ONLY for the title. Must be a non-empty array
     *  of numbers or NULL.
     * @param {String} base64Thumbnail - A thumbnail of the bookmarked
     *  page in base64 string format.
     *
     * @throws {Error} If input parameters are invalid.
     */
    constructor(
            urlToSrcPage,
            pageTitle,
            summaryText,
            userNote,
            embeddingsArray,
            embeddingsArray_title,
            base64Thumbnail) {
        const self = this;
        const methodName = 'BookmarkRecord' + '::' + `constructor`;
        const errPrefix = '(' + methodName + ') ';

        if (typeof urlToSrcPage !== "string" || urlToSrcPage.trim() === "") {
            throw new Error(`${errPrefix}Invalid urlToSrcPage: must be a non-empty string.`);
        }

        if (typeof pageTitle !== "string" || pageTitle.trim() === "") {
            throw new Error(`${errPrefix}Invalid pageTitle: must be a non-empty string.`);
        }

        if (typeof summaryText !== "string" || summaryText.trim() === "") {
            throw new Error(`${errPrefix}Invalid summaryText: must be a non-empty string.`);
        }

        // The user note may be empty, but it must be a string.
        if (typeof userNote !== "string") {
            throw new Error(`${errPrefix}Invalid summaryText: must be a string, even if it's just an empty string.`);
        }

        if (embeddingsArray !== null) {
            if (!isValidEmbeddingsArray(errPrefix, embeddingsArray))
                throw new Error(`${errPrefix}The embeddings array for the concatentated text is not NULL, so it must be a valid embeddings array.`);
        }

        if (embeddingsArray_title !== null) {
            if (!isValidEmbeddingsArray(errPrefix, embeddingsArray_title))
                throw new Error(`${errPrefix}The embeddings array for the title is not NULL, so it must be a valid embeddings array.`);
        }

        if (base64Thumbnail !== null) {
            if (isEmptySafeString(base64Thumbnail)) {
                throw new Error(`${errPrefix}Invalid base64Thumbnail: is not NULL so it must be a non-empty string.`);
            }
        }

        this.urlToSrcPage = urlToSrcPage.trim();
        this.pageTitle = pageTitle;
        this.summaryText = summaryText.trim();
        this.userNote = userNote.trim();
        this.embeddingsArray = embeddingsArray;
        this.embeddingsArray_title = embeddingsArray_title;
        this.base64Thumbnail = base64Thumbnail;
        this.dtCreated = new Date();
        this.bookmarkText = this._buildBookmarkText();
    }

    /**
     * This function builds the full text for a bookmark.
     *  This is the text that the embeddings will be
     *  generated for and will be used during searches.
     *  The bookmark text will also be saved in the
     *  bookmarkText field in this object.
     *
     * @return {String} - Returns the bookmark text for a
     *  bookmark, using the relevant fields from the given
     *  bookmark records object.
     *
     * @private
     */
    _buildBookmarkText() {
        const methodName = 'BookmarkRecord' + '::' + `_buildBookmarkText`;
        const errPrefix = '(' + methodName + ') ';

        // Must be a valid bookmark, except for the
        //  embeddings array and bookmark text, since
        //  those may being generated now with the help of this call.
        this.validateMe(false);

        const aryTextElements = [];

        // Create the bookmark text for the bookmark record object
        //  from the relevant fields.
        aryTextElements.push('PAGE TITLE:' + this.pageTitle);

        // The user note is optional.
        if (!isEmptySafeString(this.userNote))
            aryTextElements.push('USER NOTE:' + this.userNote);

        // The summary is mandatory.
        aryTextElements.push('PAGE SUMMARY:' + this.summaryText);

        return aryTextElements.join('\n\n');
    }

    /**
     * Validates this object.
     *
     * NOTE: For now we are making the presence of a
     *  base64 image string for the page thumbnail
     *  optional.
     *
     * @param {Boolean} bValidateEmbeddingsAndBookmarkText - If TRUE, then this
     *  object must have a valid embeddings array.  If FALSE, then
     *  it does not.
     */
    validateMe(bValidateEmbeddingsAndBookmarkText=false) {
        const methodName = 'BookmarkRecord' + '::' + `validateMe`;
        const errPrefix = '(' + methodName + ') ';

        if (isEmptySafeString(this.urlToSrcPage))
            throw new Error(`${errPrefix}The this.urlToSrcPage field is empty or invalid.`);
        if (isEmptySafeString(this.pageTitle))
            throw new Error(`${errPrefix}The this.pageTitle field is empty or invalid.`);
        if (isEmptySafeString(this.summaryText))
            throw new Error(`${errPrefix}The this.summaryText field is empty or invalid.`);

        // User note is optional.

        if (bValidateEmbeddingsAndBookmarkText) {
            if (isEmptySafeString(this.bookmarkText))
                throw new Error(`${errPrefix}The this.bookmarkText field is empty or invalid.`);

            if (!isValidEmbeddingsArray(errPrefix, this.embeddingsArray))
                throw new Error(`${errPrefix}The this.embeddingsArray field is empty.`);

            if (!isValidEmbeddingsArray(errPrefix, this.embeddingsArray_title))
                throw new Error(`${errPrefix}The this.embeddingsArray_title field is empty.`);
        }

        if (!this.dtCreated instanceof Date)
            throw new Error(`${errPrefix}The this.dtCreated field is invalid.`);
    }

    /**
     * Converts the BookmarkRecord to a string for storage in IndexedDB.
     * @returns {string} A JSON string representation of the BookmarkRecord.
     */
    toString() {
        return JSON.stringify({
            urlToSrcPage: this.urlToSrcPage,
            pageTitle: this.pageTitle,
            summaryText: this.summaryText,
            userNote: this.userNote,
            embeddingsArray: this.embeddingsArray,
            embeddingsArray_title: this.embeddingsArray_title,
            base64Thumbnail: this.base64Thumbnail,
            dtCreated: this.dtCreated.toISOString(),
            bookmarkText: this.bookmarkText
        });
    }

    /**
     * Creates a BookmarkRecord instance from a prototype-less JSON
     *  bookmark record object.
     *
     * @param {Object} obj - A prototype-less object that contains
     *  a bookmark record.
     *
     * @returns {BookmarkRecord} A new BookmarkRecord instance.
     */
    static fromRaw(obj) {
        const errPrefix = `(BookmarkRecord::fromRaw) `;
        
        // Validate the structure of the parsed object
        if (typeof obj.urlToSrcPage !== "string") {
            throw new Error(`${errPrefix}Invalid urlToSrcPage: Expected a string.`);
        }

        if (obj.urlToSrcPage.trim() === "") {
            throw new Error(`${errPrefix}Invalid urlToSrcPage: Cannot be an empty string.`);
        }

        if (typeof obj.pageTitle !== "string") {
            throw new Error(`${errPrefix}Invalid pageTitle: Expected a string.`);
        }

        if (obj.pageTitle.trim() === "") {
            throw new Error(`${errPrefix}Invalid pageTitle: Cannot be an empty string.`);
        }

        if (typeof obj.summaryText !== "string") {
            throw new Error(`${errPrefix}Invalid summaryText: Expected a string.`);
        }

        if (obj.summaryText.trim() === "") {
            throw new Error(`${errPrefix}Invalid summaryText: Cannot be an empty string.`);
        }

        if (typeof obj.userNote !== "string") {
            throw new Error(`${errPrefix}Invalid userNote: Expected a string.`);
        }

        if (obj.embeddingsArray !== null) {
            if (!isValidEmbeddingsArray(errPrefix, obj.embeddingsArray))
                throw new Error(`${errPrefix}The embeddings array for the concatenated text is not NULL, so it must be a valid embeddings array.`);
        }

        if (obj.embeddingsArray_title !== null) {
            if (!isValidEmbeddingsArray(errPrefix, obj.embeddingsArray_title))
                throw new Error(`${errPrefix}The embeddings array for the title is not NULL, so it must be a valid embeddings array.`);
        }

        if (obj.base64Thumbnail !== null) {
            if (isEmptySafeString(obj.base64Thumbnail)) {
                throw new Error(`${errPrefix}Invalid base64Thumbnail: is not NULL so it must be a non-empty string.`);
            }
        }
        if (typeof obj.dtCreated !== "string") {
            throw new Error(`${errPrefix}Invalid dtCreated: Expected a string in ISO format.`);
        }

        // Parse and validate the date.  Remember, the toJson()
        //  method turned dtCreated into an ISO string, so the
        //  dtCreated value of a RAW (prototype-less) JSON
        //  object is an ISO string, while the dtCreated
        //  object for this class object is a JavaScript
        //  Date object.
        const parsedDate = new Date(obj.dtCreated);
        if (isNaN(parsedDate.getTime())) {
            throw new Error(`${errPrefix}Invalid dtCreated: Invalid date string.`);
        }

        // If all validations pass, construct and return the BookmarkRecord
        const record =
            new BookmarkRecord(
                obj.urlToSrcPage,
                obj.pageTitle,
                obj.summaryText,
                obj.userNote,
                obj.embeddingsArray,
                obj.embeddingsArray_title,
                obj.base64Thumbnail);

        record.dtCreated = parsedDate; // Overwrite the auto-created date with the parsed one
        return record;
    }


    /**
     * Creates a BookmarkRecord instance from a JSON string.
     * @param {String} strJson - A JSON string representation of a BookmarkRecord.
     * @returns {BookmarkRecord} A new BookmarkRecord instance.
     * @throws {Error} If the input string is not valid JSON or does not match the expected structure.
     */
    static fromString(strJson) {
        let obj;
        try {
            obj = JSON.parse(strJson);
        } catch (err) {
            throw new Error(`Invalid JSON string: ${err.message}`);
        }

        return BookmarkRecord.fromRaw(obj);
    }

}

/**
 * This function simply returns if the alleged array
 *  of bookmark records is really just that.  If not,
 *  it throws an error.
 *
 * @param {BookmarkRecord[]} aryBookmarkRecObjs - The
 *  alleged array of bookmark record objects.
 * @param {Boolean} bArrayCanBeEmpty - If TRUE, then
 *  the function will not throw an error if the array
 *  is empty. Otherwise, it will.
 */
export function validateBookmarkRecordsObjArrayOrDie(
        aryBookmarkRecObjs,bArrayCanBeEmpty) {
    const errPrefix = `(isValidBookmarkRecordsObjArray) `;

    if (!Array.isArray(aryBookmarkRecObjs))
        throw new Error(`${errPrefix}The aryBookmarkRecObjs parameter value is not an array.`);
    if (aryBookmarkRecObjs.length < 1)
        throw new Error(`${errPrefix}The aryBookmarkRecObjs array is empty`);
    if (!aryBookmarkRecObjs.every(filter => filter instanceof BookmarkRecord)) {
        throw new Error(`${errPrefix}The aryBookmarkRecObjs parameter must contain only instances of BookmarkRecord objects.`);
    }
}