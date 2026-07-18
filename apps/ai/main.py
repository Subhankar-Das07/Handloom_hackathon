from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import uvicorn
import random
import time

app = FastAPI(title="Tanthavi AI Verification Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class VerificationResult(BaseModel):
    is_handloom: bool
    confidence_score: float
    flags: List[str]

@app.post("/verify-image", response_model=VerificationResult)
async def verify_image(file: UploadFile = File(...)):
    """
    Mock AI Verification Endpoint.
    In production, this would pass the image tensor through EfficientNet-B3.
    For local development, it simulates processing delay and returns a random/deterministic score.
    """
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    # Simulate ML inference processing time (1 to 2 seconds)
    time.sleep(random.uniform(1.0, 2.0))
    
    # Read filename to determine mock behavior if we want deterministic testing
    filename = file.filename.lower()
    
    # Deterministic mocking for testing
    if "fake" in filename or "powerloom" in filename:
        return VerificationResult(
            is_handloom=False,
            confidence_score=0.98,
            flags=["machinery_visible", "synthetic_texture_detected"]
        )
    
    if "stock" in filename:
        return VerificationResult(
            is_handloom=False,
            confidence_score=0.88,
            flags=["stock_image_detected", "reverse_image_search_match"]
        )
        
    # Default success case for normal images
    # We randomize a high score to simulate genuine handloom uploads
    score = random.uniform(0.85, 0.99)
    return VerificationResult(
        is_handloom=True,
        confidence_score=score,
        flags=[]
    )

@app.get("/health")
def health_check():
    return {"status": "ok", "model": "EfficientNet-B3 (Mock)"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
