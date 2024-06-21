// Function to fetch new messages from the server and append them to the chat interface
async function fetchAndAppendMessages() {
  try {
    const response = await fetch('http://localhost:3000/messages');
    if (!response.ok) {
      throw new Error('Failed to fetch messages');
    }
    const messagesHTML = await response.text();
    const chatMessagesDiv = document.querySelector('.chat-messages');
    // Append new messages to the chat interface
    chatMessagesDiv.insertAdjacentHTML('beforeend', messagesHTML);
  } catch (error) {
    console.error('Error fetching messages:', error);
  }
}

// Function to periodically fetch and append messages
function fetchAndAppendMessagesPeriodically() {
  fetchAndAppendMessages(); // Initial call to fetch and append messages
  setInterval(fetchAndAppendMessages, 500); // Fetch and append messages every 5 seconds
}

// Call the function to fetch and append messages periodically
fetchAndAppendMessagesPeriodically();