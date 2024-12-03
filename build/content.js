/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/content.js":
/*!************************!*\
  !*** ./src/content.js ***!
  \************************/
/***/ ((__webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.a(__webpack_module__, async (__webpack_handle_async_dependencies__, __webpack_async_result__) => { try {
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _ready_check_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./ready-check.js */ "./src/ready-check.js");
/* harmony import */ var _misc_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./misc.js */ "./src/misc.js");
// This is the content script for the YouTube transcript
//  summarizer extension.

// Prevent duplicate loads.



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

    if ((0,_misc_js__WEBPACK_IMPORTED_MODULE_1__.isEmptySafeString)(idOfDomElement))
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

    if ((0,_misc_js__WEBPACK_IMPORTED_MODULE_1__.isEmptySafeString)(waitMsg))
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

      if ((0,_misc_js__WEBPACK_IMPORTED_MODULE_1__.isEmptySafeString)(transcriptText))
        throw new Error(`${errPrefix}The transcriptText parameter
       is empty or invalid.`);
      if ((0,_misc_js__WEBPACK_IMPORTED_MODULE_1__.isEmptySafeString)(timestampString))
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

      if ((0,_misc_js__WEBPACK_IMPORTED_MODULE_1__.isEmptySafeString)(this.constructorName))
        throw new Error(`${errPrefix}The this.constructorName field is empty or invalid.`);
      if ((0,_misc_js__WEBPACK_IMPORTED_MODULE_1__.isEmptySafeString)(this.idOfVideo))
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
    if ((0,_misc_js__WEBPACK_IMPORTED_MODULE_1__.isEmptySafeString)(videoId))
      throw new Error(`${errPrefix}The videoId variable is empty or invalid.`);
    newTranscriptGrabbedObj.idOfVideo = videoId;

    // >>>>> Array of transcript lines
    //
    // Convert the array of prototype-less transcript
    //  line objects to TranscriptLine objects.
    let countContiguousEmptyLines = 0;

    for (let ndx = 0; ndx < aryTranscriptObjs.length; ndx++) {
      const rawTranscriptLineObj = aryTranscriptObjs[ndx];

      if (!(0,_misc_js__WEBPACK_IMPORTED_MODULE_1__.isNonNullObjectAndNotArray)(rawTranscriptLineObj))
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
      bIsBackgroundScriptIsNotReady = !(await (0,_ready_check_js__WEBPACK_IMPORTED_MODULE_0__.doReadyCheck)('CONTENT SCRIPT', {action: 'backgroundScriptReadyCheck'}, 'background script'));
    }

    // Popup script ready check.
    if (bIsPopupScriptIsNotReady) {
      bIsPopupScriptIsNotReady = !(await (0,_ready_check_js__WEBPACK_IMPORTED_MODULE_0__.doReadyCheck)('CONTENT SCRIPT', {action: 'popupScriptReadyCheck'}, 'popup script'));
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
__webpack_async_result__();
} catch(e) { __webpack_async_result__(e); } }, 1);

/***/ }),

/***/ "./src/misc.js":
/*!*********************!*\
  !*** ./src/misc.js ***!
  \*********************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   appendEosCharIfNotPresent: () => (/* binding */ appendEosCharIfNotPresent),
/* harmony export */   compareStringsCharByChar: () => (/* binding */ compareStringsCharByChar),
/* harmony export */   conformErrorObjectMsg: () => (/* binding */ conformErrorObjectMsg),
/* harmony export */   countWords: () => (/* binding */ countWords),
/* harmony export */   extractTopBracketedContent: () => (/* binding */ extractTopBracketedContent),
/* harmony export */   extractYouTubeVideoIdFromUrl: () => (/* binding */ extractYouTubeVideoIdFromUrl),
/* harmony export */   findAllTemplateVarNames: () => (/* binding */ findAllTemplateVarNames),
/* harmony export */   findDomElementOrDie: () => (/* binding */ findDomElementOrDie),
/* harmony export */   findMainContentArea: () => (/* binding */ findMainContentArea),
/* harmony export */   generateUniqueId: () => (/* binding */ generateUniqueId),
/* harmony export */   getCurrentTimeExt: () => (/* binding */ getCurrentTimeExt),
/* harmony export */   insertHtmlAsFirstChild: () => (/* binding */ insertHtmlAsFirstChild),
/* harmony export */   insertHtmlAsFirstChildById: () => (/* binding */ insertHtmlAsFirstChildById),
/* harmony export */   isEmptyOrWhitespaceString: () => (/* binding */ isEmptyOrWhitespaceString),
/* harmony export */   isEmptySafeString: () => (/* binding */ isEmptySafeString),
/* harmony export */   isNonNullObjectAndNotArray: () => (/* binding */ isNonNullObjectAndNotArray),
/* harmony export */   isValidAudioBlob: () => (/* binding */ isValidAudioBlob),
/* harmony export */   isValidEnumValue: () => (/* binding */ isValidEnumValue),
/* harmony export */   makeStringSafe: () => (/* binding */ makeStringSafe),
/* harmony export */   reconstructObjectNoUndefineds: () => (/* binding */ reconstructObjectNoUndefineds),
/* harmony export */   stringToObjectPropertyName: () => (/* binding */ stringToObjectPropertyName),
/* harmony export */   substituteWithoutEval: () => (/* binding */ substituteWithoutEval)
/* harmony export */ });
// Some helpful miscellaneous routines.


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
 * Simple helper function to conform error objects that may also be plain strings
 * 	to a string error message.
 *
 * @param {Object|string|null} err - The error object, or error message, or NULL.
 *
 * @return {string} - Returns the err value itself if it's a string.  If err is
 *  an object, and it has a 'message' property, it will return the err.message
 *  property value.  Otherwise, the default empty value is returned.
 */
function conformErrorObjectMsg(err)
{
  let errMsg = '(none)';

  if (typeof err == 'string')
    errMsg = err;
  else
  {
    if (err && err.message)
      errMsg = err.message;
  }

  return errMsg;
}

/**
 * Checks if a string is empty or contains only whitespaces.
 * @param {string} str The string to check.
 * @return {boolean} Whether {@code str} is empty or whitespace only.
 */
function isEmptyOrWhitespaceString (str) {
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
 * This function returns TRUE if and only if the given object is not NULL or
 * 	'undefined', is not NULL, and is of type 'object'.  Anything else rturns
 * 	FALSE
 *
 * @param obj - The alleged object to inspect.
 *
 * @return {boolean}
 */
function isNonNullObjectAndNotArray(obj) {
  let errPrefix = '(isNonNullObjectAndNotArray) ';

  if (typeof obj === 'undefined' || obj == null)
    return false;

  if (Array.isArray(obj))
    return false;

  return (typeof obj === 'object');
}

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
 * Inserts the given HTML block as the first child of the
 *  given parent DOM element.
 *
 * @param {HTMLElement} parentElement - The parent element where
 *        the HTML block will be inserted as the first child.
 * @param {string} htmlBlock - The HTML block to be inserted.
 *
 * @throws Will throw an error if either `parentElementId` or `htmlBlock`
 *         is not a string or is empty.
 */
function insertHtmlAsFirstChild(parentElement, htmlBlock) {
  const errPrefix = '(insertHtmlAsFirstChild) ';

  // Validate input parameters
  if (!(parentElement instanceof HTMLElement))
    throw new Error(`${errPrefix}The value in the parentDomElement parameter is not a HTMLElement object.`);

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
  let extendedRect = { ...rect };

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
    console.info(`${errPrefix}Unable to find a DIV with element ID: ${mainContainerElementId}`);

    mainContainerElementId = 'content';
    document.getElementById(mainContainerElementId);
  }

  if (mainContainerElement) {
    console.info(`${errPrefix}Successfully located main container element using element ID: ${mainContainerElementId}`);

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

// -------------------- BEGIN: VALIDATE AUDIO BLOB ------------

/**
 * This function returns TRUE if the given input
 *  parameter is an audio blob, FALSE if not.
 *
 * @param {Blob} audioBlob - The audio blob to
 *  validate
 *
 * @return {boolean}
 */
function isValidAudioBlob(audioBlob) {
  // Basic validation to check if it's a Blob and has an audio MIME type.
  if (!(audioBlob instanceof Blob))
    return false;

  return audioBlob.type.startsWith('audio/');
}

// -------------------- END  : VALIDATE AUDIO BLOB ------------

/**
 * This function takes a string and conditions it so that
 *  it can be used directly as a JavaScript property name
 *  without having to enclose it in double-quotes.  This
 *  function is usually used by a code generator.
 *
 * @param {String} str - The string to turn into a
 *  property name.
 * @param {Boolean} bUppercaseIt - If TRUE the
 *  returned string will be uppercased, otherwise,
 *  it won't be.
 *
 * @return {String}
 */
function stringToObjectPropertyName(str, bUppercaseIt = true) {
  // Trim the string
  let result = str.trim();

  // Replace spaces, dashes, and periods with underscores
  result = result.replace(/[ -.]/g, '_');

  // Remove invalid characters
  // A valid JavaScript property name can start with $, _, or any character in the Unicode categories “Uppercase letter (Lu)”, “Lowercase letter (Ll)”, “Titlecase letter (Lt)”, “Modifier letter (Lm)”, “Other letter (Lo)”, or “Letter number (Nl)”.
  // And after the first character, it can also include digits (0-9), in addition to the characters mentioned above.
  // For simplicity, this regex keeps letters, digits, $, and _, which covers most common use cases and avoids complexities related to Unicode categories.
  result = result.replace(/[^a-zA-Z0-9_$]/g, '');

  // Uppercase the result if bUppercaseIt is true
  if (bUppercaseIt) {
    result = result.toUpperCase();
  }

  return result;
}

/**
 * Validate a value as belonging to an enumerated constant
 *  object.
 *
 * @param {*} theValue - A value that should match one of the
 *  object values in the enumerated constant object.
 * @param {Object} theEnumeratedConstantObj - The object that
 *  contains the enumerated values.
 *
 * @return {boolean} - Returns TRUE if the given value matches
 *  exactly one of the values in the enumerated constant object,
 *  FALSE if not.
 */
function isValidEnumValue(theValue, theEnumeratedConstantObj) {
  const errPrefix = `(validateEnumValue) `;

  if (isEmptySafeString(theValue))
    throw new Error(`${errPrefix}The theValue parameter is empty or invalid.`);
  if (typeof theEnumeratedConstantObj !== 'object' || theEnumeratedConstantObj === null)
  	throw new Error(`${errPrefix}The theEnumeratedConstant parameter is not a valid object.`);

  const validValues= Object.values(theEnumeratedConstantObj);
  return validValues.includes(theValue);
}

/**
 * Reconstructs an object excluding any properties that have `undefined`
 * values. It performs a deep copy of the object, ensuring no references
 * to the original object are kept.
 *
 * @param {Object} theObj The object to be reconstructed without `undefined`
 *                        values.
 *
 * @returns {Object} A new object with the same structure as `theObj`, but
 *                   without any `undefined` values.
 *
 * @throws {TypeError} If `theObj` is not an object or is null.
 */
function reconstructObjectNoUndefineds(theObj) {
  const errPrefix = '(reconstructObjectNoUndefineds) ';

  if (typeof theObj !== 'object' || theObj === null) {
    throw new TypeError(`${errPrefix}Input must be a non-null object.`);
  }

  /**
   * A helper function to recursively clone an object excluding properties
   * with `undefined` values.
   *
   * @param {Object} obj The object to clone.
   *
   * @returns {Object} The cloned object without `undefined` values.
   */
  function cloneObjectExcludingUndefined(obj) {
    return Object.entries(obj).reduce((acc, [key, value]) => {
      if (typeof value === 'object' && value !== null) {
        acc[key] = cloneObjectExcludingUndefined(value);
      } else if (value !== undefined) {
        acc[key] = value;
      }
      return acc;
    }, Array.isArray(obj) ? [] : {});
  }

  return cloneObjectExcludingUndefined(theObj);
}

/**
 * Counts words in a given text, taking into
 *  account various punctuation and ensuring
 *  words separated by punctuation are counted correctly.
 *  Punctuation is replaced by a single space to ensure
 *  proper word separation.
 *
 * @param {string} text The text to count words in.
 *
 * @return {number} The word count.
 */
function countWords(text) {
  // Replace punctuation with a single space to ensure no words are concatenated.
  const sanitizedText = text.replace(/[\.,-\/#!$%\^&\*;:{}=\-_`~()\[\]\"\'\?]/g, " ");

  // Split the text into words using whitespace delimiters; filter(Boolean) removes any empty strings from the resulting array.
  const words = sanitizedText.split(/\s+/).filter(Boolean);

  return words.length;
}

/**
 * Compares two strings character by character and prints the
 * corresponding characters ordinally between each string along
 * with their ASCII codes.
 *
 * @param {String} str1 - The first string to compare.
 * @param {String} str2 - The second string to compare.
 *
 * @throws {Error} - If either of the input parameters is not a string.
 */
function compareStringsCharByChar(str1, str2) {
  const errPrefix = '(compareStringsCharByChar) ';

  // Error checks
  if (typeof str1 !== 'string') {
    throw new Error(`${errPrefix}The first input parameter is not a string.`);
  }
  if (typeof str2 !== 'string') {
    throw new Error(`${errPrefix}The second input parameter is not a string.`);
  }

  const maxLength = Math.max(str1.length, str2.length);

  for (let i = 0; i < maxLength; i++) {
    const char1 = i < str1.length ? str1[i] : '(none)';
    const char2 = i < str2.length ? str2[i] : '(none)';
    const ascii1 = char1 !== '(none)' ? char1.charCodeAt(0) : '(none)';
    const ascii2 = char2 !== '(none)' ? char2.charCodeAt(0) : '(none)';

    console.log(`[${i}] (${char1}, ${ascii1}), (${char2}, ${ascii2})`);
  }

  console.log(`str1: ${str1}`);
  console.log(`str2: ${str2}`);
}

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

/**
 * Replacement for uuidV4() that generates a robust unique ID.
 *
 * @return {*}
 */
const generateUniqueId = () => {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);

  // Format as a UUID (version 4 compliant)
  return `${array[0].toString(16).padStart(2, '0')}${array[1].toString(16).padStart(2, '0')}` +
      `-${array[2].toString(16).padStart(2, '0')}${array[3].toString(16).padStart(2, '0')}` +
      `-${(array[4] & 0x0f | 0x40).toString(16).padStart(2, '0')}${array[5].toString(16).padStart(2, '0')}` +
      `-${(array[6] & 0x3f | 0x80).toString(16).padStart(2, '0')}${array[7].toString(16).padStart(2, '0')}` +
      `-${array[8].toString(16).padStart(2, '0')}${array[9].toString(16).padStart(2, '0')}` +
      `${array[10].toString(16).padStart(2, '0')}${array[11].toString(16).padStart(2, '0')}` +
      `${array[12].toString(16).padStart(2, '0')}${array[13].toString(16).padStart(2, '0')}` +
      `${array[14].toString(16).padStart(2, '0')}${array[15].toString(16).padStart(2, '0')}`;
};

// -------------------- BEGIN: PROMPT FILE MANIPULATION ROUTINES ------------

/**
 * Extracts the content between the first occurrence of an opening square bracket (`[`)
 * and the last occurrence of a closing square bracket (`]`) in a given string.
 *
 * @param {string} str - The input string to process. Must be a non-empty string.
 * @returns {string|null} - The content between the brackets, excluding the brackets themselves.
 *                          Returns `null` if no valid bracketed content is found.
 * @throws {Error} - Throws an error if the input is not a non-empty string.
 */
function extractTopBracketedContent(str) {
  if (typeof str !== 'string' || str.length === 0) {
    throw new Error("Input must be a non-empty string");
  }

  let start = -1;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '[') {
      start = i;
      break;
    }
  }

  if (start === -1) {
    return null;
  }

  let end = -1;
  for (let i = str.length - 1; i >= 0; i--) {
    if (str[i] === ']') {
      end = i;
      break;
    }
  }

  if (end === -1 || end <= start) {
    return null;
  }

  return str.slice(start + 1, end);
}

/**
 * Extracts all unique variable names found in a template string.
 * Variable names are expected to be in the format ${variableName}.
 *
 * @param {string} str - The template string to search for variable names.
 * @returns {string[]} - An array of unique variable names (strings) found.
 * @throws {Error} - Throws an error if the input is not a non-empty string.
 */
function findAllTemplateVarNames(str) {
  if (typeof str !== 'string' || str.length === 0) {
    throw new Error("The input must be a non-empty string.");
  }

  const templateVariablePattern = /\${(.*?)}/g;
  const variableNames = new Set();

  let match;
  while ((match = templateVariablePattern.exec(str)) !== null) {
    const variableName = match[1].trim();
    if (variableName) {
      variableNames.add(variableName);
    }
  }

  return Array.from(variableNames);
}

/**
 * Replaces all template variable references in a given string with the values
 * provided by the `funcDoTheEval` callback, which evaluates each variable name.
 *
 * @param {string} llmPromptToFixUp - The template string with variables in the format ${variableName}.
 * @param {function} funcDoTheEval - A callback function that takes a variable name and returns its value.
 * @returns {string} - The fully substituted string with all template variables replaced by their values.
 * @throws {Error} - Throws an error if any referenced variable is missing in `funcDoTheEval`.
 */
function substituteWithoutEval(llmPromptToFixUp, funcDoTheEval) {
  if (typeof llmPromptToFixUp !== 'string' || llmPromptToFixUp.length === 0) {
    throw new Error("The input prompt must be a non-empty string.");
  }
  if (typeof funcDoTheEval !== 'function') {
    throw new Error("funcDoTheEval must be a function.");
  }

  const variableNames = findAllTemplateVarNames(llmPromptToFixUp);

  const variablesRecord = {};
  variableNames.forEach(variableName => {
    const value = funcDoTheEval(variableName);
    if (typeof value === 'undefined') {
      throw new Error(`Variable '${variableName}' is undefined.`);
    }
    variablesRecord[variableName] = value;
  });

  return llmPromptToFixUp.replace(/\${(.*?)}/g, (_, variableName) => {
    return String(variablesRecord[variableName]);
  });
}

/**
 * Appends an end-of-sentence (EOS) character (e.g., ".", "!", "?") to a string if not already present.
 * Validates that the input string is non-empty after trimming.
 *
 * @param {string} str - The input string to validate and potentially modify.
 * @returns {string} - The input string with an EOS character appended if not already present.
 * @throws {Error} - Throws an error if the input string is empty after trimming.
 */
function appendEosCharIfNotPresent(str) {
  if (typeof str !== 'string' || str.trim().length === 0) {
    throw new Error("Input string cannot be empty after trimming.");
  }

  const eosChars = ['.', '!', '?'];
  return eosChars.includes(str.trim().slice(-1)) ? str : `${str}.`;
}


// -------------------- END  : PROMPT FILE MANIPULATION ROUTINES ------------

/***/ }),

/***/ "./src/ready-check.js":
/*!****************************!*\
  !*** ./src/ready-check.js ***!
  \****************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   doReadyCheck: () => (/* binding */ doReadyCheck)
/* harmony export */ });
/* harmony import */ var _misc_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./misc.js */ "./src/misc.js");


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
async function doReadyCheck(contextPrefix, readyCheckMsgObj, targetScriptName) {
    let errPrefix = `(doReadyCheck) `;

    if ((0,_misc_js__WEBPACK_IMPORTED_MODULE_0__.isEmptySafeString)(contextPrefix))
        throw new Error(`${errPrefix}The contextPrefix parameter is empty or invalid.`);

    errPrefix = `(${contextPrefix}::doReadyCheck) `;

    if (typeof readyCheckMsgObj !== 'object')
        throw new Error(`${errPrefix}The readyCheckMsgObj parameter is invalid.`);
    if ((0,_misc_js__WEBPACK_IMPORTED_MODULE_0__.isEmptySafeString)(targetScriptName))
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

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/async module */
/******/ 	(() => {
/******/ 		var webpackQueues = typeof Symbol === "function" ? Symbol("webpack queues") : "__webpack_queues__";
/******/ 		var webpackExports = typeof Symbol === "function" ? Symbol("webpack exports") : "__webpack_exports__";
/******/ 		var webpackError = typeof Symbol === "function" ? Symbol("webpack error") : "__webpack_error__";
/******/ 		var resolveQueue = (queue) => {
/******/ 			if(queue && queue.d < 1) {
/******/ 				queue.d = 1;
/******/ 				queue.forEach((fn) => (fn.r--));
/******/ 				queue.forEach((fn) => (fn.r-- ? fn.r++ : fn()));
/******/ 			}
/******/ 		}
/******/ 		var wrapDeps = (deps) => (deps.map((dep) => {
/******/ 			if(dep !== null && typeof dep === "object") {
/******/ 				if(dep[webpackQueues]) return dep;
/******/ 				if(dep.then) {
/******/ 					var queue = [];
/******/ 					queue.d = 0;
/******/ 					dep.then((r) => {
/******/ 						obj[webpackExports] = r;
/******/ 						resolveQueue(queue);
/******/ 					}, (e) => {
/******/ 						obj[webpackError] = e;
/******/ 						resolveQueue(queue);
/******/ 					});
/******/ 					var obj = {};
/******/ 					obj[webpackQueues] = (fn) => (fn(queue));
/******/ 					return obj;
/******/ 				}
/******/ 			}
/******/ 			var ret = {};
/******/ 			ret[webpackQueues] = x => {};
/******/ 			ret[webpackExports] = dep;
/******/ 			return ret;
/******/ 		}));
/******/ 		__webpack_require__.a = (module, body, hasAwait) => {
/******/ 			var queue;
/******/ 			hasAwait && ((queue = []).d = -1);
/******/ 			var depQueues = new Set();
/******/ 			var exports = module.exports;
/******/ 			var currentDeps;
/******/ 			var outerResolve;
/******/ 			var reject;
/******/ 			var promise = new Promise((resolve, rej) => {
/******/ 				reject = rej;
/******/ 				outerResolve = resolve;
/******/ 			});
/******/ 			promise[webpackExports] = exports;
/******/ 			promise[webpackQueues] = (fn) => (queue && fn(queue), depQueues.forEach(fn), promise["catch"](x => {}));
/******/ 			module.exports = promise;
/******/ 			body((deps) => {
/******/ 				currentDeps = wrapDeps(deps);
/******/ 				var fn;
/******/ 				var getResult = () => (currentDeps.map((d) => {
/******/ 					if(d[webpackError]) throw d[webpackError];
/******/ 					return d[webpackExports];
/******/ 				}))
/******/ 				var promise = new Promise((resolve) => {
/******/ 					fn = () => (resolve(getResult));
/******/ 					fn.r = 0;
/******/ 					var fnQueue = (q) => (q !== queue && !depQueues.has(q) && (depQueues.add(q), q && !q.d && (fn.r++, q.push(fn))));
/******/ 					currentDeps.map((dep) => (dep[webpackQueues](fnQueue)));
/******/ 				});
/******/ 				return fn.r ? promise : getResult();
/******/ 			}, (err) => ((err ? reject(promise[webpackError] = err) : outerResolve(exports)), resolveQueue(queue)));
/******/ 			queue && queue.d < 0 && (queue.d = 0);
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module used 'module' so it can't be inlined
/******/ 	var __webpack_exports__ = __webpack_require__("./src/content.js");
/******/ 	
/******/ })()
;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,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c2lvbi8uL3NyYy9jb250ZW50LmpzIiwid2VicGFjazovL2V4dGVuc2lvbi8uL3NyYy9taXNjLmpzIiwid2VicGFjazovL2V4dGVuc2lvbi8uL3NyYy9yZWFkeS1jaGVjay5qcyIsIndlYnBhY2s6Ly9leHRlbnNpb24vd2VicGFjay9ib290c3RyYXAiLCJ3ZWJwYWNrOi8vZXh0ZW5zaW9uL3dlYnBhY2svcnVudGltZS9hc3luYyBtb2R1bGUiLCJ3ZWJwYWNrOi8vZXh0ZW5zaW9uL3dlYnBhY2svcnVudGltZS9kZWZpbmUgcHJvcGVydHkgZ2V0dGVycyIsIndlYnBhY2s6Ly9leHRlbnNpb24vd2VicGFjay9ydW50aW1lL2hhc093blByb3BlcnR5IHNob3J0aGFuZCIsIndlYnBhY2s6Ly9leHRlbnNpb24vd2VicGFjay9ydW50aW1lL21ha2UgbmFtZXNwYWNlIG9iamVjdCIsIndlYnBhY2s6Ly9leHRlbnNpb24vd2VicGFjay9iZWZvcmUtc3RhcnR1cCIsIndlYnBhY2s6Ly9leHRlbnNpb24vd2VicGFjay9zdGFydHVwIiwid2VicGFjazovL2V4dGVuc2lvbi93ZWJwYWNrL2FmdGVyLXN0YXJ0dXAiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gVGhpcyBpcyB0aGUgY29udGVudCBzY3JpcHQgZm9yIHRoZSBZb3VUdWJlIHRyYW5zY3JpcHRcclxuLy8gIHN1bW1hcml6ZXIgZXh0ZW5zaW9uLlxyXG5cclxuLy8gUHJldmVudCBkdXBsaWNhdGUgbG9hZHMuXHJcbmltcG9ydCB7ZG9SZWFkeUNoZWNrfSBmcm9tIFwiLi9yZWFkeS1jaGVjay5qc1wiO1xyXG5pbXBvcnQge2lzRW1wdHlTYWZlU3RyaW5nLCBpc05vbk51bGxPYmplY3RBbmROb3RBcnJheX0gZnJvbSBcIi4vbWlzYy5qc1wiO1xyXG5cclxuLy8gRG9uJ3QgbG9hZCB0aGUgY29udGVudCBzY3JpcHQgaW50byBvdXIgcG9wdXAgc2NyaXB0LCBvclxyXG4vLyAgYW55IG90aGVyIGludGVybmFsIGV4dGVuc2lvbiBzY3JpcHQsIG9yIHdlIHdpbGwgaGF2ZVxyXG4vLyAgZHVwbGljYXRlIGV2ZW50IGhhbmRsZXIgcHJvYmxlbXMuXHJcbmlmIChsb2NhdGlvbi5wcm90b2NvbCA9PT0gJ2Nocm9tZS1leHRlbnNpb246Jykge1xyXG4gIC8vIEV4aXQgZWFybHkgZm9yIGFueSBpbnRlcm5hbCBleHRlbnNpb24gcGFnZXNcclxuICBjb25zb2xlLmxvZyhcIkNPTlRFTlQgU0NSSVBUOiAtLS0tLT4+Pj4+IENvbnRlbnQgc2NyaXB0IHNraXBwZWQgZm9yIGludGVybmFsIGV4dGVuc2lvbiBwYWdlcy5cIik7XHJcbn0gZWxzZSB7XHJcblxyXG4gIGlmICh0eXBlb2Ygd2luZG93LmJJc0xvYWRpbmdPckxvYWRlZCA9PT0gJ2Jvb2xlYW4nICYmIHdpbmRvdy5iSXNMb2FkaW5nT3JMb2FkZWQgPT09IHRydWUpIHtcclxuICAgIGNvbnNvbGUubG9nKGBDT05URU5UIFNDUklQVDogSWdub3JpbmcgZHVwbGljYXRlIGxvYWQgYXR0ZW1wdC5gKTtcclxuICB9XHJcblxyXG4gIHdpbmRvdy5iSXNMb2FkaW5nT3JMb2FkZWQgPSB0cnVlO1xyXG5cclxuICBsZXQgdHJhbnNjcmlwdEdyYWJiZWRPYmogPSBudWxsO1xyXG5cclxuICBjb25zdCBERUZBVUxUX0NPTkZJR19QT1BVUF9VTkRFUl9ESVZfSUQgPSAndmlld3BvcnQnO1xyXG4gIGNvbnN0IENPTlNPTEVfTUVTU0FHRV9DQVRFR09SWV9DT05URU5UX1NDUklQVCA9ICdjb250ZW50LXNjcmlwdCc7XHJcblxyXG4gIGxldCBiVmVyYm9zZV9jb250ZW50ID0gdHJ1ZTtcclxuXHJcbiAgLyoqXHJcbiAgIC8qKlxyXG4gICAqIFZhbGlkYXRlcyB0aGUgZXhpc3RlbmNlIGFuZCB0eXBlIG9mIGEgRE9NIGVsZW1lbnQuXHJcbiAgICogIFRocm93cyBhbiBlcnJvciBpZiBhbnkgb2YgdGhlIHZhbGlkYXRpb25zIGZhaWwuXHJcbiAgICogIE90aGVyd2lzZSwgaXQgc2ltcGx5IHJldHVybnMuXHJcbiAgICpcclxuICAgKiBAcGFyYW0ge1N0cmluZ30gaWRPZkRvbUVsZW1lbnQgLSBUaGUgSUQgb2YgdGhlXHJcbiAgICogIERPTSBlbGVtZW50IHRvIGxvb2sgZm9yLlxyXG4gICAqIEBwYXJhbSB7Kn0gZXhwZWN0ZWRUeXBlIC0gVGhlIG9iamVjdCBwcm90b3R5cGVcclxuICAgKiAgb2YgdGhlIGV4cGVjdGVkIHR5cGUuICBGb3IgZXhhbXBsZSxcclxuICAgKiAgSHRtbEJ1dHRvbkVsZW1lbnQsIGV0Yy5cclxuICAgKlxyXG4gICAqIEByZXR1cm4geyp9IC0gUmV0dXJucyBhIHJlZmVyZW5jZSB0byB0aGUgRE9NIGVsZW1lbnRcclxuICAgKiAgdGhhdCBoYXMgdGhlIGdpdmVuIElELlxyXG4gICAqL1xyXG4gIGZ1bmN0aW9uIGZpbmREb21FbGVtZW50T3JEaWUoaWRPZkRvbUVsZW1lbnQsIGV4cGVjdGVkVHlwZSkge1xyXG4gICAgY29uc3QgZXJyUHJlZml4ID0gYChmaW5kRG9tRWxlbWVudE9yRGllKSBgO1xyXG5cclxuICAgIGlmIChpc0VtcHR5U2FmZVN0cmluZyhpZE9mRG9tRWxlbWVudCkpXHJcbiAgICAgIHRocm93IG5ldyBFcnJvcihgJHtlcnJQcmVmaXh9VGhlIGlkT2ZEb21FbGVtZW50IHBhcmFtZXRlciBpcyBlbXB0eSBvciBpbnZhbGlkLmApO1xyXG5cclxuICAgIGlmICh0eXBlb2YgZXhwZWN0ZWRUeXBlID09PSAndW5kZWZpbmVkJyB8fCBleHBlY3RlZFR5cGUgPT09IG51bGwpXHJcbiAgICAgIHRocm93IG5ldyBFcnJvcihgJHtlcnJQcmVmaXh9VGhlIGV4cGVjdGVkVHlwZSBwYXJhbWV0ZXIgaXMgaW52YWxpZC5gKTtcclxuXHJcbiAgICAvLyBGaW5kIHRoZSBidXR0b24gZWxlbWVudFxyXG4gICAgY29uc3QgZG9tRWxlbWVudCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGlkT2ZEb21FbGVtZW50KTtcclxuXHJcbiAgICBpZiAoIWRvbUVsZW1lbnQpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKGAke2VyclByZWZpeH1FbGVtZW50IHdpdGggSUQgXCIke2lkT2ZEb21FbGVtZW50fVwiIGNhbm5vdCBiZSBmb3VuZC5gKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoIShkb21FbGVtZW50IGluc3RhbmNlb2YgZXhwZWN0ZWRUeXBlKSkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7ZXJyUHJlZml4fUVsZW1lbnQgd2l0aCBJRCBcIiR7aWRPZkRvbUVsZW1lbnR9XCIgaXMgbm90IGEgJHtleHBlY3RlZFR5cGV9IGVsZW1lbnQuYCk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGRvbUVsZW1lbnQ7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBJbnNlcnRzIHRoZSBnaXZlbiBIVE1MIGJsb2NrIGFzIHRoZSBmaXJzdCBjaGlsZCBvZiB0aGUgZWxlbWVudFxyXG4gICAqIGlkZW50aWZpZWQgYnkgYHBhcmVudEVsZW1lbnRJZGAgaW4gdGhlIGN1cnJlbnQgRE9NIHRyZWUuXHJcbiAgICpcclxuICAgKiBAcGFyYW0ge3N0cmluZ30gcGFyZW50RWxlbWVudElkIC0gVGhlIElEIG9mIHRoZSBwYXJlbnQgZWxlbWVudCB3aGVyZVxyXG4gICAqICAgICAgICB0aGUgSFRNTCBibG9jayB3aWxsIGJlIGluc2VydGVkIGFzIHRoZSBmaXJzdCBjaGlsZC5cclxuICAgKiBAcGFyYW0ge3N0cmluZ30gaHRtbEJsb2NrIC0gVGhlIEhUTUwgYmxvY2sgdG8gYmUgaW5zZXJ0ZWQuXHJcbiAgICpcclxuICAgKiBAdGhyb3dzIFdpbGwgdGhyb3cgYW4gZXJyb3IgaWYgYHBhcmVudEVsZW1lbnRJZGAgZG9lcyBub3QgY29ycmVzcG9uZFxyXG4gICAqICAgICAgICAgdG8gYW4gZXhpc3RpbmcgZWxlbWVudCBpbiB0aGUgRE9NLlxyXG4gICAqIEB0aHJvd3MgV2lsbCB0aHJvdyBhbiBlcnJvciBpZiBlaXRoZXIgYHBhcmVudEVsZW1lbnRJZGAgb3IgYGh0bWxCbG9ja2BcclxuICAgKiAgICAgICAgIGlzIG5vdCBhIHN0cmluZyBvciBpcyBlbXB0eS5cclxuICAgKi9cclxuICBmdW5jdGlvbiBpbnNlcnRIdG1sQXNGaXJzdENoaWxkQnlJZChwYXJlbnRFbGVtZW50SWQsIGh0bWxCbG9jaykge1xyXG4gICAgY29uc3QgZXJyUHJlZml4ID0gJyhpbnNlcnRIdG1sQXNGaXJzdENoaWxkQnlJZCkgJztcclxuXHJcbiAgICAvLyBWYWxpZGF0ZSBpbnB1dCBwYXJhbWV0ZXJzXHJcbiAgICBpZiAodHlwZW9mIHBhcmVudEVsZW1lbnRJZCAhPT0gJ3N0cmluZycgfHwgcGFyZW50RWxlbWVudElkLnRyaW0oKSA9PT0gJycpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKGAke2VyclByZWZpeH1wYXJlbnRFbGVtZW50SWQgbXVzdCBiZSBhIG5vbi1lbXB0eSBzdHJpbmcuYCk7XHJcbiAgICB9XHJcbiAgICBpZiAodHlwZW9mIGh0bWxCbG9jayAhPT0gJ3N0cmluZycpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKGAke2VyclByZWZpeH1odG1sQmxvY2sgbXVzdCBiZSBhIHN0cmluZy5gKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBBdHRlbXB0IHRvIGxvY2F0ZSB0aGUgcGFyZW50IGVsZW1lbnRcclxuICAgIGNvbnN0IHBhcmVudEVsZW1lbnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChwYXJlbnRFbGVtZW50SWQpO1xyXG4gICAgaWYgKCFwYXJlbnRFbGVtZW50KSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcihgJHtlcnJQcmVmaXh9RWxlbWVudCB3aXRoIElEICcke3BhcmVudEVsZW1lbnRJZH0nIG5vdCBmb3VuZC5gKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBDcmVhdGUgYSBjb250YWluZXIgZm9yIHRoZSBIVE1MIGJsb2NrXHJcbiAgICBjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgIGNvbnRhaW5lci5pbm5lckhUTUwgPSBodG1sQmxvY2s7XHJcblxyXG4gICAgLy8gQ2hlY2sgaWYgdGhlcmUncyBhbiBleGlzdGluZyBmaXJzdCBjaGlsZFxyXG4gICAgaWYgKHBhcmVudEVsZW1lbnQuZmlyc3RDaGlsZCkge1xyXG4gICAgICBwYXJlbnRFbGVtZW50Lmluc2VydEJlZm9yZShjb250YWluZXIuZmlyc3RDaGlsZCwgcGFyZW50RWxlbWVudC5maXJzdENoaWxkKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHBhcmVudEVsZW1lbnQuYXBwZW5kQ2hpbGQoY29udGFpbmVyLmZpcnN0Q2hpbGQpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tIEJFR0lOOiBHVUVTUyBUSEUgTUFJTiBDT05URU5UIEFSRUEgLS0tLS0tLS0tLS0tXHJcblxyXG4gIC8qKlxyXG4gICAqIEF0dGVtcHRzIHRvIGdldCBhbiBleHRlbmRlZCBib3VuZGluZyBjbGllbnQgcmVjdCBmb3IgYSBET00gZWxlbWVudCxcclxuICAgKiBjb25zaWRlcmluZyBvdmVyZmxvdywgdHJhbnNmb3JtYXRpb25zLCBhbmQgb3RoZXIgZmFjdG9ycyB0aGF0IG1pZ2h0XHJcbiAgICogYWZmZWN0IHRoZSB0cnVlIHZpc2libGUgc2l6ZSBvZiB0aGUgZWxlbWVudC5cclxuICAgKlxyXG4gICAqIEBwYXJhbSB7RWxlbWVudH0gZG9tRWxlbWVudCAtIFRoZSBET00gZWxlbWVudCB0byBtZWFzdXJlLlxyXG4gICAqIEByZXR1cm4ge0RPTVJlY3R9IEFuIG9iamVjdCBzaW1pbGFyIHRvIHdoYXQgZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkgcmV0dXJucyBidXRcclxuICAgKiAgICAgICAgIHBvdGVudGlhbGx5IGFkanVzdGVkIHRvIGFjY291bnQgZm9yIHZpc2libGUgb3ZlcmZsb3csIHRyYW5zZm9ybWF0aW9ucywgZXRjLlxyXG4gICAqL1xyXG4gIGZ1bmN0aW9uIGdldEJvdW5kaW5nQ2xpZW50UmVjdEV4dGVuZGVkKGRvbUVsZW1lbnQpIHtcclxuICAgIGNvbnN0IGVyclByZWZpeCA9IGAoZ2V0Qm91bmRpbmdDbGllbnRSZWN0RXh0ZW5kZWQpIGA7XHJcblxyXG4gICAgaWYgKCEoZG9tRWxlbWVudCBpbnN0YW5jZW9mIEhUTUxFbGVtZW50KSlcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKGAke2VyclByZWZpeH1UaGUgdmFsdWUgaW4gdGhlIGRvbUVsZW1lbnQgcGFyYW1ldGVyIGlzIG5vdCBhIEhUTUxFbGVtZW50IG9iamVjdC5gKTtcclxuXHJcbiAgICBjb25zdCByZWN0ID0gZG9tRWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgIGxldCBleHRlbmRlZFJlY3QgPSB7Li4ucmVjdH07XHJcblxyXG4gICAgLy8gSW5pdGlhbGl6ZSB2YXJpYWJsZXMgdG8gdHJhY2sgdGhlIGZ1cnRoZXN0IGV4dGVudHMgb2YgY2hpbGRyZW5cclxuICAgIGxldCBtYXhYID0gcmVjdC5yaWdodDtcclxuICAgIGxldCBtYXhZID0gcmVjdC5ib3R0b207XHJcblxyXG4gICAgLy8gUmVjdXJzaXZlIGZ1bmN0aW9uIHRvIHdhbGsgdGhyb3VnaCBhbGwgY2hpbGRyZW4gYW5kIGFkanVzdCBiYXNlZCBvbiB0aGVpciBib3VuZGluZyBib3hlc1xyXG4gICAgY29uc3QgYWRqdXN0Rm9yQ2hpbGRyZW4gPSAoZWxlbWVudCkgPT4ge1xyXG4gICAgICBBcnJheS5mcm9tKGVsZW1lbnQuY2hpbGRyZW4pLmZvckVhY2goY2hpbGQgPT4ge1xyXG4gICAgICAgIGNvbnN0IGNoaWxkUmVjdCA9IGNoaWxkLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG5cclxuICAgICAgICAvLyBDaGVjayBmb3IgdmlzaWJsZSBvdmVyZmxvdyBvciBwb3NpdGlvbmluZyB0aGF0IG1pZ2h0IGV4dGVuZCBiZXlvbmQgdGhlIHBhcmVudFxyXG4gICAgICAgIGlmIChjaGlsZFJlY3QucmlnaHQgPiBtYXhYKSBtYXhYID0gY2hpbGRSZWN0LnJpZ2h0O1xyXG4gICAgICAgIGlmIChjaGlsZFJlY3QuYm90dG9tID4gbWF4WSkgbWF4WSA9IGNoaWxkUmVjdC5ib3R0b207XHJcblxyXG4gICAgICAgIC8vIFJlY3Vyc2l2ZSBjYWxsIHRvIHdhbGsgdGhyb3VnaCBhbGwgZGVzY2VuZGFudHNcclxuICAgICAgICBhZGp1c3RGb3JDaGlsZHJlbihjaGlsZCk7XHJcbiAgICAgIH0pO1xyXG4gICAgfTtcclxuXHJcbiAgICBhZGp1c3RGb3JDaGlsZHJlbihkb21FbGVtZW50KTtcclxuXHJcbiAgICAvLyBBZGp1c3QgdGhlIHdpZHRoIGFuZCBoZWlnaHQgYmFzZWQgb24gdGhlIGZ1cnRoZXN0IGV4dGVudHMgZm91bmRcclxuICAgIGV4dGVuZGVkUmVjdC53aWR0aCA9IG1heFggLSByZWN0LmxlZnQ7XHJcbiAgICBleHRlbmRlZFJlY3QuaGVpZ2h0ID0gbWF4WSAtIHJlY3QudG9wO1xyXG5cclxuICAgIC8vIENyZWF0ZSBhIG5ldyBET01SZWN0IG9iamVjdCBmb3IgY29uc2lzdGVuY3kgd2l0aCBnZXRCb3VuZGluZ0NsaWVudFJlY3RcclxuICAgIHJldHVybiBuZXcgRE9NUmVjdChyZWN0LmxlZnQsIHJlY3QudG9wLCBleHRlbmRlZFJlY3Qud2lkdGgsIGV4dGVuZGVkUmVjdC5oZWlnaHQpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQSBzaW1wbGUgaGV1cmlzdGljIGZ1bmN0aW9uIHRvIGRldGVybWluZSBpZiBhbiBlbGVtZW50IGlzIGxpa2VseSB0byBiZVxyXG4gICAqIHBhcnQgb2YgdGhlIG5vbi1tYWluIGNvbnRlbnQgKGUuZy4sIGhlYWRlciwgZm9vdGVyLCBzaWRlYmFyKS5cclxuICAgKlxyXG4gICAqIEBwYXJhbSB7RWxlbWVudH0gZWwgVGhlIGVsZW1lbnQgdG8gY2hlY2suXHJcbiAgICogQHJldHVybiB7Ym9vbGVhbn0gVHJ1ZSBpZiB0aGUgZWxlbWVudCBpcyBsaWtlbHkgYSBub24tY29udGVudCBlbGVtZW50LFxyXG4gICAqICAgICAgICAgZmFsc2Ugb3RoZXJ3aXNlLlxyXG4gICAqL1xyXG4gIGZ1bmN0aW9uIGlzTGlrZWx5Tm9uQ29udGVudChlbCkge1xyXG4gICAgY29uc3Qgbm9uQ29udGVudEtleXdvcmRzID0gWydoZWFkZXInLCAnZm9vdGVyJywgJ3NpZGViYXInLCAnbmF2JywgJ21lbnUnLCAnYWR2ZXJ0aXNlbWVudCddO1xyXG4gICAgY29uc3QgaWRBbmRDbGFzcyA9IChlbC5pZCArICcgJyArIGVsLmNsYXNzTmFtZSkudG9Mb3dlckNhc2UoKTtcclxuXHJcbiAgICByZXR1cm4gbm9uQ29udGVudEtleXdvcmRzLnNvbWUoa2V5d29yZCA9PiBpZEFuZENsYXNzLmluY2x1ZGVzKGtleXdvcmQpKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEF0dGVtcHRzIHRvIGZpbmQgdGhlIG1haW4gY29udGVudCBhcmVhIG9mIGEgd2ViIHBhZ2UgYnkgaWRlbnRpZnlpbmcgdGhlXHJcbiAgICogbGFyZ2VzdCBibG9jay1sZXZlbCBlbGVtZW50LiBJdCBjb25zaWRlcnMgZWxlbWVudHMgbGlrZSBESVYsIFRBQkxFLFxyXG4gICAqIFNFQ1RJT04sIEFSVElDTEUsIGFuZCBNQUlOLCBkZWZhdWx0aW5nIHRvIHRoZSBCT0RZIHRhZyBpZiBubyBzdWl0YWJsZVxyXG4gICAqIGNhbmRpZGF0ZSBpcyBmb3VuZC5cclxuICAgKlxyXG4gICAqIFRoZSBoZXVyaXN0aWMgaXMgYmFzZWQgb24gdGhlIHNpemUgKGFyZWEpIG9mIHRoZXNlIGVsZW1lbnRzLCBhaW1pbmcgdG9cclxuICAgKiBpZ25vcmUgY29tbW9uIGxheW91dCBlbGVtZW50cyBzdWNoIGFzIGhlYWRlcnMsIGZvb3RlcnMsIGFuZCBzaWRlYmFycy5cclxuICAgKiBBZGRpdGlvbmFsbHksIHRoaXMgZnVuY3Rpb24gY2hlY2tzIGZvciBhbiBlbGVtZW50IHdpdGggdGhlIElEIFwidmlld3BvcnRcIlxyXG4gICAqIGFuZCBjb25zaWRlcnMgaXQgaWYgaXRzIGRpbWVuc2lvbnMgYXJlIGxhcmdlci4gIElmIGl0IGNhbid0IGZpbmRcclxuICAgKiBhbiBlbGVtZW50IHdpdGggSUQgXCJ2aWV3cG9ydFwiLCBpdCB0cmllcyBhZ2FpbiBmb3IgYW4gZWxlbWVudFxyXG4gICAqIHdpdGggSUQgXCJjb250ZW50XCIuXHJcbiAgICpcclxuICAgKiBAcmV0dXJuIHtFbGVtZW50fSBUaGUgRE9NIGVsZW1lbnQgdGhhdCBpcyBsaWtlbHkgdG8gcmVwcmVzZW50IHRoZSBtYWluXHJcbiAgICogICAgICAgICBjb250ZW50IGFyZWEgb2YgdGhlIHBhZ2UuXHJcbiAgICovXHJcbiAgZnVuY3Rpb24gZmluZE1haW5Db250ZW50QXJlYSgpIHtcclxuICAgIGNvbnN0IGVyclByZWZpeCA9IGAoZmluZE1haW5Db250ZW50QXJlYSkgYDtcclxuXHJcbiAgICBjb25zdCB0YWdzVG9Db25zaWRlciA9IFsnRElWJywgJ1RBQkxFJywgJ1NFQ1RJT04nLCAnQVJUSUNMRScsICdNQUlOJ107XHJcbiAgICBsZXQgbGFyZ2VzdEVsZW1lbnQgPSBkb2N1bWVudC5ib2R5OyAvLyBEZWZhdWx0IHRvIHRoZSBib2R5XHJcbiAgICBsZXQgbGFyZ2VzdEFyZWEgPSAwO1xyXG5cclxuICAgIGxldCBtYWluQ29udGFpbmVyRWxlbWVudElkID0gJ3ZpZXdwb3J0JztcclxuXHJcbiAgICAvLyBXZSB1c2UgY2VydGFpbiBwYWdlIHNwZWNpZmljIHJ1bGVzIHRvIG92ZXJyaWRlXHJcbiAgICAvLyAgdGhlIFwiZ3Vlc3NcIiBjb2RlIGJlbG93IGZvciBwYWdlcyB3ZSBrbm93IGFib3V0LlxyXG4gICAgLy8gQWRkaXRpb25hbCBjaGVjayBmb3IgYW4gZWxlbWVudCB3aXRoIHRoZSBzcGVjaWZpY1xyXG4gICAgLy8gIElEIG9mIFwidmlld3BvcnRcIi5cclxuICAgIGxldCBtYWluQ29udGFpbmVyRWxlbWVudCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKG1haW5Db250YWluZXJFbGVtZW50SWQpO1xyXG5cclxuICAgIGlmICghbWFpbkNvbnRhaW5lckVsZW1lbnQpIHtcclxuICAgICAgY29uc29sZS5sb2coYCR7ZXJyUHJlZml4fVVuYWJsZSB0byBmaW5kIGEgRElWIHdpdGggZWxlbWVudCBJRDogJHttYWluQ29udGFpbmVyRWxlbWVudElkfWApO1xyXG5cclxuICAgICAgbWFpbkNvbnRhaW5lckVsZW1lbnRJZCA9ICdjb250ZW50JztcclxuICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQobWFpbkNvbnRhaW5lckVsZW1lbnRJZCk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKG1haW5Db250YWluZXJFbGVtZW50KSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKGAke2VyclByZWZpeH1TdWNjZXNzZnVsbHkgbG9jYXRlZCBtYWluIGNvbnRhaW5lciBlbGVtZW50IHVzaW5nIGVsZW1lbnQgSUQ6ICR7bWFpbkNvbnRhaW5lckVsZW1lbnRJZH1gKTtcclxuXHJcbiAgICAgIGNvbnN0IHJlY3QgPSBnZXRCb3VuZGluZ0NsaWVudFJlY3RFeHRlbmRlZChtYWluQ29udGFpbmVyRWxlbWVudCk7XHJcbiAgICAgIGNvbnN0IHZpZXdwb3J0QXJlYSA9IHJlY3Qud2lkdGggKiByZWN0LmhlaWdodDtcclxuICAgICAgaWYgKHZpZXdwb3J0QXJlYSA+IGxhcmdlc3RBcmVhKSB7XHJcbiAgICAgICAgbGFyZ2VzdEVsZW1lbnQgPSBtYWluQ29udGFpbmVyRWxlbWVudDtcclxuICAgICAgfVxyXG5cclxuICAgICAgcmV0dXJuIGxhcmdlc3RFbGVtZW50O1xyXG4gICAgfVxyXG5cclxuICAgIHRhZ3NUb0NvbnNpZGVyLmZvckVhY2godGFnID0+IHtcclxuICAgICAgY29uc3QgZWxlbWVudHMgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSh0YWcpO1xyXG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGVsZW1lbnRzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgY29uc3QgZWwgPSBlbGVtZW50c1tpXTtcclxuICAgICAgICBjb25zdCByZWN0ID0gZ2V0Qm91bmRpbmdDbGllbnRSZWN0RXh0ZW5kZWQoZWwpO1xyXG4gICAgICAgIGNvbnN0IGFyZWEgPSByZWN0LndpZHRoICogcmVjdC5oZWlnaHQ7XHJcblxyXG4gICAgICAgIGlmIChhcmVhID4gbGFyZ2VzdEFyZWEgJiYgIWlzTGlrZWx5Tm9uQ29udGVudChlbCkpIHtcclxuICAgICAgICAgIGxhcmdlc3RBcmVhID0gYXJlYTtcclxuICAgICAgICAgIGxhcmdlc3RFbGVtZW50ID0gZWw7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICByZXR1cm4gbGFyZ2VzdEVsZW1lbnQ7XHJcbiAgfVxyXG5cclxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0gRU5EICA6IEdVRVNTIFRIRSBNQUlOIENPTlRFTlQgQVJFQSAtLS0tLS0tLS0tLS1cclxuXHJcbiAgLyoqXHJcbiAgICogRXh0cmFjdHMgdGhlIFlvdVR1YmUgdmlkZW8gSUQgZnJvbSBhIGdpdmVuIFVSTC5cclxuICAgKiBUaGUgVVJMIGlzIGV4cGVjdGVkIHRvIGJlIGluIHRoZSBmb3JtYXRcclxuICAgKiBcImh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9XCIgYW5kIHRoZSBmdW5jdGlvblxyXG4gICAqIGRpc2NhcmRzIGFueSBvdGhlciBVUkwgYXJndW1lbnRzLiBJdCB0aHJvd3MgYW4gZXJyb3JcclxuICAgKiBpZiB0aGUgdmlkZW8gSUQgaXMgZW1wdHkgb3IgaWYgdGhlIGlucHV0IGlzIG5vdCBhIHZhbGlkXHJcbiAgICogWW91VHViZSBVUkwuXHJcbiAgICpcclxuICAgKiBAcGFyYW0ge1N0cmluZ30gdXJsIC0gVGhlIFlvdVR1YmUgVVJMIGZyb20gd2hpY2ggdG8gZXh0cmFjdFxyXG4gICAqICAgICAgICAgICAgICAgICAgICAgICB0aGUgdmlkZW8gSUQuXHJcbiAgICpcclxuICAgKiBAcmV0dXJuIHtTdHJpbmd9IFRoZSB0cmltbWVkIFlvdVR1YmUgdmlkZW8gSUQuXHJcbiAgICpcclxuICAgKiBAdGhyb3dzIHtFcnJvcn0gSWYgdGhlIGlucHV0IFVSTCBpcyBpbnZhbGlkLCBkb2VzIG5vdCBjb250YWluXHJcbiAgICogICAgICAgICAgICAgICAgIGEgdmlkZW8gSUQsIG9yIGlmIHRoZSB2aWRlbyBJRCBpcyBlbXB0eS5cclxuICAgKi9cclxuICBmdW5jdGlvbiBleHRyYWN0WW91VHViZVZpZGVvSWRGcm9tVXJsKHVybCkge1xyXG4gICAgY29uc3QgZXJyUHJlZml4ID0gJyhleHRyYWN0WW91VHViZVZpZGVvSWRGcm9tVXJsKSAnO1xyXG5cclxuICAgIC8vIFZhbGlkYXRlIHRoZSBpbnB1dCBVUkxcclxuICAgIGlmICh0eXBlb2YgdXJsICE9PSAnc3RyaW5nJyB8fCB1cmwudHJpbSgpID09PSAnJykge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXHJcbiAgICAgICAgICBgJHtlcnJQcmVmaXh9VGhlIHByb3ZpZGVkIFVSTCBtdXN0IGJlIGEgbm9uLWVtcHR5IHN0cmluZy5gXHJcbiAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgdXJsT2JqID0gbmV3IFVSTCh1cmwpO1xyXG4gICAgICBpZiAodXJsT2JqLmhvc3RuYW1lICE9PSAnd3d3LnlvdXR1YmUuY29tJyAmJlxyXG4gICAgICAgICAgdXJsT2JqLmhvc3RuYW1lICE9PSAneW91dHViZS5jb20nKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxyXG4gICAgICAgICAgICBgJHtlcnJQcmVmaXh9VGhlIFVSTCBtdXN0IGJlIGEgdmFsaWQgWW91VHViZSBVUkwuYFxyXG4gICAgICAgICk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IHZpZGVvSWQgPSB1cmxPYmouc2VhcmNoUGFyYW1zLmdldCgndicpO1xyXG4gICAgICBpZiAoIXZpZGVvSWQgfHwgdmlkZW9JZC50cmltKCkgPT09ICcnKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxyXG4gICAgICAgICAgICBgJHtlcnJQcmVmaXh9VGhlIHZpZGVvIElEIGlzIG1pc3Npbmcgb3IgZW1wdHkuYFxyXG4gICAgICAgICk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHJldHVybiB2aWRlb0lkLnRyaW0oKTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIFR5cGVFcnJvcikge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcclxuICAgICAgICAgICAgYCR7ZXJyUHJlZml4fUludmFsaWQgVVJMIGZvcm1hdC5gXHJcbiAgICAgICAgKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICB0aHJvdyBlcnJvcjtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQGZpbGVvdmVydmlldyBQcm92aWRlcyBhIGZ1bmN0aW9uIHRvIGdldCB0aGUgY3VycmVudCBkYXRlXHJcbiAgICogYW5kIHRpbWUgaW4gYSBodW1hbi1yZWFkYWJsZSBmb3JtYXQgd2l0aCBhbGwgdGltZVxyXG4gICAqIGNvbXBvbmVudHMgZG93biB0byBtaWxsaXNlY29uZHMuXHJcbiAgICovXHJcblxyXG4gIC8qKlxyXG4gICAqIEdldHMgdGhlIGN1cnJlbnQgZGF0ZSBhbmQgdGltZSBpbiBhIGh1bWFuLXJlYWRhYmxlIGZvcm1hdCxcclxuICAgKiBpbmNsdWRpbmcgYWxsIHRpbWUgY29tcG9uZW50cyBkb3duIHRvIG1pbGxpc2Vjb25kcy5cclxuICAgKlxyXG4gICAqIEB0aHJvd3Mge0Vycm9yfSBJZiBhbiB1bmV4cGVjdGVkIGVycm9yIG9jY3VycyBkdXJpbmdcclxuICAgKiBmb3JtYXR0aW5nLlxyXG4gICAqXHJcbiAgICogQHJldHVybnMge1N0cmluZ30gVGhlIGN1cnJlbnQgZGF0ZSBhbmQgdGltZSBpbiB0aGUgZm9ybWF0XHJcbiAgICogJ01NL0REL1lZWVksIEhIOk1NOlNTLm1tbScuXHJcbiAgICovXHJcbiAgZnVuY3Rpb24gZ2V0Q3VycmVudFRpbWVFeHQoKSB7XHJcbiAgICBjb25zdCBlcnJQcmVmaXggPSAnKGdldEN1cnJlbnRUaW1lRXh0KSAnO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIHJldHVybiBuZXcgRGF0ZSgpLnRvTG9jYWxlU3RyaW5nKCdlbi1VUycsIHtcclxuICAgICAgICB5ZWFyOiAnbnVtZXJpYycsXHJcbiAgICAgICAgbW9udGg6ICcyLWRpZ2l0JyxcclxuICAgICAgICBkYXk6ICcyLWRpZ2l0JyxcclxuICAgICAgICBob3VyOiAnMi1kaWdpdCcsXHJcbiAgICAgICAgbWludXRlOiAnMi1kaWdpdCcsXHJcbiAgICAgICAgc2Vjb25kOiAnMi1kaWdpdCcsXHJcbiAgICAgICAgZnJhY3Rpb25hbFNlY29uZERpZ2l0czogMyxcclxuICAgICAgICBob3VyMTI6IGZhbHNlXHJcbiAgICAgIH0pO1xyXG4gICAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcihgJHtlcnJQcmVmaXh9QW4gZXJyb3Igb2NjdXJyZWQgd2hpbGUgZm9ybWF0dGluZyB0aGUgZGF0ZTogJHtlcnIubWVzc2FnZX1gKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLSBFTkQgIDogTUlTQyBST1VUSU5FUyAtLS0tLS0tLS0tLS1cclxuXHJcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tIEJFR0lOOiBGT1JNIEhBTkRMSU5HIC0tLS0tLS0tLS0tLVxyXG5cclxuLy8gVGhpcyBpcyB0aGUgbWF4aW11bSBudW1iZXIgb2YgY29udGlndW91cyBlbXB0eSBsaW5lcyB3ZSB3aWxsXHJcbi8vICB0b2xlcmF0ZSBpbiBhIHRyYW5zY3JpcHQgbGluZSBvYmplY3RzIGFycmF5IGdlbmVyYXRlZCBmcm9tXHJcbi8vICBwYXJzaW5nIHRoZSB0cmFuc2NyaXB0IHdpbmRvdy5cclxuICBjb25zdCBNQVhfRU1QVFlfQ09OVElHVU9VU19UUkFOU0NSSVBUX0xJTkVTID0gNTtcclxuXHJcbi8vIFRoaXMgaXMgdGhlIERJViBJRCBvZiB0aGUgbWFpbiBlbGVtZW50IHRoYXQgY29udGFpbnNcclxuLy8gIHRoZSB2aWRlbyB0aHVtYm5haWxzIGluIGEgWW91VHViZSBjaGFubmVsJ3MgdmlkZW9zXHJcbi8vICBwYWdlLlxyXG4gIGNvbnN0IEVMRU1FTlRfSURfRk9SX1lPVVRVQkVfVklERU9TX1BBR0VfQ09OVEFJTkVSID0gJ2NvbnRlbnRzJztcclxuXHJcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tIEJFR0lOOiBBUklBIExBQkVMIENPTlNUQU5UUyAtLS0tLS0tLS0tLS1cclxuXHJcbiAgY29uc3QgQVJJQV9MQUJFTF9UUkFOU0NSSVBUX0JVVFRPTiA9ICdTaG93IHRyYW5zY3JpcHQnO1xyXG5cclxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0gRU5EICA6IEFSSUEgTEFCRUwgQ09OU1RBTlRTIC0tLS0tLS0tLS0tLVxyXG5cclxuICAvKipcclxuICAgKiBAZnVuY3Rpb24gZmluZEVsZW1lbnRCeVRhZ05hbWVBbmRUZXh0XHJcbiAgICogQGRlc2NyaXB0aW9uIEZpbmRzIGFsbCBlbGVtZW50cyBvZiBhIHNwZWNpZmllZCB0YWcgbmFtZSB0aGF0IGhhdmUgZXhhY3RcclxuICAgKiB0ZXh0IGNvbnRlbnQgbWF0Y2hpbmcgdGhlIHByb3ZpZGVkIHRleHQgYW5kIGFyZSBjdXJyZW50bHkgdmlzaWJsZSBvbiB0aGVcclxuICAgKiBwYWdlLiBWaXNpYmlsaXR5IGNvbnNpZGVycyB0aGUgZWxlbWVudCBhbmQgYWxsIGl0cyBhbmNlc3RvcnMuXHJcbiAgICpcclxuICAgKiBAcGFyYW0ge1N0cmluZ30gdGFnTmFtZSAtIFRoZSB0YWcgbmFtZSB0byBzZWFyY2ggZm9yLlxyXG4gICAqIEBwYXJhbSB7U3RyaW5nfSB0aGVUZXh0IC0gVGhlIHRleHQgY29udGVudCB0byBtYXRjaCBleGFjdGx5LlxyXG4gICAqXHJcbiAgICogQHJldHVybnMge0hUTUxFbGVtZW50W118bnVsbH0gQW4gYXJyYXkgb2YgbWF0Y2hpbmcgZWxlbWVudHMgdGhhdCBhcmUgdmlzaWJsZVxyXG4gICAqIG9uIHRoZSBwYWdlLCBvciBudWxsIGlmIG5vIG1hdGNoaW5nIGVsZW1lbnRzIGFyZSBmb3VuZC5cclxuICAgKlxyXG4gICAqIEB0aHJvd3Mge0Vycm9yfSBJZiB0aGUgdGFnTmFtZSBvciB0aGVUZXh0IGlzIG5vdCBhIHZhbGlkIHN0cmluZy5cclxuICAgKi9cclxuICBmdW5jdGlvbiBmaW5kRWxlbWVudEJ5VGFnTmFtZUFuZFRleHQodGFnTmFtZSwgdGhlVGV4dCkge1xyXG4gICAgY29uc3QgZXJyUHJlZml4ID0gJyhmaW5kRWxlbWVudEJ5VGFnTmFtZUFuZFRleHQpICc7XHJcblxyXG4gICAgLy8gVmFsaWRhdGUgaW5wdXQgcGFyYW1ldGVyc1xyXG4gICAgaWYgKHR5cGVvZiB0YWdOYW1lICE9PSAnc3RyaW5nJykge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7ZXJyUHJlZml4fXRhZ05hbWUgbXVzdCBiZSBhIFN0cmluZ2ApO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh0YWdOYW1lLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7ZXJyUHJlZml4fXRhZ05hbWUgY2Fubm90IGJlIGFuIGVtcHR5IFN0cmluZ2ApO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh0eXBlb2YgdGhlVGV4dCAhPT0gJ3N0cmluZycpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKGAke2VyclByZWZpeH10aGVUZXh0IG11c3QgYmUgYSBTdHJpbmdgKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAodGhlVGV4dC5sZW5ndGggPT09IDApIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKGAke2VyclByZWZpeH10aGVUZXh0IGNhbm5vdCBiZSBhbiBlbXB0eSBTdHJpbmdgKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBTZWxlY3QgYWxsIGVsZW1lbnRzIHdpdGggdGhlIHNwZWNpZmllZCB0YWcgbmFtZVxyXG4gICAgY29uc3QgZWxlbWVudHMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKHRhZ05hbWUpO1xyXG5cclxuICAgIC8vIEZpbHRlciBlbGVtZW50cyBieSBleGFjdCB0ZXh0IGNvbnRlbnQgYW5kIHZpc2liaWxpdHlcclxuICAgIGNvbnN0IG1hdGNoaW5nRWxlbWVudHMgPSBBcnJheS5mcm9tKGVsZW1lbnRzKS5maWx0ZXIoZWxlbWVudCA9PlxyXG4gICAgICAgIGVsZW1lbnQudGV4dENvbnRlbnQudHJpbSgpID09PSB0aGVUZXh0ICYmIGlzRWxlbWVudFZpc2libGUoZWxlbWVudClcclxuICAgICk7XHJcblxyXG4gICAgcmV0dXJuIG1hdGNoaW5nRWxlbWVudHMubGVuZ3RoID4gMCA/IG1hdGNoaW5nRWxlbWVudHMgOiBudWxsO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQGZ1bmN0aW9uIGZpbmRCdXR0b25CeUFyaWFMYWJlbFxyXG4gICAqIEBkZXNjcmlwdGlvbiBGaW5kcyB0aGUgZmlyc3QgdmlzaWJsZSBidXR0b24gZWxlbWVudCBpbiB0aGUgRE9NIHRyZWUgdGhhdCBoYXNcclxuICAgKiBhbiBhcmlhLWxhYmVsIGF0dHJpYnV0ZSB3aXRoIHRoZSBzcGVjaWZpZWQgbGFiZWxUZXh0LiBUaHJvd3MgYW4gZXJyb3IgaWZcclxuICAgKiBtb3JlIHRoYW4gb25lIHZpc2libGUgYnV0dG9uIG1hdGNoZXMuIElmIG5vIGJ1dHRvbiBtYXRjaGVzLCByZXR1cm5zIG51bGwuXHJcbiAgICogT3RoZXJ3aXNlLCByZXR1cm5zIGEgcmVmZXJlbmNlIHRvIHRoZSBtYXRjaGluZyBET00gZWxlbWVudC5cclxuICAgKlxyXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBsYWJlbFRleHQgLSBUaGUgdGV4dCB0byBtYXRjaCBhZ2FpbnN0IHRoZSBhcmlhLWxhYmVsXHJcbiAgICogYXR0cmlidXRlIG9mIGJ1dHRvbiBlbGVtZW50cy5cclxuICAgKlxyXG4gICAqIEByZXR1cm5zIHtIVE1MRWxlbWVudHxudWxsfSBBIHJlZmVyZW5jZSB0byB0aGUgbWF0Y2hpbmcgRE9NIGVsZW1lbnQsIG9yIG51bGxcclxuICAgKiBpZiBubyBtYXRjaCBpcyBmb3VuZC5cclxuICAgKlxyXG4gICAqIEB0aHJvd3Mge0Vycm9yfSBJZiB0aGVyZSBpcyBtb3JlIHRoYW4gb25lIG1hdGNoaW5nIHZpc2libGUgYnV0dG9uLCBvciBpZiB0aGVcclxuICAgKiBsYWJlbFRleHQgaXMgbm90IGEgdmFsaWQgc3RyaW5nLlxyXG4gICAqL1xyXG4gIGZ1bmN0aW9uIGZpbmRCdXR0b25CeUFyaWFMYWJlbChsYWJlbFRleHQpIHtcclxuICAgIGNvbnN0IGVyclByZWZpeCA9ICcoZmluZEJ1dHRvbkJ5QXJpYUxhYmVsKSAnO1xyXG5cclxuICAgIC8vIENoZWNrIHRoYXQgbGFiZWxUZXh0IGlzIGEgdmFsaWQgc3RyaW5nXHJcbiAgICBpZiAodHlwZW9mIGxhYmVsVGV4dCAhPT0gJ3N0cmluZycpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKGAke2VyclByZWZpeH1sYWJlbFRleHQgbXVzdCBiZSBhIFN0cmluZ2ApO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChsYWJlbFRleHQubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcihgJHtlcnJQcmVmaXh9bGFiZWxUZXh0IGNhbm5vdCBiZSBhbiBlbXB0eSBTdHJpbmdgKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBHZXQgYWxsIGJ1dHRvbiBlbGVtZW50cyBpbiB0aGUgRE9NXHJcbiAgICBjb25zdCBidXR0b25zID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnYnV0dG9uJyk7XHJcblxyXG4gICAgLy8gRmlsdGVyIGJ1dHRvbnMgYnkgYXJpYS1sYWJlbCBhdHRyaWJ1dGUgYW5kIHZpc2liaWxpdHlcclxuICAgIGNvbnN0IG1hdGNoaW5nQnV0dG9ucyA9IEFycmF5LmZyb20oYnV0dG9ucykuZmlsdGVyKGJ1dHRvbiA9PlxyXG4gICAgICAgIGJ1dHRvbi5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSA9PT0gbGFiZWxUZXh0ICYmIGlzRWxlbWVudFZpc2libGUoYnV0dG9uKVxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBDaGVjayBmb3IgbXVsdGlwbGUgbWF0Y2hlc1xyXG4gICAgaWYgKG1hdGNoaW5nQnV0dG9ucy5sZW5ndGggPiAxKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcihgJHtlcnJQcmVmaXh9TW9yZSB0aGFuIG9uZSB2aXNpYmxlIGJ1dHRvbiBtYXRjaGVzIHRoZSBhcmlhLWxhYmVsIFwiJHtsYWJlbFRleHR9XCJgKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBSZXR1cm4gdGhlIG1hdGNoaW5nIGJ1dHRvbiBvciBudWxsIGlmIG5vIG1hdGNoIGlzIGZvdW5kXHJcbiAgICByZXR1cm4gbWF0Y2hpbmdCdXR0b25zLmxlbmd0aCA9PT0gMSA/IG1hdGNoaW5nQnV0dG9uc1swXSA6IG51bGw7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBAZnVuY3Rpb24gaXNFbGVtZW50VmlzaWJsZVxyXG4gICAqIEBkZXNjcmlwdGlvbiBDaGVja3MgaWYgYW4gZWxlbWVudCBpcyB2aXNpYmxlIGluIHRoZSBET00uXHJcbiAgICpcclxuICAgKiBAcGFyYW0ge0hUTUxFbGVtZW50fSBlbGVtZW50IC0gVGhlIERPTSBlbGVtZW50IHRvIGNoZWNrIGZvciB2aXNpYmlsaXR5LlxyXG4gICAqXHJcbiAgICogQHJldHVybnMge0Jvb2xlYW59IFRydWUgaWYgdGhlIGVsZW1lbnQgaXMgdmlzaWJsZSwgZmFsc2Ugb3RoZXJ3aXNlLlxyXG4gICAqL1xyXG4gIGZ1bmN0aW9uIGlzRWxlbWVudFZpc2libGUoZWxlbWVudCkge1xyXG4gICAgaWYgKCFlbGVtZW50KSByZXR1cm4gZmFsc2U7XHJcblxyXG4gICAgY29uc3Qgc3R5bGUgPSB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KTtcclxuXHJcbiAgICAvLyBDaGVjayBpZiB0aGUgZWxlbWVudCBpcyBoaWRkZW4gdXNpbmcgQ1NTIHByb3BlcnRpZXNcclxuICAgIGlmIChzdHlsZS5kaXNwbGF5ID09PSAnbm9uZScgfHwgc3R5bGUudmlzaWJpbGl0eSA9PT0gJ2hpZGRlbicgfHwgc3R5bGUub3BhY2l0eSA9PT0gJzAnKSB7XHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBDaGVjayBpZiBhbnkgYW5jZXN0b3IgaXMgaGlkZGVuXHJcbiAgICBsZXQgcGFyZW50ID0gZWxlbWVudC5wYXJlbnRFbGVtZW50O1xyXG4gICAgd2hpbGUgKHBhcmVudCkge1xyXG4gICAgICBjb25zdCBwYXJlbnRTdHlsZSA9IHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKHBhcmVudCk7XHJcbiAgICAgIGlmIChwYXJlbnRTdHlsZS5kaXNwbGF5ID09PSAnbm9uZScgfHwgcGFyZW50U3R5bGUudmlzaWJpbGl0eSA9PT0gJ2hpZGRlbicgfHwgcGFyZW50U3R5bGUub3BhY2l0eSA9PT0gJzAnKSB7XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICB9XHJcbiAgICAgIHBhcmVudCA9IHBhcmVudC5wYXJlbnRFbGVtZW50O1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB0cnVlO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQGZ1bmN0aW9uIGlzVmlzaWJsZVxyXG4gICAqIEBkZXNjcmlwdGlvbiBDaGVja3MgaWYgYW4gZWxlbWVudCBpcyB2aXNpYmxlIGluIHRoZSB2aWV3cG9ydC5cclxuICAgKlxyXG4gICAqIEBwYXJhbSB7SFRNTEVsZW1lbnR9IGVsZW1lbnQgLSBUaGUgRE9NIGVsZW1lbnQgdG8gY2hlY2sgZm9yIHZpc2liaWxpdHkuXHJcbiAgICpcclxuICAgKiBAcmV0dXJucyB7Qm9vbGVhbn0gVHJ1ZSBpZiB0aGUgZWxlbWVudCBpcyB2aXNpYmxlLCBmYWxzZSBvdGhlcndpc2UuXHJcbiAgICovXHJcbiAgZnVuY3Rpb24gaXNWaXNpYmxlKGVsZW1lbnQpIHtcclxuICAgIGNvbnN0IHJlY3QgPSBlbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgcmV0dXJuIChcclxuICAgICAgICByZWN0LndpZHRoID4gMCAmJlxyXG4gICAgICAgIHJlY3QuaGVpZ2h0ID4gMCAmJlxyXG4gICAgICAgIHJlY3QudG9wID49IDAgJiZcclxuICAgICAgICByZWN0LmxlZnQgPj0gMCAmJlxyXG4gICAgICAgIHJlY3QuYm90dG9tIDw9ICh3aW5kb3cuaW5uZXJIZWlnaHQgfHwgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmNsaWVudEhlaWdodCkgJiZcclxuICAgICAgICByZWN0LnJpZ2h0IDw9ICh3aW5kb3cuaW5uZXJXaWR0aCB8fCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuY2xpZW50V2lkdGgpICYmXHJcbiAgICAgICAgd2luZG93LmdldENvbXB1dGVkU3R5bGUoZWxlbWVudCkudmlzaWJpbGl0eSAhPT0gJ2hpZGRlbicgJiZcclxuICAgICAgICB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KS5kaXNwbGF5ICE9PSAnbm9uZSdcclxuICAgICk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBXYWl0IGZvciBhIGNlcnRhaW4gbGVuZ3RoIG9mIHRpbWUgdXNpbmcgYVxyXG4gICAqICBwcm9taXNlIHNvIG90aGVyIGNvZGUgZG9lcyBub3QgYmxvY2suXHJcbiAgICpcclxuICAgKiBAcGFyYW0ge051bWJlcn0gd2FpdFRpbWVNUyAtIFRoZSBudW1iZXIgb2ZcclxuICAgKiAgbWlsbGlzZWNvbmRzIHRvIHdhaXQuXHJcbiAgICogQHBhcmFtIHtTdHJpbmd9IHdhaXRNc2cgLSBBIG1lc3NhZ2UgdG9cclxuICAgKiAgcHJpbnQgdG8gdGhlIGNvbnNvbGUuXHJcbiAgICpcclxuICAgKiBAcmV0dXJuIHtQcm9taXNlPHZvaWQ+fVxyXG4gICAqL1xyXG4gIGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JBV2hpbGUod2FpdFRpbWVNUywgd2FpdE1zZykge1xyXG4gICAgY29uc3QgZXJyUHJlZml4ID0gYCh3YWl0Rm9yQVdoaWxlKSBgO1xyXG5cclxuICAgIGlmIChcclxuICAgICAgICB0eXBlb2Ygd2FpdFRpbWVNUyAhPT0gJ251bWJlcidcclxuICAgICAgICB8fCAhTnVtYmVyLmlzSW50ZWdlcih3YWl0VGltZU1TKVxyXG4gICAgICAgIHx8IHdhaXRUaW1lTVMgPCAwKVxyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7ZXJyUHJlZml4fVRoZSB2YWx1ZSBpbiB0aGUgd2FpdFRpbWVNUyBwYXJhbWV0ZXIgaXMgaW52YWxpZC4gIE11c3QgYmUgYSBub24tbmVnYXRpdmUgaW50ZWdlciBudW1lcmljIHZhbHVlLmApO1xyXG5cclxuICAgIGlmIChpc0VtcHR5U2FmZVN0cmluZyh3YWl0TXNnKSlcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKGAke2VyclByZWZpeH1UaGUgd2FpdE1zZyBwYXJhbWV0ZXIgaXMgZW1wdHkgb3IgaW52YWxpZC5gKTtcclxuXHJcbiAgICBpZiAoYlZlcmJvc2VfY29udGVudCkge1xyXG4gICAgICBjb25zb2xlLmxvZyhDT05TT0xFX01FU1NBR0VfQ0FURUdPUllfQ09OVEVOVF9TQ1JJUFQsIGAke3dhaXRNc2d9YCk7XHJcbiAgICB9XHJcblxyXG4gICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDEwMDApKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEBmdW5jdGlvbiBnZXRBbGxUcmFuc2NyaXB0VGV4dEFuZFRpbWVzXHJcbiAgICogQGRlc2NyaXB0aW9uIFBhcnNlcyB0aGUgRE9NIHRyZWUgdG8gYnVpbGQgYW4gYXJyYXkgb2YgdHJhbnNjcmlwdCBvYmplY3RzXHJcbiAgICogd2l0aCB0ZXh0LCB0aW1lc3RhbXAgc3RyaW5nLCBhbmQgb2Zmc2V0IGluIHNlY29uZHMuXHJcbiAgICpcclxuICAgKiBAcmV0dXJucyB7QXJyYXk8T2JqZWN0Pn0gQW4gYXJyYXkgb2Ygb2JqZWN0cywgZWFjaCBjb250YWluaW5nIHRyYW5zY3JpcHRUZXh0LFxyXG4gICAqIHRpbWVzdGFtcFN0cmluZywgYW5kIG9mZnNldEluU2Vjb25kcyBmaWVsZHMuXHJcbiAgICpcclxuICAgKiBAdGhyb3dzIHtFcnJvcn0gSWYgYW4gZWxlbWVudCB3aXRoIHRoZSByZXF1aXJlZCBjbGFzcyBvciB0YWcgaXMgbm90IGZvdW5kLFxyXG4gICAqIG9yIGlmIHRoZXJlIGFyZSBtdWx0aXBsZSBtYXRjaGVzIGZvciBhIHJlcXVpcmVkIGVsZW1lbnQuXHJcbiAgICovXHJcbiAgZnVuY3Rpb24gZ2V0QWxsVHJhbnNjcmlwdFRleHRBbmRUaW1lcygpIHtcclxuICAgIGNvbnN0IGVyclByZWZpeCA9ICcoZ2V0QWxsVHJhbnNjcmlwdFRleHRBbmRUaW1lcykgJztcclxuXHJcbiAgICAvLyBHZXQgYWxsIGVsZW1lbnRzIHdpdGggdGhlIHRhZyBcInl0ZC10cmFuc2NyaXB0LXNlZ21lbnQtcmVuZGVyZXJcIlxyXG4gICAgY29uc3QgdHJhbnNjcmlwdEVsZW1lbnRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgneXRkLXRyYW5zY3JpcHQtc2VnbWVudC1yZW5kZXJlcicpO1xyXG4gICAgY29uc3QgYXJ5VHJhbnNjcmlwdEVsZW1lbnRzID0gQXJyYXkuZnJvbSh0cmFuc2NyaXB0RWxlbWVudHMpLm1hcChkb21FbGVtZW50ID0+IHtcclxuICAgICAgLy8gRmluZCB0aGUgY2hpbGQgRElWIGVsZW1lbnQgd2l0aCB0aGUgY2xhc3MgXCJzZWdtZW50LXRpbWVzdGFtcFwiXHJcbiAgICAgIGNvbnN0IHRpbWVzdGFtcERpdnMgPSBkb21FbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ2Rpdi5zZWdtZW50LXRpbWVzdGFtcCcpO1xyXG4gICAgICBpZiAodGltZXN0YW1wRGl2cy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7ZXJyUHJlZml4fU5vIGVsZW1lbnQgd2l0aCBjbGFzcyBcInNlZ21lbnQtdGltZXN0YW1wXCIgZm91bmRgKTtcclxuICAgICAgfVxyXG4gICAgICBpZiAodGltZXN0YW1wRGl2cy5sZW5ndGggPiAxKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGAke2VyclByZWZpeH1NdWx0aXBsZSBlbGVtZW50cyB3aXRoIGNsYXNzIFwic2VnbWVudC10aW1lc3RhbXBcIiBmb3VuZGApO1xyXG4gICAgICB9XHJcbiAgICAgIGNvbnN0IHRpbWVzdGFtcFN0cmluZyA9IHRpbWVzdGFtcERpdnNbMF0udGV4dENvbnRlbnQudHJpbSgpO1xyXG5cclxuICAgICAgLy8gQ2FsY3VsYXRlIHRoZSBvZmZzZXQgaW4gc2Vjb25kc1xyXG4gICAgICBjb25zdCBvZmZzZXRJblNlY29uZHMgPSBjYWxjdWxhdGVPZmZzZXRJblNlY29uZHModGltZXN0YW1wU3RyaW5nKTtcclxuXHJcbiAgICAgIC8vIEZpbmQgdGhlIGZpcnN0IERJViB3aXRoIHRhZyBcInl0LWZvcm1hdHRlZC1zdHJpbmdcIlxyXG4gICAgICBjb25zdCB0cmFuc2NyaXB0RGl2cyA9IGRvbUVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgneXQtZm9ybWF0dGVkLXN0cmluZycpO1xyXG4gICAgICBpZiAodHJhbnNjcmlwdERpdnMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGAke2VyclByZWZpeH1ObyBlbGVtZW50IHdpdGggdGFnIFwieXQtZm9ybWF0dGVkLXN0cmluZ1wiIGZvdW5kYCk7XHJcbiAgICAgIH1cclxuICAgICAgaWYgKHRyYW5zY3JpcHREaXZzLmxlbmd0aCA+IDEpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7ZXJyUHJlZml4fU11bHRpcGxlIGVsZW1lbnRzIHdpdGggdGFnIFwieXQtZm9ybWF0dGVkLXN0cmluZ1wiIGZvdW5kYCk7XHJcbiAgICAgIH1cclxuICAgICAgY29uc3QgdHJhbnNjcmlwdFRleHQgPSB0cmFuc2NyaXB0RGl2c1swXS50ZXh0Q29udGVudC50cmltKCk7XHJcblxyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHRyYW5zY3JpcHRUZXh0LFxyXG4gICAgICAgIHRpbWVzdGFtcFN0cmluZyxcclxuICAgICAgICBvZmZzZXRJblNlY29uZHNcclxuICAgICAgfTtcclxuICAgIH0pO1xyXG5cclxuICAgIHJldHVybiBhcnlUcmFuc2NyaXB0RWxlbWVudHM7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBAZnVuY3Rpb24gY2FsY3VsYXRlT2Zmc2V0SW5TZWNvbmRzXHJcbiAgICogQGRlc2NyaXB0aW9uIENhbGN1bGF0ZXMgdGhlIG9mZnNldCBpbiBzZWNvbmRzIGZyb20gYSB0aW1lc3RhbXAgc3RyaW5nLlxyXG4gICAqXHJcbiAgICogQHBhcmFtIHtTdHJpbmd9IHRpbWVzdGFtcFN0cmluZyAtIFRoZSB0aW1lc3RhbXAgc3RyaW5nIHRvIHBhcnNlLlxyXG4gICAqXHJcbiAgICogQHJldHVybnMge051bWJlcn0gVGhlIG9mZnNldCBpbiBzZWNvbmRzLlxyXG4gICAqXHJcbiAgICogQHRocm93cyB7RXJyb3J9IElmIHRoZSB0aW1lc3RhbXAgc3RyaW5nIGNhbm5vdCBiZSBwYXJzZWQgaW50byBpbnRlZ2Vycy5cclxuICAgKi9cclxuICBmdW5jdGlvbiBjYWxjdWxhdGVPZmZzZXRJblNlY29uZHModGltZXN0YW1wU3RyaW5nKSB7XHJcbiAgICBjb25zdCBlcnJQcmVmaXggPSAnKGNhbGN1bGF0ZU9mZnNldEluU2Vjb25kcykgJztcclxuXHJcbiAgICBjb25zdCBhcnlUaW1lUGllY2VzID0gdGltZXN0YW1wU3RyaW5nLnNwbGl0KCc6Jyk7XHJcbiAgICBjb25zdCBhcnlQaWVjZXNBc0ludGVnZXJzID0gYXJ5VGltZVBpZWNlcy5tYXAocGllY2UgPT4ge1xyXG4gICAgICBjb25zdCBpbnRQaWVjZSA9IHBhcnNlSW50KHBpZWNlLCAxMCk7XHJcbiAgICAgIGlmIChpc05hTihpbnRQaWVjZSkpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7ZXJyUHJlZml4fUludmFsaWQgdGltZXN0YW1wIHN0cmluZyBcIiR7dGltZXN0YW1wU3RyaW5nfVwiYCk7XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIGludFBpZWNlO1xyXG4gICAgfSk7XHJcblxyXG4gICAgbGV0IHRvdGFsU2Vjb25kcyA9IDA7XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGFyeVBpZWNlc0FzSW50ZWdlcnMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgdG90YWxTZWNvbmRzICs9IGFyeVBpZWNlc0FzSW50ZWdlcnNbaV0gKiBNYXRoLnBvdyg2MCwgYXJ5UGllY2VzQXNJbnRlZ2Vycy5sZW5ndGggLSAxIC0gaSk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHRvdGFsU2Vjb25kcztcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEBmdW5jdGlvbiByZW1vdmVDaGF0Q29udGFpbmVyXHJcbiAgICpcclxuICAgKiBAZGVzY3JpcHRpb24gRmluZHMgYW5kIHJlbW92ZXMgYSBET00gZWxlbWVudCB3aXRoIHRoZSB0YWcgbmFtZSBcImNoYXQtY29udGFpbmVyXCIuXHJcbiAgICpcclxuICAgKiBAcmV0dXJucyB7Qm9vbGVhbn0gUmV0dXJucyB0cnVlIGlmIHRoZSBlbGVtZW50IGlzIGZvdW5kIGFuZCByZW1vdmVkLCBvdGhlcndpc2UgZmFsc2UuXHJcbiAgICpcclxuICAgKiBAdGhyb3dzIHtFcnJvcn0gSWYgYW55IGVycm9ycyBvY2N1ciBkdXJpbmcgdGhlIGV4ZWN1dGlvbiBvZiB0aGVcclxuICAgKiBmdW5jdGlvbiwgdGhleSBhcmUgdGhyb3duIHdpdGggYW4gZXJyb3IgbWVzc2FnZSBwcmVmaXhlZCBieSB0aGVcclxuICAgKiBmdW5jdGlvbiBuYW1lLlxyXG4gICAqL1xyXG4gIGZ1bmN0aW9uIHJlbW92ZUNoYXRDb250YWluZXIoKSB7XHJcbiAgICBjb25zdCBlcnJQcmVmaXggPSAnKHJlbW92ZUNoYXRDb250YWluZXIpICc7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgY2hhdENvbnRhaW5lciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjaGF0LWNvbnRhaW5lcicpO1xyXG4gICAgICBpZiAoIWNoYXRDb250YWluZXIpIHtcclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNoYXRDb250YWluZXIucmVtb3ZlKCk7XHJcblxyXG4gICAgICByZXR1cm4gdHJ1ZTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoYCR7ZXJyUHJlZml4fSR7ZXJyb3IubWVzc2FnZX1gKTtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQGZ1bmN0aW9uIHNob3dUcmFuc2NyaXB0RGl2XHJcbiAgICogQGRlc2NyaXB0aW9uIExvY2F0ZXMgRE9NIGVsZW1lbnRzIHdpdGggdGhlIHRhZyBuYW1lXHJcbiAgICogXCJ5dGQtZW5nYWdlbWVudC1wYW5lbC1zZWN0aW9uLWxpc3QtcmVuZGVyZXJcIiB0aGF0IGhhdmUgYSBkZXNjZW5kYW50XHJcbiAgICogd2l0aCBhbiBhdHRyaWJ1dGUgbmFtZWQgXCJhcmlhLWxhYmVsXCIgYW5kIHRoZSB2YWx1ZSBvZiB0aGF0XHJcbiAgICogYXR0cmlidXRlIGhhcyB0aGUgbG93ZXJjYXNlZCB2YWx1ZSBlcXVhbCB0byBcInNob3cgdHJhbnNjcmlwdFwiLlxyXG4gICAqIElmIGFueSBzdWNoIGVsZW1lbnRzIGFyZSBmb3VuZCwgc2V0cyB0aGUgXCJkaXNwbGF5XCIgc3R5bGUgYXR0cmlidXRlXHJcbiAgICogdG8gXCJibG9ja1wiIGZvciBlYWNoIGFuZCByZXR1cm5zIHRoZSBudW1iZXIgb2YgZWxlbWVudHMgdGhhdCB3ZXJlXHJcbiAgICogZm91bmQuIE90aGVyd2lzZSwgcmV0dXJucyBudWxsLlxyXG4gICAqXHJcbiAgICogQHJldHVybnMge051bWJlcnxudWxsfSBUaGUgbnVtYmVyIG9mIGVsZW1lbnRzIGZvdW5kIGFuZCBtb2RpZmllZCxcclxuICAgKiBvciBudWxsIGlmIG5vIGVsZW1lbnRzIGFyZSBmb3VuZC5cclxuICAgKlxyXG4gICAqIEB0aHJvd3Mge0Vycm9yfSBJZiBhbnkgZXJyb3JzIG9jY3VyIGR1cmluZyB0aGUgZXhlY3V0aW9uIG9mIHRoZVxyXG4gICAqIGZ1bmN0aW9uLCB0aGV5IGFyZSB0aHJvd24gd2l0aCBhbiBlcnJvciBtZXNzYWdlIHByZWZpeGVkIGJ5IHRoZVxyXG4gICAqIGZ1bmN0aW9uIG5hbWUuXHJcbiAgICovXHJcbiAgZnVuY3Rpb24gc2hvd1RyYW5zY3JpcHREaXYoKSB7XHJcbiAgICBjb25zdCBlcnJQcmVmaXggPSAnKHNob3dUcmFuc2NyaXB0RGl2KSAnO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IGVsZW1lbnRzID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ3l0ZC1lbmdhZ2VtZW50LXBhbmVsLXNlY3Rpb24tbGlzdC1yZW5kZXJlcicpO1xyXG4gICAgICBsZXQgY291bnQgPSAwO1xyXG5cclxuICAgICAgLyoqXHJcbiAgICAgICAqIEBmdW5jdGlvbiByZWN1cnNpdmVTZWFyY2hcclxuICAgICAgICogQGRlc2NyaXB0aW9uIFJlY3Vyc2l2ZWx5IHNlYXJjaGVzIHRocm91Z2ggdGhlIG5vZGUncyBjaGlsZHJlbiB0byBmaW5kXHJcbiAgICAgICAqIGEgbm9kZSB3aXRoIHRoZSBzcGVjaWZpZWQgYXJpYS1sYWJlbC5cclxuICAgICAgICpcclxuICAgICAgICogQHBhcmFtIHtOb2RlfSBub2RlIFRoZSBET00gbm9kZSB0byBzZWFyY2guXHJcbiAgICAgICAqIEByZXR1cm5zIHtCb29sZWFufSBUcnVlIGlmIGEgbWF0Y2hpbmcgbm9kZSBpcyBmb3VuZCwgZmFsc2Ugb3RoZXJ3aXNlLlxyXG4gICAgICAgKi9cclxuICAgICAgY29uc3QgcmVjdXJzaXZlU2VhcmNoID0gKG5vZGUpID0+IHtcclxuICAgICAgICBpZiAobm9kZS5nZXRBdHRyaWJ1dGUgJiYgbm9kZS5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSAmJlxyXG4gICAgICAgICAgICBub2RlLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpLnRvTG93ZXJDYXNlKCkgPT09ICdzaG93IHRyYW5zY3JpcHQnKSB7XHJcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBub2RlLmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICBpZiAocmVjdXJzaXZlU2VhcmNoKG5vZGUuY2hpbGRyZW5baV0pKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgIH07XHJcblxyXG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGVsZW1lbnRzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgaWYgKHJlY3Vyc2l2ZVNlYXJjaChlbGVtZW50c1tpXSkpIHtcclxuICAgICAgICAgIGVsZW1lbnRzW2ldLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xyXG4gICAgICAgICAgY291bnQrKztcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHJldHVybiBjb3VudCA+IDAgPyBjb3VudCA6IG51bGw7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7ZXJyUHJlZml4fSR7ZXJyb3IubWVzc2FnZX1gKTtcclxuICAgIH1cclxuICB9XHJcblxyXG5cclxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0gRU5EICA6IEZPUk0gSEFORExJTkcgLS0tLS0tLS0tLS0tXHJcblxyXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLSBCRUdJTjogVFJBTlNDUklQVCBHUkFCQkVEIENMQVNTIC0tLS0tLS0tLS0tLVxyXG5cclxuLy8gVGhpcyBmaWxlIGNvbnRhaW5zIHRoZSBvYmplY3QgdGhhdCB0aGUgQ2hyb21lIGV4dGVuc2lvblxyXG4vLyAgcGFzc2VzIGJhY2sgdG8gdGhlIGJhY2stZW5kIHNlcnZlciB3aGVuIGEgdHJhbnNjcmlwdFxyXG4vLyAgaGFzIGJlZW4gZ3JhYmJlZC5cclxuXHJcbiAgLyoqXHJcbiAgICogQ2xhc3Mgb2JqZWN0IHRoYXQgY29udGFpbnMgb25lIHRyYW5zY3JpcHQgbGluZSBmcm9tXHJcbiAgICogIGEgdmlkZW8gdHJhbnNjcmlwdC5cclxuICAgKi9cclxuICBjbGFzcyBUcmFuc2NyaXB0TGluZSB7XHJcbiAgICAvKipcclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gdHJhbnNjcmlwdFRleHQgLSBUaGUgbGluZSBvZlxyXG4gICAgICogIHRleHQgYmVsb25naW5nIHRvIHRoZSB0cmFuc2NyaXB0IGxpbmUuXHJcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gdGltZXN0YW1wU3RyaW5nIC0gVGhlIHRpbWVzdGFtcFxyXG4gICAgICogIGZvciB0aGUgdHJhbnNjcmlwdCBsaW5lIGJ1dCBpbiBzdHJpbmcgZm9ybWF0LlxyXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IG9mZnNldEluU2Vjb25kcyAtIG9mZnNldFxyXG4gICAgICogIG9mIHRoZSBsaW5lIGluIHNlY29uZHMgd2hlcmUgdGhlIHRyYW5zY3JpcHQgbGluZVxyXG4gICAgICogIGFwcGVhcnMgaW4gdGhlIHZpZGVvLlxyXG4gICAgICovXHJcbiAgICBjb25zdHJ1Y3RvcihcclxuICAgICAgICB0cmFuc2NyaXB0VGV4dCxcclxuICAgICAgICB0aW1lc3RhbXBTdHJpbmcsXHJcbiAgICAgICAgb2Zmc2V0SW5TZWNvbmRzKSB7XHJcblxyXG4gICAgICBjb25zdCBtZXRob2ROYW1lID0gJ1RyYW5zY3JpcHRMaW5lJyArICc6OicgKyBgY29uc3RydWN0b3JgO1xyXG4gICAgICBjb25zdCBlcnJQcmVmaXggPSAnKCcgKyBtZXRob2ROYW1lICsgJykgJztcclxuXHJcbiAgICAgIGlmIChpc0VtcHR5U2FmZVN0cmluZyh0cmFuc2NyaXB0VGV4dCkpXHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGAke2VyclByZWZpeH1UaGUgdHJhbnNjcmlwdFRleHQgcGFyYW1ldGVyXHJcbiAgICAgICBpcyBlbXB0eSBvciBpbnZhbGlkLmApO1xyXG4gICAgICBpZiAoaXNFbXB0eVNhZmVTdHJpbmcodGltZXN0YW1wU3RyaW5nKSlcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7ZXJyUHJlZml4fVRoZSB0aW1lc3RhbXBTdHJpbmcgcGFyYW1ldGVyXHJcbiAgICAgICBpcyBlbXB0eSBvciBpbnZhbGlkLmApO1xyXG4gICAgICBpZiAodHlwZW9mIG9mZnNldEluU2Vjb25kcyAhPT0gJ251bWJlcicgfHwgb2Zmc2V0SW5TZWNvbmRzIDwgMCB8fCAhaXNGaW5pdGUob2Zmc2V0SW5TZWNvbmRzKSB8fCAhTnVtYmVyLmlzSW50ZWdlcihvZmZzZXRJblNlY29uZHMpKVxyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgJHtlcnJQcmVmaXh9VGhlIHZhbHVlIGluIHRoZSBvZmZzZXRJblNlY29uZHMgcGFyYW1ldGVyIGlzIGludmFsaWQuYCk7XHJcblxyXG4gICAgICAvKiogQHByb3BlcnR5IHtTdHJpbmd9IC0gVGhlIGxpbmUgb2ZcclxuICAgICAgIHRleHQgYmVsb25naW5nIHRvIHRoZSB0cmFuc2NyaXB0IGxpbmUuXHJcbiAgICAgICAqL1xyXG4gICAgICB0aGlzLnRyYW5zY3JpcHRUZXh0ID0gdHJhbnNjcmlwdFRleHQ7XHJcblxyXG4gICAgICAvKiogQHByb3BlcnR5IHtTdHJpbmd9IC0gVGhlIHRpbWVzdGFtcFxyXG4gICAgICAgZm9yIHRoZSB0cmFuc2NyaXB0IGxpbmUgYnV0IGluIHN0cmluZ1xyXG4gICAgICAgZm9ybWF0LlxyXG4gICAgICAgKi9cclxuICAgICAgdGhpcy50aW1lc3RhbXBTdHJpbmcgPSB0aW1lc3RhbXBTdHJpbmc7XHJcblxyXG4gICAgICAvKiogQHByb3BlcnR5IHtOdW1iZXJ9IC0gb2Zmc2V0IG9mIHRoZVxyXG4gICAgICAgKiBsaW5lIGluIHNlY29uZHMgd2hlcmUgdGhlIHRyYW5zY3JpcHRcclxuICAgICAgICogbGluZVxyXG4gICAgICAgKi9cclxuICAgICAgdGhpcy5vZmZzZXRJblNlY29uZHMgPSBvZmZzZXRJblNlY29uZHM7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBSZWNvbnN0aXR1dGVzIGEgVHJhbnNjcmlwdEdyYWJiZWQgY2xhc3Mgb2JqZWN0IGZyb20gYSByYXdcclxuICAgKiAgSlNPTiBvYmplY3QuXHJcbiAgICpcclxuICAgKiBAcGFyYW0ge09iamVjdH0gcmF3VHJhbnNjcmlwdExpbmVPYmogLSBUaGUgcmF3IEpTT04gb2JqZWN0XHJcbiAgICogIGNvbnRhaW5pbmcgdGhlIGZpZWxkcyBmb3IgYSB0cmFuc2NyaXB0IGdyYWJiZWQgb2JqZWN0LlxyXG4gICAqXHJcbiAgICogQHJldHVybiB7VHJhbnNjcmlwdExpbmV9XHJcbiAgICovXHJcbiAgVHJhbnNjcmlwdExpbmUucmVjb25zdGl0dXRlT2JqZWN0ID0gZnVuY3Rpb24gKHJhd1RyYW5zY3JpcHRMaW5lT2JqKSB7XHJcbiAgICBsZXQgZXJyUHJlZml4ID0gJyhUcmFuc2NyaXB0TGluZTo6cmVjb25zdGl0dXRlT2JqZWN0KSAnO1xyXG5cclxuICAgIGlmICghKHR5cGVvZiByYXdUcmFuc2NyaXB0TGluZU9iaiA9PSAnb2JqZWN0JykpXHJcbiAgICAgIHRocm93IG5ldyBFcnJvcihlcnJQcmVmaXggKyAnVGhlIHJhdyB0cmFuc2NyaXB0IGxpbmUgb2JqZWN0IHBhcmFtZXRlciBpcyBub3QgYW4gb2JqZWN0LicpO1xyXG5cclxuICAgIGNvbnN0IG5ld1RyYW5zY3JpcHRMaW5lT2JqID1cclxuICAgICAgICBuZXcgVHJhbnNjcmlwdExpbmUoXHJcbiAgICAgICAgICAgIHJhd1RyYW5zY3JpcHRMaW5lT2JqLnRyYW5zY3JpcHRUZXh0LFxyXG4gICAgICAgICAgICByYXdUcmFuc2NyaXB0TGluZU9iai50aW1lc3RhbXBTdHJpbmcsXHJcbiAgICAgICAgICAgIHJhd1RyYW5zY3JpcHRMaW5lT2JqLm9mZnNldEluU2Vjb25kcyk7XHJcblxyXG4gICAgcmV0dXJuIG5ld1RyYW5zY3JpcHRMaW5lT2JqO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ2xhc3Mgb2JqZWN0IHJldHVybmVkIGJ5IHRoZSBDaHJvbWUgZXh0ZW5zaW9uIGluXHJcbiAgICogIHJlc3BvbnNlIHRvIGEgZ3JhYiB0cmFuc2NyaXB0IHJlcXVlc3QgYnkgdGhlXHJcbiAgICogIGJhY2stZW5kIHNlcnZlci4gIEl0IGNvbnRhaW5zIHRoZSBwZXJ0aW5lbnRcclxuICAgKiAgZWxlbWVudHMgb2YgYSB2aWRlbyB0cmFuc2NyaXB0IGFuZCBzb21lIGdlbmVyYWxcclxuICAgKiAgaW5mb3JtYXRpb24gYWJvdXQgdGhlIHZpZGVvLlxyXG4gICAqXHJcbiAgICogTk9URTogV2UgZG8gbm90IGNhcnJ5IHRoZSBkYXRlIHRoZSB2aWRlbyB3YXMgcHVibGlzaGVkXHJcbiAgICogIGFuZCB0aGUgdmlkZW8gZGVzY3JpcHRpb24sIGJlY2F1c2UgaXQgbW9yZSByZWxpYWJsZVxyXG4gICAqICB0byBnZXQgdGhlIGluZm9ybWF0aW9uIGZyb20gdGhlIFlvdVR1YmUgQVBJLCBpbnN0ZWFkXHJcbiAgICogIG9mIHBhcnNpbmcgdGhlIERPTSB0cmVlIGZyb20gdGhlIGNvbnRlbnQgc2NyaXB0IVxyXG4gICAqL1xyXG4gIGNsYXNzIFRyYW5zY3JpcHRHcmFiYmVkIHtcclxuICAgIC8qKlxyXG4gICAgICogSW5pdGlhbGl6ZXMgYSBuZXcgaW5zdGFuY2Ugb2YgdGhlIFRyYW5zY3JpcHRHcmFiYmVkIGNsYXNzLlxyXG4gICAgICovXHJcbiAgICBjb25zdHJ1Y3RvcigpIHtcclxuXHJcbiAgICAgIC8qKiBAcHJvcGVydHkge3N0cmluZ30gLSBUaGUgY29uc3RydWN0b3IgbmFtZSBmb3IgdGhpcyBvYmplY3QsXHJcbiAgICAgICAqICAgd2hpY2ggaXMgYWxzbyB0aGUgY29uc3RydWN0IG5hbWUuICBUaGlzIGlzIHVzZWZ1bCBmb3JcclxuICAgICAgICogICBvYmplY3RzIHRoYXQgZ2V0IHBhc3NlZCBvdmVyIGJyaWRnZXMgbGlrZSB0aGUgcG9zdE1lc3NhZ2UoKVxyXG4gICAgICAgKiAgIGZ1bmN0aW9uIGFuZCBpbiBzbyBkb2luZyBhcmUgcmVkdWNlZCB0byBhIHBsYWluIEpTT05cclxuICAgICAgICogICBvYmplY3QuICBUaGlzIHByb3BlcnR5IGhlbHBzIHRoZSByZWNlaXZlciB0byByZWNvbnN0aXR1dGVcclxuICAgICAgICogICB0aGUgb3JpZ2luYWwgZnVuY3Rpb24gb3IgY2xhc3Mgb2JqZWN0LlxyXG4gICAgICAgKi9cclxuICAgICAgdGhpcy5jb25zdHJ1Y3Rvck5hbWUgPSAnVHJhbnNjcmlwdEdyYWJiZWQnO1xyXG5cclxuICAgICAgLyoqIEBwcm9wZXJ0eSB7U3RyaW5nfSAtIFRoZSB2aWRlbyBJRCBvZiB0aGVcclxuICAgICAgICogIHNvdXJjZSB2aWRlbyBmb3IgdGhlIHRyYW5zY3JpcHQuICBXZVxyXG4gICAgICAgKiAgcHV0IHRoZSB2aWRlbyBJRCBvZiB0aGUgaG9zdCB3ZWIgcGFnZVxyXG4gICAgICAgKiAgaGVyZSBzbyB0aGUgc2VydmVyIGNhbiBjb25maXJtIGl0IGFnYWluc3RcclxuICAgICAgICogIHRoZSBvbmUgaXQgdXNlZCBpbiBpdHMgdHJhbnNjcmlwdCByZXF1ZXN0LlxyXG4gICAgICAgKi9cclxuICAgICAgdGhpcy5pZE9mVmlkZW8gPSBudWxsO1xyXG5cclxuICAgICAgLyoqIEBwcm9wZXJ0eSB7QXJyYXk8VHJhbnNjcmlwdExpbmU+fSAtIFRoZSBhcnJheSBvZlxyXG4gICAgICAgKiAgdHJhbnNjcmlwdCBsaW5lIG9iamVjdHMgdGhhdCBtYWtlIHVwIGEgdmlkZW9cclxuICAgICAgICogIHRyYW5zY3JpcHQuXHJcbiAgICAgICAqL1xyXG4gICAgICB0aGlzLmFyeVRyYW5zY3JpcHRMaW5lT2JqcyA9IFtdO1xyXG5cclxuICAgICAgLy8gTk9URTogV2UgZG8gbm90IGFzc2lnbiBhbnkgb2YgdGhlIG90aGVyIHZpZGVvXHJcbiAgICAgIC8vICBkZXRhaWxzIGluIHRoaXMgb2JqZWN0IGJlY2F1c2UgdGhlIHNlcnZlciB3aWxsXHJcbiAgICAgIC8vICB1c2UgdGhlIFlvdVR1YmUgQVBJIHRvIHRoYXQgaW5zdGVhZCwgdGhlcmVieVxyXG4gICAgICAvLyAgYXZvaWRpbmcgYW55IHVubmVjZXNzYXJ5IHBhZ2UgcGFyc2luZy5cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEFkZCBhIHRyYW5zY3JpcHQgbGluZSBvYmplY3QgdG8gb3VyIGFycmF5IG9mIHRob3NlLlxyXG4gICAgICpcclxuICAgICAqIEBwYXJhbSB7VHJhbnNjcmlwdExpbmV9IHRyYW5zY3JpcHRMaW5lT2JqIC0gQSB2YWxpZFxyXG4gICAgICogIHRyYW5zY3JpcHQgbGluZSBvYmplY3QuXHJcbiAgICAgKi9cclxuICAgIGFkZFRyYW5zY3JpcHRMaW5lT2JqZWN0KHRyYW5zY3JpcHRMaW5lT2JqKSB7XHJcbiAgICAgIGNvbnN0IG1ldGhvZE5hbWUgPSAnVHJhbnNjcmlwdEdyYWJiZWQnICsgJzo6JyArIGBhZGRUcmFuc2NyaXB0TGluZU9iamVjdGA7XHJcbiAgICAgIGNvbnN0IGVyclByZWZpeCA9ICcoJyArIG1ldGhvZE5hbWUgKyAnKSAnO1xyXG5cclxuICAgICAgaWYgKCEodHJhbnNjcmlwdExpbmVPYmogaW5zdGFuY2VvZiBUcmFuc2NyaXB0TGluZSkpXHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGAke2VyclByZWZpeH1UaGUgdmFsdWUgaW4gdGhlIHRyYW5zY3JpcHRMaW5lT2JqIHBhcmFtZXRlciBpcyBub3QgYSBUcmFuc2NyaXB0TGluZSBvYmplY3QuYCk7XHJcblxyXG4gICAgICB0aGlzLmFyeVRyYW5zY3JpcHRMaW5lT2Jqcy5wdXNoKHRyYW5zY3JpcHRMaW5lT2JqKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEdldCB0aGUgY29uY2F0ZW5hdGVkIHRyYW5zY3JpcHQgdGV4dCB3aXRob3V0XHJcbiAgICAgKiAgdGltZXN0YW1wcy5cclxuICAgICAqXHJcbiAgICAgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgY29uY2F0ZW5hdGVkIHRyYW5zY3JpcHQgdGV4dC5cclxuICAgICAqXHJcbiAgICAgKiBAdGhyb3dzIHtFcnJvcn0gVGhyb3dzIGFuIGVycm9yIGlmIHRoaXMuYXJ5VHJhbnNjcmlwdExpbmVPYmpzXHJcbiAgICAgKiAgaXMgbm90IGFuIGFycmF5LlxyXG4gICAgICovXHJcbiAgICBnZXRDb25jYXRlbmF0ZWRUZXh0V2l0aG91dFRpbWVzdGFtcHMoKSB7XHJcbiAgICAgIGNvbnN0IGVyclByZWZpeCA9ICcoZ2V0Q29uY2F0ZW5hdGVkVGV4dFdpdGhvdXRUaW1lc3RhbXBzKSAnO1xyXG5cclxuICAgICAgaWYgKCFBcnJheS5pc0FycmF5KHRoaXMuYXJ5VHJhbnNjcmlwdExpbmVPYmpzKSkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgJHtlcnJQcmVmaXh9YXJ5VHJhbnNjcmlwdExpbmVPYmpzIGlzIG5vdCBhbiBhcnJheS5gKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgbGV0IHN0ckNvbmNhdGVuYXRlZFRleHQgPSAnJztcclxuXHJcbiAgICAgIHRoaXMuYXJ5VHJhbnNjcmlwdExpbmVPYmpzLmZvckVhY2goZWxlbWVudCA9PiB7XHJcbiAgICAgICAgaWYgKHR5cGVvZiBlbGVtZW50LnRyYW5zY3JpcHRUZXh0ICE9PSAnc3RyaW5nJykge1xyXG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGAke2VyclByZWZpeH10cmFuc2NyaXB0VGV4dCBpcyBub3QgYSBzdHJpbmcuYCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBUcmltIHRoZSB0cmFuc2NyaXB0IHRleHRcclxuICAgICAgICBsZXQgdHJpbW1lZFRleHQgPSBlbGVtZW50LnRyYW5zY3JpcHRUZXh0LnRyaW0oKTtcclxuXHJcbiAgICAgICAgLy8gUmVtb3ZlIGNvbnRlbnQgaW5zaWRlIHNxdWFyZSBicmFja2V0c1xyXG4gICAgICAgIHRyaW1tZWRUZXh0ID0gdHJpbW1lZFRleHQucmVwbGFjZSgvXFxbLio/XFxdL2csICcnKS50cmltKCk7XHJcblxyXG4gICAgICAgIC8vIEFwcGVuZCB0aGUgdGV4dCB0byBzdHJDb25jYXRlbmF0ZWRUZXh0IGlmIGl0J3Mgbm9uLWVtcHR5XHJcbiAgICAgICAgaWYgKHRyaW1tZWRUZXh0Lmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgIGlmIChzdHJDb25jYXRlbmF0ZWRUZXh0Lmxlbmd0aCA+IDAgJiZcclxuICAgICAgICAgICAgICBzdHJDb25jYXRlbmF0ZWRUZXh0W3N0ckNvbmNhdGVuYXRlZFRleHQubGVuZ3RoIC0gMV0gIT09ICcgJykge1xyXG4gICAgICAgICAgICBzdHJDb25jYXRlbmF0ZWRUZXh0ICs9ICcgJztcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIHN0ckNvbmNhdGVuYXRlZFRleHQgKz0gdHJpbW1lZFRleHQ7XHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIHJldHVybiBzdHJDb25jYXRlbmF0ZWRUZXh0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0IHRoZSBjb25jYXRlbmF0ZWQgdHJhbnNjcmlwdCB0ZXh0IFdJVEhcclxuICAgICAqICB0aW1lc3RhbXBzLlxyXG4gICAgICpcclxuICAgICAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSBjb25jYXRlbmF0ZWQgdHJhbnNjcmlwdCB0ZXh0LlxyXG4gICAgICpcclxuICAgICAqIEB0aHJvd3Mge0Vycm9yfSBUaHJvd3MgYW4gZXJyb3IgaWYgdGhpcy5hcnlUcmFuc2NyaXB0TGluZU9ianNcclxuICAgICAqICBpcyBub3QgYW4gYXJyYXkuXHJcbiAgICAgKi9cclxuICAgIGdldENvbmNhdGVuYXRlZFRleHRXaXRoVGltZXN0YW1wcygpIHtcclxuICAgICAgY29uc3QgZXJyUHJlZml4ID0gJyhnZXRDb25jYXRlbmF0ZWRUZXh0V2l0aFRpbWVzdGFtcHMpICc7XHJcblxyXG4gICAgICBpZiAoIUFycmF5LmlzQXJyYXkodGhpcy5hcnlUcmFuc2NyaXB0TGluZU9ianMpKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGAke2VyclByZWZpeH1hcnlUcmFuc2NyaXB0TGluZU9ianMgaXMgbm90IGFuIGFycmF5LmApO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCByYXdUcmFuc2NyaXB0VGV4dCA9XHJcbiAgICAgICAgICB0aGlzLmFyeVRyYW5zY3JpcHRMaW5lT2Jqcy5tYXAoXHJcbiAgICAgICAgICAgICAgKHRyYW5zY3JpcHRMaW5lT2JqKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZiAoISh0cmFuc2NyaXB0TGluZU9iaiBpbnN0YW5jZW9mIFRyYW5zY3JpcHRMaW5lKSlcclxuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGAke2VyclByZWZpeH1UaGUgdmFsdWUgaW4gdGhlIHRyYW5zY3JpcHRMaW5lT2JqIHZhcmlhYmxlIGlzIG5vdCBhIFRyYW5zY3JpcHRMaW5lIG9iamVjdC5gKTtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBUaGlzIHJlc3RvcmVzIHRoZSB0cmFuc2NyaXB0IHRleHQgdG8gaXRzIG9yaWdpbmFsXHJcbiAgICAgICAgICAgICAgICAvLyAgZm9ybWF0IGluIGl0cyByYXcgZm9ybS4gIFRoYXQgaXMsIHRoZSB0aW1lc3RhbXBcclxuICAgICAgICAgICAgICAgIC8vICBvbiBvbmUgbGluZSwgZm9sbG93ZWQgYnkgdGhlIGFzc29jaWF0ZWQgdHJhbnNjcmlwdFxyXG4gICAgICAgICAgICAgICAgLy8gIHRleHQgb24gdGhlIG5leHQgbGluZS5cclxuICAgICAgICAgICAgICAgIHJldHVybiBgJHt0cmFuc2NyaXB0TGluZU9iai50aW1lc3RhbXBTdHJpbmd9XFxuJHt0cmFuc2NyaXB0TGluZU9iai50cmFuc2NyaXB0VGV4dH1cXG5gO1xyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICkuam9pbigpO1xyXG5cclxuICAgICAgcmV0dXJuIHJhd1RyYW5zY3JpcHRUZXh0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVmFsaWRhdGUgdGhlIGNvbnRlbnRzIG9mIHRoaXMgb2JqZWN0LlxyXG4gICAgICovXHJcbiAgICB2YWxpZGF0ZU1lKCkge1xyXG4gICAgICBjb25zdCBtZXRob2ROYW1lID0gJ1RyYW5zY3JpcHRHcmFiYmVkJyArICc6OicgKyBgdmFsaWRhdGVNZWA7XHJcbiAgICAgIGNvbnN0IGVyclByZWZpeCA9ICcoJyArIG1ldGhvZE5hbWUgKyAnKSAnO1xyXG5cclxuICAgICAgaWYgKGlzRW1wdHlTYWZlU3RyaW5nKHRoaXMuY29uc3RydWN0b3JOYW1lKSlcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7ZXJyUHJlZml4fVRoZSB0aGlzLmNvbnN0cnVjdG9yTmFtZSBmaWVsZCBpcyBlbXB0eSBvciBpbnZhbGlkLmApO1xyXG4gICAgICBpZiAoaXNFbXB0eVNhZmVTdHJpbmcodGhpcy5pZE9mVmlkZW8pKVxyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgJHtlcnJQcmVmaXh9VGhlIFwiaWRPZlZpZGVvXCIgZmllbGQgaXMgZW1wdHkgb3IgaW52YWxpZC5gKTtcclxuXHJcbiAgICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tIEJFR0lOOiBUaG9yb3VnaGx5IHZhbGlkYXRlIHRoZSBhcnJheSBvZiB0cmFuc2NyaXB0IGxpbmUgb2JqZWN0cy4gLS0tLS0tLS0tLS0tXHJcblxyXG4gICAgICBpZiAoIUFycmF5LmlzQXJyYXkodGhpcy5hcnlUcmFuc2NyaXB0TGluZU9ianMpKVxyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgJHtlcnJQcmVmaXh9VGhlIHRoaXMuYXJ5VHJhbnNjcmlwdExpbmVPYmpzIGZpZWxkIHZhbHVlIGlzIG5vdCBhbiBhcnJheS5gKTtcclxuICAgICAgaWYgKHRoaXMuYXJ5VHJhbnNjcmlwdExpbmVPYmpzLmxlbmd0aCA8IDEpXHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGAke2VyclByZWZpeH1UaGUgdGhpcy5hcnlUcmFuc2NyaXB0TGluZU9ianMgYXJyYXkgaXMgZW1wdHlgKTtcclxuXHJcbiAgICAgIGNvbnN0IGJBbGxBcmVUcmFuc2NyaXB0TGluZU9iamVjdHMgPSB0aGlzLmFyeVRyYW5zY3JpcHRMaW5lT2Jqcy5ldmVyeSh0cmFuc2NyaXB0TGluZU9iaiA9PiB7XHJcbiAgICAgICAgcmV0dXJuIHRyYW5zY3JpcHRMaW5lT2JqIGluc3RhbmNlb2YgVHJhbnNjcmlwdExpbmU7XHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgaWYgKCFiQWxsQXJlVHJhbnNjcmlwdExpbmVPYmplY3RzKVxyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgJHtlcnJQcmVmaXh9T25lIG9yIG1vcmUgZWxlbWVudHMgaW4gdGhlIGFyeVRyYW5zY3JpcHRMaW5lT2JqcyBhcnJheSBpcyBub3QgYSBUcmFuc2NyaXB0TGluZSBvYmplY3RgKTtcclxuXHJcbiAgICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tIEVORCAgOiBUaG9yb3VnaGx5IHZhbGlkYXRlIHRoZSBhcnJheSBvZiB0cmFuc2NyaXB0IGxpbmUgb2JqZWN0cy4gLS0tLS0tLS0tLS0tXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBSZWNvbnN0aXR1dGVzIGEgVHJhbnNjcmlwdEdyYWJiZWQgY2xhc3Mgb2JqZWN0IGZyb20gYSByYXdcclxuICAgKiAgSlNPTiBvYmplY3QuXHJcbiAgICpcclxuICAgKiBAcGFyYW0ge09iamVjdH0gcmF3VHJhbnNjcmlwdEdyYWJiZWQgLSBUaGUgcmF3IEpTT04gb2JqZWN0XHJcbiAgICogIGNvbnRhaW5pbmcgdGhlIGZpZWxkcyB0aGF0IGJlbG9uZ1xyXG4gICAqICAgIHRvIGFuIGFjdGl2ZSBxdWl6LlxyXG4gICAqXHJcbiAgICogQHJldHVybiB7VHJhbnNjcmlwdEdyYWJiZWR9XHJcbiAgICovXHJcbiAgVHJhbnNjcmlwdEdyYWJiZWQucmVjb25zdGl0dXRlVHJhbnNjcmlwdEdyYWJiZWRPYmogPSBmdW5jdGlvbiAocmF3VHJhbnNjcmlwdEdyYWJiZWQpIHtcclxuICAgIGxldCBlcnJQcmVmaXggPSAnKFRyYW5zY3JpcHRHcmFiYmVkOjpyZWNvbnN0aXR1dGVUcmFuc2NyaXB0R3JhYmJlZE9iaikgJztcclxuXHJcbiAgICBpZiAoISh0eXBlb2YgcmF3VHJhbnNjcmlwdEdyYWJiZWQgPT0gJ29iamVjdCcpKVxyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoZXJyUHJlZml4ICsgJ1RoZSByYXcgdHJhbnNjcmlwdCBncmFiYmVkIHBhcmFtZXRlciBpcyBub3QgYW4gb2JqZWN0LicpO1xyXG5cclxuICAgIGNvbnN0IG5ld1RyYW5zY3JpcHRHcmFiYmVkT2JqID1cclxuICAgICAgICBuZXcgVHJhbnNjcmlwdEdyYWJiZWQoKTtcclxuXHJcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLSBCRUdJTjogQ29weSB0aGUgc2ltcGxlIGZpZWxkcyBvdmVyLiAtLS0tLS0tLS0tLS1cclxuXHJcbiAgICBuZXdUcmFuc2NyaXB0R3JhYmJlZE9iai5pZE9mVmlkZW8gPSByYXdUcmFuc2NyaXB0R3JhYmJlZC5pZE9mVmlkZW87XHJcblxyXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0gRU5EICA6IENvcHkgdGhlIHNpbXBsZSBmaWVsZHMgb3Zlci4gLS0tLS0tLS0tLS0tXHJcblxyXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0gQkVHSU46IFJFQ09OU1RJVFVURSBUUkFOU0NSSVBUIExJTkUgT0JKRUNUUyBBUlJBWSAtLS0tLS0tLS0tLS1cclxuXHJcbiAgICBpZiAoIShcclxuICAgICAgICByYXdUcmFuc2NyaXB0R3JhYmJlZC5hcnlUcmFuc2NyaXB0TGluZU9ianNcclxuICAgICAgICAmJiByYXdUcmFuc2NyaXB0R3JhYmJlZC5hcnlUcmFuc2NyaXB0TGluZU9ianMubGVuZ3RoID4gMFxyXG4gICAgKSkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7ZXJyUHJlZml4fVRoZSBhcnJheSBvZiB0cmFuc2NyaXB0IGxpbmUgb2JqZWN0cyBpcyBlbXB0eSBvciBpbnZhbGlkLmApO1xyXG4gICAgfVxyXG5cclxuICAgIGZvciAoXHJcbiAgICAgICAgbGV0IG5keCA9IDA7XHJcbiAgICAgICAgbmR4IDwgcmF3VHJhbnNjcmlwdEdyYWJiZWQuYXJ5VHJhbnNjcmlwdExpbmVPYmpzLmxlbmd0aDtcclxuICAgICAgICBuZHgrKykge1xyXG4gICAgICBjb25zdCB0cmFuc2NyaXB0TGluZU9iaiA9XHJcbiAgICAgICAgICBUcmFuc2NyaXB0TGluZS5yZWNvbnN0aXR1dGVPYmplY3QocmF3VHJhbnNjcmlwdEdyYWJiZWQuYXJ5VHJhbnNjcmlwdExpbmVPYmpzW25keF0pO1xyXG5cclxuICAgICAgbmV3VHJhbnNjcmlwdEdyYWJiZWRPYmouYWRkVHJhbnNjcmlwdExpbmVPYmplY3QodHJhbnNjcmlwdExpbmVPYmopO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tIEVORCAgOiBSRUNPTlNUSVRVVEUgVFJBTlNDUklQVCBMSU5FIE9CSkVDVFMgQVJSQVkgLS0tLS0tLS0tLS0tXHJcblxyXG4gICAgLy8gVmFsaWRhdGUgdGhlIHJlY29uc3RpdHV0ZWQgb2JqZWN0IHRob3JvdWdobHkuXHJcbiAgICBuZXdUcmFuc2NyaXB0R3JhYmJlZE9iai52YWxpZGF0ZU1lKCk7XHJcblxyXG4gICAgcmV0dXJuIG5ld1RyYW5zY3JpcHRHcmFiYmVkT2JqO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogVGhpcyBmdW5jdGlvbiBnZXRzIHRoZSB0cmFuc2NyaXB0IGZyb20gYSB2aWRlb1xyXG4gICAqICBwYWdlLlxyXG4gICAqXHJcbiAgICogQHJldHVybiB7UHJvbWlzZTxUcmFuc2NyaXB0R3JhYmJlZD59IC0gUmV0dXJuc1xyXG4gICAqICBhIGZ1bGx5IGFzc2VtYmxlZCB0cmFuc2NyaXB0IG9iamVjdCB0aGF0IGNvbnRhaW5zXHJcbiAgICogIHRoZSBjb250ZW50cyBvZiB0aGUgdmlkZW8gYmVpbmcgc2hvd24gb24gdGhlXHJcbiAgICogIGN1cnJlbnQgcGFnZS5cclxuICAgKi9cclxuICBhc3luYyBmdW5jdGlvbiBnZXRUcmFuc2NyaXB0X2FzeW5jKCkge1xyXG4gICAgY29uc3QgZXJyUHJlZml4ID0gYChnZXRUcmFuc2NyaXB0X2FzeW5jKSBgO1xyXG5cclxuICAgIC8vIEZpbmQgdGhlIFNob3cgVHJhbnNjcmlwdCBidXR0b24uXHJcbiAgICBsZXQgdHJhbnNjcmlwdEJ0biA9XHJcbiAgICAgICAgYXdhaXQgZmluZEJ1dHRvbkJ5QXJpYUxhYmVsKEFSSUFfTEFCRUxfVFJBTlNDUklQVF9CVVRUT04pO1xyXG5cclxuICAgIGlmICghdHJhbnNjcmlwdEJ0bikge1xyXG4gICAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLSBCRUdJTjogUkVNT1ZFIENIQVQgQ09OVEFJTkVSIC0tLS0tLS0tLS0tLVxyXG5cclxuICAgICAgLy8gV2UgY2hlY2sgdG8gc2VlIGlmIHRoZSBjaGF0IG1lc3NhZ2VzIGNvbnRhaW5lciBlbGVtZW50XHJcbiAgICAgIC8vICBpcyBzaG93aW5nIGFuZCBpZiBzbywgYW5kIHJlbW92ZSBpdCBpbW1lZGlhdGVseSBzaW5jZSBpdCBoaWRlc1xyXG4gICAgICAvLyAgdGhlIERJViB0aGF0IGhhcyB0aGUgc2hvdyB0cmFuc2NyaXB0IGJ1dHRvbi5cclxuICAgICAgY29uc3QgYldhc0NoYXRNZXNzYWdlc1dpbmRvd0Nsb3NlZCA9IHJlbW92ZUNoYXRDb250YWluZXIoKTtcclxuXHJcbiAgICAgIGlmIChiV2FzQ2hhdE1lc3NhZ2VzV2luZG93Q2xvc2VkKSB7XHJcbiAgICAgICAgaWYgKGJWZXJib3NlX2NvbnRlbnQpIHtcclxuICAgICAgICAgIGNvbnNvbGUubG9nKENPTlNPTEVfTUVTU0FHRV9DQVRFR09SWV9DT05URU5UX1NDUklQVCwgYFN1Y2Nlc3NmdWxseSBmb3VuZCBhbmQgY2xvc2VkIHRoZSBjaGF0IG1lc3NhZ2VzIHdpbmRvdy5gKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIE1ha2Ugc3VyZSB0aGUgdHJhbnNjcmlwdCBkaXYgaXMgdmlzaWJsZS5cclxuICAgICAgICBzaG93VHJhbnNjcmlwdERpdigpO1xyXG4gICAgICAgIGF3YWl0IHdhaXRGb3JBV2hpbGUoMTAwMCwgJ01ha2luZyB0aGUgdHJhbnNjcmlwdCBESVYgdmlzaWJsZScpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKENPTlNPTEVfTUVTU0FHRV9DQVRFR09SWV9DT05URU5UX1NDUklQVCwgYFRoZSBjaGF0IG1lc3NhZ2VzIHdpbmRvdyB3YXMgbm90IHZpc2libGUgb3Igd2Ugd2VyZSB1bmFibGUgdG8gY2xvc2UgaXQuYCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tIEVORCAgOiBDTE9TRSBDSEFUIE1FU1NBR0VTIFdJTkRPVyAtLS0tLS0tLS0tLS1cclxuXHJcbiAgICAgIC8vIFRyeSB0byBmaW5kIHRoZSBTaG93IFRyYW5zY3JpcHQgYnV0dG9uIGFnYWluLlxyXG4gICAgICB0cmFuc2NyaXB0QnRuID1cclxuICAgICAgICAgIGF3YWl0IGZpbmRCdXR0b25CeUFyaWFMYWJlbChBUklBX0xBQkVMX1RSQU5TQ1JJUFRfQlVUVE9OKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBXZSBtYXkgbmVlZCB0byBoaXQgdGhlIFwiU2hvdyBtb3JlXCIgYnV0dG9uIHRvXHJcbiAgICAvLyBtYWtlIGl0IHZpc2libGUgZmlyc3QuXHJcbiAgICBpZiAoIXRyYW5zY3JpcHRCdG4pIHtcclxuICAgICAgY29uc3QgYXJ5RXhwYW5kb0J1dHRvbnMgPVxyXG4gICAgICAgICAgZmluZEVsZW1lbnRCeVRhZ05hbWVBbmRUZXh0KCd0cC15dC1wYXBlci1idXR0b24nLCAnLi4ubW9yZScpO1xyXG5cclxuICAgICAgaWYgKGFyeUV4cGFuZG9CdXR0b25zKSB7XHJcbiAgICAgICAgY29uc3Qgb3BlcmF0aW9uTXNnID0gYENsaWNraW5nIEFMTCBleHBhbmRvIGJ1dHRvbnMgbm93LmA7XHJcblxyXG4gICAgICAgIGlmIChiVmVyYm9zZV9jb250ZW50KSB7XHJcbiAgICAgICAgICBjb25zb2xlLmxvZyhDT05TT0xFX01FU1NBR0VfQ0FURUdPUllfQ09OVEVOVF9TQ1JJUFQsIG9wZXJhdGlvbk1zZyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBhcnlFeHBhbmRvQnV0dG9ucy5mb3JFYWNoKGJ1dHRvbiA9PiBidXR0b24uY2xpY2soKSk7XHJcblxyXG4gICAgICAgIGF3YWl0IHdhaXRGb3JBV2hpbGUoMTAwMCwgb3BlcmF0aW9uTXNnKTtcclxuXHJcbiAgICAgICAgaWYgKGJWZXJib3NlX2NvbnRlbnQpIHtcclxuICAgICAgICAgIGNvbnNvbGUubG9nKENPTlNPTEVfTUVTU0FHRV9DQVRFR09SWV9DT05URU5UX1NDUklQVCwgJ0F0dGVtcHRpbmcgdG8gZmluZCB0cmFuc2NyaXB0IGJ1dHRvbiBhZ2Fpbi4uLicpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gVHJ5IHRvIGZpbmQgdGhlIHNob3cgdHJhbnNjcmlwdCBidXR0b24gYWdhaW4uXHJcbiAgICAgICAgdHJhbnNjcmlwdEJ0biA9XHJcbiAgICAgICAgICAgIGF3YWl0IGZpbmRCdXR0b25CeUFyaWFMYWJlbChBUklBX0xBQkVMX1RSQU5TQ1JJUFRfQlVUVE9OKTtcclxuXHJcbiAgICAgICAgaWYgKCF0cmFuc2NyaXB0QnRuKSB7XHJcbiAgICAgICAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLSBCRUdJTjogU0hPVyBISURERU4gRU5HQUdFTUVOVCBQQU5FbCAtLS0tLS0tLS0tLS1cclxuXHJcbiAgICAgICAgICAvLyBUaGVyZSBhcHBlYXJzIHRvIGJlIGFuIG9kZCBidWcgaW4gdGhlIFlvdVR1YmUgaG9zdCBwYWdlXHJcbiAgICAgICAgICAvLyAgY29kZSB0aGF0IGhpZGVzIHRoZSBlbmdhZ2VtZW50IHBhbmVsIChvciBmYWlscyB0b1xyXG4gICAgICAgICAgLy8gIHNob3cgaXQpIHRoYXQgaGFzIHRoZSB0cmFuc2NyaXB0IGJ1dHRvbi4gIEFzIGEgbGFzdFxyXG4gICAgICAgICAgLy8gIHJlc29ydCwgdHJ5IGFuZCBzaG93IGl0IGFuZCB0cnkgdG8gZmluZCB0aGUgYnV0dG9uXHJcbiAgICAgICAgICAvLyAgYWdhaW4uICBOb3RlLCB0aGUgZW5nYWdlbWVudCBwYW5lbCBoYXMgYSBcInZpc2liaWxpdHlcIlxyXG4gICAgICAgICAgLy8gIGF0dHJpYnV0ZSBvZiBcIkVOR0FHRU1FTlRfUEFORUxfVklTSUJJTElUWV9ISURERU5cIi5cclxuICAgICAgICAgIHNob3dUcmFuc2NyaXB0RGl2KCk7XHJcblxyXG4gICAgICAgICAgLy8gVHJ5IHRvIGZpbmQgdGhlIHNob3cgdHJhbnNjcmlwdCBidXR0b24gYWdhaW4uXHJcbiAgICAgICAgICB0cmFuc2NyaXB0QnRuID1cclxuICAgICAgICAgICAgICBhd2FpdCBmaW5kQnV0dG9uQnlBcmlhTGFiZWwoQVJJQV9MQUJFTF9UUkFOU0NSSVBUX0JVVFRPTik7XHJcblxyXG4gICAgICAgICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0gRU5EICA6IFNIT1cgSElEREVOIEVOR0FHRU1FTlQgUEFORWwgLS0tLS0tLS0tLS0tXHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgJHtlcnJQcmVmaXh9VW5hYmxlIHRvIGZpbmQgYW55IGV4cGFuZG8gYnV0dG9ucyB0aGF0IG1pZ2h0IGJlIGhpZGluZyB0aGUgc2hvdyB0cmFuc2NyaXB0IGJ1dHRvbi5gKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGlmICghdHJhbnNjcmlwdEJ0bikge1xyXG4gICAgICAvLyBhbGVydChgVW5hYmxlIHRvIGZpbmQgYSBidXR0b24gd2l0aCBhcmlhIGxhYmVsOiAke0FSSUFfTEFCRUxfVFJBTlNDUklQVF9CVVRUT059YCk7XHJcbiAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIENsaWNrIHRoZSBidXR0b24uXHJcbiAgICBpZiAoYlZlcmJvc2VfY29udGVudCkge1xyXG4gICAgICBjb25zb2xlLmxvZyhDT05TT0xFX01FU1NBR0VfQ0FURUdPUllfQ09OVEVOVF9TQ1JJUFQsIGBDbGlja2luZyB0aGUgdHJhbnNjcmlwdCBidXR0b24gbm93LmApO1xyXG4gICAgfVxyXG4gICAgdHJhbnNjcmlwdEJ0bi5jbGljaygpO1xyXG5cclxuICAgIC8vIFRPRE86IEFjdHVhbGx5IHdlIHNob3VsZCBkbyByZXBlYXRlZCBjaGVja3NcclxuICAgIC8vICB0byBnZXQgdGhlIGNvdW50IG9mIHRyYW5zY3JpcHQgZWxlbWVudHMgaW4gdGhlXHJcbiAgICAvLyAgdmlkZW8gdHJhbnNjcmlwdCB3aW5kb3cgYW5kIGV4aXQgdGhlIGNoZWNrXHJcbiAgICAvLyAgbG9vcCB3aGVuIG1vcmUgdGhlbiBYIHNlY29uZHMgaGF2ZSBnb25lIGJ5XHJcbiAgICAvLyAgYW5kIHRoZSBub24temVybyBjb3VudCBoYXMgbm90IGNoYW5nZWQsIGluZGljYXRpbmdcclxuICAgIC8vICB0aGUgdHJhbnNjcmlwdCB3aW5kb3cgaGFzIChtb3N0IGxpa2VseSkgZmluaXNoZWRcclxuICAgIC8vICBsb2FkaW5nIGl0cyBjb250ZW50LlxyXG4gICAgYXdhaXQgd2FpdEZvckFXaGlsZSgxMDAwLCAnV2FpdGluZyBmb3IgdHJhbnNjcmlwdCcpO1xyXG5cclxuICAgIC8qXHJcbiAgICAgICAgdHJhbnNjcmlwdFRleHQsXHJcbiAgICAgICAgdGltZXN0YW1wU3RyaW5nLFxyXG4gICAgICAgIG9mZnNldEluU2Vjb25kc1xyXG4gICAgICovXHJcbiAgICBjb25zdCBhcnlUcmFuc2NyaXB0T2JqcyA9IGdldEFsbFRyYW5zY3JpcHRUZXh0QW5kVGltZXMoKTtcclxuXHJcbiAgICAvLyBhbGVydChgVHJhbnNjcmlwdCBvZiBsZW5ndGgoJHthcnlUcmFuc2NyaXB0T2Jqc30pIGhhcyBiZWVuIGNvcGllZCB0byB0aGUgY2xpcGJvYXJkLmApO1xyXG5cclxuICAgIC8vIEJ1aWxkIGEgdHJhbnNjcmlwdCBncmFiYmVkIG9iamVjdCBhbmQgcmV0dXJuIGl0LlxyXG4gICAgY29uc3QgbmV3VHJhbnNjcmlwdEdyYWJiZWRPYmogPVxyXG4gICAgICAgIG5ldyBUcmFuc2NyaXB0R3JhYmJlZCgpO1xyXG5cclxuICAgIC8vID4+Pj4+IEFjdHVhbCB2aWRlbyBJRC5cclxuICAgIGNvbnN0IHZpZGVvSWQgPSBleHRyYWN0WW91VHViZVZpZGVvSWRGcm9tVXJsKGxvY2F0aW9uLmhyZWYpO1xyXG4gICAgaWYgKGlzRW1wdHlTYWZlU3RyaW5nKHZpZGVvSWQpKVxyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7ZXJyUHJlZml4fVRoZSB2aWRlb0lkIHZhcmlhYmxlIGlzIGVtcHR5IG9yIGludmFsaWQuYCk7XHJcbiAgICBuZXdUcmFuc2NyaXB0R3JhYmJlZE9iai5pZE9mVmlkZW8gPSB2aWRlb0lkO1xyXG5cclxuICAgIC8vID4+Pj4+IEFycmF5IG9mIHRyYW5zY3JpcHQgbGluZXNcclxuICAgIC8vXHJcbiAgICAvLyBDb252ZXJ0IHRoZSBhcnJheSBvZiBwcm90b3R5cGUtbGVzcyB0cmFuc2NyaXB0XHJcbiAgICAvLyAgbGluZSBvYmplY3RzIHRvIFRyYW5zY3JpcHRMaW5lIG9iamVjdHMuXHJcbiAgICBsZXQgY291bnRDb250aWd1b3VzRW1wdHlMaW5lcyA9IDA7XHJcblxyXG4gICAgZm9yIChsZXQgbmR4ID0gMDsgbmR4IDwgYXJ5VHJhbnNjcmlwdE9ianMubGVuZ3RoOyBuZHgrKykge1xyXG4gICAgICBjb25zdCByYXdUcmFuc2NyaXB0TGluZU9iaiA9IGFyeVRyYW5zY3JpcHRPYmpzW25keF07XHJcblxyXG4gICAgICBpZiAoIWlzTm9uTnVsbE9iamVjdEFuZE5vdEFycmF5KHJhd1RyYW5zY3JpcHRMaW5lT2JqKSlcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7ZXJyUHJlZml4fVRoZSByYXdUcmFuc2NyaXB0TGluZU9iaiB2YXJpYWJsZSBmb3IgZWxlbWVudCgke25keH0pIGlzIG5vdCBhIHZhbGlkIG9iamVjdCBpcyBub3QgYSB2YWxpZCBvYmplY3QuYCk7XHJcblxyXG4gICAgICAvLyBTb21ldGltZXMgdGhlcmUgYWN0dWFsbHkgYXJlIGEgZmV3IGVtcHR5IGxpbmVzLlxyXG4gICAgICBjb25zdCB1c2VUcmFuc2NyaXB0VGV4dCA9XHJcbiAgICAgICAgICByYXdUcmFuc2NyaXB0TGluZU9iai50cmFuc2NyaXB0VGV4dC50cmltKCk7XHJcblxyXG4gICAgICBpZiAodXNlVHJhbnNjcmlwdFRleHQubGVuZ3RoIDwgMSkge1xyXG4gICAgICAgIGNvdW50Q29udGlndW91c0VtcHR5TGluZXMrKztcclxuXHJcbiAgICAgICAgLy8gVG9vIG1hbnkgY29udGlndW91cyBlbXB0eSBsaW5lcz9cclxuICAgICAgICBpZiAoY291bnRDb250aWd1b3VzRW1wdHlMaW5lcyA+IE1BWF9FTVBUWV9DT05USUdVT1VTX1RSQU5TQ1JJUFRfTElORVMpXHJcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7ZXJyUHJlZml4fVRvbyBtYW55IGNvbnRpZ3VvdXMgZW1wdHkgdHJhbnNjcmlwdCBsaW5lcy5gKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBSZXNldCB0aGUgY29udGlndW91cyBlbXB0eSBsaW5lIGNvdW50ZXIgc2luY2Ugd2VcclxuICAgICAgICAvLyAgZm91bmQgYSBub24tZW1wdHkgbGluZS5cclxuICAgICAgICBjb3VudENvbnRpZ3VvdXNFbXB0eUxpbmVzID0gMDtcclxuXHJcbiAgICAgICAgY29uc3QgdHJhbnNjcmlwdExpbmVPYmogPVxyXG4gICAgICAgICAgICBuZXcgVHJhbnNjcmlwdExpbmUodXNlVHJhbnNjcmlwdFRleHQsIHJhd1RyYW5zY3JpcHRMaW5lT2JqLnRpbWVzdGFtcFN0cmluZywgcmF3VHJhbnNjcmlwdExpbmVPYmoub2Zmc2V0SW5TZWNvbmRzKTtcclxuXHJcbiAgICAgICAgbmV3VHJhbnNjcmlwdEdyYWJiZWRPYmouYWRkVHJhbnNjcmlwdExpbmVPYmplY3QodHJhbnNjcmlwdExpbmVPYmopO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKGJWZXJib3NlX2NvbnRlbnQpIHtcclxuICAgICAgY29uc29sZS5sb2coQ09OU09MRV9NRVNTQUdFX0NBVEVHT1JZX0NPTlRFTlRfU0NSSVBULCBgUmV0dXJuaW5nIG5ldyB0cmFuc2NyaXB0IG9iamVjdCBmb3IgdmlkZW8gSUQ6ICR7dmlkZW9JZH1gKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gbmV3VHJhbnNjcmlwdEdyYWJiZWRPYmo7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBUaGlzIGZ1bmN0aW9uIGdldHMgdGhlIGNvbnRlbnQgZnJvbSB0aGUgY3VycmVudFxyXG4gICAqICB3ZWIgcGFnZS5cclxuICAgKlxyXG4gICAqIEByZXR1cm4ge09iamVjdHxudWxsfSAtIFJldHVybnMgdGhlIGNvbnRlbnRcclxuICAgKiAgb2YgdGhlIGN1cnJlbnQgcGFnZSBvciBOVUxMIGlmIHRoYXQgY29udGVudFxyXG4gICAqICBjYW4gbm90IGJlIGFjY2Vzc2VkIGF0IHRoaXMgdGltZS5cclxuICAgKi9cclxuICBmdW5jdGlvbiBnZXRDb250ZW50X2FzeW5jKCkge1xyXG4gICAgY29uc3QgZXJyUHJlZml4ID0gYChnZXRDb250ZW50X2FzeW5jKSBgO1xyXG5cclxuICAgIGlmIChkb2N1bWVudCkge1xyXG4gICAgICBjb25zdCBwYWdlQ29udGVudE9iaiA9XHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIHBhZ2VUaXRsZTogZG9jdW1lbnQudGl0bGUsXHJcbiAgICAgICAgICAgIHBhZ2VDb250ZW50OiBkb2N1bWVudC5ib2R5LmlubmVyVGV4dCxcclxuICAgICAgICAgICAgdXJsVG9TcmNQYWdlOiBsb2NhdGlvbi5ocmVmXHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICByZXR1cm4gcGFnZUNvbnRlbnRPYmo7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICAvKlxyXG4gICAgY29uc3QgYmxvYiA9IG5ldyBCbG9iKFthbGxDb250ZW50c10sIHsgdHlwZTogJ3RleHQvcGxhaW4nIH0pO1xyXG4gICAgY29uc3QgdXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcclxuICAgIGNvbnN0IGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XHJcblxyXG4gICAgYS5ocmVmID0gdXJsO1xyXG4gICAgYS5kb3dubG9hZCA9ICdjb250ZW50LnR4dCc7XHJcbiAgICBhLmNsaWNrKCk7XHJcbiAgICBVUkwucmV2b2tlT2JqZWN0VVJMKHVybCk7XHJcbiAgICAgKi9cclxuICB9XHJcblxyXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLSBFTkQgIDogVFJBTlNDUklQVCBHUkFCQkVEIENMQVNTIC0tLS0tLS0tLS0tLVxyXG5cclxuICAvKipcclxuICAgKiBMaXN0ZW5lciBmb3IgbWVzc2FnZXMgdG8gdGhpcyBjb250ZW50IHNjcmlwdC5cclxuICAgKi9cclxuICBjaHJvbWUucnVudGltZS5vbk1lc3NhZ2UuYWRkTGlzdGVuZXIoXHJcbiAgICAgIChtZXNzYWdlLCBzZW5kZXIsIHNlbmRSZXNwb25zZSkgPT4ge1xyXG5cclxuICAgICAgICBjb25zb2xlLmxvZyhgQ09OVEVOVCBTQ1JJUFQ6IFJlY2VpdmVkIG1lc3NhZ2U6IGAsIG1lc3NhZ2UpO1xyXG5cclxuICAgICAgICBsZXQgYklzQXN5bmNSZXNwb25zZSA9IGZhbHNlO1xyXG5cclxuICAgICAgICBpZiAoc2VuZGVyLmlkICE9PSBjaHJvbWUucnVudGltZS5pZCkge1xyXG4gICAgICAgICAgLy8gSWdub3JlIG1lc3NhZ2VzIHRoYXQgYXJlIG5vdCBmcm9tIHRoZSBiYWNrZ3JvdW5kIHNjcmlwdC5cclxuICAgICAgICAgIGNvbnNvbGUubG9nKGBDT05URU5UIFNDUklQVDogSWdub3JpbmcgdW53YW50ZWQgb3IgdW5kZWZpbmVkIG1lc3NhZ2UuYCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIC8vIElzIGl0IGEgcmVxdWVzdCBhY3Rpb24sIG9yIHJlc3BvbnNlIG1lc3NhZ2U/XHJcbiAgICAgICAgICBpZiAobWVzc2FnZS5hY3Rpb24pIHtcclxuICAgICAgICAgICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0gQkVHSU46IFBST0NFU1MgUkVRVUVTVCBBQ1RJT04gLS0tLS0tLS0tLS0tXHJcblxyXG4gICAgICAgICAgICBjb25zdCByZXF1ZXN0T2JqID0gbWVzc2FnZTtcclxuXHJcbiAgICAgICAgICAgIGlmIChyZXF1ZXN0T2JqLmFjdGlvbiA9PT0gJ2NvbnRlbnRTY3JpcHRSZWFkeUNoZWNrJykge1xyXG4gICAgICAgICAgICAgIC8vIFRoZSBCQUNLR1JPVU5EIHNjcmlwdCB3YW50cyB0byBrbm93IGlmIHdlIGFyZSByZWFkeS5cclxuICAgICAgICAgICAgICBjb25zdCBzdGF0dXNNc2cgPSBgQ09OVEVOVCBTQ1JJUFQ6IFRoZSBjb250ZW50IHNjcmlwdCBpcyB0ZWxsaW5nIHRoZSBCQUNLR1JPVU5EIHNjcmlwdCB0aGF0IGlzIHJlYWR5LmA7XHJcblxyXG4gICAgICAgICAgICAgIHNlbmRSZXNwb25zZShzdGF0dXNNc2cpO1xyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHJlcXVlc3RPYmouYWN0aW9uID09PSAncmVsYXllZENvbnRlbnRTY3JpcHRSZWFkeUNoZWNrJykge1xyXG4gICAgICAgICAgICAgIC8vIEEgbm9uLWNvbnRlbnQgc2NyaXB0IGJlc2lkZXMgdGhlIEJBQ0tHUk9VTkQgc2NyaXB0IHdhbnRzXHJcbiAgICAgICAgICAgICAgLy8gIHRvIGtub3cgaWYgd2UgYXJlIHJlYWR5LlxyXG4gICAgICAgICAgICAgIGNvbnN0IHN0YXR1c01zZyA9IGBDT05URU5UIFNDUklQVDogVGhlIGNvbnRlbnQgc2NyaXB0IGlzIHRlbGxpbmcgYW5vdGhlciBOT04tQ09OVEVOVCBzY3JpcHQgdGhhdCBpcyBub3QgdGhlIGJhY2tncm91bmQgc2NyaXB0IHRoYXQgaXMgcmVhZHkuYDtcclxuICAgICAgICAgICAgICBzZW5kUmVzcG9uc2Uoc3RhdHVzTXNnKTtcclxuICAgICAgICAgICAgfSBlbHNlIGlmIChyZXF1ZXN0T2JqLmFjdGlvbiA9PT0gXCJleHRyYWN0VGV4dFwiKSB7XHJcbiAgICAgICAgICAgICAgLy8gRXh0cmFjdCB0aGUgdGV4dCBmcm9tIHRoZSBjdXJyZW50IHdlYiBwYWdlIChsZWdhY3kpLlxyXG4gICAgICAgICAgICAgIHNlbmRSZXNwb25zZSh7dGV4dDogZG9jdW1lbnQuYm9keS5pbm5lclRleHR9KTtcclxuICAgICAgICAgICAgfSBlbHNlIGlmIChyZXF1ZXN0T2JqLmFjdGlvbiA9PT0gXCJncmFiVHJhbnNjcmlwdFwiKSB7XHJcbiAgICAgICAgICAgICAgLy8gR3JhYiB0aGUgY3VycmVudCB0cmFuc2NyaXB0IGFuZCBzZW5kIGl0XHJcbiAgICAgICAgICAgICAgLy8gIGJhY2sgdG8gdGhlIHBvcHVwLlxyXG4gICAgICAgICAgICAgIHNldFRpbWVvdXQoYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgZ3JhYmJlZFRyYW5zY3JpcHRPYmogPVxyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IGdldFRyYW5zY3JpcHRfYXN5bmMoKTtcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAoZ3JhYmJlZFRyYW5zY3JpcHRPYmopIHtcclxuICAgICAgICAgICAgICAgICAgY29uc3QgdHJhbnNjcmlwdFRleHQgPVxyXG4gICAgICAgICAgICAgICAgICAgICAgZ3JhYmJlZFRyYW5zY3JpcHRPYmouZ2V0Q29uY2F0ZW5hdGVkVGV4dFdpdGhvdXRUaW1lc3RhbXBzKCk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAvLyBHaXZlIHRoZSBwb3B1cCB0aGUgdHJhbnNjcmlwdCB0ZXh0LlxyXG4gICAgICAgICAgICAgICAgICBzZW5kUmVzcG9uc2Uoe3R5cGU6IFwidHJhbnNjcmlwdEdyYWJiZWRcIiwgdGV4dDogdHJhbnNjcmlwdFRleHR9KTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgIC8vIFRlbGwgdGhlIHBvcHVwIHdlIGNvdWxkIG5vdCBncmFiIHRoZSB0cmFuc2NyaXB0LlxyXG4gICAgICAgICAgICAgICAgICBzZW5kUmVzcG9uc2Uoe3R5cGU6IFwidHJhbnNjcmlwdFVuYXZhaWxhYmxlXCIsIHRleHQ6IFwiVGhlIHRyYW5zY3JpcHQgaXMgdW5hdmFpbGFibGUuXCJ9KTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICB9LCAxKTtcclxuXHJcbiAgICAgICAgICAgICAgLy8gTGV0IHRoZSBiYWNrZ3JvdW5kIHNjcmlwdCBrbm93IHdlIHdpbGwgcmV0dXJuIHRoZVxyXG4gICAgICAgICAgICAgIC8vICByZXNwb25zZSBhc3luY2hyb25vdXNseS5cclxuICAgICAgICAgICAgICBiSXNBc3luY1Jlc3BvbnNlID0gdHJ1ZTtcclxuICAgICAgICAgICAgfSBlbHNlIGlmIChyZXF1ZXN0T2JqLmFjdGlvbiA9PT0gXCJncmFiQ29udGVudFwiKSB7XHJcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coYENPTlRFTlQgU0NSSVBUOiBSZWNlaXZlZCBncmFiQ29udGVudCBhY3Rpb24gcmVxdWVzdC5gKTtcclxuXHJcbiAgICAgICAgICAgICAgLy8gR3JhYiB0aGUgY3VycmVudCBjb250ZW50IGFuZCBzZW5kIGl0XHJcbiAgICAgICAgICAgICAgLy8gIGJhY2sgdG8gdGhlIGJhY2tncm91bmQgc2NyaXB0LlxyXG4gICAgICAgICAgICAgIHNldFRpbWVvdXQoYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYENPTlRFTlQgU0NSSVBUOiBHZXR0aW5nIHBhZ2UgY29udGVudC5gKTtcclxuXHJcbiAgICAgICAgICAgICAgICBjb25zdCBzdHJQYWdlQ29udGVudE9iaiA9IGdldENvbnRlbnRfYXN5bmMoKTtcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHN0clBhZ2VDb250ZW50T2JqID09PSAnb2JqZWN0Jykge1xyXG4gICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgQ09OVEVOVCBTQ1JJUFQ6IFJldHVybmluZyBQQUdFIENPTlRFTlQgcmVzcG9uc2UuYCk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAvLyBSZXR1cm4gdGhlIHdlYiBwYWdlIGNvbnRlbnQuXHJcbiAgICAgICAgICAgICAgICAgIHNlbmRSZXNwb25zZShcclxuICAgICAgICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogXCJjb250ZW50R3JhYmJlZFwiLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0ZXh0OiBKU09OLnN0cmluZ2lmeShzdHJQYWdlQ29udGVudE9iailcclxuICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBDT05URU5UIFNDUklQVDogUmV0dXJuaW5nIFBBR0UgRkFJTFVSRSByZXNwb25zZS5gKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgIC8vIFRlbGwgdGhlIGJhY2tncm91bmQgc2NyaXB0IHdlIGNvdWxkIG5vdCBncmFiIHRoZSBjb250ZW50LlxyXG4gICAgICAgICAgICAgICAgICBzZW5kUmVzcG9uc2Uoe3R5cGU6IFwiY29udGVudFVuYXZhaWxhYmxlXCIsIHRleHQ6IFwiVGhlIGNvbnRlbnQgaXMgdW5hdmFpbGFibGUuXCJ9KTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICB9LCAxKTtcclxuXHJcbiAgICAgICAgICAgICAgLy8gTGV0IHRoZSBiYWNrZ3JvdW5kIHNjcmlwdCBrbm93IHdlIHdpbGwgcmV0dXJuIHRoZVxyXG4gICAgICAgICAgICAgIC8vICByZXNwb25zZSBhc3luY2hyb25vdXNseS5cclxuICAgICAgICAgICAgICBiSXNBc3luY1Jlc3BvbnNlID0gdHJ1ZTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgQ09OVEVOVCBTQ1JJUFQ6IFVua25vd24gYWN0aW9uOiAke3JlcXVlc3RPYmouYWN0aW9ufWApO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLSBFTkQgIDogUFJPQ0VTUyBSRVFVRVNUIEFDVElPTiAtLS0tLS0tLS0tLS1cclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tIEJFR0lOOiBIQU5ETEUgTUVTU0FHRSAtLS0tLS0tLS0tLS1cclxuXHJcbiAgICAgICAgICAgIGlmIChbJ3JlbGF5ZWRDb250ZW50U2NyaXB0SXNSZWFkeSddLmluY2x1ZGVzKG1lc3NhZ2UudHlwZSkpIHtcclxuICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgQ09OVEVOVCBTQ1JJUFQ6IElnbm9yaW5nIHNhZmVseSBtZXNzYWdlOiAke21lc3NhZ2UudHlwZX1gKTtcclxuICAgICAgICAgICAgfSBlbHNlIGlmIChtZXNzYWdlLnR5cGUgPT09IFwicG9wdXBTY3JpcHRSZWFkeVwiKSB7XHJcbiAgICAgICAgICAgICAgLy8gVGhlIHBvcHVwIHNjcmlwdCBpcyByZWFkeS5cclxuICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgQ09OVEVOVCBTQ1JJUFQ6IFJlY2VpdmVkIFwicG9wdXBTY3JpcHRSZWFkeVwiIG1lc3NhZ2UuYCk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coYENPTlRFTlQgU0NSSVBUOiBVbmtub3duIE1FU1NBR0UgdHlwZTogJHttZXNzYWdlLnR5cGV9YCk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tIEVORCAgOiBIQU5ETEUgTUVTU0FHRSAtLS0tLS0tLS0tLS1cclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBiSXNBc3luY1Jlc3BvbnNlO1xyXG4gICAgICB9KTtcclxuXHJcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tIEJFR0lOOiBXQUlUIEZPUiBPVEhFUiBTQ1JJUFRTIFRPIEJFIFJFQURZIC0tLS0tLS0tLS0tLVxyXG5cclxuICBsZXQgYklzQmFja2dyb3VuZFNjcmlwdElzTm90UmVhZHkgPSB0cnVlO1xyXG4gIGxldCBiSXNQb3B1cFNjcmlwdElzTm90UmVhZHkgPSB0cnVlO1xyXG5cclxuICB3aGlsZSAoYklzQmFja2dyb3VuZFNjcmlwdElzTm90UmVhZHkgfHwgYklzUG9wdXBTY3JpcHRJc05vdFJlYWR5KSB7XHJcbiAgICAvLyBCYWNrZ3JvdW5kIHNjcmlwdCByZWFkeSBjaGVjay5cclxuICAgIGlmIChiSXNCYWNrZ3JvdW5kU2NyaXB0SXNOb3RSZWFkeSkge1xyXG4gICAgICBiSXNCYWNrZ3JvdW5kU2NyaXB0SXNOb3RSZWFkeSA9ICEoYXdhaXQgZG9SZWFkeUNoZWNrKCdDT05URU5UIFNDUklQVCcsIHthY3Rpb246ICdiYWNrZ3JvdW5kU2NyaXB0UmVhZHlDaGVjayd9LCAnYmFja2dyb3VuZCBzY3JpcHQnKSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gUG9wdXAgc2NyaXB0IHJlYWR5IGNoZWNrLlxyXG4gICAgaWYgKGJJc1BvcHVwU2NyaXB0SXNOb3RSZWFkeSkge1xyXG4gICAgICBiSXNQb3B1cFNjcmlwdElzTm90UmVhZHkgPSAhKGF3YWl0IGRvUmVhZHlDaGVjaygnQ09OVEVOVCBTQ1JJUFQnLCB7YWN0aW9uOiAncG9wdXBTY3JpcHRSZWFkeUNoZWNrJ30sICdwb3B1cCBzY3JpcHQnKSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gV2FpdCAxMDBtcy5cclxuICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMDApKTtcclxuICB9XHJcblxyXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLSBFTkQgIDogV0FJVCBGT1IgT1RIRVIgU0NSSVBUUyBUTyBCRSBSRUFEWSAtLS0tLS0tLS0tLS1cclxuXHJcbi8vIFRlbGwgdGhlIHBvcHVwIHNjcmlwdCB3ZSBhcmUgcmVhZHkuXHJcbiAgY29uc29sZS5sb2coYENPTlRFTlQgU0NSSVBUOiBDb250ZW50IHNjcmlwdCBsb2FkZWQuICBTZW5kaW5nIGNvbnRlbnRTY3JpcHRSZWFkeSBtZXNzYWdlIHRvIGJhY2tncm91bmQgc2NyaXB0Li4uYCk7XHJcblxyXG4gIGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcclxuICAgIHR5cGU6IFwiY29udGVudFNjcmlwdFJlYWR5XCIsXHJcbiAgICBtZXNzYWdlOiBcIlRoZSBjb250ZW50IHNjcmlwdCBpcyByZWFkeS5cIlxyXG4gIH0pO1xyXG59XHJcbi8vIGRlYnVnZ2VyOyIsIi8vIFNvbWUgaGVscGZ1bCBtaXNjZWxsYW5lb3VzIHJvdXRpbmVzLlxyXG5cclxuXHJcbi8qKlxyXG4gKiBSZXR1cm5zIGEgc3RyaW5nIHJlcHJlc2VudGF0aW9uIG9mIHRoZSBnaXZlbiBvYmplY3QsIHdpdGhcclxuICogbnVsbCBhbmQgdW5kZWZpbmVkIGJlaW5nIHJldHVybmVkIGFzIHRoZSBlbXB0eSBzdHJpbmcuXHJcbiAqXHJcbiAqIEBwYXJhbSB7Kn0gb2JqIFRoZSBvYmplY3QgdG8gY29udmVydC5cclxuICpcclxuICogQHJldHVybiB7c3RyaW5nfSBBIHN0cmluZyByZXByZXNlbnRhdGlvbiBvZiB0aGUge0Bjb2RlIG9ian0uXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gbWFrZVN0cmluZ1NhZmUob2JqKSB7XHJcbiAgaWYgKHR5cGVvZiBvYmogPT0gJ3VuZGVmaW5lZCcgfHwgb2JqID09IG51bGwpXHJcbiAgICByZXR1cm4gJyc7XHJcblxyXG4gIHJldHVybiBTdHJpbmcob2JqKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFNpbXBsZSBoZWxwZXIgZnVuY3Rpb24gdG8gY29uZm9ybSBlcnJvciBvYmplY3RzIHRoYXQgbWF5IGFsc28gYmUgcGxhaW4gc3RyaW5nc1xyXG4gKiBcdHRvIGEgc3RyaW5nIGVycm9yIG1lc3NhZ2UuXHJcbiAqXHJcbiAqIEBwYXJhbSB7T2JqZWN0fHN0cmluZ3xudWxsfSBlcnIgLSBUaGUgZXJyb3Igb2JqZWN0LCBvciBlcnJvciBtZXNzYWdlLCBvciBOVUxMLlxyXG4gKlxyXG4gKiBAcmV0dXJuIHtzdHJpbmd9IC0gUmV0dXJucyB0aGUgZXJyIHZhbHVlIGl0c2VsZiBpZiBpdCdzIGEgc3RyaW5nLiAgSWYgZXJyIGlzXHJcbiAqICBhbiBvYmplY3QsIGFuZCBpdCBoYXMgYSAnbWVzc2FnZScgcHJvcGVydHksIGl0IHdpbGwgcmV0dXJuIHRoZSBlcnIubWVzc2FnZVxyXG4gKiAgcHJvcGVydHkgdmFsdWUuICBPdGhlcndpc2UsIHRoZSBkZWZhdWx0IGVtcHR5IHZhbHVlIGlzIHJldHVybmVkLlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGNvbmZvcm1FcnJvck9iamVjdE1zZyhlcnIpXHJcbntcclxuICBsZXQgZXJyTXNnID0gJyhub25lKSc7XHJcblxyXG4gIGlmICh0eXBlb2YgZXJyID09ICdzdHJpbmcnKVxyXG4gICAgZXJyTXNnID0gZXJyO1xyXG4gIGVsc2VcclxuICB7XHJcbiAgICBpZiAoZXJyICYmIGVyci5tZXNzYWdlKVxyXG4gICAgICBlcnJNc2cgPSBlcnIubWVzc2FnZTtcclxuICB9XHJcblxyXG4gIHJldHVybiBlcnJNc2c7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDaGVja3MgaWYgYSBzdHJpbmcgaXMgZW1wdHkgb3IgY29udGFpbnMgb25seSB3aGl0ZXNwYWNlcy5cclxuICogQHBhcmFtIHtzdHJpbmd9IHN0ciBUaGUgc3RyaW5nIHRvIGNoZWNrLlxyXG4gKiBAcmV0dXJuIHtib29sZWFufSBXaGV0aGVyIHtAY29kZSBzdHJ9IGlzIGVtcHR5IG9yIHdoaXRlc3BhY2Ugb25seS5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBpc0VtcHR5T3JXaGl0ZXNwYWNlU3RyaW5nIChzdHIpIHtcclxuICAvLyB0ZXN0aW5nIGxlbmd0aCA9PSAwIGZpcnN0IGlzIGFjdHVhbGx5IHNsb3dlciBpbiBhbGwgYnJvd3NlcnMgKGFib3V0IHRoZVxyXG4gIC8vIHNhbWUgaW4gT3BlcmEpLlxyXG4gIC8vIFNpbmNlIElFIGRvZXNuJ3QgaW5jbHVkZSBub24tYnJlYWtpbmctc3BhY2UgKDB4YTApIGluIHRoZWlyIFxccyBjaGFyYWN0ZXJcclxuICAvLyBjbGFzcyAoYXMgcmVxdWlyZWQgYnkgc2VjdGlvbiA3LjIgb2YgdGhlIEVDTUFTY3JpcHQgc3BlYyksIHdlIGV4cGxpY2l0bHlcclxuICAvLyBpbmNsdWRlIGl0IGluIHRoZSByZWdleHAgdG8gZW5mb3JjZSBjb25zaXN0ZW50IGNyb3NzLWJyb3dzZXIgYmVoYXZpb3IuXHJcbiAgcmV0dXJuIC9eW1xcc1xceGEwXSokLy50ZXN0KHN0cik7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDaGVja3MgaWYgYSBzdHJpbmcgaXMgbnVsbCwgdW5kZWZpbmVkLCBlbXB0eSBvciBjb250YWlucyBvbmx5IHdoaXRlc3BhY2VzLlxyXG4gKiBAcGFyYW0geyp9IHN0ciBUaGUgc3RyaW5nIHRvIGNoZWNrLlxyXG4gKiBAcmV0dXJuIHtib29sZWFufSBXaGV0aGVyIHtAY29kZSBzdHJ9IGlzIG51bGwsIHVuZGVmaW5lZCwgZW1wdHksIG9yXHJcbiAqICAgICB3aGl0ZXNwYWNlIG9ubHkuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gaXNFbXB0eVNhZmVTdHJpbmcoc3RyKSB7XHJcbiAgcmV0dXJuIGlzRW1wdHlPcldoaXRlc3BhY2VTdHJpbmcobWFrZVN0cmluZ1NhZmUoc3RyKSk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBUaGlzIGZ1bmN0aW9uIHJldHVybnMgVFJVRSBpZiBhbmQgb25seSBpZiB0aGUgZ2l2ZW4gb2JqZWN0IGlzIG5vdCBOVUxMIG9yXHJcbiAqIFx0J3VuZGVmaW5lZCcsIGlzIG5vdCBOVUxMLCBhbmQgaXMgb2YgdHlwZSAnb2JqZWN0Jy4gIEFueXRoaW5nIGVsc2UgcnR1cm5zXHJcbiAqIFx0RkFMU0VcclxuICpcclxuICogQHBhcmFtIG9iaiAtIFRoZSBhbGxlZ2VkIG9iamVjdCB0byBpbnNwZWN0LlxyXG4gKlxyXG4gKiBAcmV0dXJuIHtib29sZWFufVxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGlzTm9uTnVsbE9iamVjdEFuZE5vdEFycmF5KG9iaikge1xyXG4gIGxldCBlcnJQcmVmaXggPSAnKGlzTm9uTnVsbE9iamVjdEFuZE5vdEFycmF5KSAnO1xyXG5cclxuICBpZiAodHlwZW9mIG9iaiA9PT0gJ3VuZGVmaW5lZCcgfHwgb2JqID09IG51bGwpXHJcbiAgICByZXR1cm4gZmFsc2U7XHJcblxyXG4gIGlmIChBcnJheS5pc0FycmF5KG9iaikpXHJcbiAgICByZXR1cm4gZmFsc2U7XHJcblxyXG4gIHJldHVybiAodHlwZW9mIG9iaiA9PT0gJ29iamVjdCcpO1xyXG59XHJcblxyXG4vKipcclxuLyoqXHJcbiAqIFZhbGlkYXRlcyB0aGUgZXhpc3RlbmNlIGFuZCB0eXBlIG9mIGEgRE9NIGVsZW1lbnQuXHJcbiAqICBUaHJvd3MgYW4gZXJyb3IgaWYgYW55IG9mIHRoZSB2YWxpZGF0aW9ucyBmYWlsLlxyXG4gKiAgT3RoZXJ3aXNlLCBpdCBzaW1wbHkgcmV0dXJucy5cclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IGlkT2ZEb21FbGVtZW50IC0gVGhlIElEIG9mIHRoZVxyXG4gKiAgRE9NIGVsZW1lbnQgdG8gbG9vayBmb3IuXHJcbiAqIEBwYXJhbSB7Kn0gZXhwZWN0ZWRUeXBlIC0gVGhlIG9iamVjdCBwcm90b3R5cGVcclxuICogIG9mIHRoZSBleHBlY3RlZCB0eXBlLiAgRm9yIGV4YW1wbGUsXHJcbiAqICBIdG1sQnV0dG9uRWxlbWVudCwgZXRjLlxyXG4gKlxyXG4gKiBAcmV0dXJuIHsqfSAtIFJldHVybnMgYSByZWZlcmVuY2UgdG8gdGhlIERPTSBlbGVtZW50XHJcbiAqICB0aGF0IGhhcyB0aGUgZ2l2ZW4gSUQuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZmluZERvbUVsZW1lbnRPckRpZShpZE9mRG9tRWxlbWVudCwgZXhwZWN0ZWRUeXBlKSB7XHJcbiAgY29uc3QgZXJyUHJlZml4ID0gYChmaW5kRG9tRWxlbWVudE9yRGllKSBgO1xyXG5cclxuICBpZiAoaXNFbXB0eVNhZmVTdHJpbmcoaWRPZkRvbUVsZW1lbnQpKVxyXG4gICAgdGhyb3cgbmV3IEVycm9yKGAke2VyclByZWZpeH1UaGUgaWRPZkRvbUVsZW1lbnQgcGFyYW1ldGVyIGlzIGVtcHR5IG9yIGludmFsaWQuYCk7XHJcblxyXG4gIGlmICh0eXBlb2YgZXhwZWN0ZWRUeXBlID09PSAndW5kZWZpbmVkJyB8fCBleHBlY3RlZFR5cGUgPT09IG51bGwpXHJcbiAgICAgIHRocm93IG5ldyBFcnJvcihgJHtlcnJQcmVmaXh9VGhlIGV4cGVjdGVkVHlwZSBwYXJhbWV0ZXIgaXMgaW52YWxpZC5gKTtcclxuXHJcbiAgLy8gRmluZCB0aGUgYnV0dG9uIGVsZW1lbnRcclxuICBjb25zdCBkb21FbGVtZW50ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoaWRPZkRvbUVsZW1lbnQpO1xyXG5cclxuICBpZiAoIWRvbUVsZW1lbnQpIHtcclxuICAgIHRocm93IG5ldyBFcnJvcihgJHtlcnJQcmVmaXh9RWxlbWVudCB3aXRoIElEIFwiJHtpZE9mRG9tRWxlbWVudH1cIiBjYW5ub3QgYmUgZm91bmQuYCk7XHJcbiAgfVxyXG5cclxuICBpZiAoIShkb21FbGVtZW50IGluc3RhbmNlb2YgZXhwZWN0ZWRUeXBlKSkge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKGAke2VyclByZWZpeH1FbGVtZW50IHdpdGggSUQgXCIke2lkT2ZEb21FbGVtZW50fVwiIGlzIG5vdCBhICR7ZXhwZWN0ZWRUeXBlfSBlbGVtZW50LmApO1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIGRvbUVsZW1lbnQ7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBJbnNlcnRzIHRoZSBnaXZlbiBIVE1MIGJsb2NrIGFzIHRoZSBmaXJzdCBjaGlsZCBvZiB0aGVcclxuICogIGdpdmVuIHBhcmVudCBET00gZWxlbWVudC5cclxuICpcclxuICogQHBhcmFtIHtIVE1MRWxlbWVudH0gcGFyZW50RWxlbWVudCAtIFRoZSBwYXJlbnQgZWxlbWVudCB3aGVyZVxyXG4gKiAgICAgICAgdGhlIEhUTUwgYmxvY2sgd2lsbCBiZSBpbnNlcnRlZCBhcyB0aGUgZmlyc3QgY2hpbGQuXHJcbiAqIEBwYXJhbSB7c3RyaW5nfSBodG1sQmxvY2sgLSBUaGUgSFRNTCBibG9jayB0byBiZSBpbnNlcnRlZC5cclxuICpcclxuICogQHRocm93cyBXaWxsIHRocm93IGFuIGVycm9yIGlmIGVpdGhlciBgcGFyZW50RWxlbWVudElkYCBvciBgaHRtbEJsb2NrYFxyXG4gKiAgICAgICAgIGlzIG5vdCBhIHN0cmluZyBvciBpcyBlbXB0eS5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBpbnNlcnRIdG1sQXNGaXJzdENoaWxkKHBhcmVudEVsZW1lbnQsIGh0bWxCbG9jaykge1xyXG4gIGNvbnN0IGVyclByZWZpeCA9ICcoaW5zZXJ0SHRtbEFzRmlyc3RDaGlsZCkgJztcclxuXHJcbiAgLy8gVmFsaWRhdGUgaW5wdXQgcGFyYW1ldGVyc1xyXG4gIGlmICghKHBhcmVudEVsZW1lbnQgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkpXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYCR7ZXJyUHJlZml4fVRoZSB2YWx1ZSBpbiB0aGUgcGFyZW50RG9tRWxlbWVudCBwYXJhbWV0ZXIgaXMgbm90IGEgSFRNTEVsZW1lbnQgb2JqZWN0LmApO1xyXG5cclxuICAvLyBDcmVhdGUgYSBjb250YWluZXIgZm9yIHRoZSBIVE1MIGJsb2NrXHJcbiAgY29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgY29udGFpbmVyLmlubmVySFRNTCA9IGh0bWxCbG9jaztcclxuXHJcbiAgLy8gQ2hlY2sgaWYgdGhlcmUncyBhbiBleGlzdGluZyBmaXJzdCBjaGlsZFxyXG4gIGlmIChwYXJlbnRFbGVtZW50LmZpcnN0Q2hpbGQpIHtcclxuICAgIHBhcmVudEVsZW1lbnQuaW5zZXJ0QmVmb3JlKGNvbnRhaW5lci5maXJzdENoaWxkLCBwYXJlbnRFbGVtZW50LmZpcnN0Q2hpbGQpO1xyXG4gIH0gZWxzZSB7XHJcbiAgICBwYXJlbnRFbGVtZW50LmFwcGVuZENoaWxkKGNvbnRhaW5lci5maXJzdENoaWxkKTtcclxuICB9XHJcbn1cclxuXHJcblxyXG4vKipcclxuICogSW5zZXJ0cyB0aGUgZ2l2ZW4gSFRNTCBibG9jayBhcyB0aGUgZmlyc3QgY2hpbGQgb2YgdGhlIGVsZW1lbnRcclxuICogaWRlbnRpZmllZCBieSBgcGFyZW50RWxlbWVudElkYCBpbiB0aGUgY3VycmVudCBET00gdHJlZS5cclxuICpcclxuICogQHBhcmFtIHtzdHJpbmd9IHBhcmVudEVsZW1lbnRJZCAtIFRoZSBJRCBvZiB0aGUgcGFyZW50IGVsZW1lbnQgd2hlcmVcclxuICogICAgICAgIHRoZSBIVE1MIGJsb2NrIHdpbGwgYmUgaW5zZXJ0ZWQgYXMgdGhlIGZpcnN0IGNoaWxkLlxyXG4gKiBAcGFyYW0ge3N0cmluZ30gaHRtbEJsb2NrIC0gVGhlIEhUTUwgYmxvY2sgdG8gYmUgaW5zZXJ0ZWQuXHJcbiAqXHJcbiAqIEB0aHJvd3MgV2lsbCB0aHJvdyBhbiBlcnJvciBpZiBgcGFyZW50RWxlbWVudElkYCBkb2VzIG5vdCBjb3JyZXNwb25kXHJcbiAqICAgICAgICAgdG8gYW4gZXhpc3RpbmcgZWxlbWVudCBpbiB0aGUgRE9NLlxyXG4gKiBAdGhyb3dzIFdpbGwgdGhyb3cgYW4gZXJyb3IgaWYgZWl0aGVyIGBwYXJlbnRFbGVtZW50SWRgIG9yIGBodG1sQmxvY2tgXHJcbiAqICAgICAgICAgaXMgbm90IGEgc3RyaW5nIG9yIGlzIGVtcHR5LlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGluc2VydEh0bWxBc0ZpcnN0Q2hpbGRCeUlkKHBhcmVudEVsZW1lbnRJZCwgaHRtbEJsb2NrKSB7XHJcbiAgY29uc3QgZXJyUHJlZml4ID0gJyhpbnNlcnRIdG1sQXNGaXJzdENoaWxkQnlJZCkgJztcclxuXHJcbiAgLy8gVmFsaWRhdGUgaW5wdXQgcGFyYW1ldGVyc1xyXG4gIGlmICh0eXBlb2YgcGFyZW50RWxlbWVudElkICE9PSAnc3RyaW5nJyB8fCBwYXJlbnRFbGVtZW50SWQudHJpbSgpID09PSAnJykge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKGAke2VyclByZWZpeH1wYXJlbnRFbGVtZW50SWQgbXVzdCBiZSBhIG5vbi1lbXB0eSBzdHJpbmcuYCk7XHJcbiAgfVxyXG4gIGlmICh0eXBlb2YgaHRtbEJsb2NrICE9PSAnc3RyaW5nJykge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKGAke2VyclByZWZpeH1odG1sQmxvY2sgbXVzdCBiZSBhIHN0cmluZy5gKTtcclxuICB9XHJcblxyXG4gIC8vIEF0dGVtcHQgdG8gbG9jYXRlIHRoZSBwYXJlbnQgZWxlbWVudFxyXG4gIGNvbnN0IHBhcmVudEVsZW1lbnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChwYXJlbnRFbGVtZW50SWQpO1xyXG4gIGlmICghcGFyZW50RWxlbWVudCkge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKGAke2VyclByZWZpeH1FbGVtZW50IHdpdGggSUQgJyR7cGFyZW50RWxlbWVudElkfScgbm90IGZvdW5kLmApO1xyXG4gIH1cclxuXHJcbiAgLy8gQ3JlYXRlIGEgY29udGFpbmVyIGZvciB0aGUgSFRNTCBibG9ja1xyXG4gIGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gIGNvbnRhaW5lci5pbm5lckhUTUwgPSBodG1sQmxvY2s7XHJcblxyXG4gIC8vIENoZWNrIGlmIHRoZXJlJ3MgYW4gZXhpc3RpbmcgZmlyc3QgY2hpbGRcclxuICBpZiAocGFyZW50RWxlbWVudC5maXJzdENoaWxkKSB7XHJcbiAgICBwYXJlbnRFbGVtZW50Lmluc2VydEJlZm9yZShjb250YWluZXIuZmlyc3RDaGlsZCwgcGFyZW50RWxlbWVudC5maXJzdENoaWxkKTtcclxuICB9IGVsc2Uge1xyXG4gICAgcGFyZW50RWxlbWVudC5hcHBlbmRDaGlsZChjb250YWluZXIuZmlyc3RDaGlsZCk7XHJcbiAgfVxyXG59XHJcblxyXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLSBCRUdJTjogR1VFU1MgVEhFIE1BSU4gQ09OVEVOVCBBUkVBIC0tLS0tLS0tLS0tLVxyXG5cclxuLyoqXHJcbiAqIEF0dGVtcHRzIHRvIGdldCBhbiBleHRlbmRlZCBib3VuZGluZyBjbGllbnQgcmVjdCBmb3IgYSBET00gZWxlbWVudCxcclxuICogY29uc2lkZXJpbmcgb3ZlcmZsb3csIHRyYW5zZm9ybWF0aW9ucywgYW5kIG90aGVyIGZhY3RvcnMgdGhhdCBtaWdodFxyXG4gKiBhZmZlY3QgdGhlIHRydWUgdmlzaWJsZSBzaXplIG9mIHRoZSBlbGVtZW50LlxyXG4gKlxyXG4gKiBAcGFyYW0ge0VsZW1lbnR9IGRvbUVsZW1lbnQgLSBUaGUgRE9NIGVsZW1lbnQgdG8gbWVhc3VyZS5cclxuICogQHJldHVybiB7RE9NUmVjdH0gQW4gb2JqZWN0IHNpbWlsYXIgdG8gd2hhdCBnZXRCb3VuZGluZ0NsaWVudFJlY3QoKSByZXR1cm5zIGJ1dFxyXG4gKiAgICAgICAgIHBvdGVudGlhbGx5IGFkanVzdGVkIHRvIGFjY291bnQgZm9yIHZpc2libGUgb3ZlcmZsb3csIHRyYW5zZm9ybWF0aW9ucywgZXRjLlxyXG4gKi9cclxuZnVuY3Rpb24gZ2V0Qm91bmRpbmdDbGllbnRSZWN0RXh0ZW5kZWQoZG9tRWxlbWVudCkge1xyXG4gIGNvbnN0IGVyclByZWZpeCA9IGAoZ2V0Qm91bmRpbmdDbGllbnRSZWN0RXh0ZW5kZWQpIGA7XHJcblxyXG4gIGlmICghKGRvbUVsZW1lbnQgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkpXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYCR7ZXJyUHJlZml4fVRoZSB2YWx1ZSBpbiB0aGUgZG9tRWxlbWVudCBwYXJhbWV0ZXIgaXMgbm90IGEgSFRNTEVsZW1lbnQgb2JqZWN0LmApO1xyXG5cclxuICBjb25zdCByZWN0ID0gZG9tRWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICBsZXQgZXh0ZW5kZWRSZWN0ID0geyAuLi5yZWN0IH07XHJcblxyXG4gIC8vIEluaXRpYWxpemUgdmFyaWFibGVzIHRvIHRyYWNrIHRoZSBmdXJ0aGVzdCBleHRlbnRzIG9mIGNoaWxkcmVuXHJcbiAgbGV0IG1heFggPSByZWN0LnJpZ2h0O1xyXG4gIGxldCBtYXhZID0gcmVjdC5ib3R0b207XHJcblxyXG4gIC8vIFJlY3Vyc2l2ZSBmdW5jdGlvbiB0byB3YWxrIHRocm91Z2ggYWxsIGNoaWxkcmVuIGFuZCBhZGp1c3QgYmFzZWQgb24gdGhlaXIgYm91bmRpbmcgYm94ZXNcclxuICBjb25zdCBhZGp1c3RGb3JDaGlsZHJlbiA9IChlbGVtZW50KSA9PiB7XHJcbiAgICBBcnJheS5mcm9tKGVsZW1lbnQuY2hpbGRyZW4pLmZvckVhY2goY2hpbGQgPT4ge1xyXG4gICAgICBjb25zdCBjaGlsZFJlY3QgPSBjaGlsZC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuXHJcbiAgICAgIC8vIENoZWNrIGZvciB2aXNpYmxlIG92ZXJmbG93IG9yIHBvc2l0aW9uaW5nIHRoYXQgbWlnaHQgZXh0ZW5kIGJleW9uZCB0aGUgcGFyZW50XHJcbiAgICAgIGlmIChjaGlsZFJlY3QucmlnaHQgPiBtYXhYKSBtYXhYID0gY2hpbGRSZWN0LnJpZ2h0O1xyXG4gICAgICBpZiAoY2hpbGRSZWN0LmJvdHRvbSA+IG1heFkpIG1heFkgPSBjaGlsZFJlY3QuYm90dG9tO1xyXG5cclxuICAgICAgLy8gUmVjdXJzaXZlIGNhbGwgdG8gd2FsayB0aHJvdWdoIGFsbCBkZXNjZW5kYW50c1xyXG4gICAgICBhZGp1c3RGb3JDaGlsZHJlbihjaGlsZCk7XHJcbiAgICB9KTtcclxuICB9O1xyXG5cclxuICBhZGp1c3RGb3JDaGlsZHJlbihkb21FbGVtZW50KTtcclxuXHJcbiAgLy8gQWRqdXN0IHRoZSB3aWR0aCBhbmQgaGVpZ2h0IGJhc2VkIG9uIHRoZSBmdXJ0aGVzdCBleHRlbnRzIGZvdW5kXHJcbiAgZXh0ZW5kZWRSZWN0LndpZHRoID0gbWF4WCAtIHJlY3QubGVmdDtcclxuICBleHRlbmRlZFJlY3QuaGVpZ2h0ID0gbWF4WSAtIHJlY3QudG9wO1xyXG5cclxuICAvLyBDcmVhdGUgYSBuZXcgRE9NUmVjdCBvYmplY3QgZm9yIGNvbnNpc3RlbmN5IHdpdGggZ2V0Qm91bmRpbmdDbGllbnRSZWN0XHJcbiAgcmV0dXJuIG5ldyBET01SZWN0KHJlY3QubGVmdCwgcmVjdC50b3AsIGV4dGVuZGVkUmVjdC53aWR0aCwgZXh0ZW5kZWRSZWN0LmhlaWdodCk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBBIHNpbXBsZSBoZXVyaXN0aWMgZnVuY3Rpb24gdG8gZGV0ZXJtaW5lIGlmIGFuIGVsZW1lbnQgaXMgbGlrZWx5IHRvIGJlXHJcbiAqIHBhcnQgb2YgdGhlIG5vbi1tYWluIGNvbnRlbnQgKGUuZy4sIGhlYWRlciwgZm9vdGVyLCBzaWRlYmFyKS5cclxuICpcclxuICogQHBhcmFtIHtFbGVtZW50fSBlbCBUaGUgZWxlbWVudCB0byBjaGVjay5cclxuICogQHJldHVybiB7Ym9vbGVhbn0gVHJ1ZSBpZiB0aGUgZWxlbWVudCBpcyBsaWtlbHkgYSBub24tY29udGVudCBlbGVtZW50LFxyXG4gKiAgICAgICAgIGZhbHNlIG90aGVyd2lzZS5cclxuICovXHJcbmZ1bmN0aW9uIGlzTGlrZWx5Tm9uQ29udGVudChlbCkge1xyXG4gIGNvbnN0IG5vbkNvbnRlbnRLZXl3b3JkcyA9IFsnaGVhZGVyJywgJ2Zvb3RlcicsICdzaWRlYmFyJywgJ25hdicsICdtZW51JywgJ2FkdmVydGlzZW1lbnQnXTtcclxuICBjb25zdCBpZEFuZENsYXNzID0gKGVsLmlkICsgJyAnICsgZWwuY2xhc3NOYW1lKS50b0xvd2VyQ2FzZSgpO1xyXG5cclxuICByZXR1cm4gbm9uQ29udGVudEtleXdvcmRzLnNvbWUoa2V5d29yZCA9PiBpZEFuZENsYXNzLmluY2x1ZGVzKGtleXdvcmQpKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIEF0dGVtcHRzIHRvIGZpbmQgdGhlIG1haW4gY29udGVudCBhcmVhIG9mIGEgd2ViIHBhZ2UgYnkgaWRlbnRpZnlpbmcgdGhlXHJcbiAqIGxhcmdlc3QgYmxvY2stbGV2ZWwgZWxlbWVudC4gSXQgY29uc2lkZXJzIGVsZW1lbnRzIGxpa2UgRElWLCBUQUJMRSxcclxuICogU0VDVElPTiwgQVJUSUNMRSwgYW5kIE1BSU4sIGRlZmF1bHRpbmcgdG8gdGhlIEJPRFkgdGFnIGlmIG5vIHN1aXRhYmxlXHJcbiAqIGNhbmRpZGF0ZSBpcyBmb3VuZC5cclxuICpcclxuICogVGhlIGhldXJpc3RpYyBpcyBiYXNlZCBvbiB0aGUgc2l6ZSAoYXJlYSkgb2YgdGhlc2UgZWxlbWVudHMsIGFpbWluZyB0b1xyXG4gKiBpZ25vcmUgY29tbW9uIGxheW91dCBlbGVtZW50cyBzdWNoIGFzIGhlYWRlcnMsIGZvb3RlcnMsIGFuZCBzaWRlYmFycy5cclxuICogQWRkaXRpb25hbGx5LCB0aGlzIGZ1bmN0aW9uIGNoZWNrcyBmb3IgYW4gZWxlbWVudCB3aXRoIHRoZSBJRCBcInZpZXdwb3J0XCJcclxuICogYW5kIGNvbnNpZGVycyBpdCBpZiBpdHMgZGltZW5zaW9ucyBhcmUgbGFyZ2VyLiAgSWYgaXQgY2FuJ3QgZmluZFxyXG4gKiBhbiBlbGVtZW50IHdpdGggSUQgXCJ2aWV3cG9ydFwiLCBpdCB0cmllcyBhZ2FpbiBmb3IgYW4gZWxlbWVudFxyXG4gKiB3aXRoIElEIFwiY29udGVudFwiLlxyXG4gKlxyXG4gKiBAcmV0dXJuIHtFbGVtZW50fSBUaGUgRE9NIGVsZW1lbnQgdGhhdCBpcyBsaWtlbHkgdG8gcmVwcmVzZW50IHRoZSBtYWluXHJcbiAqICAgICAgICAgY29udGVudCBhcmVhIG9mIHRoZSBwYWdlLlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGZpbmRNYWluQ29udGVudEFyZWEoKSB7XHJcbiAgY29uc3QgZXJyUHJlZml4ID0gYChmaW5kTWFpbkNvbnRlbnRBcmVhKSBgO1xyXG5cclxuICBjb25zdCB0YWdzVG9Db25zaWRlciA9IFsnRElWJywgJ1RBQkxFJywgJ1NFQ1RJT04nLCAnQVJUSUNMRScsICdNQUlOJ107XHJcbiAgbGV0IGxhcmdlc3RFbGVtZW50ID0gZG9jdW1lbnQuYm9keTsgLy8gRGVmYXVsdCB0byB0aGUgYm9keVxyXG4gIGxldCBsYXJnZXN0QXJlYSA9IDA7XHJcblxyXG4gIGxldCBtYWluQ29udGFpbmVyRWxlbWVudElkID0gJ3ZpZXdwb3J0JztcclxuXHJcbiAgLy8gV2UgdXNlIGNlcnRhaW4gcGFnZSBzcGVjaWZpYyBydWxlcyB0byBvdmVycmlkZVxyXG4gIC8vICB0aGUgXCJndWVzc1wiIGNvZGUgYmVsb3cgZm9yIHBhZ2VzIHdlIGtub3cgYWJvdXQuXHJcbiAgLy8gQWRkaXRpb25hbCBjaGVjayBmb3IgYW4gZWxlbWVudCB3aXRoIHRoZSBzcGVjaWZpY1xyXG4gIC8vICBJRCBvZiBcInZpZXdwb3J0XCIuXHJcbiAgbGV0IG1haW5Db250YWluZXJFbGVtZW50ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQobWFpbkNvbnRhaW5lckVsZW1lbnRJZCk7XHJcblxyXG4gIGlmICghbWFpbkNvbnRhaW5lckVsZW1lbnQpIHtcclxuICAgIGNvbnNvbGUuaW5mbyhgJHtlcnJQcmVmaXh9VW5hYmxlIHRvIGZpbmQgYSBESVYgd2l0aCBlbGVtZW50IElEOiAke21haW5Db250YWluZXJFbGVtZW50SWR9YCk7XHJcblxyXG4gICAgbWFpbkNvbnRhaW5lckVsZW1lbnRJZCA9ICdjb250ZW50JztcclxuICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKG1haW5Db250YWluZXJFbGVtZW50SWQpO1xyXG4gIH1cclxuXHJcbiAgaWYgKG1haW5Db250YWluZXJFbGVtZW50KSB7XHJcbiAgICBjb25zb2xlLmluZm8oYCR7ZXJyUHJlZml4fVN1Y2Nlc3NmdWxseSBsb2NhdGVkIG1haW4gY29udGFpbmVyIGVsZW1lbnQgdXNpbmcgZWxlbWVudCBJRDogJHttYWluQ29udGFpbmVyRWxlbWVudElkfWApO1xyXG5cclxuICAgIGNvbnN0IHJlY3QgPSBnZXRCb3VuZGluZ0NsaWVudFJlY3RFeHRlbmRlZChtYWluQ29udGFpbmVyRWxlbWVudCk7XHJcbiAgICBjb25zdCB2aWV3cG9ydEFyZWEgPSByZWN0LndpZHRoICogcmVjdC5oZWlnaHQ7XHJcbiAgICBpZiAodmlld3BvcnRBcmVhID4gbGFyZ2VzdEFyZWEpIHtcclxuICAgICAgbGFyZ2VzdEVsZW1lbnQgPSBtYWluQ29udGFpbmVyRWxlbWVudDtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gbGFyZ2VzdEVsZW1lbnQ7XHJcbiAgfVxyXG5cclxuICB0YWdzVG9Db25zaWRlci5mb3JFYWNoKHRhZyA9PiB7XHJcbiAgICBjb25zdCBlbGVtZW50cyA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKHRhZyk7XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGVsZW1lbnRzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgIGNvbnN0IGVsID0gZWxlbWVudHNbaV07XHJcbiAgICAgIGNvbnN0IHJlY3QgPSBnZXRCb3VuZGluZ0NsaWVudFJlY3RFeHRlbmRlZChlbCk7XHJcbiAgICAgIGNvbnN0IGFyZWEgPSByZWN0LndpZHRoICogcmVjdC5oZWlnaHQ7XHJcblxyXG4gICAgICBpZiAoYXJlYSA+IGxhcmdlc3RBcmVhICYmICFpc0xpa2VseU5vbkNvbnRlbnQoZWwpKSB7XHJcbiAgICAgICAgbGFyZ2VzdEFyZWEgPSBhcmVhO1xyXG4gICAgICAgIGxhcmdlc3RFbGVtZW50ID0gZWw7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9KTtcclxuXHJcbiAgcmV0dXJuIGxhcmdlc3RFbGVtZW50O1xyXG59XHJcblxyXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLSBFTkQgIDogR1VFU1MgVEhFIE1BSU4gQ09OVEVOVCBBUkVBIC0tLS0tLS0tLS0tLVxyXG5cclxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0gQkVHSU46IFZBTElEQVRFIEFVRElPIEJMT0IgLS0tLS0tLS0tLS0tXHJcblxyXG4vKipcclxuICogVGhpcyBmdW5jdGlvbiByZXR1cm5zIFRSVUUgaWYgdGhlIGdpdmVuIGlucHV0XHJcbiAqICBwYXJhbWV0ZXIgaXMgYW4gYXVkaW8gYmxvYiwgRkFMU0UgaWYgbm90LlxyXG4gKlxyXG4gKiBAcGFyYW0ge0Jsb2J9IGF1ZGlvQmxvYiAtIFRoZSBhdWRpbyBibG9iIHRvXHJcbiAqICB2YWxpZGF0ZVxyXG4gKlxyXG4gKiBAcmV0dXJuIHtib29sZWFufVxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGlzVmFsaWRBdWRpb0Jsb2IoYXVkaW9CbG9iKSB7XHJcbiAgLy8gQmFzaWMgdmFsaWRhdGlvbiB0byBjaGVjayBpZiBpdCdzIGEgQmxvYiBhbmQgaGFzIGFuIGF1ZGlvIE1JTUUgdHlwZS5cclxuICBpZiAoIShhdWRpb0Jsb2IgaW5zdGFuY2VvZiBCbG9iKSlcclxuICAgIHJldHVybiBmYWxzZTtcclxuXHJcbiAgcmV0dXJuIGF1ZGlvQmxvYi50eXBlLnN0YXJ0c1dpdGgoJ2F1ZGlvLycpO1xyXG59XHJcblxyXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLSBFTkQgIDogVkFMSURBVEUgQVVESU8gQkxPQiAtLS0tLS0tLS0tLS1cclxuXHJcbi8qKlxyXG4gKiBUaGlzIGZ1bmN0aW9uIHRha2VzIGEgc3RyaW5nIGFuZCBjb25kaXRpb25zIGl0IHNvIHRoYXRcclxuICogIGl0IGNhbiBiZSB1c2VkIGRpcmVjdGx5IGFzIGEgSmF2YVNjcmlwdCBwcm9wZXJ0eSBuYW1lXHJcbiAqICB3aXRob3V0IGhhdmluZyB0byBlbmNsb3NlIGl0IGluIGRvdWJsZS1xdW90ZXMuICBUaGlzXHJcbiAqICBmdW5jdGlvbiBpcyB1c3VhbGx5IHVzZWQgYnkgYSBjb2RlIGdlbmVyYXRvci5cclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IHN0ciAtIFRoZSBzdHJpbmcgdG8gdHVybiBpbnRvIGFcclxuICogIHByb3BlcnR5IG5hbWUuXHJcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gYlVwcGVyY2FzZUl0IC0gSWYgVFJVRSB0aGVcclxuICogIHJldHVybmVkIHN0cmluZyB3aWxsIGJlIHVwcGVyY2FzZWQsIG90aGVyd2lzZSxcclxuICogIGl0IHdvbid0IGJlLlxyXG4gKlxyXG4gKiBAcmV0dXJuIHtTdHJpbmd9XHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gc3RyaW5nVG9PYmplY3RQcm9wZXJ0eU5hbWUoc3RyLCBiVXBwZXJjYXNlSXQgPSB0cnVlKSB7XHJcbiAgLy8gVHJpbSB0aGUgc3RyaW5nXHJcbiAgbGV0IHJlc3VsdCA9IHN0ci50cmltKCk7XHJcblxyXG4gIC8vIFJlcGxhY2Ugc3BhY2VzLCBkYXNoZXMsIGFuZCBwZXJpb2RzIHdpdGggdW5kZXJzY29yZXNcclxuICByZXN1bHQgPSByZXN1bHQucmVwbGFjZSgvWyAtLl0vZywgJ18nKTtcclxuXHJcbiAgLy8gUmVtb3ZlIGludmFsaWQgY2hhcmFjdGVyc1xyXG4gIC8vIEEgdmFsaWQgSmF2YVNjcmlwdCBwcm9wZXJ0eSBuYW1lIGNhbiBzdGFydCB3aXRoICQsIF8sIG9yIGFueSBjaGFyYWN0ZXIgaW4gdGhlIFVuaWNvZGUgY2F0ZWdvcmllcyDigJxVcHBlcmNhc2UgbGV0dGVyIChMdSnigJ0sIOKAnExvd2VyY2FzZSBsZXR0ZXIgKExsKeKAnSwg4oCcVGl0bGVjYXNlIGxldHRlciAoTHQp4oCdLCDigJxNb2RpZmllciBsZXR0ZXIgKExtKeKAnSwg4oCcT3RoZXIgbGV0dGVyIChMbynigJ0sIG9yIOKAnExldHRlciBudW1iZXIgKE5sKeKAnS5cclxuICAvLyBBbmQgYWZ0ZXIgdGhlIGZpcnN0IGNoYXJhY3RlciwgaXQgY2FuIGFsc28gaW5jbHVkZSBkaWdpdHMgKDAtOSksIGluIGFkZGl0aW9uIHRvIHRoZSBjaGFyYWN0ZXJzIG1lbnRpb25lZCBhYm92ZS5cclxuICAvLyBGb3Igc2ltcGxpY2l0eSwgdGhpcyByZWdleCBrZWVwcyBsZXR0ZXJzLCBkaWdpdHMsICQsIGFuZCBfLCB3aGljaCBjb3ZlcnMgbW9zdCBjb21tb24gdXNlIGNhc2VzIGFuZCBhdm9pZHMgY29tcGxleGl0aWVzIHJlbGF0ZWQgdG8gVW5pY29kZSBjYXRlZ29yaWVzLlxyXG4gIHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKC9bXmEtekEtWjAtOV8kXS9nLCAnJyk7XHJcblxyXG4gIC8vIFVwcGVyY2FzZSB0aGUgcmVzdWx0IGlmIGJVcHBlcmNhc2VJdCBpcyB0cnVlXHJcbiAgaWYgKGJVcHBlcmNhc2VJdCkge1xyXG4gICAgcmVzdWx0ID0gcmVzdWx0LnRvVXBwZXJDYXNlKCk7XHJcbiAgfVxyXG5cclxuICByZXR1cm4gcmVzdWx0O1xyXG59XHJcblxyXG4vKipcclxuICogVmFsaWRhdGUgYSB2YWx1ZSBhcyBiZWxvbmdpbmcgdG8gYW4gZW51bWVyYXRlZCBjb25zdGFudFxyXG4gKiAgb2JqZWN0LlxyXG4gKlxyXG4gKiBAcGFyYW0geyp9IHRoZVZhbHVlIC0gQSB2YWx1ZSB0aGF0IHNob3VsZCBtYXRjaCBvbmUgb2YgdGhlXHJcbiAqICBvYmplY3QgdmFsdWVzIGluIHRoZSBlbnVtZXJhdGVkIGNvbnN0YW50IG9iamVjdC5cclxuICogQHBhcmFtIHtPYmplY3R9IHRoZUVudW1lcmF0ZWRDb25zdGFudE9iaiAtIFRoZSBvYmplY3QgdGhhdFxyXG4gKiAgY29udGFpbnMgdGhlIGVudW1lcmF0ZWQgdmFsdWVzLlxyXG4gKlxyXG4gKiBAcmV0dXJuIHtib29sZWFufSAtIFJldHVybnMgVFJVRSBpZiB0aGUgZ2l2ZW4gdmFsdWUgbWF0Y2hlc1xyXG4gKiAgZXhhY3RseSBvbmUgb2YgdGhlIHZhbHVlcyBpbiB0aGUgZW51bWVyYXRlZCBjb25zdGFudCBvYmplY3QsXHJcbiAqICBGQUxTRSBpZiBub3QuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gaXNWYWxpZEVudW1WYWx1ZSh0aGVWYWx1ZSwgdGhlRW51bWVyYXRlZENvbnN0YW50T2JqKSB7XHJcbiAgY29uc3QgZXJyUHJlZml4ID0gYCh2YWxpZGF0ZUVudW1WYWx1ZSkgYDtcclxuXHJcbiAgaWYgKGlzRW1wdHlTYWZlU3RyaW5nKHRoZVZhbHVlKSlcclxuICAgIHRocm93IG5ldyBFcnJvcihgJHtlcnJQcmVmaXh9VGhlIHRoZVZhbHVlIHBhcmFtZXRlciBpcyBlbXB0eSBvciBpbnZhbGlkLmApO1xyXG4gIGlmICh0eXBlb2YgdGhlRW51bWVyYXRlZENvbnN0YW50T2JqICE9PSAnb2JqZWN0JyB8fCB0aGVFbnVtZXJhdGVkQ29uc3RhbnRPYmogPT09IG51bGwpXHJcbiAgXHR0aHJvdyBuZXcgRXJyb3IoYCR7ZXJyUHJlZml4fVRoZSB0aGVFbnVtZXJhdGVkQ29uc3RhbnQgcGFyYW1ldGVyIGlzIG5vdCBhIHZhbGlkIG9iamVjdC5gKTtcclxuXHJcbiAgY29uc3QgdmFsaWRWYWx1ZXM9IE9iamVjdC52YWx1ZXModGhlRW51bWVyYXRlZENvbnN0YW50T2JqKTtcclxuICByZXR1cm4gdmFsaWRWYWx1ZXMuaW5jbHVkZXModGhlVmFsdWUpO1xyXG59XHJcblxyXG4vKipcclxuICogUmVjb25zdHJ1Y3RzIGFuIG9iamVjdCBleGNsdWRpbmcgYW55IHByb3BlcnRpZXMgdGhhdCBoYXZlIGB1bmRlZmluZWRgXHJcbiAqIHZhbHVlcy4gSXQgcGVyZm9ybXMgYSBkZWVwIGNvcHkgb2YgdGhlIG9iamVjdCwgZW5zdXJpbmcgbm8gcmVmZXJlbmNlc1xyXG4gKiB0byB0aGUgb3JpZ2luYWwgb2JqZWN0IGFyZSBrZXB0LlxyXG4gKlxyXG4gKiBAcGFyYW0ge09iamVjdH0gdGhlT2JqIFRoZSBvYmplY3QgdG8gYmUgcmVjb25zdHJ1Y3RlZCB3aXRob3V0IGB1bmRlZmluZWRgXHJcbiAqICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWVzLlxyXG4gKlxyXG4gKiBAcmV0dXJucyB7T2JqZWN0fSBBIG5ldyBvYmplY3Qgd2l0aCB0aGUgc2FtZSBzdHJ1Y3R1cmUgYXMgYHRoZU9iamAsIGJ1dFxyXG4gKiAgICAgICAgICAgICAgICAgICB3aXRob3V0IGFueSBgdW5kZWZpbmVkYCB2YWx1ZXMuXHJcbiAqXHJcbiAqIEB0aHJvd3Mge1R5cGVFcnJvcn0gSWYgYHRoZU9iamAgaXMgbm90IGFuIG9iamVjdCBvciBpcyBudWxsLlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHJlY29uc3RydWN0T2JqZWN0Tm9VbmRlZmluZWRzKHRoZU9iaikge1xyXG4gIGNvbnN0IGVyclByZWZpeCA9ICcocmVjb25zdHJ1Y3RPYmplY3ROb1VuZGVmaW5lZHMpICc7XHJcblxyXG4gIGlmICh0eXBlb2YgdGhlT2JqICE9PSAnb2JqZWN0JyB8fCB0aGVPYmogPT09IG51bGwpIHtcclxuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoYCR7ZXJyUHJlZml4fUlucHV0IG11c3QgYmUgYSBub24tbnVsbCBvYmplY3QuYCk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBBIGhlbHBlciBmdW5jdGlvbiB0byByZWN1cnNpdmVseSBjbG9uZSBhbiBvYmplY3QgZXhjbHVkaW5nIHByb3BlcnRpZXNcclxuICAgKiB3aXRoIGB1bmRlZmluZWRgIHZhbHVlcy5cclxuICAgKlxyXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvYmogVGhlIG9iamVjdCB0byBjbG9uZS5cclxuICAgKlxyXG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSBjbG9uZWQgb2JqZWN0IHdpdGhvdXQgYHVuZGVmaW5lZGAgdmFsdWVzLlxyXG4gICAqL1xyXG4gIGZ1bmN0aW9uIGNsb25lT2JqZWN0RXhjbHVkaW5nVW5kZWZpbmVkKG9iaikge1xyXG4gICAgcmV0dXJuIE9iamVjdC5lbnRyaWVzKG9iaikucmVkdWNlKChhY2MsIFtrZXksIHZhbHVlXSkgPT4ge1xyXG4gICAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCkge1xyXG4gICAgICAgIGFjY1trZXldID0gY2xvbmVPYmplY3RFeGNsdWRpbmdVbmRlZmluZWQodmFsdWUpO1xyXG4gICAgICB9IGVsc2UgaWYgKHZhbHVlICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICBhY2Nba2V5XSA9IHZhbHVlO1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBhY2M7XHJcbiAgICB9LCBBcnJheS5pc0FycmF5KG9iaikgPyBbXSA6IHt9KTtcclxuICB9XHJcblxyXG4gIHJldHVybiBjbG9uZU9iamVjdEV4Y2x1ZGluZ1VuZGVmaW5lZCh0aGVPYmopO1xyXG59XHJcblxyXG4vKipcclxuICogQ291bnRzIHdvcmRzIGluIGEgZ2l2ZW4gdGV4dCwgdGFraW5nIGludG9cclxuICogIGFjY291bnQgdmFyaW91cyBwdW5jdHVhdGlvbiBhbmQgZW5zdXJpbmdcclxuICogIHdvcmRzIHNlcGFyYXRlZCBieSBwdW5jdHVhdGlvbiBhcmUgY291bnRlZCBjb3JyZWN0bHkuXHJcbiAqICBQdW5jdHVhdGlvbiBpcyByZXBsYWNlZCBieSBhIHNpbmdsZSBzcGFjZSB0byBlbnN1cmVcclxuICogIHByb3BlciB3b3JkIHNlcGFyYXRpb24uXHJcbiAqXHJcbiAqIEBwYXJhbSB7c3RyaW5nfSB0ZXh0IFRoZSB0ZXh0IHRvIGNvdW50IHdvcmRzIGluLlxyXG4gKlxyXG4gKiBAcmV0dXJuIHtudW1iZXJ9IFRoZSB3b3JkIGNvdW50LlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGNvdW50V29yZHModGV4dCkge1xyXG4gIC8vIFJlcGxhY2UgcHVuY3R1YXRpb24gd2l0aCBhIHNpbmdsZSBzcGFjZSB0byBlbnN1cmUgbm8gd29yZHMgYXJlIGNvbmNhdGVuYXRlZC5cclxuICBjb25zdCBzYW5pdGl6ZWRUZXh0ID0gdGV4dC5yZXBsYWNlKC9bXFwuLC1cXC8jISQlXFxeJlxcKjs6e309XFwtX2B+KClcXFtcXF1cXFwiXFwnXFw/XS9nLCBcIiBcIik7XHJcblxyXG4gIC8vIFNwbGl0IHRoZSB0ZXh0IGludG8gd29yZHMgdXNpbmcgd2hpdGVzcGFjZSBkZWxpbWl0ZXJzOyBmaWx0ZXIoQm9vbGVhbikgcmVtb3ZlcyBhbnkgZW1wdHkgc3RyaW5ncyBmcm9tIHRoZSByZXN1bHRpbmcgYXJyYXkuXHJcbiAgY29uc3Qgd29yZHMgPSBzYW5pdGl6ZWRUZXh0LnNwbGl0KC9cXHMrLykuZmlsdGVyKEJvb2xlYW4pO1xyXG5cclxuICByZXR1cm4gd29yZHMubGVuZ3RoO1xyXG59XHJcblxyXG4vKipcclxuICogQ29tcGFyZXMgdHdvIHN0cmluZ3MgY2hhcmFjdGVyIGJ5IGNoYXJhY3RlciBhbmQgcHJpbnRzIHRoZVxyXG4gKiBjb3JyZXNwb25kaW5nIGNoYXJhY3RlcnMgb3JkaW5hbGx5IGJldHdlZW4gZWFjaCBzdHJpbmcgYWxvbmdcclxuICogd2l0aCB0aGVpciBBU0NJSSBjb2Rlcy5cclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IHN0cjEgLSBUaGUgZmlyc3Qgc3RyaW5nIHRvIGNvbXBhcmUuXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBzdHIyIC0gVGhlIHNlY29uZCBzdHJpbmcgdG8gY29tcGFyZS5cclxuICpcclxuICogQHRocm93cyB7RXJyb3J9IC0gSWYgZWl0aGVyIG9mIHRoZSBpbnB1dCBwYXJhbWV0ZXJzIGlzIG5vdCBhIHN0cmluZy5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBjb21wYXJlU3RyaW5nc0NoYXJCeUNoYXIoc3RyMSwgc3RyMikge1xyXG4gIGNvbnN0IGVyclByZWZpeCA9ICcoY29tcGFyZVN0cmluZ3NDaGFyQnlDaGFyKSAnO1xyXG5cclxuICAvLyBFcnJvciBjaGVja3NcclxuICBpZiAodHlwZW9mIHN0cjEgIT09ICdzdHJpbmcnKSB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYCR7ZXJyUHJlZml4fVRoZSBmaXJzdCBpbnB1dCBwYXJhbWV0ZXIgaXMgbm90IGEgc3RyaW5nLmApO1xyXG4gIH1cclxuICBpZiAodHlwZW9mIHN0cjIgIT09ICdzdHJpbmcnKSB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoYCR7ZXJyUHJlZml4fVRoZSBzZWNvbmQgaW5wdXQgcGFyYW1ldGVyIGlzIG5vdCBhIHN0cmluZy5gKTtcclxuICB9XHJcblxyXG4gIGNvbnN0IG1heExlbmd0aCA9IE1hdGgubWF4KHN0cjEubGVuZ3RoLCBzdHIyLmxlbmd0aCk7XHJcblxyXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgbWF4TGVuZ3RoOyBpKyspIHtcclxuICAgIGNvbnN0IGNoYXIxID0gaSA8IHN0cjEubGVuZ3RoID8gc3RyMVtpXSA6ICcobm9uZSknO1xyXG4gICAgY29uc3QgY2hhcjIgPSBpIDwgc3RyMi5sZW5ndGggPyBzdHIyW2ldIDogJyhub25lKSc7XHJcbiAgICBjb25zdCBhc2NpaTEgPSBjaGFyMSAhPT0gJyhub25lKScgPyBjaGFyMS5jaGFyQ29kZUF0KDApIDogJyhub25lKSc7XHJcbiAgICBjb25zdCBhc2NpaTIgPSBjaGFyMiAhPT0gJyhub25lKScgPyBjaGFyMi5jaGFyQ29kZUF0KDApIDogJyhub25lKSc7XHJcblxyXG4gICAgY29uc29sZS5sb2coYFske2l9XSAoJHtjaGFyMX0sICR7YXNjaWkxfSksICgke2NoYXIyfSwgJHthc2NpaTJ9KWApO1xyXG4gIH1cclxuXHJcbiAgY29uc29sZS5sb2coYHN0cjE6ICR7c3RyMX1gKTtcclxuICBjb25zb2xlLmxvZyhgc3RyMjogJHtzdHIyfWApO1xyXG59XHJcblxyXG4vKipcclxuICogRXh0cmFjdHMgdGhlIFlvdVR1YmUgdmlkZW8gSUQgZnJvbSBhIGdpdmVuIFVSTC5cclxuICogVGhlIFVSTCBpcyBleHBlY3RlZCB0byBiZSBpbiB0aGUgZm9ybWF0XHJcbiAqIFwiaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1cIiBhbmQgdGhlIGZ1bmN0aW9uXHJcbiAqIGRpc2NhcmRzIGFueSBvdGhlciBVUkwgYXJndW1lbnRzLiBJdCB0aHJvd3MgYW4gZXJyb3JcclxuICogaWYgdGhlIHZpZGVvIElEIGlzIGVtcHR5IG9yIGlmIHRoZSBpbnB1dCBpcyBub3QgYSB2YWxpZFxyXG4gKiBZb3VUdWJlIFVSTC5cclxuICpcclxuICogQHBhcmFtIHtTdHJpbmd9IHVybCAtIFRoZSBZb3VUdWJlIFVSTCBmcm9tIHdoaWNoIHRvIGV4dHJhY3RcclxuICogICAgICAgICAgICAgICAgICAgICAgIHRoZSB2aWRlbyBJRC5cclxuICpcclxuICogQHJldHVybiB7U3RyaW5nfSBUaGUgdHJpbW1lZCBZb3VUdWJlIHZpZGVvIElELlxyXG4gKlxyXG4gKiBAdGhyb3dzIHtFcnJvcn0gSWYgdGhlIGlucHV0IFVSTCBpcyBpbnZhbGlkLCBkb2VzIG5vdCBjb250YWluXHJcbiAqICAgICAgICAgICAgICAgICBhIHZpZGVvIElELCBvciBpZiB0aGUgdmlkZW8gSUQgaXMgZW1wdHkuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZXh0cmFjdFlvdVR1YmVWaWRlb0lkRnJvbVVybCh1cmwpIHtcclxuICBjb25zdCBlcnJQcmVmaXggPSAnKGV4dHJhY3RZb3VUdWJlVmlkZW9JZEZyb21VcmwpICc7XHJcblxyXG4gIC8vIFZhbGlkYXRlIHRoZSBpbnB1dCBVUkxcclxuICBpZiAodHlwZW9mIHVybCAhPT0gJ3N0cmluZycgfHwgdXJsLnRyaW0oKSA9PT0gJycpIHtcclxuICAgIHRocm93IG5ldyBFcnJvcihcclxuICAgICAgYCR7ZXJyUHJlZml4fVRoZSBwcm92aWRlZCBVUkwgbXVzdCBiZSBhIG5vbi1lbXB0eSBzdHJpbmcuYFxyXG4gICAgKTtcclxuICB9XHJcblxyXG4gIHRyeSB7XHJcbiAgICBjb25zdCB1cmxPYmogPSBuZXcgVVJMKHVybCk7XHJcbiAgICBpZiAodXJsT2JqLmhvc3RuYW1lICE9PSAnd3d3LnlvdXR1YmUuY29tJyAmJlxyXG4gICAgICB1cmxPYmouaG9zdG5hbWUgIT09ICd5b3V0dWJlLmNvbScpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKFxyXG4gICAgICAgIGAke2VyclByZWZpeH1UaGUgVVJMIG11c3QgYmUgYSB2YWxpZCBZb3VUdWJlIFVSTC5gXHJcbiAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgdmlkZW9JZCA9IHVybE9iai5zZWFyY2hQYXJhbXMuZ2V0KCd2Jyk7XHJcbiAgICBpZiAoIXZpZGVvSWQgfHwgdmlkZW9JZC50cmltKCkgPT09ICcnKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcihcclxuICAgICAgICBgJHtlcnJQcmVmaXh9VGhlIHZpZGVvIElEIGlzIG1pc3Npbmcgb3IgZW1wdHkuYFxyXG4gICAgICApO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB2aWRlb0lkLnRyaW0oKTtcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgaWYgKGVycm9yIGluc3RhbmNlb2YgVHlwZUVycm9yKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcihcclxuICAgICAgICBgJHtlcnJQcmVmaXh9SW52YWxpZCBVUkwgZm9ybWF0LmBcclxuICAgICAgKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHRocm93IGVycm9yO1xyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIEBmaWxlb3ZlcnZpZXcgUHJvdmlkZXMgYSBmdW5jdGlvbiB0byBnZXQgdGhlIGN1cnJlbnQgZGF0ZVxyXG4gKiBhbmQgdGltZSBpbiBhIGh1bWFuLXJlYWRhYmxlIGZvcm1hdCB3aXRoIGFsbCB0aW1lXHJcbiAqIGNvbXBvbmVudHMgZG93biB0byBtaWxsaXNlY29uZHMuXHJcbiAqL1xyXG5cclxuLyoqXHJcbiAqIEdldHMgdGhlIGN1cnJlbnQgZGF0ZSBhbmQgdGltZSBpbiBhIGh1bWFuLXJlYWRhYmxlIGZvcm1hdCxcclxuICogaW5jbHVkaW5nIGFsbCB0aW1lIGNvbXBvbmVudHMgZG93biB0byBtaWxsaXNlY29uZHMuXHJcbiAqXHJcbiAqIEB0aHJvd3Mge0Vycm9yfSBJZiBhbiB1bmV4cGVjdGVkIGVycm9yIG9jY3VycyBkdXJpbmdcclxuICogZm9ybWF0dGluZy5cclxuICpcclxuICogQHJldHVybnMge1N0cmluZ30gVGhlIGN1cnJlbnQgZGF0ZSBhbmQgdGltZSBpbiB0aGUgZm9ybWF0XHJcbiAqICdNTS9ERC9ZWVlZLCBISDpNTTpTUy5tbW0nLlxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGdldEN1cnJlbnRUaW1lRXh0KCkge1xyXG4gIGNvbnN0IGVyclByZWZpeCA9ICcoZ2V0Q3VycmVudFRpbWVFeHQpICc7XHJcblxyXG4gIHRyeSB7XHJcbiAgICByZXR1cm4gbmV3IERhdGUoKS50b0xvY2FsZVN0cmluZygnZW4tVVMnLCB7XHJcbiAgICAgIHllYXI6ICdudW1lcmljJyxcclxuICAgICAgbW9udGg6ICcyLWRpZ2l0JyxcclxuICAgICAgZGF5OiAnMi1kaWdpdCcsXHJcbiAgICAgIGhvdXI6ICcyLWRpZ2l0JyxcclxuICAgICAgbWludXRlOiAnMi1kaWdpdCcsXHJcbiAgICAgIHNlY29uZDogJzItZGlnaXQnLFxyXG4gICAgICBmcmFjdGlvbmFsU2Vjb25kRGlnaXRzOiAzLFxyXG4gICAgICBob3VyMTI6IGZhbHNlXHJcbiAgICB9KTtcclxuICB9IGNhdGNoIChlcnIpIHtcclxuICAgIHRocm93IG5ldyBFcnJvcihgJHtlcnJQcmVmaXh9QW4gZXJyb3Igb2NjdXJyZWQgd2hpbGUgZm9ybWF0dGluZyB0aGUgZGF0ZTogJHtlcnIubWVzc2FnZX1gKTtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBSZXBsYWNlbWVudCBmb3IgdXVpZFY0KCkgdGhhdCBnZW5lcmF0ZXMgYSByb2J1c3QgdW5pcXVlIElELlxyXG4gKlxyXG4gKiBAcmV0dXJuIHsqfVxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGdlbmVyYXRlVW5pcXVlSWQgPSAoKSA9PiB7XHJcbiAgY29uc3QgYXJyYXkgPSBuZXcgVWludDhBcnJheSgxNik7XHJcbiAgY3J5cHRvLmdldFJhbmRvbVZhbHVlcyhhcnJheSk7XHJcblxyXG4gIC8vIEZvcm1hdCBhcyBhIFVVSUQgKHZlcnNpb24gNCBjb21wbGlhbnQpXHJcbiAgcmV0dXJuIGAke2FycmF5WzBdLnRvU3RyaW5nKDE2KS5wYWRTdGFydCgyLCAnMCcpfSR7YXJyYXlbMV0udG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDIsICcwJyl9YCArXHJcbiAgICAgIGAtJHthcnJheVsyXS50b1N0cmluZygxNikucGFkU3RhcnQoMiwgJzAnKX0ke2FycmF5WzNdLnRvU3RyaW5nKDE2KS5wYWRTdGFydCgyLCAnMCcpfWAgK1xyXG4gICAgICBgLSR7KGFycmF5WzRdICYgMHgwZiB8IDB4NDApLnRvU3RyaW5nKDE2KS5wYWRTdGFydCgyLCAnMCcpfSR7YXJyYXlbNV0udG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDIsICcwJyl9YCArXHJcbiAgICAgIGAtJHsoYXJyYXlbNl0gJiAweDNmIHwgMHg4MCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDIsICcwJyl9JHthcnJheVs3XS50b1N0cmluZygxNikucGFkU3RhcnQoMiwgJzAnKX1gICtcclxuICAgICAgYC0ke2FycmF5WzhdLnRvU3RyaW5nKDE2KS5wYWRTdGFydCgyLCAnMCcpfSR7YXJyYXlbOV0udG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDIsICcwJyl9YCArXHJcbiAgICAgIGAke2FycmF5WzEwXS50b1N0cmluZygxNikucGFkU3RhcnQoMiwgJzAnKX0ke2FycmF5WzExXS50b1N0cmluZygxNikucGFkU3RhcnQoMiwgJzAnKX1gICtcclxuICAgICAgYCR7YXJyYXlbMTJdLnRvU3RyaW5nKDE2KS5wYWRTdGFydCgyLCAnMCcpfSR7YXJyYXlbMTNdLnRvU3RyaW5nKDE2KS5wYWRTdGFydCgyLCAnMCcpfWAgK1xyXG4gICAgICBgJHthcnJheVsxNF0udG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDIsICcwJyl9JHthcnJheVsxNV0udG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDIsICcwJyl9YDtcclxufTtcclxuXHJcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tIEJFR0lOOiBQUk9NUFQgRklMRSBNQU5JUFVMQVRJT04gUk9VVElORVMgLS0tLS0tLS0tLS0tXHJcblxyXG4vKipcclxuICogRXh0cmFjdHMgdGhlIGNvbnRlbnQgYmV0d2VlbiB0aGUgZmlyc3Qgb2NjdXJyZW5jZSBvZiBhbiBvcGVuaW5nIHNxdWFyZSBicmFja2V0IChgW2ApXHJcbiAqIGFuZCB0aGUgbGFzdCBvY2N1cnJlbmNlIG9mIGEgY2xvc2luZyBzcXVhcmUgYnJhY2tldCAoYF1gKSBpbiBhIGdpdmVuIHN0cmluZy5cclxuICpcclxuICogQHBhcmFtIHtzdHJpbmd9IHN0ciAtIFRoZSBpbnB1dCBzdHJpbmcgdG8gcHJvY2Vzcy4gTXVzdCBiZSBhIG5vbi1lbXB0eSBzdHJpbmcuXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd8bnVsbH0gLSBUaGUgY29udGVudCBiZXR3ZWVuIHRoZSBicmFja2V0cywgZXhjbHVkaW5nIHRoZSBicmFja2V0cyB0aGVtc2VsdmVzLlxyXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgUmV0dXJucyBgbnVsbGAgaWYgbm8gdmFsaWQgYnJhY2tldGVkIGNvbnRlbnQgaXMgZm91bmQuXHJcbiAqIEB0aHJvd3Mge0Vycm9yfSAtIFRocm93cyBhbiBlcnJvciBpZiB0aGUgaW5wdXQgaXMgbm90IGEgbm9uLWVtcHR5IHN0cmluZy5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBleHRyYWN0VG9wQnJhY2tldGVkQ29udGVudChzdHIpIHtcclxuICBpZiAodHlwZW9mIHN0ciAhPT0gJ3N0cmluZycgfHwgc3RyLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiSW5wdXQgbXVzdCBiZSBhIG5vbi1lbXB0eSBzdHJpbmdcIik7XHJcbiAgfVxyXG5cclxuICBsZXQgc3RhcnQgPSAtMTtcclxuICBmb3IgKGxldCBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xyXG4gICAgaWYgKHN0cltpXSA9PT0gJ1snKSB7XHJcbiAgICAgIHN0YXJ0ID0gaTtcclxuICAgICAgYnJlYWs7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBpZiAoc3RhcnQgPT09IC0xKSB7XHJcbiAgICByZXR1cm4gbnVsbDtcclxuICB9XHJcblxyXG4gIGxldCBlbmQgPSAtMTtcclxuICBmb3IgKGxldCBpID0gc3RyLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XHJcbiAgICBpZiAoc3RyW2ldID09PSAnXScpIHtcclxuICAgICAgZW5kID0gaTtcclxuICAgICAgYnJlYWs7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBpZiAoZW5kID09PSAtMSB8fCBlbmQgPD0gc3RhcnQpIHtcclxuICAgIHJldHVybiBudWxsO1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHN0ci5zbGljZShzdGFydCArIDEsIGVuZCk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBFeHRyYWN0cyBhbGwgdW5pcXVlIHZhcmlhYmxlIG5hbWVzIGZvdW5kIGluIGEgdGVtcGxhdGUgc3RyaW5nLlxyXG4gKiBWYXJpYWJsZSBuYW1lcyBhcmUgZXhwZWN0ZWQgdG8gYmUgaW4gdGhlIGZvcm1hdCAke3ZhcmlhYmxlTmFtZX0uXHJcbiAqXHJcbiAqIEBwYXJhbSB7c3RyaW5nfSBzdHIgLSBUaGUgdGVtcGxhdGUgc3RyaW5nIHRvIHNlYXJjaCBmb3IgdmFyaWFibGUgbmFtZXMuXHJcbiAqIEByZXR1cm5zIHtzdHJpbmdbXX0gLSBBbiBhcnJheSBvZiB1bmlxdWUgdmFyaWFibGUgbmFtZXMgKHN0cmluZ3MpIGZvdW5kLlxyXG4gKiBAdGhyb3dzIHtFcnJvcn0gLSBUaHJvd3MgYW4gZXJyb3IgaWYgdGhlIGlucHV0IGlzIG5vdCBhIG5vbi1lbXB0eSBzdHJpbmcuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZmluZEFsbFRlbXBsYXRlVmFyTmFtZXMoc3RyKSB7XHJcbiAgaWYgKHR5cGVvZiBzdHIgIT09ICdzdHJpbmcnIHx8IHN0ci5sZW5ndGggPT09IDApIHtcclxuICAgIHRocm93IG5ldyBFcnJvcihcIlRoZSBpbnB1dCBtdXN0IGJlIGEgbm9uLWVtcHR5IHN0cmluZy5cIik7XHJcbiAgfVxyXG5cclxuICBjb25zdCB0ZW1wbGF0ZVZhcmlhYmxlUGF0dGVybiA9IC9cXCR7KC4qPyl9L2c7XHJcbiAgY29uc3QgdmFyaWFibGVOYW1lcyA9IG5ldyBTZXQoKTtcclxuXHJcbiAgbGV0IG1hdGNoO1xyXG4gIHdoaWxlICgobWF0Y2ggPSB0ZW1wbGF0ZVZhcmlhYmxlUGF0dGVybi5leGVjKHN0cikpICE9PSBudWxsKSB7XHJcbiAgICBjb25zdCB2YXJpYWJsZU5hbWUgPSBtYXRjaFsxXS50cmltKCk7XHJcbiAgICBpZiAodmFyaWFibGVOYW1lKSB7XHJcbiAgICAgIHZhcmlhYmxlTmFtZXMuYWRkKHZhcmlhYmxlTmFtZSk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICByZXR1cm4gQXJyYXkuZnJvbSh2YXJpYWJsZU5hbWVzKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFJlcGxhY2VzIGFsbCB0ZW1wbGF0ZSB2YXJpYWJsZSByZWZlcmVuY2VzIGluIGEgZ2l2ZW4gc3RyaW5nIHdpdGggdGhlIHZhbHVlc1xyXG4gKiBwcm92aWRlZCBieSB0aGUgYGZ1bmNEb1RoZUV2YWxgIGNhbGxiYWNrLCB3aGljaCBldmFsdWF0ZXMgZWFjaCB2YXJpYWJsZSBuYW1lLlxyXG4gKlxyXG4gKiBAcGFyYW0ge3N0cmluZ30gbGxtUHJvbXB0VG9GaXhVcCAtIFRoZSB0ZW1wbGF0ZSBzdHJpbmcgd2l0aCB2YXJpYWJsZXMgaW4gdGhlIGZvcm1hdCAke3ZhcmlhYmxlTmFtZX0uXHJcbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGZ1bmNEb1RoZUV2YWwgLSBBIGNhbGxiYWNrIGZ1bmN0aW9uIHRoYXQgdGFrZXMgYSB2YXJpYWJsZSBuYW1lIGFuZCByZXR1cm5zIGl0cyB2YWx1ZS5cclxuICogQHJldHVybnMge3N0cmluZ30gLSBUaGUgZnVsbHkgc3Vic3RpdHV0ZWQgc3RyaW5nIHdpdGggYWxsIHRlbXBsYXRlIHZhcmlhYmxlcyByZXBsYWNlZCBieSB0aGVpciB2YWx1ZXMuXHJcbiAqIEB0aHJvd3Mge0Vycm9yfSAtIFRocm93cyBhbiBlcnJvciBpZiBhbnkgcmVmZXJlbmNlZCB2YXJpYWJsZSBpcyBtaXNzaW5nIGluIGBmdW5jRG9UaGVFdmFsYC5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBzdWJzdGl0dXRlV2l0aG91dEV2YWwobGxtUHJvbXB0VG9GaXhVcCwgZnVuY0RvVGhlRXZhbCkge1xyXG4gIGlmICh0eXBlb2YgbGxtUHJvbXB0VG9GaXhVcCAhPT0gJ3N0cmluZycgfHwgbGxtUHJvbXB0VG9GaXhVcC5sZW5ndGggPT09IDApIHtcclxuICAgIHRocm93IG5ldyBFcnJvcihcIlRoZSBpbnB1dCBwcm9tcHQgbXVzdCBiZSBhIG5vbi1lbXB0eSBzdHJpbmcuXCIpO1xyXG4gIH1cclxuICBpZiAodHlwZW9mIGZ1bmNEb1RoZUV2YWwgIT09ICdmdW5jdGlvbicpIHtcclxuICAgIHRocm93IG5ldyBFcnJvcihcImZ1bmNEb1RoZUV2YWwgbXVzdCBiZSBhIGZ1bmN0aW9uLlwiKTtcclxuICB9XHJcblxyXG4gIGNvbnN0IHZhcmlhYmxlTmFtZXMgPSBmaW5kQWxsVGVtcGxhdGVWYXJOYW1lcyhsbG1Qcm9tcHRUb0ZpeFVwKTtcclxuXHJcbiAgY29uc3QgdmFyaWFibGVzUmVjb3JkID0ge307XHJcbiAgdmFyaWFibGVOYW1lcy5mb3JFYWNoKHZhcmlhYmxlTmFtZSA9PiB7XHJcbiAgICBjb25zdCB2YWx1ZSA9IGZ1bmNEb1RoZUV2YWwodmFyaWFibGVOYW1lKTtcclxuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICd1bmRlZmluZWQnKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcihgVmFyaWFibGUgJyR7dmFyaWFibGVOYW1lfScgaXMgdW5kZWZpbmVkLmApO1xyXG4gICAgfVxyXG4gICAgdmFyaWFibGVzUmVjb3JkW3ZhcmlhYmxlTmFtZV0gPSB2YWx1ZTtcclxuICB9KTtcclxuXHJcbiAgcmV0dXJuIGxsbVByb21wdFRvRml4VXAucmVwbGFjZSgvXFwkeyguKj8pfS9nLCAoXywgdmFyaWFibGVOYW1lKSA9PiB7XHJcbiAgICByZXR1cm4gU3RyaW5nKHZhcmlhYmxlc1JlY29yZFt2YXJpYWJsZU5hbWVdKTtcclxuICB9KTtcclxufVxyXG5cclxuLyoqXHJcbiAqIEFwcGVuZHMgYW4gZW5kLW9mLXNlbnRlbmNlIChFT1MpIGNoYXJhY3RlciAoZS5nLiwgXCIuXCIsIFwiIVwiLCBcIj9cIikgdG8gYSBzdHJpbmcgaWYgbm90IGFscmVhZHkgcHJlc2VudC5cclxuICogVmFsaWRhdGVzIHRoYXQgdGhlIGlucHV0IHN0cmluZyBpcyBub24tZW1wdHkgYWZ0ZXIgdHJpbW1pbmcuXHJcbiAqXHJcbiAqIEBwYXJhbSB7c3RyaW5nfSBzdHIgLSBUaGUgaW5wdXQgc3RyaW5nIHRvIHZhbGlkYXRlIGFuZCBwb3RlbnRpYWxseSBtb2RpZnkuXHJcbiAqIEByZXR1cm5zIHtzdHJpbmd9IC0gVGhlIGlucHV0IHN0cmluZyB3aXRoIGFuIEVPUyBjaGFyYWN0ZXIgYXBwZW5kZWQgaWYgbm90IGFscmVhZHkgcHJlc2VudC5cclxuICogQHRocm93cyB7RXJyb3J9IC0gVGhyb3dzIGFuIGVycm9yIGlmIHRoZSBpbnB1dCBzdHJpbmcgaXMgZW1wdHkgYWZ0ZXIgdHJpbW1pbmcuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gYXBwZW5kRW9zQ2hhcklmTm90UHJlc2VudChzdHIpIHtcclxuICBpZiAodHlwZW9mIHN0ciAhPT0gJ3N0cmluZycgfHwgc3RyLnRyaW0oKS5sZW5ndGggPT09IDApIHtcclxuICAgIHRocm93IG5ldyBFcnJvcihcIklucHV0IHN0cmluZyBjYW5ub3QgYmUgZW1wdHkgYWZ0ZXIgdHJpbW1pbmcuXCIpO1xyXG4gIH1cclxuXHJcbiAgY29uc3QgZW9zQ2hhcnMgPSBbJy4nLCAnIScsICc/J107XHJcbiAgcmV0dXJuIGVvc0NoYXJzLmluY2x1ZGVzKHN0ci50cmltKCkuc2xpY2UoLTEpKSA/IHN0ciA6IGAke3N0cn0uYDtcclxufVxyXG5cclxuXHJcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tIEVORCAgOiBQUk9NUFQgRklMRSBNQU5JUFVMQVRJT04gUk9VVElORVMgLS0tLS0tLS0tLS0tIiwiaW1wb3J0IHtpc0VtcHR5U2FmZVN0cmluZ30gZnJvbSBcIi4vbWlzYy5qc1wiO1xyXG5cclxuLyoqXHJcbiAqIFRoaXMgZnVuY3Rpb24gZXhlY3V0ZXMgYSBzZW5kLW1lc3NhZ2UgYmFzZWQgcmVhZHkgY2hlY2tcclxuICogIHVzaW5nIHRoZSBnaXZlbiBwYXJhbWV0ZXJzLlxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gY29udGV4dFByZWZpeCAtIEEgbGFiZWwgdG8gZGVzY3JpYmUgdGhlXHJcbiAqICBjYWxsaW5nIHNjcmlwdCAoaS5lLiAtIHRoZSBjb250ZXh0KS5cclxuICogQHBhcmFtIHtPYmplY3R9IHJlYWR5Q2hlY2tNc2dPYmogLSBUaGUgb2JqZWN0IHRvIHNlbmRcclxuICogIHVzaW5nIHNlbmRNZXNzYWdlKCkuXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSB0YXJnZXRTY3JpcHROYW1lIC0gQSBsYWJlbCB0byBkZXNjcmliZVxyXG4gKiAgdGhlIHRhcmdldCBzY3JpcHQgKGUuZy4gLSBiYWNrZ3JvdW5kIHNjcmlwdCwgZXRjLikuXHJcbiAqXHJcbiAqIEByZXR1cm4ge1Byb21pc2U8Ym9vbGVhbj59IC0gUmV0dXJucyBUUlVFIGlmIHRoZVxyXG4gKiAgdGFyZ2V0IHNjcmlwdCByZXBvcnRlZCB0aGF0IGl0IHdhcyByZWFkeSwgRkFMU0UgaWZcclxuICogIG5vdC5cclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBkb1JlYWR5Q2hlY2soY29udGV4dFByZWZpeCwgcmVhZHlDaGVja01zZ09iaiwgdGFyZ2V0U2NyaXB0TmFtZSkge1xyXG4gICAgbGV0IGVyclByZWZpeCA9IGAoZG9SZWFkeUNoZWNrKSBgO1xyXG5cclxuICAgIGlmIChpc0VtcHR5U2FmZVN0cmluZyhjb250ZXh0UHJlZml4KSlcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7ZXJyUHJlZml4fVRoZSBjb250ZXh0UHJlZml4IHBhcmFtZXRlciBpcyBlbXB0eSBvciBpbnZhbGlkLmApO1xyXG5cclxuICAgIGVyclByZWZpeCA9IGAoJHtjb250ZXh0UHJlZml4fTo6ZG9SZWFkeUNoZWNrKSBgO1xyXG5cclxuICAgIGlmICh0eXBlb2YgcmVhZHlDaGVja01zZ09iaiAhPT0gJ29iamVjdCcpXHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGAke2VyclByZWZpeH1UaGUgcmVhZHlDaGVja01zZ09iaiBwYXJhbWV0ZXIgaXMgaW52YWxpZC5gKTtcclxuICAgIGlmIChpc0VtcHR5U2FmZVN0cmluZyh0YXJnZXRTY3JpcHROYW1lKSlcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7ZXJyUHJlZml4fVRoZSB0YXJnZXRTY3JpcHROYW1lIHBhcmFtZXRlciBpcyBlbXB0eSBvciBpbnZhbGlkLmApO1xyXG5cclxuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgLy8gQnJvYWRjYXN0IG1lc3NhZ2UuXHJcbiAgICAgICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UocmVhZHlDaGVja01zZ09iaiwgKHJlc3BvbnNlKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChjaHJvbWUucnVudGltZS5sYXN0RXJyb3IpIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGAke2NvbnRleHRQcmVmaXh9OiBOb24tZmF0YWwgZXJyb3Igd2hpbGUgd2FpdGluZyBmb3IgXCIke3RhcmdldFNjcmlwdE5hbWV9XCIgc2NyaXB0IHRvIGJlIHJlYWR5LiAgTGFzdCBlcnJvcjogJHtjaHJvbWUucnVudGltZS5sYXN0RXJyb3J9LmApO1xyXG4gICAgICAgICAgICAgICAgcmVzb2x2ZShmYWxzZSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAvLyBDaGVjayB0aGUgcmVzcG9uc2UuXHJcbiAgICAgICAgICAgICAgICBpZiAocmVzcG9uc2UgPT09IG51bGwgfHwgcmVzcG9uc2UgPT09ICcnIHx8IHR5cGVvZiByZXNwb25zZSAhPT0gJ3N0cmluZycpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgJHtjb250ZXh0UHJlZml4fTogV2FpdGluZyBmb3IgXCIke3RhcmdldFNjcmlwdE5hbWV9XCIgc2NyaXB0IHRvIGJlIHJlYWR5LmApO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGZhbHNlKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gVGhlIHRhcmdldCBzY3JpcHQgaXMgcmVhZHkuXHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coYCR7Y29udGV4dFByZWZpeH06IFRoZSBcIiR7dGFyZ2V0U2NyaXB0TmFtZX1cIiBzY3JpcHQgaXMgcmVhZHkuICBNZXNzYWdlIHJlY2VpdmVkOiAke3Jlc3BvbnNlfWApO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUodHJ1ZSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH0pO1xyXG59IiwiLy8gVGhlIG1vZHVsZSBjYWNoZVxudmFyIF9fd2VicGFja19tb2R1bGVfY2FjaGVfXyA9IHt9O1xuXG4vLyBUaGUgcmVxdWlyZSBmdW5jdGlvblxuZnVuY3Rpb24gX193ZWJwYWNrX3JlcXVpcmVfXyhtb2R1bGVJZCkge1xuXHQvLyBDaGVjayBpZiBtb2R1bGUgaXMgaW4gY2FjaGVcblx0dmFyIGNhY2hlZE1vZHVsZSA9IF9fd2VicGFja19tb2R1bGVfY2FjaGVfX1ttb2R1bGVJZF07XG5cdGlmIChjYWNoZWRNb2R1bGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiBjYWNoZWRNb2R1bGUuZXhwb3J0cztcblx0fVxuXHQvLyBDcmVhdGUgYSBuZXcgbW9kdWxlIChhbmQgcHV0IGl0IGludG8gdGhlIGNhY2hlKVxuXHR2YXIgbW9kdWxlID0gX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fW21vZHVsZUlkXSA9IHtcblx0XHQvLyBubyBtb2R1bGUuaWQgbmVlZGVkXG5cdFx0Ly8gbm8gbW9kdWxlLmxvYWRlZCBuZWVkZWRcblx0XHRleHBvcnRzOiB7fVxuXHR9O1xuXG5cdC8vIEV4ZWN1dGUgdGhlIG1vZHVsZSBmdW5jdGlvblxuXHRfX3dlYnBhY2tfbW9kdWxlc19fW21vZHVsZUlkXShtb2R1bGUsIG1vZHVsZS5leHBvcnRzLCBfX3dlYnBhY2tfcmVxdWlyZV9fKTtcblxuXHQvLyBSZXR1cm4gdGhlIGV4cG9ydHMgb2YgdGhlIG1vZHVsZVxuXHRyZXR1cm4gbW9kdWxlLmV4cG9ydHM7XG59XG5cbiIsInZhciB3ZWJwYWNrUXVldWVzID0gdHlwZW9mIFN5bWJvbCA9PT0gXCJmdW5jdGlvblwiID8gU3ltYm9sKFwid2VicGFjayBxdWV1ZXNcIikgOiBcIl9fd2VicGFja19xdWV1ZXNfX1wiO1xudmFyIHdlYnBhY2tFeHBvcnRzID0gdHlwZW9mIFN5bWJvbCA9PT0gXCJmdW5jdGlvblwiID8gU3ltYm9sKFwid2VicGFjayBleHBvcnRzXCIpIDogXCJfX3dlYnBhY2tfZXhwb3J0c19fXCI7XG52YXIgd2VicGFja0Vycm9yID0gdHlwZW9mIFN5bWJvbCA9PT0gXCJmdW5jdGlvblwiID8gU3ltYm9sKFwid2VicGFjayBlcnJvclwiKSA6IFwiX193ZWJwYWNrX2Vycm9yX19cIjtcbnZhciByZXNvbHZlUXVldWUgPSAocXVldWUpID0+IHtcblx0aWYocXVldWUgJiYgcXVldWUuZCA8IDEpIHtcblx0XHRxdWV1ZS5kID0gMTtcblx0XHRxdWV1ZS5mb3JFYWNoKChmbikgPT4gKGZuLnItLSkpO1xuXHRcdHF1ZXVlLmZvckVhY2goKGZuKSA9PiAoZm4uci0tID8gZm4ucisrIDogZm4oKSkpO1xuXHR9XG59XG52YXIgd3JhcERlcHMgPSAoZGVwcykgPT4gKGRlcHMubWFwKChkZXApID0+IHtcblx0aWYoZGVwICE9PSBudWxsICYmIHR5cGVvZiBkZXAgPT09IFwib2JqZWN0XCIpIHtcblx0XHRpZihkZXBbd2VicGFja1F1ZXVlc10pIHJldHVybiBkZXA7XG5cdFx0aWYoZGVwLnRoZW4pIHtcblx0XHRcdHZhciBxdWV1ZSA9IFtdO1xuXHRcdFx0cXVldWUuZCA9IDA7XG5cdFx0XHRkZXAudGhlbigocikgPT4ge1xuXHRcdFx0XHRvYmpbd2VicGFja0V4cG9ydHNdID0gcjtcblx0XHRcdFx0cmVzb2x2ZVF1ZXVlKHF1ZXVlKTtcblx0XHRcdH0sIChlKSA9PiB7XG5cdFx0XHRcdG9ialt3ZWJwYWNrRXJyb3JdID0gZTtcblx0XHRcdFx0cmVzb2x2ZVF1ZXVlKHF1ZXVlKTtcblx0XHRcdH0pO1xuXHRcdFx0dmFyIG9iaiA9IHt9O1xuXHRcdFx0b2JqW3dlYnBhY2tRdWV1ZXNdID0gKGZuKSA9PiAoZm4ocXVldWUpKTtcblx0XHRcdHJldHVybiBvYmo7XG5cdFx0fVxuXHR9XG5cdHZhciByZXQgPSB7fTtcblx0cmV0W3dlYnBhY2tRdWV1ZXNdID0geCA9PiB7fTtcblx0cmV0W3dlYnBhY2tFeHBvcnRzXSA9IGRlcDtcblx0cmV0dXJuIHJldDtcbn0pKTtcbl9fd2VicGFja19yZXF1aXJlX18uYSA9IChtb2R1bGUsIGJvZHksIGhhc0F3YWl0KSA9PiB7XG5cdHZhciBxdWV1ZTtcblx0aGFzQXdhaXQgJiYgKChxdWV1ZSA9IFtdKS5kID0gLTEpO1xuXHR2YXIgZGVwUXVldWVzID0gbmV3IFNldCgpO1xuXHR2YXIgZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzO1xuXHR2YXIgY3VycmVudERlcHM7XG5cdHZhciBvdXRlclJlc29sdmU7XG5cdHZhciByZWplY3Q7XG5cdHZhciBwcm9taXNlID0gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlaikgPT4ge1xuXHRcdHJlamVjdCA9IHJlajtcblx0XHRvdXRlclJlc29sdmUgPSByZXNvbHZlO1xuXHR9KTtcblx0cHJvbWlzZVt3ZWJwYWNrRXhwb3J0c10gPSBleHBvcnRzO1xuXHRwcm9taXNlW3dlYnBhY2tRdWV1ZXNdID0gKGZuKSA9PiAocXVldWUgJiYgZm4ocXVldWUpLCBkZXBRdWV1ZXMuZm9yRWFjaChmbiksIHByb21pc2VbXCJjYXRjaFwiXSh4ID0+IHt9KSk7XG5cdG1vZHVsZS5leHBvcnRzID0gcHJvbWlzZTtcblx0Ym9keSgoZGVwcykgPT4ge1xuXHRcdGN1cnJlbnREZXBzID0gd3JhcERlcHMoZGVwcyk7XG5cdFx0dmFyIGZuO1xuXHRcdHZhciBnZXRSZXN1bHQgPSAoKSA9PiAoY3VycmVudERlcHMubWFwKChkKSA9PiB7XG5cdFx0XHRpZihkW3dlYnBhY2tFcnJvcl0pIHRocm93IGRbd2VicGFja0Vycm9yXTtcblx0XHRcdHJldHVybiBkW3dlYnBhY2tFeHBvcnRzXTtcblx0XHR9KSlcblx0XHR2YXIgcHJvbWlzZSA9IG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG5cdFx0XHRmbiA9ICgpID0+IChyZXNvbHZlKGdldFJlc3VsdCkpO1xuXHRcdFx0Zm4uciA9IDA7XG5cdFx0XHR2YXIgZm5RdWV1ZSA9IChxKSA9PiAocSAhPT0gcXVldWUgJiYgIWRlcFF1ZXVlcy5oYXMocSkgJiYgKGRlcFF1ZXVlcy5hZGQocSksIHEgJiYgIXEuZCAmJiAoZm4ucisrLCBxLnB1c2goZm4pKSkpO1xuXHRcdFx0Y3VycmVudERlcHMubWFwKChkZXApID0+IChkZXBbd2VicGFja1F1ZXVlc10oZm5RdWV1ZSkpKTtcblx0XHR9KTtcblx0XHRyZXR1cm4gZm4uciA/IHByb21pc2UgOiBnZXRSZXN1bHQoKTtcblx0fSwgKGVycikgPT4gKChlcnIgPyByZWplY3QocHJvbWlzZVt3ZWJwYWNrRXJyb3JdID0gZXJyKSA6IG91dGVyUmVzb2x2ZShleHBvcnRzKSksIHJlc29sdmVRdWV1ZShxdWV1ZSkpKTtcblx0cXVldWUgJiYgcXVldWUuZCA8IDAgJiYgKHF1ZXVlLmQgPSAwKTtcbn07IiwiLy8gZGVmaW5lIGdldHRlciBmdW5jdGlvbnMgZm9yIGhhcm1vbnkgZXhwb3J0c1xuX193ZWJwYWNrX3JlcXVpcmVfXy5kID0gKGV4cG9ydHMsIGRlZmluaXRpb24pID0+IHtcblx0Zm9yKHZhciBrZXkgaW4gZGVmaW5pdGlvbikge1xuXHRcdGlmKF9fd2VicGFja19yZXF1aXJlX18ubyhkZWZpbml0aW9uLCBrZXkpICYmICFfX3dlYnBhY2tfcmVxdWlyZV9fLm8oZXhwb3J0cywga2V5KSkge1xuXHRcdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIGtleSwgeyBlbnVtZXJhYmxlOiB0cnVlLCBnZXQ6IGRlZmluaXRpb25ba2V5XSB9KTtcblx0XHR9XG5cdH1cbn07IiwiX193ZWJwYWNrX3JlcXVpcmVfXy5vID0gKG9iaiwgcHJvcCkgPT4gKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIHByb3ApKSIsIi8vIGRlZmluZSBfX2VzTW9kdWxlIG9uIGV4cG9ydHNcbl9fd2VicGFja19yZXF1aXJlX18uciA9IChleHBvcnRzKSA9PiB7XG5cdGlmKHR5cGVvZiBTeW1ib2wgIT09ICd1bmRlZmluZWQnICYmIFN5bWJvbC50b1N0cmluZ1RhZykge1xuXHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBTeW1ib2wudG9TdHJpbmdUYWcsIHsgdmFsdWU6ICdNb2R1bGUnIH0pO1xuXHR9XG5cdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCAnX19lc01vZHVsZScsIHsgdmFsdWU6IHRydWUgfSk7XG59OyIsIiIsIi8vIHN0YXJ0dXBcbi8vIExvYWQgZW50cnkgbW9kdWxlIGFuZCByZXR1cm4gZXhwb3J0c1xuLy8gVGhpcyBlbnRyeSBtb2R1bGUgdXNlZCAnbW9kdWxlJyBzbyBpdCBjYW4ndCBiZSBpbmxpbmVkXG52YXIgX193ZWJwYWNrX2V4cG9ydHNfXyA9IF9fd2VicGFja19yZXF1aXJlX18oXCIuL3NyYy9jb250ZW50LmpzXCIpO1xuIiwiIl0sIm5hbWVzIjpbXSwic291cmNlUm9vdCI6IiJ9