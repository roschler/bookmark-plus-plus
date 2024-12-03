import path from 'path';
import { fileURLToPath } from 'url';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import CopyPlugin from 'copy-webpack-plugin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = {
    mode: 'development',
    devtool: 'inline-source-map',
    entry: {
        background: './src/background.js',
        popup: './src/popup.js',
        content: './src/content.js',
    },
    output: {
        path: path.resolve(__dirname, 'build'),
        filename: '[name].js',
    },
    module: {
        rules: [
            {
                test: /\.json$/,
                type: 'asset/resource',
                generator: {
                    filename: 'models/embeddings/jina-embeddings-v2-small-en-onnx/onnx_model/[name][ext]',
                },
            },
            {
                test: /\.onnx$/,
                type: 'asset/resource',
                generator: {
                    filename: 'models/embeddings/jina-embeddings-v2-small-en-onnx/onnx_model/[name][ext]',
                },
            },
            {
                test: /\.txt$/, // Add rule for .txt files
                type: 'asset/resource',
                generator: {
                    filename: 'prompts/[name][ext]',
                },
            },
        ],
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './src/popup.html',
            filename: 'popup.html',
            inject: false, // Prevent automatic injection to avoid duplicate popup.js loads.
        }),
        new CopyPlugin({
            patterns: [
                {
                    from: 'public',
                    to: '.', // Copies to build folder
                },
                {
                    from: 'src/popup.css',
                    to: 'popup.css',
                },
                {
                    // Copy all files in the onnx_model directory
                    from: path.resolve(__dirname, 'models/embeddings/jina-embeddings-v2-small-en-onnx'),
                    to: 'models/embeddings/jina-embeddings-v2-small-en-onnx',
                },
                {
                    // Add copy pattern for prompt files
                    from: 'src/prompts', 
                    to: 'prompts', // Output to build folder
                },
            ],
        }),
    ],
};

export default config;
