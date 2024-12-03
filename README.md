# bookmark-plus-plus
Open Source Repository for Bookmark++, a Bookmark Management Tool That Utilizes Chrome Local APIs

## Introduction

Bookmark++ is a Chrome V3 extension that leverages Chrome local APIs and cutting-edge AI technologies to help you manage and search your bookmarks effectively. It uses the Summarization API to summarize the content of a web page before storing it in local storage, and the Prompt API to process bookmark searches.  Transformer.js is used with a local copy of the Jina embeddings model to create the embeddings needed for the natural language search features.  This ensures that Bookmark++ operates completely privately—your data never leaves your browser.  

Bookmark++ transforms your bookmark collection into a searchable database, allowing you to find relevant web pages using natural language queries. Even better, it supports analytical queries, making your bookmarks an advanced knowledge base rather than just a static collection of web page references.

## Features

- **Local AI Processing**: Ensures privacy by performing all operations directly in your browser.
- **AI-Powered Summarization**: Automatically generates summaries of bookmarked pages.
- **Search with Natural Language**: Use simple keywords or complex queries to find bookmarks.
- **Customizable Summaries**: Adjust summary styles to suit your preferences.
- **User Notes**: Add personalized annotations to bookmarks for richer search results.
- **Analytical Queries**: Perform advanced searches to uncover insights from your bookmarks.

## Requirements

- The latest **Canary build of Chrome**, which includes experimental natural language APIs.
- A modern GPU with at least 4GB of VRAM for local AI processing.

## Installation

1. Open Chrome and navigate to the Extensions page (Extensions > Manage Extensions).
2. Enable **Developer Mode** in the top-right corner.
3. Click **Load unpacked** and select the "build" directory from this project's files.
4. Pin Bookmark++ to the extensions toolbar for easy access.

## Adding Bookmarks

1. Navigate to a webpage you want to bookmark.
2. Wait for the page to load completely.
3. Click on the icon for Bookmark++ to bring up the popup.
4. The popup will automatically summarize the webpage content.
5. (Optional) Add custom text in the **User Note** field to enhance searchability.
6. (Optional) Use the summary settings to select a different summary style and regenerate the summary.
7. Click the **ADD BOOKMARK** button to save the bookmark.

## Updating Bookmarks

1. Go to a webpage you have previously bookmarked.
2. Click on the icon for Bookmark++ to bring up the popup.
3. View the existing bookmark contents, including the summary and **User Note** field.
4. (Optional) Modify the **User Note** field or adjust the summary style. If the style is changed, the summary will automatically regenerate.
5. Click the **UPDATE BOOKMARK** button to save your changes.

## Searching Bookmarks

1. Click on the icon for Bookmark++ to bring up the popup.
2. Click on the **Search Bookmarks** tab to access the search controls.
3. Enter your search query:
    - Use simple keywords (e.g., "humanoid robots").
    - Or ask complex questions (e.g., "Can robots cooperate with humans?").
4. The extension will use the **Gemini Nano** model to perform a retrieval augmented generation (RAG) search using your bookmarks as a grounding attributions source to answer your query.

## Feedback and Contribution

This is an open-source project. Contributions, bug reports, and feature suggestions are welcome. Please submit them via the GitHub Issues page.
