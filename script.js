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


//Checking for changes in the user chat costumization
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
previousMatrix = [];
async function fetchUserAddonList() {
  try {
    const response = await fetch('/userAddonList');
    if (!response.ok) {
      throw new Error('Failed to fetch user addon list');
    }
    return await response.json();
  } catch (error) {
    console.error(error);
    return [];
  }
}

function isValidHexColor(str) {
  const match = /^#?([0-9A-F]{6})$/i.exec(str);
  if (match) {
    let color = match[1];
    if (!str.startsWith('#')) {
      color = '#' + color;
    }
    return color.toUpperCase();
  }
  return false;
}

function generateUserStyles(matrix) {
  const userStyles = {};

  matrix.forEach(line => {
    const [user, property, color] = line.split(':*:');
    const validColor = isValidHexColor(color);
    if (validColor) {
      if (!userStyles[user]) userStyles[user] = {};
      userStyles[user][property] = validColor;
    }
  });

  let styleString = '';
  for (const [user, styles] of Object.entries(userStyles)) {
    let userStyle = '';
    for (const [property, color] of Object.entries(styles)) {
      if (property === "textcolor") {
        userStyle += `--chat-text-color: ${color}; `;
      } else if (property === "chatcolor") {
        userStyle += `--chat-bubble-color: ${color}; `;
      }
    }
    styleString += `.user-${user} { ${userStyle} } `;
  }

  return styleString;
}

function updateUserStyles(matrix) {
  const dynamicStylesElement = document.getElementById('dynamic-styles');

  if (JSON.stringify(matrix) !== JSON.stringify(previousMatrix)) {
    const newStyles = generateUserStyles(matrix);
    dynamicStylesElement.innerHTML = newStyles;
    previousMatrix = [...matrix]; // Update previous matrix
  }
}

async function fetchAndUpdateStyles() {
  const chatAddonList = await fetchUserAddonList();
  updateUserStyles(chatAddonList);
}

fetchAndUpdateStyles();

setInterval(fetchAndUpdateStyles, 5000);
