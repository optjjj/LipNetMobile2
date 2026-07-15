import onnx
import os

print("1. Loading the split model...")
# This automatically reads lipnet.onnx AND looks for lipnet.onnx.data next to it
model = onnx.load("lipnet.onnx", load_external_data=True)

print("2. Merging weights and saving as a single file...")
# This forces the weights inside the protobuf binary, dropping the .data file
onnx.save_model(model, "lipnet_single.onnx", save_as_external_data=False)

# Verify the size
new_size_mb = os.path.getsize("lipnet_single.onnx") / (1024 * 1024)
print(f"Success! lipnet_single.onnx created. Size: {new_size_mb:.2f} MB")