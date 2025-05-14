import cv2
import numpy as np
from ultralytics import YOLO
import tempfile
import os
import shutil

class ObjectDetector:
    def __init__(self, model_path="models/yolov8l.pt"):
        self.model = YOLO(model_path)

    def get_object_positions(self, frame):
        """Process a single frame and return detections"""
        height, width = frame.shape[:2]
        results = self.model(frame)
        
        # Dictionary to keep track of object counts
        object_counts = {}
        detections = []
        
        for result in results:
            for box in result.boxes:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                cls = int(box.cls[0].item())
                label = self.model.names[cls]
                confidence = float(box.conf[0].item())
                
                # Update object count and get unique ID
                object_counts[label] = object_counts.get(label, 0) + 1
                object_id = f"{label}_{object_counts[label]}"
                
                # Calculate center points and determine position
                x_center = (x1 + x2) / 2
                y_center = (y1 + y2) / 2
                position = self._determine_position(x_center, y_center, width, height)
                
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

    def process_video(self, video_path: str, sample_rate=30):
        """Process video and track objects"""
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError("Could not open video file")
        
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        # Dictionary to track unique objects
        unique_objects = {}
        object_counts = {}
        
        frame_number = 0
        
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
                
            if frame_number % sample_rate == 0:
                results = self.model(frame)
                
                for result in results:
                    for box in result.boxes:
                        x1, y1, x2, y2 = box.xyxy[0].tolist()
                        cls = int(box.cls[0].item())
                        label = self.model.names[cls]
                        confidence = float(box.conf[0].item())
                        
                        x_center = (x1 + x2) / 2
                        y_center = (y1 + y2) / 2
                        position = self._determine_position(x_center, y_center, width, height)
                        
                        # Track unique objects
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

    def _determine_position(self, x_center, y_center, width, height):
        """Helper method to determine object position"""
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
            return "centre"
        elif v_pos == "centre":
            return f"centre-{h_pos}"
        elif h_pos == "centre":
            return v_pos
        return f"{v_pos}-{h_pos}"