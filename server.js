const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');
const fss = require('fs').promises;
const axios = require('axios'); 
const CHATPATH = 'E:/video editing/Steam Alerts/ChatOverlay'; // your chat directory
const directoryPath = CHATPATH;
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
//////////////////////////////////////////////////////////////////// OAuthToken ////////////////////////////////////////////////////////////////////
const broadcasterId = 'YOURID';
const clientId = 'YOURCLIENTID';
const clientSecret = 'YOURSECRET';
const tokenPath = './tokens.json';
const redirectUri = 'http://localhost:3000/callback';

app.use(express.static(directoryPath));
app.get('/favicon.ico', (req, res) => {
  res.status(404).end();
});

//////////////////////////////////////////////////////////////////// getTwitchOauthToken ////////////////////////////////////////////////////////////////////
async function initiateOAuth() {
    try {
        const authUrl = `https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=channel:read:subscriptions`;
        await axios.get(authUrl);
        console.log('Trying to get Outh for sublist.');
    } catch (error) {
        console.error('Error initiating OAuth flow:', error.message);
    }
}

app.get('/callback', async (req, res) => {
    const { code } = req.query;

    if (!code) {
        return res.status(400).send('No code provided');
    }

    try {
        const tokenResponse = await axios.post('https://id.twitch.tv/oauth2/token', querystring.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri
        }));

        const tokens = tokenResponse.data;
        fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
        res.send('Tokens saved');
    } catch (error) {
        console.error('Error fetching access token:', error.response.data);
        res.status(500).send('Error fetching access token');
    }
});

// Function to refresh the token
async function refreshToken() {
    const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
    const refreshToken = tokens.refresh_token;

    try {
        const tokenResponse = await axios.post('https://id.twitch.tv/oauth2/token', querystring.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token',
            refresh_token: refreshToken
        }));

        const newTokens = tokenResponse.data;
        fs.writeFileSync(tokenPath, JSON.stringify(newTokens, null, 2));
        console.log('Tokens refreshed');
    } catch (error) {
        console.error('Error refreshing token:', error.response.data);
    }
}
// feels bad to have to use the api and also scrap latter for the emotes, but anyway
//////////////////////////////////////////////////////////////////// getTwitchSublist ////////////////////////////////////////////////////////////////////
async function getSubscribers() {
    const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
    const accessToken = tokens.access_token;

    try {
        const response = await axios.get('https://api.twitch.tv/helix/subscriptions', {
            headers: {
                'Client-ID': clientId,
                'Authorization': `Bearer ${accessToken}`
            },
            params: {
                'broadcaster_id': broadcasterId
            }
        });
		const subscribersString = JSON.stringify(response.data.data, null, 2);
        fs.writeFileSync('twitchSubscribers.txt', subscribersString);
			return true;
    } catch (error) {
        if (error.response && error.response.status === 401) {
            await refreshToken();
			
            return getSubscribers();
        } else {
            console.error('Error fetching subscribers:', error.response ? error.response.data : error.message);
            throw error;
        }
    }
}

async function createTwitchSubList() {
    try {
        subscriptions = await getSubscribers(); // Await the result of getSubscribers()
		return subscriptions;
    } catch (error) {
        return null;
    }
}
createTwitchSubList();

//////////////////////////////////////////////////////////////////// GettingChatterEmotes ////////////////////////////////////////////////////////////////////
//this part will check if the user tipped the same word more than 2 times and check if it's a emote. This may lead to falseChecks, but since witch didnt tag they emotes, i didnt though in other way.
class Semaphore {
    constructor(maxConcurrency) {
        this.maxConcurrency = maxConcurrency;
        this.currentConcurrency = 0;
        this.queue = [];
    }

    async acquire() {
        if (this.currentConcurrency < this.maxConcurrency) {
            this.currentConcurrency++;
            return Promise.resolve();
        } else {
            return new Promise(resolve => this.queue.push(resolve));
        }
    }

    release() {
        if (this.queue.length > 0) {
            const resolve = this.queue.shift();
            resolve();
        } else {
            this.currentConcurrency--;
        }
    }

    async withLock(fn) {
        await this.acquire();
        try {
            await fn();
        } finally {
            this.release();
        }
    }
}
const semaphore = new Semaphore(2); // Limit to 2 concurrent requests, necessary so the chat doesnt explode your pc checking emotes, since twitch doesnot tag the emotes, we need to interate to every word.
async function findEmoteUrlAndSave(emoteName) {
    const searchUrl = `https://twitch-tools.rootonline.de/emotes_search.php?q=${emoteName}&qc=1&qo=0&qt=0&page=1`;
    const emotesFolder = path.join(__dirname, 'emotes');
    const imagePath = path.join(emotesFolder, `${emoteName}.png`);
    const imagePathGif = path.join(emotesFolder, `${emoteName}.gif`);

    try {
        if (fs.existsSync(imagePath)) {
            return imagePath;
        }
        if (fs.existsSync(imagePathGif)) {
            return imagePath;
        }		

        await semaphore.withLock(async () => {
            const browser = await puppeteer.launch();
            const page = await browser.newPage();
            await page.goto(searchUrl, { waitUntil: 'networkidle0' });

            const emoteData = await page.evaluate(emoteName => {
                const cardBody = document.querySelector('.card-body');
                const emoteNameTag = cardBody.querySelector('.mt-2.text-center');
                const img = cardBody.querySelector('img');

                if (emoteNameTag && img && emoteNameTag.textContent.trim() === emoteName) {
                    return { imgUrl: img.src, emoteName: emoteNameTag.textContent.trim() };
                } else {
                    return null;
                }
            }, emoteName);

            await browser.close();

			if (emoteData) {
				if (!fs.existsSync(emotesFolder)) {
					fs.mkdirSync(emotesFolder);
				}

				const response = await axios.get(emoteData.imgUrl, { responseType: 'stream' });
				const contentType = response.headers['content-type'];
				const fileExtension = contentType.includes('gif') ? 'gif' : 'png';
				const finalImagePath = path.join(emotesFolder, `${emoteData.emoteName}.${fileExtension}`);
				const writer = fs.createWriteStream(finalImagePath);

				response.data.pipe(writer);

				await new Promise((resolve, reject) => {
					writer.on('finish', resolve);
					writer.on('error', reject);
				});

				return finalImagePath;
			} else {
				throw new Error(`No emote found for name: ${emoteName}`);
			}
			
        });
    } catch (error) {
        console.error(`An error occurred: ${error.message}`);
        return null;
    }
}

// Function to process a list of words with concurrency control
async function processWords(words) {
    if (!Array.isArray(words)) {
        throw new TypeError('Expected an array of words');
    }
    const promises = words.map(word => findEmoteUrlAndSave(word));
    await Promise.all(promises);
}
//////////////////////////////////////////////////////////////////// GettingChatterEmotes ////////////////////////////////////////////////////////////////////
//this call the scrap function for the emotes after check if the tipped word ins't already a emote. Again, checking the whole emote folder against the word, not to good.
function findRepeatedWords(frase) {
    const words = frase.split(" ");
    const wordFreq = {};
	const emotesFolder = path.join(__dirname, 'emotes');
	
	returnedFrase = "";

    for (const word of words) {			
		const imagePath = path.join(emotesFolder, `${word}.png`);
		const imagePathG = path.join(emotesFolder, `${word}.gif`);

		if (fs.existsSync(imagePath) || fs.existsSync(imagePathG)) {
			returnedFrase += `<img class="emote-small" src="emotes/${word}${fs.existsSync(imagePathG) ? '.gif' : '.png'}">`;
		} else {
			returnedFrase += word;
			wordFreq[word] = (wordFreq[word] || 0) + 1;
		}
    }

    const repeatedWords = Object.keys(wordFreq).filter(word => wordFreq[word] > 2);

    processWords(repeatedWords);
	
	return returnedFrase;
}
//////////////////////////////////////////////////////////////////// GettingDataFromOurTxt ////////////////////////////////////////////////////////////////////
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
    const memberNames = data.split('\n').map(name => name.trim());
    return memberNames;
  } catch (error) {
    throw error;
  }
}

async function getMemberNamesFromFile(txtFile) {
  try {
    const filePath = CHATPATH + txtFile;
    const memberNames = await readMemberNamesFromFile(filePath);
    return memberNames;
  } catch (error) {
    throw error;
  }
}
//////////////////////////////////////////////////////////////////// MainFunctionToSendMessagesToTheClient ////////////////////////////////////////////////////////////////////
let subscribers = [];
let IgnoredChatterNames = [];
let memberNames = [];

async function setupVariables() {
    try {
		memberNames = await getMemberNamesFromFile('/memberlistYoutube.txt');
		IgnoredChatterNames = await getMemberNamesFromFile('/ignoredList.txt');
		subscribersJson = await getMemberNamesFromFile('/twitchSubscribers.txt');
   	
	} catch (error) {
        return null;
    }
	
setTimeout(function() {	
	fs.readFile('twitchSubscribers.txt', 'utf8', (err, data) => {
		if (err) {
			console.error('Error reading file:', err);
			return;
		}
			try {
				const parsedData = JSON.parse(data);
				parsedData.forEach(function(item) {
					var userName = item.user_name;
					var tier = item.tier;
					subscribers.push([item.user_name,item.tier]);
				});
			} catch (error) {
					console.error(error);
			}	
	});
	}, 1000);
}

setupVariables();

app.get('/favicon.ico', (req, res) => {
  res.status(404).end();
});


app.get('/messages', async (req, res) => {
   try {
	    let messages = [];
		const data = await readTextFile(CHATPATH + '/ChatOverlay.txt');
		lines = data.split('\n');
		var numberOfLines = lines.length;
		var lastLines = Number(await readTextFile(CHATPATH + '/ChatLastLine.txt'));

	for (let i = (lines.length - 10); i < lines.length; i++) {
//	for (let i = 0; i < lines.length; i++) {
		if (i > lastLines){
			const line = lines[i];
			
			console.error('msg:', line);
			
			let [info1, info2, info3, info4, info5] = line.split(":%:").map(item => item.trim());
			
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

			if (memberNames.includes(info1)) {
				continue;
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
				info2 = findRepeatedWords(info2);
				if (subscribers.some(sub => sub[0] === info1)) {
					isMemberChatter = 'twitchMemberChatter';
					const userTier = subscribers.find(sub => sub[0] === info1)[1];
					memberBadge = `<img class="icon-platform" src="imgs/twitchBadge (${userTier / 1000}).png">`;
				}				//twitchPngLink = `<img src="${info5}" width="75" height="75">`;
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
				await fss.writeFile(CHATPATH + '/ChatLastLine.txt', lastLines.toString());
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


const port = 3000;
app.listen(port, async () => {
	await initiateOAuth();
	console.log(`Server is running on http://localhost:${port}`);
});