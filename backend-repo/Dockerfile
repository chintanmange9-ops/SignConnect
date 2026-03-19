FROM python:3.10-slim

WORKDIR /app

# System deps for tensorflow and opencv-headless
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 libgl1 && \
    rm -rf /var/lib/apt/lists/*

# Install only what api.py actually needs
RUN pip install --no-cache-dir \
    fastapi \
    uvicorn \
    pydantic \
    "numpy<2.0" \
    "tensorflow-cpu==2.12.0" \
    scikit-learn \
    ollama \
    gtts

# Copy model, videos, and source
COPY my_model/ ./my_model/
COPY videos_input/ ./videos_input/
COPY api.py ./

# Create empty data label folders (model needs folder names for action labels, not .npy files)
RUN mkdir -p data && \
    for word in AFTER BAD BEFORE BOOK BYE CALL CLOSE COLLEGE COME DRINK \
    EAT FAST FATHER FOOD FRIEND GIVE GO GOOD HELLO HELP \
    HOME I MEDICINE MONEY MORE MOTHER NAME NO OPEN PHONE \
    PLAY PLEASE READ SIT SLEEP SORRY STAND STOP THANKYOU TODAY \
    TOMORROW WAIT WALK WANT WASH WATER WHERE WRITE YES YOU; \
    do mkdir -p data/$word; done

EXPOSE 8000

CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
