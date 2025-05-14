from fastapi import APIRouter, UploadFile, File, Request, HTTPException
from fastapi.responses import JSONResponse
from core.detection import ObjectDetector
import cv2
import numpy as np
import tempfile
import os
import shutil
from typing import List

router = APIRouter()
detector = ObjectDetector()

ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/avi', 'video/quicktime', 'video/x-matroska']
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

@router.post("/vior-image")
async def process_image(file: UploadFile = File(...)):
    """
    Process an uploaded image and return detected objects with positions
    """
    try:
        # Validate file type
        if file.content_type not in ALLOWED_IMAGE_TYPES:
            raise HTTPException(
                status_code=400,
                detail="Invalid file type. Supported formats: JPG, JPEG, PNG, WebP"
            )

        # Read file content and reset pointer for potential reuse
        contents = await file.read()
        await file.seek(0)
        
        # Validate file size
        if len(contents) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail="File size too large. Maximum size is 50MB"
            )

        # Convert to image
        nparr = np.frombuffer(contents, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if image is None:
            raise HTTPException(
                status_code=400,
                detail="Could not decode image file"
            )
        
        # Process the image
        results = detector.get_object_positions(image)
        
        return JSONResponse(
            content={
                "status": "success",
                "filename": file.filename,
                "detections": results
            }
        )
    
    except HTTPException as he:
        return JSONResponse(
            status_code=he.status_code,
            content={"error": he.detail}
        )
    except Exception as e:
        print(f"Error processing image: {str(e)}")  # Add logging
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@router.post("/vior-video")
async def process_video_file(file: UploadFile = File(...)):
    """
    Process an uploaded video and return tracked objects with positions
    """
    temp_file = None
    try:
        # Validate file type
        if file.content_type not in ALLOWED_VIDEO_TYPES:
            raise HTTPException(
                status_code=400,
                detail="Invalid file type. Supported formats: MP4, AVI, MOV, MKV"
            )

        # Create temp file
        suffix = os.path.splitext(file.filename)[1]
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp:
            temp_file = temp.name
            
            # Read and write in chunks to handle large files
            chunk_size = 1024 * 1024  # 1MB chunks
            file_size = 0
            
            while True:
                chunk = await file.read(chunk_size)
                if not chunk:
                    break
                file_size += len(chunk)
                if file_size > MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=400,
                        detail="File size too large. Maximum size is 50MB"
                    )
                temp.write(chunk)

            # Ensure all data is written
            temp.flush()
        
        # Process the video
        results = detector.process_video(temp_file)
        
        return JSONResponse(
            content={
                "status": "success",
                "filename": file.filename,
                "detections": results
            }
        )
    
    except HTTPException as he:
        return JSONResponse(
            status_code=he.status_code,
            content={"error": he.detail}
        )
    except Exception as e:
        print(f"Error processing video: {str(e)}")  # Add logging
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )
    
    finally:
        # Clean up temporary file
        if temp_file and os.path.exists(temp_file):
            try:
                os.unlink(temp_file)
            except Exception as e:
                print(f"Error cleaning up temp file: {str(e)}")  # Add logging for cleanup errors