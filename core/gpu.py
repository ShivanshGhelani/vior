import torch
print("CUDA Available:", torch.cuda.is_available())
print("Device Count:", torch.cuda.device_count())
print("GPU Name:", torch.cuda.get_device_name(0))
print("Torch CUDA Version:", torch.version.cuda)
print("Torch Backend Using CUDA:", torch.backends.cudnn.enabled)
