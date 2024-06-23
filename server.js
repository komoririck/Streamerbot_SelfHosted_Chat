const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');
const fss = require('fs').promises;
const axios = require('axios'); // Importe o axios aqui
const CHATPATH = 'E:/video editing/Steam Alerts/ChatOverlay'; // Replace this with your Twitch Client ID
const directoryPath = CHATPATH;
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

app.use(express.static(directoryPath));
app.get('/favicon.ico', (req, res) => {
  res.status(404).end();
});

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
const semaphore = new Semaphore(2); // Limit to 2 concurrent requests

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



// Function to find repeated words and process them
function findRepeatedWords(frase) {
    const words = frase.split(" ");
    const wordFreq = {};
	const emotesFolder = path.join(__dirname, 'emotes');
	
	returnedFrase = "";

    for (const word of words) {			
		imagePath = path.join(emotesFolder, `${word}.png`);
		imagePathG = path.join(emotesFolder, `${word}.gif`);
		if (fs.existsSync(imagePath)) {
			returnedFrase += `<img class="emote-small" src="emotes/${word}.png">`;
		} else if (fs.existsSync(imagePathG))  {
			returnedFrase += `<img class="emote-small" src="emotes/${word}.gif">`;
		} else{
			returnedFrase+= word;
			wordFreq[word] = (wordFreq[word] || 0) + 1;			
		} 
    }

    const repeatedWords = Object.keys(wordFreq).filter(word => wordFreq[word] > 2);

    processWords(repeatedWords);
	
	return returnedFrase;
}


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

async function getMemberNamesFromFile() {
  try {
    const filePath = CHATPATH + '/memberlist.txt';
    const memberNames = await readMemberNamesFromFile(filePath);
    return memberNames;
  } catch (error) {
    throw error;
  }
}

app.get('/messages', async (req, res) => {
  try {
    const data = await readTextFile(CHATPATH + '/ChatOverlay.txt');
    const messages = [];
    const lines = data.split('\n');
	var numberOfLines = lines.length;
	var lastLines = Number(await readTextFile(CHATPATH + '/ChatLastLine.txt'));
	let memberNames = [];
	memberNames = await getMemberNamesFromFile();
	
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
			
			
			
			if (info1 == "Hololive Vtuber Legendada") {
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
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});