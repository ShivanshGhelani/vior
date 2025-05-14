from ultralytics import YOLO
import cv2
import requests
import time

# Load YOLOv8 model
model = YOLO("yolov8l.pt")  # Use "yolov8n.pt" for speed

# Define target objects
TARGET_OBJECTS = ["person", "chair", "bottle", "bag", "table", "cellphone"]


API_URL = "https://jaguar-giving-awfully.ngrok-free.app/process_objects"  # Replace with actual server URL

# Tracking variables
previous_objects = {}
last_stable_objects = {}  # Stores the last stable detection
last_update_time = 0
STABILITY_THRESHOLD = 2  # Seconds before confirming a change
COOLDOWN_TIME = 2  # Min time between API calls

# Open webcam
cap = cv2.VideoCapture(0)

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    # Run YOLOv8 inference9-
    results = model(frame, device="cpu", imgsz=640, conf=0.5, verbose=False)

    detected_objects = {}

    # Process detections
    for result in results:
        for box in result.boxes:
            cls = int(box.cls[0])  # Class ID
            label = model.names[cls]  # Convert class ID to label

            if label in TARGET_OBJECTS:
                x1, y1, x2, y2 = map(int, box.xyxy[0])  # Bounding box
                center_x = (x1 + x2) // 2

                # Determine object position
                position = "center"
                if center_x < frame.shape[1] // 3:
                    position = "left"
                elif center_x > 2 * frame.shape[1] // 3:
                    position = "right"

                detected_objects[label] = position

    # Check if detections are stable for STABILITY_THRESHOLD seconds
    if detected_objects != last_stable_objects:
        last_update_time = time.time()
        last_stable_objects = detected_objects.copy()
    
    # Send update only if objects are stable & changed
    if (
        detected_objects != previous_objects and 
        (time.time() - last_update_time) > STABILITY_THRESHOLD and 
        (time.time() - last_update_time) > COOLDOWN_TIME
    ):
        previous_objects = detected_objects.copy()
        data = {"objects": detected_objects}

        try:
            response = requests.post(API_URL, json=data, headers={"Content-Type": "application/json"})
            print(f"✅ Sent to API: {data} | Response: {response.status_code} {response.text}")
        except requests.exceptions.RequestException as e:
            print(f"❌ API Error: {e}")

    # Display the live feed (Optional)
    cv2.imshow("YOLOv8 Object Detection", frame)

    # Exit on 'q' key
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
