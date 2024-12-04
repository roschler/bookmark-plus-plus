# Reduce the Jira embeddings model precision from FLOAT (Float32) to INT8
#  so that it fits within the GitHub file size limit.
from onnxruntime.quantization import quantize_dynamic, QuantType

quantize_dynamic(
    model_input="model.onnx", 
    model_output="quantized_model.onnx", 
    weight_type=QuantType.QUInt8  # Quantize weights to UINT8 (widely compatible)
)
