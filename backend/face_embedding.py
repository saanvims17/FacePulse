import numpy as np
from insightface.app import FaceAnalysis
from insightface.app.common import Face
from insightface.utils import face_align


class FaceEmbeddingModel:
    """
    ArcFace-based face embedding generator for FacePulse.
    """
    def __init__(self):
        # FaceAnalysis supplies the ArcFace model weights.  We intentionally do
        # not call ``app.get``: that method invokes InsightFace's detector and
        # would bypass the project's fine-tuned YOLO face detector.
        self.app = FaceAnalysis(
            name="buffalo_l",
            providers=["CPUExecutionProvider"]
        )

        # Prepare the model
        self.app.prepare(
            ctx_id=0,
            det_size=(640, 640)
        )

        self.recognition_model = self.app.models.get("recognition")
        if self.recognition_model is None:
            raise RuntimeError("InsightFace ArcFace recognition model was not loaded.")

        # This landmark model receives the face crop selected by YOLO. It does
        # not perform face detection; it only aligns that already-known face
        # before ArcFace inference.
        self.landmark_model = self.app.models.get("landmark_3d_68")
        if self.landmark_model is None:
            raise RuntimeError("InsightFace landmark model was not loaded.")

    def _align_yolo_crop(self, face_crop):
        """Align a YOLO crop with landmarks before ArcFace feature extraction."""
        height, width = face_crop.shape[:2]
        face = Face(bbox=np.array([0, 0, width - 1, height - 1], dtype=np.float32))
        landmarks = self.landmark_model.get(face_crop, face)[:, :2]

        # Standard 68-point landmark locations: left/right eye, nose, and
        # left/right mouth corners.  ArcFace's canonical alignment uses these
        # five points and does not invoke another detector.
        five_points = landmarks[[36, 45, 30, 48, 54]]
        return face_align.norm_crop(
            face_crop,
            landmark=five_points,
            image_size=self.recognition_model.input_size[0]
        )

    def get_embedding_from_crop(self, face_crop):
        """
        Generate a 512-dimensional face embedding.

        Parameters:
        face_crop: one face cropped from a YOLO bounding box (BGR format)

        Returns:
        numpy array of shape (512,)
        or None if no valid face is found.
        """

        if face_crop is None or face_crop.size == 0:
            return None

        # get_feat performs ArcFace inference only.  The crop is already
        # selected by YOLO, so InsightFace never performs detection.
        aligned_crop = self._align_yolo_crop(face_crop)
        embedding = self.recognition_model.get_feat(aligned_crop)
        embedding = np.asarray(embedding, dtype=np.float32).reshape(-1)

        if embedding.size != 512:
            raise RuntimeError(
                f"Expected a 512-D ArcFace embedding, received {embedding.size}-D."
            )

        # Normalize embedding
        norm = np.linalg.norm(embedding)
        if norm == 0:
            raise ValueError("Could not generate a usable face embedding.")

        embedding = embedding / norm

        return embedding.astype(
            np.float32
        )
