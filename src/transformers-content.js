// content.js - the content scripts which is run in the context of web pages, and has access
// to the DOM and other web APIs.

// Example usage:
// const message = {
//     action: 'classify',
//     text: 'text to classify',
// }
// chrome.runtime.sendMessage(message, (response) => {
//     console.log('received user data', response)
// });


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
                console.info(CONSOLE_MESSAGE_CATEGORY_CONTENT_SCRIPT, `Successfully found and closed the chat messages window.`);
            }

            // Make sure the transcript div is visible.
            showTranscriptDiv();
            await waitForAWhile(1000, 'Making the transcript DIV visible');
        } else {
            console.info(CONSOLE_MESSAGE_CATEGORY_CONTENT_SCRIPT, `The chat messages window was not visible or we were unable to close it.`);
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
                console.info(CONSOLE_MESSAGE_CATEGORY_CONTENT_SCRIPT, operationMsg);
            }

            aryExpandoButtons.forEach(button => button.click());

            await waitForAWhile(1000, operationMsg);

            if (bVerbose_content) {
                console.info(CONSOLE_MESSAGE_CATEGORY_CONTENT_SCRIPT, 'Attempting to find transcript button again...');
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
        console.info(CONSOLE_MESSAGE_CATEGORY_CONTENT_SCRIPT, `Clicking the transcript button now.`);
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
        console.info(CONSOLE_MESSAGE_CATEGORY_CONTENT_SCRIPT, `Returning new transcript object for video ID: ${videoId}`);
    }

    return newTranscriptGrabbedObj;
}
