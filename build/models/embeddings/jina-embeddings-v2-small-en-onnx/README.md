---
library_name: light-embed
pipeline_tag: sentence-similarity
tags:
- sentence-transformers
- feature-extraction
- sentence-similarity

---

# onnx-models/jina-embeddings-v2-small-en-onnx

This is the ONNX-ported version of the [jinaai/jina-embeddings-v2-small-en](https://huggingface.co/jinaai/jina-embeddings-v2-small-en) for generating text embeddings.

## Model details
- Embedding dimension: 512
- Max sequence length: 8192
- File size on disk:  0.11 GB
- Modules incorporated in the onnx: Transformer, Pooling

<!--- Describe your model here -->

## Usage

Using this model becomes easy when you have [light-embed](https://pypi.org/project/light-embed/) installed:

```
pip install -U light-embed
```

Then you can use the model by specifying the *original model name* like this:

```python
from light_embed import TextEmbedding
sentences = [
	"This is an example sentence",
	"Each sentence is converted"
]

model = TextEmbedding('jinaai/jina-embeddings-v2-small-en')
embeddings = model.encode(sentences)
print(embeddings)
```

or by specifying the *onnx model name* like this:

```python
from light_embed import TextEmbedding
sentences = [
	"This is an example sentence",
	"Each sentence is converted"
]

model = TextEmbedding('onnx-models/jina-embeddings-v2-small-en-onnx')
embeddings = model.encode(sentences)
print(embeddings)
```

## Citing & Authors

Binh Nguyen / binhcode25@gmail.com