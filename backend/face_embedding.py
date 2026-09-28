import cv2
import numpy as np
from insightface.app import FaceAnalysis


class FaceEmbeddingModel:
    """
    ArcFace-based face embedding generator for FacePulse.
    """
    def __init__(self):
        # Load pretrained ArcFace model
        self.app = FaceAnalysis(
            name="buffalo_l",
            providers=["CPUExecutionProvider"]
        )

        # Prepare the model
        self.app.prepare(
            ctx_id=0,
            det_size=(640, 640)
        )

    def get_embedding(self, image):
        """
        Generate a 512-dimensional face embedding.

        Parameters:
        image: OpenCV image (BGR format)

        Returns:
        numpy array of shape (512,)
        or None if no valid face is found.
        """

        if image is None:
            return None

        # Detect faces
        faces = self.app.get(image)

        print("Faces detected:", len(faces))

        # No face
        if len(faces) == 0:
            print("No face detected.")
            return None

        # Multiple faces
        if len(faces) > 1:
            print("Multiple faces detected.")

            raise ValueError(
                "Multiple faces detected. "
                "Please provide an image containing one face."
            )

        # Get the first detected face
        face = faces[0]

        print(
            "Face bounding box:",
            face.bbox
        )

        # ArcFace embedding
        embedding = face.embedding

        print(
            "Embedding dimension:",
            len(embedding)
        )

        # Normalize embedding
        embedding = (
            embedding /
            np.linalg.norm(embedding)
        )

        return embedding.astype(
            np.float32
        )

# TEST
if __name__ == "__main__":

    model = FaceEmbeddingModel()

    # Load test image
    image = cv2.imread("face1.jpg")

    if image is None:
        print("Could not read face1.jpg")
        exit()

    # Generate embedding
    embedding = model.get_embedding(image)

    if embedding is None:
        print("No face detected.")

    else:
        print("Face detected!")
        print("Embedding shape:", embedding.shape)
        print("Embedding dimension:", len(embedding))
        print("Embedding:")
        print(embedding)