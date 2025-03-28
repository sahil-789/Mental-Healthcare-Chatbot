import React, { useState, useEffect } from "react";
import "./App.css";
import Sidebar from "./components/Sidebar";


const backend_url=import.meta.env.VITE_BACKEND_URL;

function App() {
  const [messages, setMessages] = useState([]); // Stores chat history
  const [input, setInput] = useState(""); // Stores user input
  const [isListening, setIsListening] = useState(false); // Tracks voice input state
  const [sessionId, setSessionId] = useState(null); // Stores the session ID

  // Function to generate a session ID
  const generateSessionId = () => {
    return "session-" + Math.random().toString(36).substr(2, 9);
  };

  // Initialize session ID when the component mounts
  useEffect(() => {
    const newSessionId = generateSessionId();
    setSessionId(newSessionId);
    console.log("Generated Session ID:", newSessionId); // Debug session ID
  }, []);

  // Function to send user input to the backend
  const sendMessage = async () => {
    if (!input.trim()) return; // Ignore empty input

    // Add user message to chat history
    setMessages((prev) => [...prev, { role: "user", content: input }]);

    try {
      console.log("Sending message with Session ID:", sessionId); // Debug session ID
      const response = await fetch(`${backend_url}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: input, session_id: sessionId }),
      });
  
      const data = await response.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.response }]);
    } catch (error) {
      console.error("Error:", error);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ An error occurred. Please try again." },
      ]);
    }
  
    setInput("");
  };

 
  // Function to fetch chat history for the current session
  const fetchChatHistory = async () => {
    try {
      const response = await fetch(`${backend_url}/chat-history?session_id=${sessionId}`);
      const data = await response.json();
      if (data.chat_history) {
        // Map the chat history to include both user and bot messages
        const formattedMessages = data.chat_history.flatMap(msg => [
          { role: "user", content: msg.user_input },
          { role: "assistant", content: msg.bot_response }
        ]);
        setMessages(formattedMessages);
      }
    } catch (error) {
      console.error("Error fetching chat history:", error);
    }
  };


// Add these functions to your App.jsx
const startRecording = () => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("Speech recognition not supported in your browser");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = false;

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    setInput(transcript);
    // Auto-send the message
    const userMessage = { role: "user", content: transcript };
    setMessages((prev) => [...prev, userMessage]);
    getBotResponse(transcript);
  };

  recognition.onerror = (event) => {
    console.error("Speech recognition error", event.error);
    setIsListening(false);
  };

  recognition.onend = () => {
    setIsListening(false);
  };

  recognition.start();
  setIsListening(true);
};

const speakText = (text) => {
  const utterance = new SpeechSynthesisUtterance(text);
  window.speechSynthesis.speak(utterance);
};

const getBotResponse = async (message) => {
  try {
    const response = await fetch(`${backend_url}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message, session_id: sessionId }),
    });
    
    const data = await response.json();
    const botMessage = { role: "assistant", content: data.response };
    setMessages((prev) => [...prev, botMessage]);
    speakText(data.response);
  } catch (error) {
    console.error("Error getting bot response:", error);
  }
};

// Update your voice input button handler
const handleVoiceInput = () => {
  if (isListening) {
    // Note: Web Speech API doesn't have a direct stop method in all implementations
    setIsListening(false);
  } else {
    startRecording();
  }
};

    // New method to handle session selection
    const handleSessionSelect = async (selectedSessionId) => {
      setSessionId(selectedSessionId);
      
      try {
        const response = await fetch(`${backend_url}/chat-history?session_id=${selectedSessionId}`);
        const data = await response.json();
        if (data.chat_history) {
          const formattedMessages = data.chat_history.flatMap(msg => [
            { role: "user", content: msg.user_input },
            { role: "assistant", content: msg.bot_response }
          ]);
          setMessages(formattedMessages);
        }
      } catch (error) {
        console.error("Error fetching chat history:", error);
      }
    };

  // Fetch chat history when the session ID is set
  useEffect(() => {
    if (sessionId) {
      fetchChatHistory();
    }
  }, [sessionId]);

  return (
    <div className="App">
    {/* Add Sidebar component */}
    <Sidebar 
      onSelectSession={handleSessionSelect} 
      currentSessionId={sessionId}
    />
    
    <div className="main-content">
      <h1>Mental Health Chatbot 🤖</h1>
      <div className="chat-window">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`message ${msg.role === "user" ? "user-message" : "bot-message"}`}
          >
            <strong>{msg.role === "user" ? "You" : "Chatbot"}:</strong> {msg.content}
          </div>
        ))}
      </div>
      <div className="input-area">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          onKeyPress={(e) => e.key === "Enter" && sendMessage()}
        />
        <button onClick={sendMessage}>Send</button>
        <button onClick={handleVoiceInput} disabled={isListening}>
          {isListening ? "🎤 Listening..." : "🎤 Voice Input"}
        </button>
      </div>
    </div>
  </div>
  );
}

export default App;