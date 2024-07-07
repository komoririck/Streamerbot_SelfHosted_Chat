function removeOldMessages() {
    const chatMessagesDiv = document.querySelector('.chat-messages');
    const childDivs = chatMessagesDiv.querySelectorAll('div'); // Get all child divs

    const currentTime = new Date().getTime(); // Get current time in milliseconds

    childDivs.forEach(div => {
        const divTime = div.dataset.timestamp ? parseInt(div.dataset.timestamp) : currentTime; // Parse timestamp to number
        const elapsedTime = currentTime - divTime; // Calculate time elapsed

        if (elapsedTime > 30000) { // If more than 2 minute
            console.log("Removing div:", div);
            div.remove(); // Remove the div
        }
    });
}

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


const chatMessagesDiv = document.querySelector('.chat-messages');
const observer = new MutationObserver(handleMutations);
observer.observe(chatMessagesDiv, { childList: true, subtree: true });

setInterval(removeOldMessages, 1000);
