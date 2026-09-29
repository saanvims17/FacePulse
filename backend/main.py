"""FastAPI application for the FacePulse YOLO → ArcFace → FAISS pipeline."""

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

# On macOS, PyTorch/Ultralytics and FAISS may load separate OpenMP runtimes.
# This keeps the local prototype process alive; production deployments should
# use a single, container-managed OpenMP runtime instead.
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO

from backend.face_database import (
    add_student, get_student, get_student_by_id, get_today_attendance,
    get_today_attendance_count, get_total_student_count, initialize_database,
    mark_attendance, clear_facepulse_data,
)
from backend.face_embedding import FaceEmbeddingModel
from backend.notifications import notify_attendance_marked
from backend.vector_database import FaceVectorDatabase

logger = logging.getLogger(__name__)
PROJECT_ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = PROJECT_ROOT / "models" / "best.pt"
RECOGNITION_THRESHOLD = float(os.getenv("RECOGNITION_THRESHOLD", "0.60"))
YOLO_CONFIDENCE = float(os.getenv("YOLO_CONFIDENCE", "0.50"))


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    if not MODEL_PATH.exists():
        raise RuntimeError(f"FacePulse YOLO model is missing: {MODEL_PATH}")
    app.state.detector = YOLO(str(MODEL_PATH))
    app.state.face_model = FaceEmbeddingModel()
    app.state.vector_db = FaceVectorDatabase()
    logger.info("FacePulse ready: %s registered embeddings", app.state.vector_db.count())
    yield


app = FastAPI(
    title="FacePulse API",
    description="AI-powered real-time attendance system",
    version="1.1.0",
    lifespan=lifespan,
)

origins = os.getenv("CORS_ORIGINS", "http://127.0.0.1:5500,http://localhost:5500").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _decode_upload(image_bytes: bytes) -> np.ndarray:
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Image file is empty.")
    image = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="Invalid image.")
    return image


def _detect_faces(image: np.ndarray) -> list[dict]:
    """Detect all usable faces using the supplied fine-tuned YOLO model."""
    result = app.state.detector(image, conf=YOLO_CONFIDENCE, verbose=False)[0]
    faces = []
    for box in result.boxes:
        x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(image.shape[1], x2), min(image.shape[0], y2)
        crop = image[y1:y2, x1:x2]
        if crop.size:
            faces.append({
                "crop": crop,
                "bounding_box": [int(x1), int(y1), int(x2), int(y2)],
                "detection_confidence": float(box.conf[0].item()),
            })
    return faces


def _recognize_face(face: dict) -> dict:
    metadata = {
        "bounding_box": face["bounding_box"],
        "detection_confidence": face["detection_confidence"],
    }
    embedding = app.state.face_model.get_embedding_from_crop(face["crop"])
    if embedding is None:
        return {"status": "Unknown", "message": "Could not generate an embedding.", **metadata}

    matches = app.state.vector_db.search(embedding, top_k=1)
    if not matches:
        return {"status": "Unknown", "message": "No registered faces found.", "similarity": None, **metadata}

    best_match = matches[0]
    similarity = best_match["similarity"]
    if similarity < RECOGNITION_THRESHOLD:
        return {
            "status": "Unknown", "message": "Face not recognized.",
            "similarity": similarity, **metadata,
        }

    student = get_student_by_id(best_match["student_database_id"])
    if student is None:
        logger.warning("FAISS returned missing SQLite student id %s", best_match["student_database_id"])
        return {
            "status": "Unknown", "message": "Face index is out of sync with the student database.",
            "similarity": similarity, **metadata,
        }

    marked = mark_attendance(student["id"], similarity)
    notification = None
    if marked:
        try:
            notification = notify_attendance_marked(student, similarity)
        except Exception:
            logger.exception("Attendance was saved but notification delivery failed")
            notification = "failed"

    return {
        "status": "Present",
        "message": "Attendance marked successfully." if marked else "Attendance already marked today.",
        "student": student, "similarity": similarity, "attendance_marked": marked,
        "notification": notification, **metadata,
    }


@app.get("/")
def home():
    return {"message": "FacePulse API is running", "docs": "/docs"}


@app.get("/health")
def health():
    return {
        "status": "healthy", "model": MODEL_PATH.name,
        "embeddings": app.state.vector_db.count(),
        "recognition_threshold": RECOGNITION_THRESHOLD,
    }


@app.post("/students/register", status_code=201)
async def register_student(
    name: str = Form(...), student_id: str = Form(...), department: str = Form(...),
    year: int = Form(...), section: str = Form(...), replace_face: bool = Form(False),
    face_image: list[UploadFile] = File(...),
):
    existing_student = get_student(student_id)
    if existing_student and not replace_face:
        raise HTTPException(status_code=409, detail="Student ID already registered.")

    if not 1 <= len(face_image) <= 5:
        raise HTTPException(status_code=400, detail="Provide between one and five face images.")

    embeddings = []
    detection_confidences = []
    for position, upload in enumerate(face_image, start=1):
        image = _decode_upload(await upload.read())
        faces = _detect_faces(image)
        if not faces:
            raise HTTPException(status_code=400, detail=f"No face detected by YOLO in registration frame {position}.")
        if len(faces) != 1:
            raise HTTPException(status_code=400, detail=f"Multiple faces detected in registration frame {position}. Keep one person in view.")
        try:
            embedding = app.state.face_model.get_embedding_from_crop(faces[0]["crop"])
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        if embedding is None:
            raise HTTPException(status_code=400, detail=f"Could not generate an embedding for registration frame {position}.")
        embeddings.append(embedding)
        detection_confidences.append(faces[0]["detection_confidence"])

    # Averaging several normalised views makes enrollment less sensitive to a
    # single blink, crop, or head pose. Normalize once more for IndexFlatIP.
    embedding = np.mean(embeddings, axis=0).astype(np.float32)
    embedding /= np.linalg.norm(embedding)

    if existing_student:
        database_id = existing_student["id"]
        student = existing_student
        message = "Face profile updated successfully."
    else:
        database_id = add_student(student_id, name, department, year, section)
        if database_id is None:
            raise HTTPException(status_code=409, detail="Student ID already registered.")
        student = {"id": database_id, "student_id": student_id, "name": name,
                   "department": department, "year": year, "section": section}
        message = "Student registered successfully"

    app.state.vector_db.add_face(database_id, embedding)
    return {
        "message": message,
        "student": student,
        "embedding_dimension": int(embedding.size),
        "registration_frames": len(embeddings),
        "detection_confidence": float(np.mean(detection_confidences)),
    }


@app.post("/attendance/recognize")
async def recognize_attendance(face_image: UploadFile = File(...)):
    image = _decode_upload(await face_image.read())
    faces = _detect_faces(image)
    if not faces:
        return {"status": "Unknown", "message": "No face detected by YOLO.", "results": []}

    # The classroom flow intentionally processes one student at a time.  Do
    # not mark a partial/ambiguous frame when another person is also visible.
    if len(faces) != 1:
        return {
            "status": "MultipleFaces",
            "message": "Multiple faces detected. Keep exactly one student in the camera frame.",
            "faces_detected": len(faces),
            "results": [],
        }

    results = [_recognize_face(face) for face in faces]
    # Backwards-compatible fields for the dashboard's single-face flow.
    primary = results[0]
    return {**primary, "faces_detected": len(results), "results": results}


@app.get("/attendance/today")
def today_attendance():
    return {"attendance": get_today_attendance(), "count": get_today_attendance_count()}


@app.get("/dashboard/summary")
def dashboard_summary():
    total = get_total_student_count()
    present = get_today_attendance_count()
    return {
        "total_students": total, "present_today": present,
        "absent_today": max(total - present, 0),
        "attendance_percentage": round((present / total * 100) if total else 0, 1),
    }


@app.post("/admin/index/reset")
def reset_face_index(x_admin_token: str | None = Header(default=None)):
    """Reset only the FAISS index; requires FACEPULSE_ADMIN_TOKEN when configured."""
    token = os.getenv("FACEPULSE_ADMIN_TOKEN")
    if not token or x_admin_token != token:
        raise HTTPException(status_code=403, detail="Set FACEPULSE_ADMIN_TOKEN and send it as x_admin_token to reset the index.")
    app.state.vector_db.reset()
    return {"message": "FAISS index reset. Re-register students to rebuild embeddings."}


@app.post("/admin/data/reset")
def reset_all_facepulse_data(x_admin_token: str | None = Header(default=None)):
    """Clear FacePulse students, attendance, and FAISS vectors as one local reset."""
    token = os.getenv("FACEPULSE_ADMIN_TOKEN")
    if not token or x_admin_token != token:
        raise HTTPException(status_code=403, detail="Set FACEPULSE_ADMIN_TOKEN and send it as x_admin_token to clear FacePulse data.")
    clear_facepulse_data()
    app.state.vector_db.reset()
    return {"message": "FacePulse student, attendance, and FAISS data cleared.", "students": 0, "embeddings": 0}
