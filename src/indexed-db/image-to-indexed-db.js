// This module contains a class to make it easier to
//  load/save images from the user's IndexedDB database.

/**
 * Class to manage the saving and loading of base64-encoded images in IndexedDB.
 */
export class ImageToIndexedDB {
    // ...

    /**
     * Save a base64-encoded image to the IndexedDB.
     * @param {String} imageNameAsKey - The key to use for storing the image.
     * @param {String} b64JsonData - The base64-encoded JSON data of the image.
     * @param {String} projectName - The project associated with the image.
     * @returns {Promise} - A promise that resolves when the image has been successfully stored.
     */
    saveB64JsonImageToDatabase(imageNameAsKey, b64JsonData, projectName) {
        // Parameter validation
        if (typeof imageNameAsKey !== "string" || imageNameAsKey.length === 0) {
            throw new Error("imageNameAsKey must be a non-empty string");
        }
        if (typeof b64JsonData !== "string" || b64JsonData.length === 0) {
            throw new Error("b64JsonData must be a non-empty string");
        }
        if (typeof projectName !== "string" || projectName.length === 0) {
            throw new Error("projectName must be a non-empty string");
        }

        const imageObject = {
            id: imageNameAsKey,
            b64_json: b64JsonData,
            dtCreated: Date.now(),
            projectName: projectName
        };

        return new Promise((resolve, reject) => {
            const openRequest = indexedDB.open(this.dbName, 1);

            openRequest.onupgradeneeded = function () {
                const db = openRequest.result;
                if (!db.objectStoreNames.contains("images")) {
                    db.createObjectStore("images", { keyPath: 'id' });
                }
            };

            openRequest.onsuccess = () => {
                const db = openRequest.result;
                const transaction = db.transaction("images", "readwrite");
                const images = transaction.objectStore("images");
                const request = images.add(imageObject);

                request.onsuccess = () => {
                    resolve();
                };

                request.onerror = () => {
                    reject("Error", request.error);
                };
            };

            openRequest.onerror = () => {
                reject("Error", openRequest.error);
            };
        });
    }

    /**
     * Load a base64-encoded image from the IndexedDB.
     * @param {String} imageNameAsKey - The key to use for loading the image.
     * @param {String} projectName - The project associated with the image.
     * @returns {Promise} - A promise that resolves with the Blob URL of the image data,
     * or null if no image with the given key exists.
     */
    loadB64ImageFromDatabase(imageNameAsKey, projectName) {
        // Parameter validation
        if (typeof imageNameAsKey !== "string" || imageNameAsKey.length === 0) {
            throw new Error("imageNameAsKey must be a non-empty string");
        }
        if (typeof projectName !== "string" || projectName.length === 0) {
            throw new Error("projectName must be a non-empty string");
        }

        return new Promise((resolve, reject) => {
            const openRequest = indexedDB.open(this.dbName, 1);

            openRequest.onsuccess = () => {
                const db = openRequest.result;
                const transaction = db.transaction("images", "readonly");
                const images = transaction.objectStore("images");
                const request = images.get(imageNameAsKey);

                request.onsuccess = () => {
                    if (request.result) {
                        const imgJson = JSON.parse(request.result.b64_json);
                        const blob = this.b64ToBlob(imgJson.image, 'image/png');
                        const blobUrl = URL.createObjectURL(blob);
                        resolve(blobUrl);
                    } else {
                        resolve(null);
                    }
                };

                request.onerror = () => {
                    reject("Error", request.error);
                };
            };

            openRequest.onerror = () => {
                reject("Error", openRequest.error);
            };
        });
    }

    // ...
}
