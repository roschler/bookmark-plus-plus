// This is the content script for the YouTube transcript
//  summarizer extension.

// Prevent duplicate loads.
import {doReadyCheck} from "./ready-check.js";
import {isEmptySafeString, isNonNullObjectAndNotArray} from "./misc.js";

// Don't load the content script into our popup script, or
//  any other internal extension script, or we will have
//  duplicate event handler problems.
if (location.protocol === 'chrome-extension:') {
  // Exit early for any internal extension pages
  console.log("CONTENT SCRIPT: ----->>>>> Content script skipped for internal extension pages.");
} else {

  if (typeof window.bIsLoadingOrLoaded === 'boolean' && window.bIsLoadingOrLoaded === true) {
    console.log(`CONTENT SCRIPT: Ignoring duplicate load attempt.`);
  }

  window.bIsLoadingOrLoaded = true;

  let transcriptGrabbedObj = null;

  const DEFAULT_CONFIG_POPUP_UNDER_DIV_ID = 'viewport';
  const CONSOLE_MESSAGE_CATEGORY_CONTENT_SCRIPT = 'content-script';

  let bVerbose_content = true;

  /**
   /**
   * Validates the existence and type of a DOM element.
   *  Throws an error if any of the validations fail.
   *  Otherwise, it simply returns.
   *
   * @param {String} idOfDomElement - The ID of the
   *  DOM element to look for.
   * @param {*} expectedType - The object prototype
   *  of the expected type.  For example,
   *  HtmlButtonElement, etc.
   *
   * @return {*} - Returns a reference to the DOM element
   *  that has the given ID.
   */
  function findDomElementOrDie(idOfDomElement, expectedType) {
    const errPrefix = `(findDomElementOrDie) `;

    if (isEmptySafeString(idOfDomElement))
      throw new Error(`${errPrefix}The idOfDomElement parameter is empty or invalid.`);

    if (typeof expectedType === 'undefined' || expectedType === null)
      throw new Error(`${errPrefix}The expectedType parameter is invalid.`);

    // Find the button element
    const domElement = document.getElementById(idOfDomElement);

    if (!domElement) {
      throw new Error(`${errPrefix}Element with ID "${idOfDomElement}" cannot be found.`);
    }

    if (!(domElement instanceof expectedType)) {
      throw new Error(`${errPrefix}Element with ID "${idOfDomElement}" is not a ${expectedType} element.`);
    }

    return domElement;
  }

  /**
   * Inserts the given HTML block as the first child of the element
   * identified by `parentElementId` in the current DOM tree.
   *
   * @param {string} parentElementId - The ID of the parent element where
   *        the HTML block will be inserted as the first child.
   * @param {string} htmlBlock - The HTML block to be inserted.
   *
   * @throws Will throw an error if `parentElementId` does not correspond
   *         to an existing element in the DOM.
   * @throws Will throw an error if either `parentElementId` or `htmlBlock`
   *         is not a string or is empty.
   */
  function insertHtmlAsFirstChildById(parentElementId, htmlBlock) {
    const errPrefix = '(insertHtmlAsFirstChildById) ';

    // Validate input parameters
    if (typeof parentElementId !== 'string' || parentElementId.trim() === '') {
      throw new Error(`${errPrefix}parentElementId must be a non-empty string.`);
    }
    if (typeof htmlBlock !== 'string') {
      throw new Error(`${errPrefix}htmlBlock must be a string.`);
    }

    // Attempt to locate the parent element
    const parentElement = document.getElementById(parentElementId);
    if (!parentElement) {
      throw new Error(`${errPrefix}Element with ID '${parentElementId}' not found.`);
    }

    // Create a container for the HTML block
    const container = document.createElement('div');
    container.innerHTML = htmlBlock;

    // Check if there's an existing first child
    if (parentElement.firstChild) {
      parentElement.insertBefore(container.firstChild, parentElement.firstChild);
    } else {
      parentElement.appendChild(container.firstChild);
    }
  }

// -------------------- BEGIN: GUESS THE MAIN CONTENT AREA ------------

  /**
   * Attempts to get an extended bounding client rect for a DOM element,
   * considering overflow, transformations, and other factors that might
   * affect the true visible size of the element.
   *
   * @param {Element} domElement - The DOM element to measure.
   * @return {DOMRect} An object similar to what getBoundingClientRect() returns but
   *         potentially adjusted to account for visible overflow, transformations, etc.
   */
  function getBoundingClientRectExtended(domElement) {
    const errPrefix = `(getBoundingClientRectExtended) `;

    if (!(domElement instanceof HTMLElement))
      throw new Error(`${errPrefix}The value in the domElement parameter is not a HTMLElement object.`);

    const rect = domElement.getBoundingClientRect();
    let extendedRect = {...rect};

    // Initialize variables to track the furthest extents of children
    let maxX = rect.right;
    let maxY = rect.bottom;

    // Recursive function to walk through all children and adjust based on their bounding boxes
    const adjustForChildren = (element) => {
      Array.from(element.children).forEach(child => {
        const childRect = child.getBoundingClientRect();

        // Check for visible overflow or positioning that might extend beyond the parent
        if (childRect.right > maxX) maxX = childRect.right;
        if (childRect.bottom > maxY) maxY = childRect.bottom;

        // Recursive call to walk through all descendants
        adjustForChildren(child);
      });
    };

    adjustForChildren(domElement);

    // Adjust the width and height based on the furthest extents found
    extendedRect.width = maxX - rect.left;
    extendedRect.height = maxY - rect.top;

    // Create a new DOMRect object for consistency with getBoundingClientRect
    return new DOMRect(rect.left, rect.top, extendedRect.width, extendedRect.height);
  }

  /**
   * A simple heuristic function to determine if an element is likely to be
   * part of the non-main content (e.g., header, footer, sidebar).
   *
   * @param {Element} el The element to check.
   * @return {boolean} True if the element is likely a non-content element,
   *         false otherwise.
   */
  function isLikelyNonContent(el) {
    const nonContentKeywords = ['header', 'footer', 'sidebar', 'nav', 'menu', 'advertisement'];
    const idAndClass = (el.id + ' ' + el.className).toLowerCase();

    return nonContentKeywords.some(keyword => idAndClass.includes(keyword));
  }

  /**
   * Attempts to find the main content area of a web page by identifying the
   * largest block-level element. It considers elements like DIV, TABLE,
   * SECTION, ARTICLE, and MAIN, defaulting to the BODY tag if no suitable
   * candidate is found.
   *
   * The heuristic is based on the size (area) of these elements, aiming to
   * ignore common layout elements such as headers, footers, and sidebars.
   * Additionally, this function checks for an element with the ID "viewport"
   * and considers it if its dimensions are larger.  If it can't find
   * an element with ID "viewport", it tries again for an element
   * with ID "content".
   *
   * @return {Element} The DOM element that is likely to represent the main
   *         content area of the page.
   */
  function findMainContentArea() {
    const errPrefix = `(findMainContentArea) `;

    const tagsToConsider = ['DIV', 'TABLE', 'SECTION', 'ARTICLE', 'MAIN'];
    let largestElement = document.body; // Default to the body
    let largestArea = 0;

    let mainContainerElementId = 'viewport';

    // We use certain page specific rules to override
    //  the "guess" code below for pages we know about.
    // Additional check for an element with the specific
    //  ID of "viewport".
    let mainContainerElement = document.getElementById(mainContainerElementId);

    if (!mainContainerElement) {
      console.log(`${errPrefix}Unable to find a DIV with element ID: ${mainContainerElementId}`);

      mainContainerElementId = 'content';
      document.getElementById(mainContainerElementId);
    }

    if (mainContainerElement) {
      console.log(`${errPrefix}Successfully located main container element using element ID: ${mainContainerElementId}`);

      const rect = getBoundingClientRectExtended(mainContainerElement);
      const viewportArea = rect.width * rect.height;
      if (viewportArea > largestArea) {
        largestElement = mainContainerElement;
      }

      return largestElement;
    }

    tagsToConsider.forEach(tag => {
      const elements = document.getElementsByTagName(tag);
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        const rect = getBoundingClientRectExtended(el);
        const area = rect.width * rect.height;

        if (area > largestArea && !isLikelyNonContent(el)) {
          largestArea = area;
          largestElement = el;
        }
      }
    });

    return largestElement;
  }

// -------------------- END  : GUESS THE MAIN CONTENT AREA ------------

  /**
   * Extracts the YouTube video ID from a given URL.
   * The URL is expected to be in the format
   * "https://www.youtube.com/watch?v=" and the function
   * discards any other URL arguments. It throws an error
   * if the video ID is empty or if the input is not a valid
   * YouTube URL.
   *
   * @param {String} url - The YouTube URL from which to extract
   *                       the video ID.
   *
   * @return {String} The trimmed YouTube video ID.
   *
   * @throws {Error} If the input URL is invalid, does not contain
   *                 a video ID, or if the video ID is empty.
   */
  function extractYouTubeVideoIdFromUrl(url) {
    const errPrefix = '(extractYouTubeVideoIdFromUrl) ';

    // Validate the input URL
    if (typeof url !== 'string' || url.trim() === '') {
      throw new Error(
          `${errPrefix}The provided URL must be a non-empty string.`
      );
    }

    try {
      const urlObj = new URL(url);
      if (urlObj.hostname !== 'www.youtube.com' &&
          urlObj.hostname !== 'youtube.com') {
        throw new Error(
            `${errPrefix}The URL must be a valid YouTube URL.`
        );
      }

      const videoId = urlObj.searchParams.get('v');
      if (!videoId || videoId.trim() === '') {
        throw new Error(
            `${errPrefix}The video ID is missing or empty.`
        );
      }

      return videoId.trim();
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(
            `${errPrefix}Invalid URL format.`
        );
      } else {
        throw error;
      }
    }
  }

  /**
   * @fileoverview Provides a function to get the current date
   * and time in a human-readable format with all time
   * components down to milliseconds.
   */

  /**
   * Gets the current date and time in a human-readable format,
   * including all time components down to milliseconds.
   *
   * @throws {Error} If an unexpected error occurs during
   * formatting.
   *
   * @returns {String} The current date and time in the format
   * 'MM/DD/YYYY, HH:MM:SS.mmm'.
   */
  function getCurrentTimeExt() {
    const errPrefix = '(getCurrentTimeExt) ';

    try {
      return new Date().toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3,
        hour12: false
      });
    } catch (err) {
      throw new Error(`${errPrefix}An error occurred while formatting the date: ${err.message}`);
    }
  }

// -------------------- END  : MISC ROUTINES ------------

// -------------------- BEGIN: FORM HANDLING ------------

// This is the maximum number of contiguous empty lines we will
//  tolerate in a transcript line objects array generated from
//  parsing the transcript window.
  const MAX_EMPTY_CONTIGUOUS_TRANSCRIPT_LINES = 5;

// This is the DIV ID of the main element that contains
//  the video thumbnails in a YouTube channel's videos
//  page.
  const ELEMENT_ID_FOR_YOUTUBE_VIDEOS_PAGE_CONTAINER = 'contents';

// -------------------- BEGIN: ARIA LABEL CONSTANTS ------------

  const ARIA_LABEL_TRANSCRIPT_BUTTON = 'Show transcript';

// -------------------- END  : ARIA LABEL CONSTANTS ------------

  /**
   * @function findElementByTagNameAndText
   * @description Finds all elements of a specified tag name that have exact
   * text content matching the provided text and are currently visible on the
   * page. Visibility considers the element and all its ancestors.
   *
   * @param {String} tagName - The tag name to search for.
   * @param {String} theText - The text content to match exactly.
   *
   * @returns {HTMLElement[]|null} An array of matching elements that are visible
   * on the page, or null if no matching elements are found.
   *
   * @throws {Error} If the tagName or theText is not a valid string.
   */
  function findElementByTagNameAndText(tagName, theText) {
    const errPrefix = '(findElementByTagNameAndText) ';

    // Validate input parameters
    if (typeof tagName !== 'string') {
      throw new Error(`${errPrefix}tagName must be a String`);
    }

    if (tagName.length === 0) {
      throw new Error(`${errPrefix}tagName cannot be an empty String`);
    }

    if (typeof theText !== 'string') {
      throw new Error(`${errPrefix}theText must be a String`);
    }

    if (theText.length === 0) {
      throw new Error(`${errPrefix}theText cannot be an empty String`);
    }

    // Select all elements with the specified tag name
    const elements = document.querySelectorAll(tagName);

    // Filter elements by exact text content and visibility
    const matchingElements = Array.from(elements).filter(element =>
        element.textContent.trim() === theText && isElementVisible(element)
    );

    return matchingElements.length > 0 ? matchingElements : null;
  }

  /**
   * @function findButtonByAriaLabel
   * @description Finds the first visible button element in the DOM tree that has
   * an aria-label attribute with the specified labelText. Throws an error if
   * more than one visible button matches. If no button matches, returns null.
   * Otherwise, returns a reference to the matching DOM element.
   *
   * @param {String} labelText - The text to match against the aria-label
   * attribute of button elements.
   *
   * @returns {HTMLElement|null} A reference to the matching DOM element, or null
   * if no match is found.
   *
   * @throws {Error} If there is more than one matching visible button, or if the
   * labelText is not a valid string.
   */
  function findButtonByAriaLabel(labelText) {
    const errPrefix = '(findButtonByAriaLabel) ';

    // Check that labelText is a valid string
    if (typeof labelText !== 'string') {
      throw new Error(`${errPrefix}labelText must be a String`);
    }

    if (labelText.length === 0) {
      throw new Error(`${errPrefix}labelText cannot be an empty String`);
    }

    // Get all button elements in the DOM
    const buttons = document.querySelectorAll('button');

    // Filter buttons by aria-label attribute and visibility
    const matchingButtons = Array.from(buttons).filter(button =>
        button.getAttribute('aria-label') === labelText && isElementVisible(button)
    );

    // Check for multiple matches
    if (matchingButtons.length > 1) {
      throw new Error(`${errPrefix}More than one visible button matches the aria-label "${labelText}"`);
    }

    // Return the matching button or null if no match is found
    return matchingButtons.length === 1 ? matchingButtons[0] : null;
  }

  /**
   * @function isElementVisible
   * @description Checks if an element is visible in the DOM.
   *
   * @param {HTMLElement} element - The DOM element to check for visibility.
   *
   * @returns {Boolean} True if the element is visible, false otherwise.
   */
  function isElementVisible(element) {
    if (!element) return false;

    const style = window.getComputedStyle(element);

    // Check if the element is hidden using CSS properties
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }

    // Check if any ancestor is hidden
    let parent = element.parentElement;
    while (parent) {
      const parentStyle = window.getComputedStyle(parent);
      if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden' || parentStyle.opacity === '0') {
        return false;
      }
      parent = parent.parentElement;
    }

    return true;
  }

  /**
   * @function isVisible
   * @description Checks if an element is visible in the viewport.
   *
   * @param {HTMLElement} element - The DOM element to check for visibility.
   *
   * @returns {Boolean} True if the element is visible, false otherwise.
   */
  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth) &&
        window.getComputedStyle(element).visibility !== 'hidden' &&
        window.getComputedStyle(element).display !== 'none'
    );
  }

  /**
   * Wait for a certain length of time using a
   *  promise so other code does not block.
   *
   * @param {Number} waitTimeMS - The number of
   *  milliseconds to wait.
   * @param {String} waitMsg - A message to
   *  print to the console.
   *
   * @return {Promise<void>}
   */
  async function waitForAWhile(waitTimeMS, waitMsg) {
    const errPrefix = `(waitForAWhile) `;

    if (
        typeof waitTimeMS !== 'number'
        || !Number.isInteger(waitTimeMS)
        || waitTimeMS < 0)
      throw new Error(`${errPrefix}The value in the waitTimeMS parameter is invalid.  Must be a non-negative integer numeric value.`);

    if (isEmptySafeString(waitMsg))
      throw new Error(`${errPrefix}The waitMsg parameter is empty or invalid.`);

    if (bVerbose_content) {
      console.log(CONSOLE_MESSAGE_CATEGORY_CONTENT_SCRIPT, `${waitMsg}`);
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  /**
   * @function getAllTranscriptTextAndTimes
   * @description Parses the DOM tree to build an array of transcript objects
   * with text, timestamp string, and offset in seconds.
   *
   * @returns {Array<Object>} An array of objects, each containing transcriptText,
   * timestampString, and offsetInSeconds fields.
   *
   * @throws {Error} If an element with the required class or tag is not found,
   * or if there are multiple matches for a required element.
   */
  function getAllTranscriptTextAndTimes() {
    const errPrefix = '(getAllTranscriptTextAndTimes) ';

    // Get all elements with the tag "ytd-transcript-segment-renderer"
    const transcriptElements = document.querySelectorAll('ytd-transcript-segment-renderer');
    const aryTranscriptElements = Array.from(transcriptElements).map(domElement => {
      // Find the child DIV element with the class "segment-timestamp"
      const timestampDivs = domElement.querySelectorAll('div.segment-timestamp');
      if (timestampDivs.length === 0) {
        throw new Error(`${errPrefix}No element with class "segment-timestamp" found`);
      }
      if (timestampDivs.length > 1) {
        throw new Error(`${errPrefix}Multiple elements with class "segment-timestamp" found`);
      }
      const timestampString = timestampDivs[0].textContent.trim();

      // Calculate the offset in seconds
      const offsetInSeconds = calculateOffsetInSeconds(timestampString);

      // Find the first DIV with tag "yt-formatted-string"
      const transcriptDivs = domElement.querySelectorAll('yt-formatted-string');
      if (transcriptDivs.length === 0) {
        throw new Error(`${errPrefix}No element with tag "yt-formatted-string" found`);
      }
      if (transcriptDivs.length > 1) {
        throw new Error(`${errPrefix}Multiple elements with tag "yt-formatted-string" found`);
      }
      const transcriptText = transcriptDivs[0].textContent.trim();

      return {
        transcriptText,
        timestampString,
        offsetInSeconds
      };
    });

    return aryTranscriptElements;
  }

  /**
   * @function calculateOffsetInSeconds
   * @description Calculates the offset in seconds from a timestamp string.
   *
   * @param {String} timestampString - The timestamp string to parse.
   *
   * @returns {Number} The offset in seconds.
   *
   * @throws {Error} If the timestamp string cannot be parsed into integers.
   */
  function calculateOffsetInSeconds(timestampString) {
    const errPrefix = '(calculateOffsetInSeconds) ';

    const aryTimePieces = timestampString.split(':');
    const aryPiecesAsIntegers = aryTimePieces.map(piece => {
      const intPiece = parseInt(piece, 10);
      if (isNaN(intPiece)) {
        throw new Error(`${errPrefix}Invalid timestamp string "${timestampString}"`);
      }
      return intPiece;
    });

    let totalSeconds = 0;
    for (let i = 0; i < aryPiecesAsIntegers.length; i++) {
      totalSeconds += aryPiecesAsIntegers[i] * Math.pow(60, aryPiecesAsIntegers.length - 1 - i);
    }

    return totalSeconds;
  }

  /**
   * @function removeChatContainer
   *
   * @description Finds and removes a DOM element with the tag name "chat-container".
   *
   * @returns {Boolean} Returns true if the element is found and removed, otherwise false.
   *
   * @throws {Error} If any errors occur during the execution of the
   * function, they are thrown with an error message prefixed by the
   * function name.
   */
  function removeChatContainer() {
    const errPrefix = '(removeChatContainer) ';

    try {
      const chatContainer = document.getElementById('chat-container');
      if (!chatContainer) {
        return false;
      }

      chatContainer.remove();

      return true;
    } catch (error) {
      console.error(`${errPrefix}${error.message}`);
      return false;
    }
  }

  /**
   * @function showTranscriptDiv
   * @description Locates DOM elements with the tag name
   * "ytd-engagement-panel-section-list-renderer" that have a descendant
   * with an attribute named "aria-label" and the value of that
   * attribute has the lowercased value equal to "show transcript".
   * If any such elements are found, sets the "display" style attribute
   * to "block" for each and returns the number of elements that were
   * found. Otherwise, returns null.
   *
   * @returns {Number|null} The number of elements found and modified,
   * or null if no elements are found.
   *
   * @throws {Error} If any errors occur during the execution of the
   * function, they are thrown with an error message prefixed by the
   * function name.
   */
  function showTranscriptDiv() {
    const errPrefix = '(showTranscriptDiv) ';

    try {
      const elements = document.getElementsByTagName('ytd-engagement-panel-section-list-renderer');
      let count = 0;

      /**
       * @function recursiveSearch
       * @description Recursively searches through the node's children to find
       * a node with the specified aria-label.
       *
       * @param {Node} node The DOM node to search.
       * @returns {Boolean} True if a matching node is found, false otherwise.
       */
      const recursiveSearch = (node) => {
        if (node.getAttribute && node.getAttribute('aria-label') &&
            node.getAttribute('aria-label').toLowerCase() === 'show transcript') {
          return true;
        }
        for (let i = 0; i < node.children.length; i++) {
          if (recursiveSearch(node.children[i])) {
            return true;
          }
        }
        return false;
      };

      for (let i = 0; i < elements.length; i++) {
        if (recursiveSearch(elements[i])) {
          elements[i].style.display = 'block';
          count++;
        }
      }

      return count > 0 ? count : null;
    } catch (error) {
      throw new Error(`${errPrefix}${error.message}`);
    }
  }


// -------------------- END  : FORM HANDLING ------------

// -------------------- BEGIN: TRANSCRIPT GRABBED CLASS ------------

// This file contains the object that the Chrome extension
//  passes back to the back-end server when a transcript
//  has been grabbed.

  /**
   * Class object that contains one transcript line from
   *  a video transcript.
   */
  class TranscriptLine {
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
  TranscriptLine.reconstituteObject = function (rawTranscriptLineObj) {
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
  class TranscriptGrabbed {
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
   *    to an active quiz.
   *
   * @return {TranscriptGrabbed}
   */
  TranscriptGrabbed.reconstituteTranscriptGrabbedObj = function (rawTranscriptGrabbed) {
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

  /**
   * This function gets the transcript from a video
   *  page.
   *
   * @return {Promise<TranscriptGrabbed>} - Returns
   *  a fully assembled transcript object that contains
   *  the contents of the video being shown on the
   *  current page.
   */
  async function getTranscript_async() {
    const errPrefix = `(getTranscript_async) `;

    // Find the Show Transcript button.
    let transcriptBtn =
        await findButtonByAriaLabel(ARIA_LABEL_TRANSCRIPT_BUTTON);

    if (!transcriptBtn) {
      // -------------------- BEGIN: REMOVE CHAT CONTAINER ------------

      // We check to see if the chat messages container element
      //  is showing and if so, and remove it immediately since it hides
      //  the DIV that has the show transcript button.
      const bWasChatMessagesWindowClosed = removeChatContainer();

      if (bWasChatMessagesWindowClosed) {
        if (bVerbose_content) {
          console.log(CONSOLE_MESSAGE_CATEGORY_CONTENT_SCRIPT, `Successfully found and closed the chat messages window.`);
        }

        // Make sure the transcript div is visible.
        showTranscriptDiv();
        await waitForAWhile(1000, 'Making the transcript DIV visible');
      } else {
        console.log(CONSOLE_MESSAGE_CATEGORY_CONTENT_SCRIPT, `The chat messages window was not visible or we were unable to close it.`);
      }

      // -------------------- END  : CLOSE CHAT MESSAGES WINDOW ------------

      // Try to find the Show Transcript button again.
      transcriptBtn =
          await findButtonByAriaLabel(ARIA_LABEL_TRANSCRIPT_BUTTON);
    }

    // We may need to hit the "Show more" button to
    // make it visible first.
    if (!transcriptBtn) {
      const aryExpandoButtons =
          findElementByTagNameAndText('tp-yt-paper-button', '...more');

      if (aryExpandoButtons) {
        const operationMsg = `Clicking ALL expando buttons now.`;

        if (bVerbose_content) {
          console.log(CONSOLE_MESSAGE_CATEGORY_CONTENT_SCRIPT, operationMsg);
        }

        aryExpandoButtons.forEach(button => button.click());

        await waitForAWhile(1000, operationMsg);

        if (bVerbose_content) {
          console.log(CONSOLE_MESSAGE_CATEGORY_CONTENT_SCRIPT, 'Attempting to find transcript button again...');
        }

        // Try to find the show transcript button again.
        transcriptBtn =
            await findButtonByAriaLabel(ARIA_LABEL_TRANSCRIPT_BUTTON);

        if (!transcriptBtn) {
          // -------------------- BEGIN: SHOW HIDDEN ENGAGEMENT PANEl ------------

          // There appears to be an odd bug in the YouTube host page
          //  code that hides the engagement panel (or fails to
          //  show it) that has the transcript button.  As a last
          //  resort, try and show it and try to find the button
          //  again.  Note, the engagement panel has a "visibility"
          //  attribute of "ENGAGEMENT_PANEL_VISIBILITY_HIDDEN".
          showTranscriptDiv();

          // Try to find the show transcript button again.
          transcriptBtn =
              await findButtonByAriaLabel(ARIA_LABEL_TRANSCRIPT_BUTTON);

          // -------------------- END  : SHOW HIDDEN ENGAGEMENT PANEl ------------
        }
      } else {
        throw new Error(`${errPrefix}Unable to find any expando buttons that might be hiding the show transcript button.`);
      }
    }

    if (!transcriptBtn) {
      // alert(`Unable to find a button with aria label: ${ARIA_LABEL_TRANSCRIPT_BUTTON}`);
      return null;
    }

    // Click the button.
    if (bVerbose_content) {
      console.log(CONSOLE_MESSAGE_CATEGORY_CONTENT_SCRIPT, `Clicking the transcript button now.`);
    }
    transcriptBtn.click();

    // TODO: Actually we should do repeated checks
    //  to get the count of transcript elements in the
    //  video transcript window and exit the check
    //  loop when more then X seconds have gone by
    //  and the non-zero count has not changed, indicating
    //  the transcript window has (most likely) finished
    //  loading its content.
    await waitForAWhile(1000, 'Waiting for transcript');

    /*
        transcriptText,
        timestampString,
        offsetInSeconds
     */
    const aryTranscriptObjs = getAllTranscriptTextAndTimes();

    // alert(`Transcript of length(${aryTranscriptObjs}) has been copied to the clipboard.`);

    // Build a transcript grabbed object and return it.
    const newTranscriptGrabbedObj =
        new TranscriptGrabbed();

    // >>>>> Actual video ID.
    const videoId = extractYouTubeVideoIdFromUrl(location.href);
    if (isEmptySafeString(videoId))
      throw new Error(`${errPrefix}The videoId variable is empty or invalid.`);
    newTranscriptGrabbedObj.idOfVideo = videoId;

    // >>>>> Array of transcript lines
    //
    // Convert the array of prototype-less transcript
    //  line objects to TranscriptLine objects.
    let countContiguousEmptyLines = 0;

    for (let ndx = 0; ndx < aryTranscriptObjs.length; ndx++) {
      const rawTranscriptLineObj = aryTranscriptObjs[ndx];

      if (!isNonNullObjectAndNotArray(rawTranscriptLineObj))
        throw new Error(`${errPrefix}The rawTranscriptLineObj variable for element(${ndx}) is not a valid object is not a valid object.`);

      // Sometimes there actually are a few empty lines.
      const useTranscriptText =
          rawTranscriptLineObj.transcriptText.trim();

      if (useTranscriptText.length < 1) {
        countContiguousEmptyLines++;

        // Too many contiguous empty lines?
        if (countContiguousEmptyLines > MAX_EMPTY_CONTIGUOUS_TRANSCRIPT_LINES)
          throw new Error(`${errPrefix}Too many contiguous empty transcript lines.`);
      } else {
        // Reset the contiguous empty line counter since we
        //  found a non-empty line.
        countContiguousEmptyLines = 0;

        const transcriptLineObj =
            new TranscriptLine(useTranscriptText, rawTranscriptLineObj.timestampString, rawTranscriptLineObj.offsetInSeconds);

        newTranscriptGrabbedObj.addTranscriptLineObject(transcriptLineObj);
      }
    }

    if (bVerbose_content) {
      console.log(CONSOLE_MESSAGE_CATEGORY_CONTENT_SCRIPT, `Returning new transcript object for video ID: ${videoId}`);
    }

    return newTranscriptGrabbedObj;
  }

  /**
   * This function gets the content from the current
   *  web page.
   *
   * @return {Object|null} - Returns the content
   *  of the current page or NULL if that content
   *  can not be accessed at this time.
   */
  function getContent_async() {
    const errPrefix = `(getContent_async) `;

    if (document) {
      const pageContentObj =
          {
            pageTitle: document.title,
            pageContent: document.body.innerText,
            urlToSrcPage: location.href
          }

      return pageContentObj;
    } else {
      return null;
    }

    /*
    const blob = new Blob([allContents], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = 'content.txt';
    a.click();
    URL.revokeObjectURL(url);
     */
  }

// -------------------- END  : TRANSCRIPT GRABBED CLASS ------------

  /**
   * Listener for messages to this content script.
   */
  chrome.runtime.onMessage.addListener(
      (message, sender, sendResponse) => {

        console.log(`CONTENT SCRIPT: Received message: `, message);

        let bIsAsyncResponse = false;

        if (sender.id !== chrome.runtime.id) {
          // Ignore messages that are not from the background script.
          console.log(`CONTENT SCRIPT: Ignoring unwanted or undefined message.`);
        } else {
          // Is it a request action, or response message?
          if (message.action) {
            // -------------------- BEGIN: PROCESS REQUEST ACTION ------------

            const requestObj = message;

            if (requestObj.action === 'contentScriptReadyCheck') {
              // The BACKGROUND script wants to know if we are ready.
              const statusMsg = `CONTENT SCRIPT: The content script is telling the BACKGROUND script that is ready.`;

              sendResponse(statusMsg);
            } else if (requestObj.action === 'relayedContentScriptReadyCheck') {
              // A non-content script besides the BACKGROUND script wants
              //  to know if we are ready.
              const statusMsg = `CONTENT SCRIPT: The content script is telling another NON-CONTENT script that is not the background script that is ready.`;
              sendResponse(statusMsg);
            } else if (requestObj.action === "extractText") {
              // Extract the text from the current web page (legacy).
              sendResponse({text: document.body.innerText});
            } else if (requestObj.action === "grabTranscript") {
              // Grab the current transcript and send it
              //  back to the popup.
              setTimeout(async () => {
                const grabbedTranscriptObj =
                    await getTranscript_async();

                if (grabbedTranscriptObj) {
                  const transcriptText =
                      grabbedTranscriptObj.getConcatenatedTextWithoutTimestamps();

                  // Give the popup the transcript text.
                  sendResponse({type: "transcriptGrabbed", text: transcriptText});
                } else {
                  // Tell the popup we could not grab the transcript.
                  sendResponse({type: "transcriptUnavailable", text: "The transcript is unavailable."});
                }
              }, 1);

              // Let the background script know we will return the
              //  response asynchronously.
              bIsAsyncResponse = true;
            } else if (requestObj.action === "grabContent") {
              console.log(`CONTENT SCRIPT: Received grabContent action request.`);

              // Grab the current content and send it
              //  back to the background script.
              setTimeout(async () => {
                console.log(`CONTENT SCRIPT: Getting page content.`);

                const strPageContentObj = getContent_async();

                if (typeof strPageContentObj === 'object') {
                  console.log(`CONTENT SCRIPT: Returning PAGE CONTENT response.`);

                  // Return the web page content.
                  sendResponse(
                      {
                        type: "contentGrabbed",
                        text: JSON.stringify(strPageContentObj)
                      }
                  );
                } else {
                  console.log(`CONTENT SCRIPT: Returning PAGE FAILURE response.`);

                  // Tell the background script we could not grab the content.
                  sendResponse({type: "contentUnavailable", text: "The content is unavailable."});
                }
              }, 1);

              // Let the background script know we will return the
              //  response asynchronously.
              bIsAsyncResponse = true;
            } else {
              console.log(`CONTENT SCRIPT: Unknown action: ${requestObj.action}`);
            }

            // -------------------- END  : PROCESS REQUEST ACTION ------------
          } else {
            // -------------------- BEGIN: HANDLE MESSAGE ------------

            if (['relayedContentScriptIsReady'].includes(message.type)) {
              console.log(`CONTENT SCRIPT: Ignoring safely message: ${message.type}`);
            } else if (message.type === "popupScriptReady") {
              // The popup script is ready.
              console.log(`CONTENT SCRIPT: Received "popupScriptReady" message.`);
            } else {
              console.log(`CONTENT SCRIPT: Unknown MESSAGE type: ${message.type}`);
            }

            // -------------------- END  : HANDLE MESSAGE ------------
          }
        }

        return bIsAsyncResponse;
      });

// -------------------- BEGIN: WAIT FOR OTHER SCRIPTS TO BE READY ------------

  let bIsBackgroundScriptIsNotReady = true;
  let bIsPopupScriptIsNotReady = true;

  while (bIsBackgroundScriptIsNotReady || bIsPopupScriptIsNotReady) {
    // Background script ready check.
    if (bIsBackgroundScriptIsNotReady) {
      bIsBackgroundScriptIsNotReady = !(await doReadyCheck('CONTENT SCRIPT', {action: 'backgroundScriptReadyCheck'}, 'background script'));
    }

    // Popup script ready check.
    if (bIsPopupScriptIsNotReady) {
      bIsPopupScriptIsNotReady = !(await doReadyCheck('CONTENT SCRIPT', {action: 'popupScriptReadyCheck'}, 'popup script'));
    }

    // Wait 100ms.
    await new Promise(resolve => setTimeout(resolve, 100));
  }

// -------------------- END  : WAIT FOR OTHER SCRIPTS TO BE READY ------------

// Tell the popup script we are ready.
  console.log(`CONTENT SCRIPT: Content script loaded.  Sending contentScriptReady message to background script...`);

  chrome.runtime.sendMessage({
    type: "contentScriptReady",
    message: "The content script is ready."
  });
}
// debugger;