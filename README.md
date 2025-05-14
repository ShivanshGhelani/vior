# VIOR API - Video and Image Object Recognition

A FastAPI-based application for object detection in images and videos using YOLOv8.

## Features

- Real-time object detection in images
- Object detection in video files
- Web interface for easy interaction
- RESTful API endpoints
- Support for multiple YOLOv8 models

## Prerequisites

- Python 3.9+
- Docker (optional)

## Installation

### Local Setup

1. Clone the repository:
```bash
git clone <your-repository-url>
cd vior-api
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Download YOLOv8 model:
```bash
python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"
```

4. Run the application:
```bash
uvicorn main:app --reload
```

### Docker Setup

1. Build the Docker image:
```bash
docker build -t vior-api .
```

2. Run the container:
```bash
docker run -p 8000:8000 vior-api
```

## Usage

Access the web interface at `http://localhost:8000`

API endpoints:
- `/docs` - Swagger UI documentation
- `/redoc` - ReDoc documentation
- `/detect/image` - Image detection endpoint
- `/detect/video` - Video detection endpoint

## API Documentation

Full API documentation is available at `http://localhost:8000/docs` when running the application.

## Deployment

This application is ready to be deployed on Render. To deploy:

1. Push your code to GitHub
2. Create a new Web Service on Render
3. Connect your GitHub repository
4. Use the following settings:
   - Environment: Docker
   - Build Command: (Docker will handle this)
   - Start Command: (Docker will handle this)

## License

[Your chosen license]

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
