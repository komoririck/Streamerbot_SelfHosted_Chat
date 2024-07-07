const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');
const fss = require('fs').promises;
const axios = require('axios');
const CHATPATH = path.resolve(__dirname);
const directoryPath = CHATPATH;
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
//////////////////////////////////////////////////////////////////// OAuthToken ////////////////////////////////////////////////////////////////////
const broadcasterId = '';//yourID
const clientId = '';//yourAPICLIENT
const clientSecret = '';//yourSECRET
const tokenPath = './tokens.json';
const redirectUri = 'http://localhost:3000/callback';

const {twitchEmotes} = require('./TwitchEmoteList.js');

//LOADING THE SVG ADDONS WE WILL USE LATTER IN THE CHAT
const {YoutubeTypeChatter, TwitchTypeChatter, chatAddonSvg} = require('./ChatSVGAddonList.js');

app.use(express.static(directoryPath));
app.get('/favicon.ico', (req, res) => {
   res.status(404).end();
});

//////////////////////////////////////////////////////////////////// getTwitchOauthToken ////////////////////////////////////////////////////////////////////
async function initiateOAuth() {
   try {
      const authUrl = `https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=channel:read:subscriptions`;
      await axios.get(authUrl);
      console.log('Trying to get Outh for Twitchsublist.');
   } catch (error) {
      console.error('Error initiating OAuth flow:', error.message);
   }
}

app.get('/callback', async (req, res) => {
   const {
      code
   } = req.query;

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
         await page.goto(searchUrl, {
            waitUntil: 'networkidle0'
         });

         const emoteData = await page.evaluate(emoteName => {
            const cardBody = document.querySelector('.card-body');
            const emoteNameTag = cardBody.querySelector('.mt-2.text-center');
            const img = cardBody.querySelector('img');

            if (emoteNameTag && img && emoteNameTag.textContent.trim() === emoteName) {
               return {
                  imgUrl: img.src,
                  emoteName: emoteNameTag.textContent.trim()
               };
            } else {
               return null;
            }
         }, emoteName);

         await browser.close();

         if (emoteData) {
            if (!fs.existsSync(emotesFolder)) {
               fs.mkdirSync(emotesFolder);
            }

            const response = await axios.get(emoteData.imgUrl, {
               responseType: 'stream'
            });
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
function isValidTwitchEmote(word) {//6 letter + number
    const regex = /^[a-zA-Z]{6}\d/;
    return regex.test(word);
}

//////////////////////////////////////////////////////////////////// GettingChatterEmotes ////////////////////////////////////////////////////////////////////
//this call the scrap function for the emotes after check if the tipped word ins't already a emote. Again, checking the whole emote folder against the word, not to good.
function findRepeatedWords(frase) { // this function is only called for twtich, so to make more optimal we check if it's a user emote in the bennning, the server as hardcoded the other emotes.

   const words = frase.split(" ");
   const wordFreq = {};
   const emotesFolder = path.join(__dirname, 'emotes');

   returnedFrase = "";

   for (const word of words) {
	  
      const imagePath = path.join(emotesFolder, `${word}.png`);
      const imagePathG = path.join(emotesFolder, `${word}.gif`);
	  if (twitchEmotes.hasOwnProperty(word)) {
		returnedFrase += `<img class="emote-small" src="${word}'}">`;
	  } else if (isValidTwitchEmote(word)) {
		if (fs.existsSync(imagePath) || fs.existsSync(imagePathG)){
			returnedFrase += `<img class="emote-small" src="emotes/${word}${fs.existsSync(imagePathG) ? '.gif' : '.png'}">`;
		} else {
         returnedFrase += word + " ";
         wordFreq[word] = (wordFreq[word] || 0) + 1;	
		}
      } else {
         returnedFrase += word + " ";
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


//////////////////////////////////////////////////////////////////// BADGES HANDLER ////////////////////////////////////////////////////////////////////
const userMedalMatrix = [
    ['akemi_origin', 'twitchFirst'],
    ['shyatsuh', 'twitchFirstOfAll'],
    ['Hyo Yuki', 'youtubeFirstOfAll']
];

function createUserBadgeMap(matrix) {
    const userBadgeMap = new Map();

    matrix.forEach(row => {
        const [user, ...badges] = row;
        userBadgeMap.set(user, badges);
    });
    return userBadgeMap;
}
function getBadgesForUser(userBadgeMap, user) {
    return userBadgeMap.get(user) || [];
}
//////////////////////////////////////////////////////////////////// CHAT, TEXT COLOR - ADDONS ////////////////////////////////////////////////////////////////////
//BADGES AND MEDALS                     ------------------------------           IF YOU WANT TO GET THE POSITION X OF THE MEDAL, USE THE VARIABLE styleAddon i'm too weak on css to make it work with classes 
																																					// you can probably have 5 classes with distances and positions,
function getBadgesListHtml(memberList, subscribersList, userBadgeMap, user) {
    let userBadges = ``;
    let medalCount = 0;
	
    if (subscribersList.some(sub => sub[0] === user)) {//twitchcheck
		styleAddon = `style="right: ${40 + ( 7 * medalCount)}%;"`;
        let userTier = subscribersList.find(sub => sub[0] === user)[1];
        userBadges += `
            <div class="medal" ${styleAddon}>
                <img src="medals/twitchBadge (${userTier / 1000}).png">
            </div>
        `;
        medalCount++;
    }

   if (memberList.includes(user)) { //youtubecheck  || need to distigue member tier + time
		styleAddon = `style="right: ${40 + ( 7 * medalCount)}%;"`;
        userBadges += `
            <div class="medal" ${styleAddon}>
                <img src="medals/unnamed (1).png">
            </div>
        `;
        medalCount++;
   }
   
	for (let i = 0; i < userBadgeMap.length; i++){
			if (userBadgeMap[i][0] === user && medalCount < 10) {  
					styleAddon = `style="right: ${30 + ( 7 * medalCount)}%;"`;
					userBadges += `
						<div class="medal" ${styleAddon}>
							<img src="medals/${userBadgeMap[i][1]}.png">
						</div>
					`;
					medalCount++;
			}
	}
    return userBadges;
}



//////////////////////////////////////////////////////////////////// MainFunctionToSendMessagesToTheClient ////////////////////////////////////////////////////////////////////
let subscribers = [];
let IgnoredChatterNames = [];
let memberNames = [];
let rankingNames = [];

async function setupVariables() {
   try {
      memberNames = await getMemberNamesFromFile('/memberlistYoutube.txt');
      IgnoredChatterNames = await getMemberNamesFromFile('/ignoredList.txt');
      subscribersJson = await getMemberNamesFromFile('/twitchSubscribers.txt');
      rankingNames = await getMemberNamesFromFile('/ranking.txt');

   } catch (error) {
      return null;
   }

   setTimeout(function () {
      fs.readFile('twitchSubscribers.txt', 'utf8', (err, data) => {
         if (err) {
            console.error('Error reading file:', err);
            return;
         }
         try {
            const parsedData = JSON.parse(data);
            parsedData.forEach(function (item) {
               var userName = item.user_name;
               var tier = item.tier;
               subscribers.push([item.user_name, item.tier]);
            });
         } catch (error) {
            console.error(error);
         }
      });
   }, 1000);
}
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
app.get('/userAddonList', async (req, res) => {
  try {
    const filePath = path.join(CHATPATH, 'userAddonList.txt');
    const data = await readMemberNamesFromFile(filePath);
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error fetching user addon list.');
  }
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

setupVariables();

app.get('/messages', async (req, res) => {
   try {
      let messages = [];
      const data = await readTextFile(CHATPATH + '/ChatOverlay.txt');
      var lines = data.split('\n');
      var numberOfLines = lines.length;
      var lastLines = Number(await readTextFile(CHATPATH + '/ChatLastLine.txt'));
	  

      for (let i = (lines.length - 10); i < lines.length; i++) {
         if (i > lastLines) {
            const line = lines[i];

            console.error('msg:', line);

            let [info1, info2, info3, info4, info5, info6, info7] = line.split(":%:").map(item => item.trim());

            if (info1 == null) {
               info1 == "";
            }
            if (info2 == null) {
               info2 == "";
            }
            if (info3 == null) {
               info3 == "";
            }
            if (info4 == null) {
               info4 == "";
            }
            if (info5 == null) {
               info5 == "";
            }
            if (info6 == null) {
               info6 == "";
            }
            if (info7 == null) {
               info7 == "";
            }


            if (IgnoredChatterNames.includes(info1)) {
               i++;
               continue;
            }



            typeChatter = ``;
            isMemberChatter = ``;
            memberBadge = ``;
            memberTier = ` `;
            userTier = ``;
            userPowerType = ``;

            currentTime = new Date().toLocaleTimeString();

            if (info4 == 2 || info4 == 4) {
               typeChatter = YoutubeTypeChatter;
            } else if (info4 == 1 || info4 == 3) {
               info2 = findRepeatedWords(info2);
               typeChatter = TwitchTypeChatter;
            }


            if (info4 == 2) {
               typeChatter = YoutubeTypeChatter;
            } else if (info4 == 1) {
               info2 = findRepeatedWords(info2);
               typeChatter = TwitchTypeChatter;
            }




			//ranking - need to check if info1 isnot used anymore latter
			rankingNamesList = rankingNames.map(line => line.split(' - ')[0]);
			rankInfo = "";
			for (let i = 0; i < rankingNamesList.length; i++) {
				name = rankingNamesList[i].split(' - ')[0];
				if (name == info1){	
					rankInfo += `<textstyle class="ranking-chatter">TOP${i + 1}<textstyle/>`;
				}
			}			
			
            messageHTMLL = `
<yt-live-chat-text-message-renderer  author-type="${userPowerType}" class="style-scope thought " modern="" >
         <div id="author-photo alert-author-photo">
			<img id="img" draggable="false" class="style-scope yt-img-shadow" alt="" height="24" width="24" src="https://yt4.ggpht.com/8Un1A5mP2F3RIt0rLhna7bG65qEnxSL5xeKowWVPOnUlhJo-SmHMNk8LMUBhicii0ILwyVAWdA=s32-c-k-c0x00ffffff-no-rj">
         </div>
		 
         <div id="content" class="style-scope yt-live-chat-text-message-renderer">
            <span id="timestamp" class="style-scope yt-live-chat-text-message-renderer"></span>
            <yt-live-chat-author-chip class="style-scope yt-live-chat-text-message-renderer" is-highlighted="">
			   <span id="prepend-chat-badges" class="style-scope yt-live-chat-author-chip"></span>
			   <span id="author-name" dir="auto" class="owner style-scope yt-live-chat-author-chip style-scope yt-live-chat-author-chip">${info1}<span id="chip-badges" class="style-scope yt-live-chat-author-chip"></span></span>
			   <span id="chat-badges" class="style-scope yt-live-chat-author-chip">
					<div id="author-badges">
							<img class="icon-platform" src="imgs/${info4.match(/\d+/)[0]}.png">  
					</div>			   
			   </span>
            </yt-live-chat-author-chip>
            <span id="message" dir="auto" class="style-scope yt-live-chat-text-message-renderer">${info2}</span><span id="deleted-state" class="style-scope yt-live-chat-text-message-renderer"></span><a id="show-original" href="#" class="style-scope yt-live-chat-text-message-renderer"></a>
         </div>
      </yt-live-chat-text-message-renderer>
	  `;

            typeChatterTag = "undefined";
            typeChatterTag = "moderator";
            typeChatterTag = "broadcaster";
            typeChatterTag = "subscriber";
            userProfilePicture = info6;

            messageHTML = `
      <div class="msg-container ${typeChatterTag} default user-${info1} " id="msg-${i}">
        <div class="content">
        <div class="author-photo">
			<img draggable="false" alt="" height="60" width="60" src="${userProfilePicture}">
			
          <div class="text-line"></div>
         </div>			
          <div class="text-wrapper">
            <div class="text-block">
              <div class="user-block">
                <p class="user">
                  ${info1} ${rankInfo}
                </p>
              </div>
              <div class="content-message">
                ${info2}
              </div>
            </div>
          </div>
        </div>
        <div class="platform-icon">
		${typeChatter}
        </div>
		${getBadgesListHtml(memberNames, subscribers, userMedalMatrix, info1)}
		<div class="msg-shape">
			<div class="section-1"></div>
			<div class="section-2">  
				<div class="filler"></div>        
			</div>
			<div class="section-3"></div>
		</div>
		</div>	  
`;

            if (info5.length > 1) {
               firstThreeChars = info5.substring(0, 3);
               restOfString = info5.substring(3);

               if (firstThreeChars == "BIT") {
                  firstThreeChars = "BITS";
               }

               donateChatMessage = `			
			<div class="alert default" id="msg-32">
					<div class="content">	
					  <div class="alert-content-wrap">
						<div class="alert-text">
						  <p class="user">${info1}</p>
						  <p>Doou ${restOfString} ${firstThreeChars}!</p>
						</div>
					  </div>
					</div>
					<div class="alert-author-photo" width="60" height="60">
						<img id="img" draggable="false" alt="" src="${userProfilePicture}">
					</div>
					<div class="msg-shape">
					  <div class="section-1"></div>
					  <div class="section-2">
						<div class="filler"></div>        
					  </div>
					  <div class="section-3"></div>
					</div>
				  </div>	  	  
			`;

               if (restOfString > 0) {
                  messageHTML = donateChatMessage;
               }
            }
            memberChat = `
			<div class="alert default" id="msg-31">
					<div class="content">
					  <div class="alert-content-wrap">
						<div class="alert-text">
						  <p class="user">Bem-Vindo!! <span class="mention">${info1}</p>
						  <p>Um novo ${memberTier} se juntou a nós!</p>
						</div>
					</div>
					<div class="alert-author-photo" width="60" height="60">
						<img id="img" draggable="false" alt="" src="${userProfilePicture}">
					</div>
					<div class="msg-shape">
					  <div class="section-1"></div>
					  <div class="section-2">
						<div class="filler"></div>        
					  </div>
					  <div class="section-3"></div>
					</div>
				  </div>	  	  
			`;


            if (info4 == 3 || info4 == 4) {
               messageHTML = memberChat;
            }

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

app.get('/favicon.ico', (req, res) => {
   res.status(404).end();
});

const port = 3000;
app.listen(port, async () => {
   await initiateOAuth();
   console.log(`Server is running on http://localhost:${port}`);
});