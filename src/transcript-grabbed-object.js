// This file contains the object that the Chrome extension
//  passes back to the back-end server when a transcript
//  has been grabbed.

import {isEmptySafeString} from './misc.js';

/**
 * Class object that contains one transcript line from
 *  a video transcript.
 */
export class TranscriptLine {
  /**
   *
   * @param {String} transcriptText - The line of
   *  text belonging to the transcript line.
   * @param {String} timestampString - The timestamp
   *  for the transcript line but in string format.
   * @param {Number} offsetInSeconds - offset
   *  of the line in seconds where the transcript line
   *  appears in the video.
   */
  constructor(
      transcriptText,
      timestampString,
      offsetInSeconds) {

    const methodName = 'TranscriptLine' + '::' + `constructor`;
    const errPrefix = '(' + methodName + ') ';

    if (isEmptySafeString(transcriptText))
      throw new Error(`${errPrefix}The transcriptText parameter
       is empty or invalid.`);
    if (isEmptySafeString(timestampString))
      throw new Error(`${errPrefix}The timestampString parameter
       is empty or invalid.`);
    if (typeof offsetInSeconds !== 'number' || offsetInSeconds < 0 || !isFinite(offsetInSeconds) || !Number.isInteger(offsetInSeconds))
    	throw new Error(`${errPrefix}The value in the offsetInSeconds parameter is invalid.`);

    /** @property {String} - The line of
     text belonging to the transcript line.
     */
    this.transcriptText = transcriptText;

    /** @property {String} - The timestamp
     for the transcript line but in string
     format.
     */
    this.timestampString = timestampString;

    /** @property {Number} - offset of the
     * line in seconds where the transcript
     * line
     */
    this.offsetInSeconds = offsetInSeconds;
  }
}

/**
 * Reconstitutes a TranscriptGrabbed class object from a raw
 *  JSON object.
 *
 * @param {Object} rawTranscriptLineObj - The raw JSON object
 *  containing the fields for a transcript grabbed object.
 *
 * @return {TranscriptLine}
 */
TranscriptLine.reconstituteObject = function(rawTranscriptLineObj) {
  let errPrefix = '(TranscriptLine::reconstituteObject) ';

  if (!(typeof rawTranscriptLineObj == 'object'))
    throw new Error(errPrefix + 'The raw transcript line object parameter is not an object.');

  const newTranscriptLineObj =
    new TranscriptLine(
      rawTranscriptLineObj.transcriptText,
      rawTranscriptLineObj.timestampString,
      rawTranscriptLineObj.offsetInSeconds);

  return newTranscriptLineObj;
}

/**
 * Class object returned by the Chrome extension in
 *  response to a grab transcript request by the
 *  back-end server.  It contains the pertinent
 *  elements of a video transcript and some general
 *  information about the video.
 *
 * NOTE: We do not carry the date the video was published
 *  and the video description, because it more reliable
 *  to get the information from the YouTube API, instead
 *  of parsing the DOM tree from the content script!
 */
export class TranscriptGrabbed {
  /**
   * Initializes a new instance of the TranscriptGrabbed class.
   */
  constructor() {

    /** @property {string} - The constructor name for this object,
     *   which is also the construct name.  This is useful for
     *   objects that get passed over bridges like the postMessage()
     *   function and in so doing are reduced to a plain JSON
     *   object.  This property helps the receiver to reconstitute
     *   the original function or class object.
     */
    this.constructorName = 'TranscriptGrabbed';

    /** @property {String} - The video ID of the
     *  source video for the transcript.  We
     *  put the video ID of the host web page
     *  here so the server can confirm it against
     *  the one it used in its transcript request.
     */
    this.idOfVideo = null;

    /** @property {Array<TranscriptLine>} - The array of
     *  transcript line objects that make up a video
     *  transcript.
     */
    this.aryTranscriptLineObjs = [];

    // NOTE: We do not assign any of the other video
    //  details in this object because the server will
    //  use the YouTube API to that instead, thereby
    //  avoiding any unnecessary page parsing.
  }

  /**
   * Add a transcript line object to our array of those.
   *
   * @param {TranscriptLine} transcriptLineObj - A valid
   *  transcript line object.
   */
  addTranscriptLineObject(transcriptLineObj) {
    const methodName = 'TranscriptGrabbed' + '::' + `addTranscriptLineObject`;
    const errPrefix = '(' + methodName + ') ';

    if (!(transcriptLineObj instanceof TranscriptLine))
      throw new Error(`${errPrefix}The value in the transcriptLineObj parameter is not a TranscriptLine object.`);

    this.aryTranscriptLineObjs.push(transcriptLineObj);
  }

  /**
   * Get the concatenated transcript text without
   *  timestamps.
   *
   * @returns {String} The concatenated transcript text.
   *
   * @throws {Error} Throws an error if this.aryTranscriptLineObjs
   *  is not an array.
   */
  getConcatenatedTextWithoutTimestamps() {
    const errPrefix = '(getConcatenatedTextWithoutTimestamps) ';

    if (!Array.isArray(this.aryTranscriptLineObjs)) {
      throw new Error(`${errPrefix}aryTranscriptLineObjs is not an array.`);
    }

    let strConcatenatedText = '';

    this.aryTranscriptLineObjs.forEach(element => {
      if (typeof element.transcriptText !== 'string') {
        throw new Error(`${errPrefix}transcriptText is not a string.`);
      }

      // Trim the transcript text
      let trimmedText = element.transcriptText.trim();

      // Remove content inside square brackets
      trimmedText = trimmedText.replace(/\[.*?\]/g, '').trim();

      // Append the text to strConcatenatedText if it's non-empty
      if (trimmedText.length > 0) {
        if (strConcatenatedText.length > 0 &&
          strConcatenatedText[strConcatenatedText.length - 1] !== ' ') {
          strConcatenatedText += ' ';
        }
        strConcatenatedText += trimmedText;
      }
    });

    return strConcatenatedText;
  }

  /**
   * Get the concatenated transcript text WITH
   *  timestamps.
   *
   * @returns {String} The concatenated transcript text.
   *
   * @throws {Error} Throws an error if this.aryTranscriptLineObjs
   *  is not an array.
   */
  getConcatenatedTextWithTimestamps() {
    const errPrefix = '(getConcatenatedTextWithTimestamps) ';

    if (!Array.isArray(this.aryTranscriptLineObjs)) {
      throw new Error(`${errPrefix}aryTranscriptLineObjs is not an array.`);
    }

    const rawTranscriptText =
      this.aryTranscriptLineObjs.map(
        (transcriptLineObj) => {
          if (!(transcriptLineObj instanceof TranscriptLine))
            throw new Error(`${errPrefix}The value in the transcriptLineObj variable is not a TranscriptLine object.`);

          // This restores the transcript text to its original
          //  format in its raw form.  That is, the timestamp
          //  on one line, followed by the associated transcript
          //  text on the next line.
          return `${transcriptLineObj.timestampString}\n${transcriptLineObj.transcriptText}\n`;
        }
      ).join();

    return rawTranscriptText;
  }

  /**
   * Validate the contents of this object.
   */
  validateMe() {
    const methodName = 'TranscriptGrabbed' + '::' + `validateMe`;
    const errPrefix = '(' + methodName + ') ';

    if (isEmptySafeString(this.constructorName))
      throw new Error(`${errPrefix}The this.constructorName field is empty or invalid.`);
    if (isEmptySafeString(this.idOfVideo))
      throw new Error(`${errPrefix}The "idOfVideo" field is empty or invalid.`);


    // -------------------- BEGIN: Thoroughly validate the array of transcript line objects. ------------

    if (!Array.isArray(this.aryTranscriptLineObjs))
      throw new Error(`${errPrefix}The this.aryTranscriptLineObjs field value is not an array.`);
    if (this.aryTranscriptLineObjs.length < 1)
      throw new Error(`${errPrefix}The this.aryTranscriptLineObjs array is empty`);

    const bAllAreTranscriptLineObjects = this.aryTranscriptLineObjs.every(transcriptLineObj => {
      return transcriptLineObj instanceof TranscriptLine;
    });

    if (!bAllAreTranscriptLineObjects)
      throw new Error(`${errPrefix}One or more elements in the aryTranscriptLineObjs array is not a TranscriptLine object`);

    // -------------------- END  : Thoroughly validate the array of transcript line objects. ------------
  }
}

/**
 * Reconstitutes a TranscriptGrabbed class object from a raw
 *  JSON object.
 *
 * @param {Object} rawTranscriptGrabbed - The raw JSON object
 *  containing the fields that belong
 * 	to an active quiz.
 *
 * @return {TranscriptGrabbed}
 */
TranscriptGrabbed.reconstituteTranscriptGrabbedObj = function(rawTranscriptGrabbed) {
  let errPrefix = '(TranscriptGrabbed::reconstituteTranscriptGrabbedObj) ';

  if (!(typeof rawTranscriptGrabbed == 'object'))
    throw new Error(errPrefix + 'The raw transcript grabbed parameter is not an object.');

  const newTranscriptGrabbedObj =
    new TranscriptGrabbed();

  // -------------------- BEGIN: Copy the simple fields over. ------------

  newTranscriptGrabbedObj.idOfVideo = rawTranscriptGrabbed.idOfVideo;

  // -------------------- END  : Copy the simple fields over. ------------

  // -------------------- BEGIN: RECONSTITUTE TRANSCRIPT LINE OBJECTS ARRAY ------------

  if (!(
    rawTranscriptGrabbed.aryTranscriptLineObjs
    && rawTranscriptGrabbed.aryTranscriptLineObjs.length > 0
  )) {
    throw new Error(`${errPrefix}The array of transcript line objects is empty or invalid.`);
  }

  for (
    let ndx = 0;
    ndx < rawTranscriptGrabbed.aryTranscriptLineObjs.length;
    ndx++) {
    const transcriptLineObj =
      TranscriptLine.reconstituteObject(rawTranscriptGrabbed.aryTranscriptLineObjs[ndx]);

    newTranscriptGrabbedObj.addTranscriptLineObject(transcriptLineObj);
  }

  // -------------------- END  : RECONSTITUTE TRANSCRIPT LINE OBJECTS ARRAY ------------

  // Validate the reconstituted object thoroughly.
  newTranscriptGrabbedObj.validateMe();

  return newTranscriptGrabbedObj;
}
