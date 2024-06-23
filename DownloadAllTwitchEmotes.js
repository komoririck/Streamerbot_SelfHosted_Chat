const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Function to sanitize filename
function sanitizeFilename(filename) {
    return filename.replace(/[\\/:*?"<>|]/g, '_');
}

async function downloadEmojis() {
    const apiUrl = 'https://api.betterttv.net/3/cached/emotes/global';

    try {
        // Fetch the list of emojis from the API
        const response = await axios.get(apiUrl);
        const emojis = response.data;

        // Create a directory to store the emojis if it doesn't exist
        const emotesFolder = path.join(__dirname, 'emotes');
        if (!fs.existsSync(emotesFolder)) {
            fs.mkdirSync(emotesFolder);
        }

        // Download each emoji
        for (const emoji of emojis) {
            const imageUrl = `https://cdn.betterttv.net/emote/${emoji.id}/1x`;
            const imageExtension = emoji.imageType === 'gif' ? 'gif' : 'png';
            const sanitizedFilename = sanitizeFilename(emoji.code);
            const imagePath = path.join(emotesFolder, `${sanitizedFilename}.${imageExtension}`);

            // Check if the emoji is already downloaded
            if (!fs.existsSync(imagePath)) {
                const emojiResponse = await axios.get(imageUrl, { responseType: 'stream' });
                const writer = fs.createWriteStream(imagePath);
                emojiResponse.data.pipe(writer);
                await new Promise((resolve, reject) => {
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                });
                console.log(`Downloaded: ${emoji.code}`);
            } else {
                console.log(`Skipped: ${emoji.code} (already downloaded)`);
            }
        }
        console.log('All emojis downloaded successfully!');
    } catch (error) {
        console.error('An error occurred while downloading emojis:', error.message);
    }
}

// Call the function to start downloading the emojis
downloadEmojis();
