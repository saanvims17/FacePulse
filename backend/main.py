from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import numpy as np
import cv2

from backend.face_database import (
    initialize_database,
    add_student,
    get_student,
    get_student_by_id,
    mark_attendance
)

from backend.face_embedding import FaceEmbeddingModel
from backend.vector_database import FaceVectorDatabase

app = FastAPI(
    title="FacePulse API",
    description="AI-powered attendance system",
    version="1.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database and AI models
initialize_database()

face_model = FaceEmbeddingModel()
vector_db = FaceVectorDatabase()

# Home
@app.get("/")
def home():
    return {
        "message": "FacePulse API is running"
    }

# Health check
@app.get("/health")
def health():
    return {
        "status": "healthy"
    }

# Student Registration
@app.post("/students/register")
async def register_student(
    name: str = Form(...),
    student_id: str = Form(...),
    department: str = Form(...),
    year: int = Form(...),
    section: str = Form(...),
    face_image: UploadFile = File(...)
):

    # 1. Check if student already exists
    existing_student = get_student(student_id)

    if existing_student:
        raise HTTPException(
            status_code=400,
            detail="Student ID already registered."
        )

    # 2. Read uploaded image
    image_bytes = await face_image.read()

    image_array = np.frombuffer(
        image_bytes,
        dtype=np.uint8
    )

    image = cv2.imdecode(
        image_array,
        cv2.IMREAD_COLOR
    )

    if image is None:
        raise HTTPException(
            status_code=400,
            detail="Invalid image."
        )

    # 3. Generate ArcFace embedding
    try:
        embedding = face_model.get_embedding(image)

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error)
        )

    if embedding is None:
        raise HTTPException(
            status_code=400,
            detail="No face detected."
        )

    # 4. Store student in SQLite
    database_id = add_student(
        student_id=student_id,
        name=name,
        department=department,
        year=year,
        section=section
    )

    if database_id is None:
        raise HTTPException(
            status_code=400,
            detail="Could not register student."
        )

    # 5. Store face embedding in FAISS
    vector_db.add_face(
        student_database_id=database_id,
        embedding=embedding
    )

    # 6. Return response
    return {
        "message": "Student registered successfully",
        "student": {
            "id": database_id,
            "student_id": student_id,
            "name": name,
            "department": department,
            "year": year,
            "section": section
        },
        "embedding_dimension": len(embedding)
    }

# Attendance Recognition
RECOGNITION_THRESHOLD = 0.60


@app.post("/attendance/recognize")
async def recognize_attendance(
    face_image: UploadFile = File(...)
):

    # 1. Read uploaded image
    image_bytes = await face_image.read()

    image_array = np.frombuffer(
        image_bytes,
        dtype=np.uint8
    )

    image = cv2.imdecode(
        image_array,
        cv2.IMREAD_COLOR
    )

    if image is None:
        raise HTTPException(
            status_code=400,
            detail="Invalid image."
        )

    # 2. Generate ArcFace embedding
    try:
        embedding = face_model.get_embedding(image)

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error)
        )

    if embedding is None:
        raise HTTPException(
            status_code=400,
            detail="No face detected."
        )

    # 3. Search FAISS
    results = vector_db.search(
        embedding,
        top_k=1
    )

    if not results:
        return {
            "status": "Unknown",
            "message": "No registered faces found."
        }


    best_match = results[0]

    student_database_id = (
        best_match["student_database_id"]
    )

    similarity = best_match["similarity"]

    # 4. Check similarity threshold
    if similarity < RECOGNITION_THRESHOLD:
        return {
            "status": "Unknown",
            "message": "Face not recognized.",
            "similarity": similarity
        }

    # 5. Find student in SQLite
    student = get_student_by_id(
        student_database_id
    )

    if student is None:
        raise HTTPException(
            status_code=500,
            detail="Student record not found."
        )

    # 6. Mark attendance
    marked = mark_attendance(
        student_database_id=student_database_id,
        confidence=similarity
    )

    # 7. Return result
    if marked:
        message = "Attendance marked successfully."
    else:
        message = "Attendance already marked today."


    return {
        "status": "Present",
        "message": message,
        "student": {
            "id": student["id"],
            "student_id": student["student_id"],
            "name": student["name"],
            "department": student["department"],
            "year": student["year"],
            "section": student["section"]
        },
        "similarity": similarity
    }