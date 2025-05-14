from fastapi import FastAPI, UploadFile, File, Request
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import cv2
import numpy as np
import tempfile
import os
from ultralytics import YOLO
from typing import Dict, List
import shutil

app = FastAPI(title="VIOR API", description="Video and Image Object Recognition API")

# Initialize YOLO model
model = YOLO("models/yolov8l.pt")

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

@app.get("/", response_class=HTMLResponse)
async def root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

def get_object_positions(frame):
    """Process a single frame and return detections"""
    height, width = frame.shape[:2]
    results = model(frame)
    
    # Dictionary to keep track of object counts
    object_counts = {}
    detections = []
    
    for result in results:
        for box in result.boxes:
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            cls = int(box.cls[0].item())
            label = model.names[cls]
            confidence = float(box.conf[0].item())
            
            # Update object count and get unique ID
            object_counts[label] = object_counts.get(label, 0) + 1
            object_id = f"{label}_{object_counts[label]}"
            
            # Calculate center points
            x_center = (x1 + x2) / 2
            y_center = (y1 + y2) / 2
            
            # Determine horizontal position
            if x_center < width * 0.3:
                h_pos = "left"
            elif x_center > width * 0.7:
                h_pos = "right"
            else:
                h_pos = "centre"
            
            # Determine vertical position
            if y_center < height * 0.3:
                v_pos = "top"
            elif y_center > height * 0.7:
                v_pos = "bottom"
            else:
                v_pos = "centre"
            
            # Combine positions
            if v_pos == "centre" and h_pos == "centre":
                position = "centre"
            elif v_pos == "centre":
                position = f"centre-{h_pos}"
            elif h_pos == "centre":
                position = v_pos
            else:
                position = f"{v_pos}-{h_pos}"
            
            detections.append({
                'object_id': object_id,
                'object': label,
                'position': position,
                'confidence': round(confidence, 3)
            })
    
    # Group detections by object type
    grouped_detections = {}
    for det in detections:
        obj_type = det['object']
        if obj_type not in grouped_detections:
            grouped_detections[obj_type] = []
        grouped_detections[obj_type].append({
            'object_id': det['object_id'],
            'position': det['position'],
            'confidence': det['confidence']
        })
    
    return grouped_detections

def process_video(video_path: str) -> Dict[str, List[Dict]]:
    """Process video and return object tracking data"""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError("Could not open video file")
    
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    
    # Dictionary to track unique objects
    unique_objects = {}
    object_counts = {}
    
    frame_number = 0
    sample_rate = 30  # Process 1 frame per second assuming 30fps
    
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
            
        if frame_number % sample_rate == 0:
            results = model(frame)
            
            for result in results:
                for box in result.boxes:
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    cls = int(box.cls[0].item())
                    label = model.names[cls]
                    confidence = float(box.conf[0].item())
                    
                    x_center = (x1 + x2) / 2
                    y_center = (y1 + y2) / 2
                    
                    # Determine position
                    if x_center < width * 0.3:
                        h_pos = "left"
                    elif x_center > width * 0.7:
                        h_pos = "right"
                    else:
                        h_pos = "centre"
                    
                    if y_center < height * 0.3:
                        v_pos = "top"
                    elif y_center > height * 0.7:
                        v_pos = "bottom"
                    else:
                        v_pos = "centre"
                    
                    if v_pos == "centre" and h_pos == "centre":
                        position = "centre"
                    elif v_pos == "centre":
                        position = f"centre-{h_pos}"
                    elif h_pos == "centre":
                        position = v_pos
                    else:
                        position = f"{v_pos}-{h_pos}"
                    
                    # Check if this is a new unique object based on position proximity
                    new_object = True
                    for obj_key, obj_data in unique_objects.items():
                        if obj_data['object'] == label:
                            stored_x = obj_data['center_x']
                            stored_y = obj_data['center_y']
                            if abs(stored_x - x_center) < width * 0.1 and abs(stored_y - y_center) < height * 0.1:
                                new_object = False
                                if confidence > obj_data['confidence']:
                                    obj_data['position'] = position
                                    obj_data['confidence'] = confidence
                                    obj_data['center_x'] = x_center
                                    obj_data['center_y'] = y_center
                                break
                    
                    if new_object:
                        object_counts[label] = object_counts.get(label, 0) + 1
                        object_id = f"{label}_{object_counts[label]}"
                        unique_objects[object_id] = {
                            'object': label,
                            'object_id': object_id,
                            'position': position,
                            'confidence': confidence,
                            'center_x': x_center,
                            'center_y': y_center
                        }
        
        frame_number += 1
    
    cap.release()
    
    # Group objects by type
    grouped_objects = {}
    for obj_data in unique_objects.values():
        obj_type = obj_data['object']
        if obj_type not in grouped_objects:
            grouped_objects[obj_type] = []
        grouped_objects[obj_type].append({
            'object_id': obj_data['object_id'],
            'position': obj_data['position'],
            'confidence': round(obj_data['confidence'], 3)
        })
    
    return grouped_objects

@app.post("/vior-image")
async def process_image(file: UploadFile = File(...)):
    """
    Process an uploaded image and return detected objects with positions
    """
    try:
        # Read and process the uploaded image
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if image is None:
            return JSONResponse(
                status_code=400,
                content={"error": "Invalid image file"}
            )
        
        # Process the image
        results = get_object_positions(image)
        
        return JSONResponse(
            content={
                "status": "success",
                "filename": file.filename,
                "detections": results
            }
        )
    
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.post("/vior-video")
async def process_video_file(file: UploadFile = File(...)):
    """
    Process an uploaded video and return tracked objects with positions
    """
    temp_file = None
    try:
        # Save uploaded file temporarily
        suffix = os.path.splitext(file.filename)[1]
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp:
            temp_file = temp.name
            shutil.copyfileobj(file.file, temp)
        
        # Process the video
        results = process_video(temp_file)
        
        return JSONResponse(
            content={
                "status": "success",
                "filename": file.filename,
                "detections": results
            }
        )
    
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )
    
    finally:
        # Clean up temporary file
        if temp_file and os.path.exists(temp_file):
            os.unlink(temp_file)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)