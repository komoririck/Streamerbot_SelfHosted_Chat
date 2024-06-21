const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');
const fss = require('fs').promises;
const axios = require('axios'); // Importe o axios aqui
const clientId = 'YOUR_TWITCH_CLIENT_ID'; // Replace this with your Twitch Client ID
const accessToken = 'YOUR_TWITCH_ACCESS_TOKEN'; // Replace this with your Twitch Access Token


// Serve static files from the specified directory
const directoryPath = 'E:/video editing/Steam Alerts/ChatOverlay';
app.use(express.static(directoryPath));

app.get('/favicon.ico', (req, res) => {
  // Just send a 404 response
  res.status(404).end();
});

function getEmoteUrl(emoteName){
	var apiUrl = `https://api.twitch.tv/helix/chat/emotes?name=${encodeURIComponent(emoteName)}`;

	fetch(apiUrl, {
	  headers: {
		'Client-ID': clientId,
		'Authorization': `Bearer ${accessToken}`
	  }
	})
	.then(response => {
	  if (!response.ok) {
		throw new Error('Network response was not ok');
	  }
	  return response.json();
	})
	.then(data => {
	  if (data.data && data.data.length > 0) {
		const emoteURL = data.data[0].url;
		console.log(emoteURL); // This will log the direct URL of the emote image
	  } else {
		console.log('Emote not found');
	  }
	})
	.catch(error => {
	  console.error('There was a problem with the request:', error);
	});
}

// Function to read the file and return its contents
function readTextFile(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}

async function readMemberNamesFromFile(filePath) {
  try {
    const data = await fss.readFile(filePath, 'utf8');
    // Assuming each member name is on a separate line in the text file
    const memberNames = data.split('\n').map(name => name.trim());
    return memberNames;
  } catch (error) {
    throw error;
  }
}

// Modified function to get member names from a text file
async function getMemberNamesFromFile() {
  try {
    const filePath = 'E:/video editing/Steam Alerts/ChatOverlay/memberlist.txt'; // Update with the path to your text file
    const memberNames = await readMemberNamesFromFile(filePath);
    return memberNames;
  } catch (error) {
    throw error;
  }
}

// Route to handle displaying messages
app.get('/messages', async (req, res) => {
  try {
    const data = await readTextFile('E:/video editing/Steam Alerts/ChatOverlay/ChatOverlay.txt');
    const messages = [];
    const lines = data.split('\n');
	var numberOfLines = lines.length;
	var lastLines = Number(await readTextFile('E:/video editing/Steam Alerts/ChatOverlay/ChatLastLine.txt'));
	let memberNames = [];
	memberNames = await getMemberNamesFromFile();
	
	for (let i = (lines.length - 10); i < lines.length; i++) {
		
		if (i > lastLines){
			const line = lines[i];
			
			console.error('msg:', line);
			
			const [info1, info2, info3, info4, info5] = line.split(":%:").map(item => item.trim());
			
			if (info1 == null){
				info1 == "";
			}
			if (info2 == null){
				info2 == "";
			}
			if (info3 == null){
				info3 == "";
			}
			if (info4 == null){
				info4 == "";
			}
			if (info5 == null){
				info5 == "";
			}
			
			
			
			if (info1 == "Hololive Vtuber Legendada") {
				continue; // Skip the iteration when i equals 5
			}
			
			var typeChatter = ``;
			var isMemberChatter = ``;
			var memberBadge = ``;
			var twitchPngLink = ``;
			
			if (info4 == 2){			
				typeChatter = `youtubeChatter`;
				if (memberNames.includes(info1)) {
					isMemberChatter = `youtubeMemberChatter`;
					memberBadge = `<img class="icon-platform" src="imgs/unnamed (1).png">`;
				}			
			} else if (info4 == 1){
				if (memberNames.includes(info1)) {
					isMemberChatter = `twitchMemberChatter`;
					memberBadge = `<img class="icon-platform" src="imgs/unnamed (1).png">`;
				}	
				//twitchPngLink = `<img src="${info5}" width="75" height="75">`;
				typeChatter = `twitchChatter`;				
			}

					

			
			const currentTime = new Date().toLocaleTimeString();
			const messageHTML = `
			  <div class="message-item">
				<div class="message-info-container">
				<div>${twitchPngLink}<img></div>
				  <div class="message-info  ${typeChatter}">
					${memberBadge}
					<img class="icon-platform" src="imgs/${info4.match(/\d+/)[0]}.png">
					<span class="message-sender"><span>${info1}</span></span>
					<div class="message-time ">${info3}</div>
				  </div>
				  <div class="message-text ${isMemberChatter}"><span class="chat-text-normal">${info2}</span></div>
				</div>
			  </div>
			`;
			
			lastLines = i;
			try {
				await fss.writeFile('E:/video editing/Steam Alerts/ChatOverlay/ChatLastLine.txt', lastLines.toString());
			} catch (error) {
				console.error("Error writing file:", error);
			}
			messages.push(messageHTML);
		}
	}

    var allMessagesHTML = messages.join('');
    res.send(allMessagesHTML);
  } catch (error) {
    console.error('Error reading file:', error);
    res.status(500).send('Error reading file');
  }
});

// Start the server
const port = 3000;
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});