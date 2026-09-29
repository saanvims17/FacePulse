import faiss
import numpy as np
import os
from pathlib import Path

# PATH
DATABASE_DIR = Path(os.getenv(
    "FACEPULSE_DATABASE_DIR",
    str(Path(__file__).parent.parent / "database")
))

FAISS_INDEX_PATH = DATABASE_DIR / "face_index.faiss"

DATABASE_DIR.mkdir(exist_ok=True)

# VECTOR DATABASE
class FaceVectorDatabase:

    def __init__(self, embedding_dimension=512):

        self.embedding_dimension = embedding_dimension

        # Base FAISS index
        base_index = faiss.IndexFlatIP(
            embedding_dimension
        )

        # Allows custom IDs
        self.index = faiss.IndexIDMap2(
            base_index
        )

        self.load()

    # NORMALIZE
    def normalize(self, embedding):

        embedding = np.asarray(
            embedding,
            dtype=np.float32
        )

        embedding = embedding.reshape(1, -1)

        faiss.normalize_L2(embedding)

        return embedding

    # ADD FACE
    def add_face(
        self,
        student_database_id,
        embedding
    ):
        """
        Store a student's embedding in FAISS.

        The FAISS ID is the same ID
        as the student's SQLite database ID.
        """

        embedding = self.normalize(
            embedding
        )

        student_database_id = np.array(
            [student_database_id],
            dtype=np.int64
        )

        # One SQLite student maps to one current embedding.  Re-registration is
        # blocked at the API level, but this keeps the FAISS mapping unambiguous
        # for maintenance scripts as well.
        self.index.remove_ids(student_database_id)

        self.index.add_with_ids(
            embedding,
            student_database_id
        )

        self.save()

    # SEARCH
    def search(
        self,
        embedding,
        top_k=1
    ):
        """
        Search for the closest registered faces.
        """

        if self.index.ntotal == 0:
            return []

        embedding = self.normalize(
            embedding
        )

        similarities, ids = self.index.search(
            embedding,
            top_k
        )

        results = []

        for similarity, student_id in zip(
            similarities[0],
            ids[0]
        ):

            if student_id == -1:
                continue

            results.append({
                "student_database_id": int(student_id),

                "similarity": float(similarity)
            })

        return results

    # SAVE
    def save(self):

        faiss.write_index(
            self.index,
            str(FAISS_INDEX_PATH)
        )


    # LOAD
    def load(self):

        if FAISS_INDEX_PATH.exists():

            loaded_index = faiss.read_index(str(FAISS_INDEX_PATH))
            if loaded_index.d != self.embedding_dimension:
                raise RuntimeError(
                    "Existing FAISS index dimension does not match the 512-D ArcFace model. "
                    "Use the safe reset endpoint after backing up the database."
                )
            self.index = loaded_index

    def reset(self):
        """Safely replace the persistent index with an empty 512-D index."""
        self.index = faiss.IndexIDMap2(faiss.IndexFlatIP(self.embedding_dimension))
        self.save()

    # COUNT
    def count(self):

        return self.index.ntotal

# TEST
if __name__ == "__main__":

    vector_db = FaceVectorDatabase()

    print(
        "Registered faces:",
        vector_db.count()
    )

    # Fake ArcFace embedding
    test_embedding = np.random.rand(
        512
    ).astype(np.float32)

    # SQLite ID = 1
    vector_db.add_face(
        student_database_id=1,
        embedding=test_embedding
    )

    print(
        "Face registered for SQLite ID = 1"
    )

    # Search
    results = vector_db.search(
        test_embedding
    )

    print("\nSearch result:")

    for result in results:

        print(
            "Student database ID:",
            result["student_database_id"]
        )

        print(
            "Similarity:",
            result["similarity"]
        )
