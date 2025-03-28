import React, { useState, useEffect } from 'react';

const Sidebar = ({ onSelectSession, currentSessionId }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState(null);

  // Fetch all sessions from MongoDB
  const fetchSessions = async () => {
    try {
      const response = await fetch(`http://localhost:5000/sessions`);
      
      // Check if the response is OK
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Validate data structure
      if (data && Array.isArray(data.sessions)) {
        // Filter and map sessions to get unique session IDs
        const uniqueSessions = data.sessions.map(session => ({
          session_id: session.session_id || '',
          title: session.messages && session.messages.length > 0 
            ? session.messages[0].user_input.substring(0, 20) + '...' 
            : 'New Session'
        }));

        setSessions(uniqueSessions);
        setError(null);
      } else {
        throw new Error('Invalid sessions data format');
      }
    } catch (error) {
      console.error('Error fetching sessions:', error);
      setError(error.message);
      setSessions([]);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  // Toggles sidebar expansion
  const toggleSidebar = () => {
    setIsExpanded(!isExpanded);
  };

  // Handles session selection
  const handleSessionSelect = (sessionId) => {
    onSelectSession(sessionId);
    setIsExpanded(false);
  };

  return (
    <div className={`sidebar ${isExpanded ? 'expanded' : 'collapsed'}`}>
      {isExpanded ? (
        <div className="sidebar-content">
          <h2>Chat Sessions</h2>
          <button className="close-btn" onClick={toggleSidebar}>
            ✕
          </button>
          {error ? (
            <div className="error-message">
              Error loading sessions: {error}
            </div>
          ) : (
            <div className="session-list">
              {sessions.map((session) => (
                <div 
                  key={session.session_id} 
                  className={`session-item ${session.session_id === currentSessionId ? 'active' : ''}`}
                  onClick={() => handleSessionSelect(session.session_id)}
                >
                  {session.title}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button className="sidebar-toggle" onClick={toggleSidebar}>
          ☰
        </button>
      )}
    </div>
  );
};

export default Sidebar;