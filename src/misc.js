// Some helpful miscellaneous routines.


/**
 * Returns a string representation of the given object, with
 * null and undefined being returned as the empty string.
 *
 * @param {*} obj The object to convert.
 *
 * @return {string} A string representation of the {@code obj}.
 */
export function makeStringSafe(obj) {
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
export function conformErrorObjectMsg(err)
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
export function isEmptyOrWhitespaceString (str) {
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
export function isEmptySafeString(str) {
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
export function isNonNullObjectAndNotArray(obj) {
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
export function findDomElementOrDie(idOfDomElement, expectedType) {
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
export function insertHtmlAsFirstChild(parentElement, htmlBlock) {
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
export function insertHtmlAsFirstChildById(parentElementId, htmlBlock) {
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
export function findMainContentArea() {
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
export function isValidAudioBlob(audioBlob) {
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
export function stringToObjectPropertyName(str, bUppercaseIt = true) {
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
export function isValidEnumValue(theValue, theEnumeratedConstantObj) {
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
export function reconstructObjectNoUndefineds(theObj) {
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
export function countWords(text) {
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
export function compareStringsCharByChar(str1, str2) {
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
export function extractYouTubeVideoIdFromUrl(url) {
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
export function getCurrentTimeExt() {
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
export const generateUniqueId = () => {
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
export function extractTopBracketedContent(str) {
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
export function findAllTemplateVarNames(str) {
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
export function substituteWithoutEval(llmPromptToFixUp, funcDoTheEval) {
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
export function appendEosCharIfNotPresent(str) {
  if (typeof str !== 'string' || str.trim().length === 0) {
    throw new Error("Input string cannot be empty after trimming.");
  }

  const eosChars = ['.', '!', '?'];
  return eosChars.includes(str.trim().slice(-1)) ? str : `${str}.`;
}


// -------------------- END  : PROMPT FILE MANIPULATION ROUTINES ------------