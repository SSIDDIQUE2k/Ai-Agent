from langchain_chroma import Chroma

COLLECTION = "all_documents"
PERSIST_DIR = "./chroma_db"  # Use your actual ChromaDB directory

vector_store = Chroma(
    collection_name=COLLECTION,
    persist_directory=PERSIST_DIR
)

vector_store._collection.delete(where={})
print("ChromaDB collection reset!") 