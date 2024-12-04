import onnx

# Load the ONNX model
model = onnx.load("model.onnx")

# Define ONNX tensor data types
onnx_tensor_data_types = {
    1: "FLOAT",      # FP32
    2: "UINT8",
    3: "INT8",
    4: "UINT16",
    5: "INT16",
    6: "INT32",
    7: "INT64",
    10: "FLOAT16",   # FP16
    11: "DOUBLE",    # FP64
}

# Check data types of inputs
print("Inputs:")
for tensor in model.graph.input:
    dtype = onnx_tensor_data_types.get(tensor.type.tensor_type.elem_type, "UNKNOWN")
    print(f"  Name: {tensor.name}, Type: {dtype}")

# Check data types of outputs
print("\nOutputs:")
for tensor in model.graph.output:
    dtype = onnx_tensor_data_types.get(tensor.type.tensor_type.elem_type, "UNKNOWN")
    print(f"  Name: {tensor.name}, Type: {dtype}")

# Check data types of weights (initializers)
print("\nWeights:")
for initializer in model.graph.initializer:
    dtype = onnx_tensor_data_types.get(initializer.data_type, "UNKNOWN")
    print(f"  Name: {initializer.name}, Type: {dtype}")
