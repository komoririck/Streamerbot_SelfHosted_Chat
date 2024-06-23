// Function to continuously scroll to the bottom of the page
function scrollToEnd() {
	window.scrollTo(0, document.body.scrollHeight);
}
scrollToEnd();
var _autoScroller = setInterval(scrollToEnd, 100);


//remove messages after x seconds	
function removeOldMessages() {
    const chatMessagesDiv = document.querySelector('.chat-messages');
    const childDivs = chatMessagesDiv.querySelectorAll('div'); // Get all child divs

    const currentTime = new Date().getTime(); // Get current time in milliseconds

    childDivs.forEach(div => {
        const divTime = div.dataset.timestamp ? parseInt(div.dataset.timestamp) : currentTime; // Parse timestamp to number
        const elapsedTime = currentTime - divTime; // Calculate time elapsed

        if (elapsedTime > 60000) { // If more than 1 minute
            console.log("Removing div:", div);
            div.remove(); // Remove the div
        }
    });
}

// Function to handle mutations (new divs added)
function handleMutations(mutationsList, observer) {
    mutationsList.forEach(mutation => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            console.log("New divs added:", mutation.addedNodes);
            const currentTime = new Date().getTime(); // Get current time in milliseconds
            mutation.addedNodes.forEach(node => {
                if (node instanceof HTMLDivElement) {
                    node.dataset.timestamp = currentTime; // Set data-timestamp attribute to current time
                }
            });
            removeOldMessages(); // Apply removal logic to new divs
        }
    });
}


function applyGlowEffect() {
    const elements = document.querySelectorAll('.twitchMemberChatter');
    elements.forEach(element => {
        element.style.background = 'linear-gradient(to right, #ffffff, #FF0000)';
        element.style.animation = 'glow 1s ease-in-out infinite alternate'; // Add glowing animation
    });
}

// Create a MutationObserver to watch for changes in the chat-messages element
const chatMessagesDiv = document.querySelector('.chat-messages');
const observer = new MutationObserver(handleMutations);
observer.observe(chatMessagesDiv, { childList: true, subtree: true });

// Call removeOldMessages function periodically (every second in this case)
setInterval(removeOldMessages, 1000);
setInterval(applyGlowEffect, 1000);

