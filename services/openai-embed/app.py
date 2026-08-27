import os
import logging
import json
from flask import Flask, request, jsonify
from openai import OpenAI

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
MODEL = "text-embedding-3-large"
DIMENSIONS = 3072


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "healthy", "model": MODEL, "dimensions": DIMENSIONS})


@app.route("/embed", methods=["POST"])
def embed():
    try:
        data = request.get_json()
        logger.info(f"RAW REQUEST: {json.dumps(data)}")

        if not data:
            return jsonify({"error": "No JSON body provided"}), 400

        if "data" in data:
            rows = data["data"]
            logger.info(f"Processing {len(rows)} rows in Snowflake format")
            results = []

            for row in rows:
                row_index = row[0]
                text = row[1] if len(row) > 1 else ""
                logger.info(
                    f"Row {row_index}: text='{text[:50] if text else 'EMPTY'}...'"
                )

                if not text or str(text).strip() == "":
                    results.append([row_index, None])
                    continue

                response = client.embeddings.create(
                    model=MODEL, input=str(text), dimensions=DIMENSIONS
                )
                embedding = response.data[0].embedding
                results.append([row_index, embedding])

            logger.info(f"Returning {len(results)} embeddings")
            return jsonify({"data": results})

        texts = data.get("texts", [])
        if isinstance(data.get("text"), str):
            texts = [data["text"]]

        if not texts:
            logger.error(f"No text found in request: {data}")
            return jsonify({"error": "No text or texts provided"}), 400

        logger.info(f"Generating embeddings for {len(texts)} text(s)")

        response = client.embeddings.create(
            model=MODEL, input=texts, dimensions=DIMENSIONS
        )

        embeddings = [item.embedding for item in response.data]

        return jsonify(
            {"embeddings": embeddings, "model": MODEL, "dimensions": DIMENSIONS}
        )
    except Exception as e:
        logger.error(f"Error generating embeddings: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    logger.info(f"Starting OpenAI embedding service on port {port}")
    app.run(host="0.0.0.0", port=port)
