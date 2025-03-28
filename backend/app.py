from flask import Flask, request, jsonify
from flask_cors import CORS
from langchain_groq import ChatGroq
from langchain_community.embeddings import HuggingFaceBgeEmbeddings
from langchain_community.vectorstores import Chroma
from langchain.chains import RetrievalQA
from langchain.prompts import PromptTemplate
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import DirectoryLoader, PyPDFLoader
import os
from pymongo import MongoClient
from datetime import datetime
from dotenv import load_dotenv


load_dotenv()

import uuid  # Import uuid to generate session IDs



mongo_uri = os.getenv("MONGO_URL")
grok_key = os.getenv("GROK_API_KEY")
grok_model_name = os.getenv("MODEL_NAME")
dataset_url = os.getenv("DATASET_URL")
huggingface_model= os.getenv("HUGGINGFACE_MODEL")



app = Flask(__name__)
CORS(app)  # Enable CORS for frontend communication

# Initialize MongoDB
client = MongoClient(mongo_uri)  # Connect to MongoDB
db = client["chatbot_db"]  # Use or create a database named "chatbot_db"
chats_collection = db["chats"]  # Use or create a collection named "chats"

# Save chat to MongoDB with session ID
def save_chat(session_id, user_input, bot_response):
    print(f"Saving chat with session_id: {session_id}")  # Debug session_id
    chat = {
        "user_input": user_input,
        "bot_response": bot_response,
        "timestamp": datetime.now()
    }
    
    # Update the document with the session_id and push the new chat message
    chats_collection.update_one(
        {"session_id": session_id},  # Query by session_id
        {
            "$setOnInsert": {"session_id": session_id},  # Set session_id only on insert
            "$push": {"messages": chat}  # Push the new chat message
        },
        upsert=True  # Create a new document if the session_id doesn't exist
    )

# Fetch chat history by session ID from MongoDB
def fetch_chat_history(session_id):
    session_data = chats_collection.find_one({"session_id": session_id}, {"_id": 0})
    if session_data:
        return session_data.get("messages", [])
    return []

# Initialize LLM
def initialize_llm():
    llm = ChatGroq(
        temperature=0,
        groq_api_key=grok_key,
        model_name=grok_model_name
    )
    return llm

# Create or Load Vector Database
def create_vector_db():
    pdf_directory = dataset_url  # Update this path
    loader = DirectoryLoader(pdf_directory, glob="*.pdf", loader_cls=PyPDFLoader)
    documents = loader.load()

    # Debug: Print the first document's content
    if documents:
        print("First document content:")
        print(documents[0].page_content)  # Print the text content of the first document
    else:
        print("No documents loaded. Check the PDF directory and files.")

    # Split documents into chunks
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
    texts = text_splitter.split_documents(documents)

    # Debug: Print the first chunk's content
    if texts:
        print("First chunk content:")
        print(texts[0].page_content)  # Print the text content of the first chunk
    else:
        print("No text chunks generated. Check the text extraction process.")

    # Initialize embeddings
    embeddings = HuggingFaceBgeEmbeddings(model_name=huggingface_model)

    # Debug: Test embeddings on a sample text
    sample_text = "This is a test sentence."
    sample_embedding = embeddings.embed_query(sample_text)
    print("Sample embedding shape:", len(sample_embedding))  # Should be a non-empty list

    # Create and persist the vector database
    vector_db = Chroma.from_documents(texts, embeddings, persist_directory="./chroma_db")
    vector_db.persist()

    print("✅ ChromaDB Created and Data Saved!")
    return vector_db

# Setup QA Chain
def setup_qa_chain(vector_db, llm):
    retriever = vector_db.as_retriever()
    prompt_templates = """You are a friendly and empathetic mental health chatbot, here to support users like a caring friend. Your responses should feel natural, warm, and conversational—never robotic or overly formal. Keep replies **brief (1-2 short sentences)** while still being meaningful and supportive.  

If the user shares a problem or feeling:  
1. **Acknowledge** their emotions in a simple and natural way.  
2. **Respond like a friend**—short, relatable, and comforting.  
3. Offer a light suggestion only if it feels natural (don’t force solutions).  

If the user asks a general question:  
1. Give a **clear, human-like response** in a casual tone.  
2. Keep it **short and engaging**, like a quick chat with a friend.  

You’re here to support, **not diagnose**—just be a good listener and offer friendly, reassuring replies.  
{context}  
User: {question}  
Chatbot:  """  

    PROMPT = PromptTemplate(template=prompt_templates, input_variables=["context", "question"])
    qa_chain = RetrievalQA.from_chain_type(
        llm=llm,
        chain_type="stuff",
        retriever=retriever,
        chain_type_kwargs={"prompt": PROMPT}
    )
    return qa_chain

# Initialize Chatbot
print("🚀 Initializing Chatbot...")
llm = initialize_llm()

db_path = "./chroma_db"
if not os.path.exists(db_path):
    vector_db = create_vector_db()
else:
    embeddings = HuggingFaceBgeEmbeddings(model_name=huggingface_model)
    vector_db = Chroma(persist_directory=db_path, embedding_function=embeddings)

qa_chain = setup_qa_chain(vector_db, llm)

print("DEBUG: Registering /sessions route")
@app.route("/sessions", methods=["GET"])
def get_all_sessions():
    print("DEBUG: /sessions endpoint hit")
    try:
        # Fetch all unique session IDs
        unique_sessions = chats_collection.distinct("session_id")
        
        # Collect sessions with their first message
        sessions_list = []
        for session_id in unique_sessions:
            # Find the first document for this session ID
            session_doc = chats_collection.find_one(
                {"session_id": session_id}, 
                {"_id": 0}
            )
            
            if session_doc:
                sessions_list.append(session_doc)
        
        return jsonify({"sessions": sessions_list})
    except Exception as e:
        print(f"Error fetching sessions: {str(e)}")
        return jsonify({"error": str(e), "sessions": []}), 500
    



# API Endpoint for Chatbot
@app.route("/chat", methods=["POST"])
def chat():
    user_input = request.json.get("message")
    session_id = request.json.get("session_id", str(uuid.uuid4()))  # Generate a new session ID if not provided
    
    if not user_input:
        return jsonify({"response": "⚠️ Please provide a message."})

    try:
        response_data = qa_chain.invoke({"query": user_input})
        response_text = response_data.get("result", "⚠️ No response generated.")

        # Save chat to MongoDB with session ID
        save_chat(session_id, user_input, response_text)

        return jsonify({"response": response_text, "session_id": session_id})
    except Exception as e:
        return jsonify({"response": f"⚠️ An error occurred: {str(e)}"})

# API Endpoint to Fetch Chat History by Session ID
@app.route("/chat-history", methods=["GET"])
def get_chat_history():
    session_id = request.args.get("session_id")
    if not session_id:
        return jsonify({"error": "Session ID is required"}), 400

    try:
        chat_history = fetch_chat_history(session_id)
        return jsonify({"chat_history": chat_history})
    except Exception as e:
        return jsonify({"error": str(e)}), 500



if __name__ == "__main__":
    app.run(port=5000, debug=True)