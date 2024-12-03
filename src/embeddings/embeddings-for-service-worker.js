// CONTEXT: Service worker (Background Script).
//
// This file contains code for creating or working with
//  embeddings arrays.


// -------------------- BEGIN: EMBEDDINGS ------------

import {pipeline} from "@xenova/transformers";

export class PipelineSingleton_embeddings {
    static task = 'feature-extraction';
    static instance = null;

    static async getInstance(progress_callback = null) {
        if (this.instance === null) {
            // const modelDirUrl = chrome.runtime.getURL('models/embeddings/jina-embeddings-v2-small-en-onnx/onnx_model/');
            const modelDirUrl = ('embeddings/jina-embeddings-v2-small-en-onnx/');

            // Initialize pipeline, using the directory URL instead of the model file directly
            this.instance = await pipeline(this.task, modelDirUrl, {
                progress_callback,
                // We are loading models locally so caching is not
                //  only unnecessary, it breaks the local URLs.
                // cache_dir: undefined,
                local_files_only: true,  // Enforce local file usage
                // model_file_name: "model.onnx", // Explicitly specify the model file name
            });
        }

        return this.instance;
    }
}


// -------------------- END  : EMBEDDINGS ------------

// -------------------- BEGIN: UTILITY CODE ------------

/**
 * Get the embeddings from the transformers.js pipeline for that.
 *
 * @param {String} text - The text to get embeddings for.
 *
 * @return {Promise<Number[]>} - Returns the embeddings array
 *  for the given text.
 */
export const getEmbeddings_async = async (text) => {
    // Get a reference to the model that creates embeddings.
    const model = await PipelineSingleton_embeddings.getInstance((data) => {
        console.log('progress', data);
    });

    // Run the model to get embeddings for the input text
    const output = await model(text);

    // Output is a Tensor object: dims: [1, 172, 512]
    const dims = output.dims; // [1, 172, 512]
    const sequenceLength = dims[1]; // 172 tokens
    const embeddingSize = dims[2]; // 512 dimensions

    // Mean pooling: directly compute the pooled values into a number[]
    const documentEmbedding = Array(embeddingSize).fill(0); // Create a number[] array

    for (let i = 0; i < sequenceLength; i++) {
        for (let j = 0; j < embeddingSize; j++) {
            documentEmbedding[j] += output.data[i * embeddingSize + j];
        }
    }

    // Divide by the sequence length to compute the mean
    for (let j = 0; j < embeddingSize; j++) {
        documentEmbedding[j] /= sequenceLength;
    }

    return documentEmbedding; // A single vector of size 512 (number[])
};

// -------------------- END  : UTILITY CODE ------------
