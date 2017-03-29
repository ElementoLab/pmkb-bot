var restify = require('restify');
var builder = require('botbuilder');
var prompts = require('./prompts');
const PMKBClient = require('./lib/pmkbClient');
const async = require('async');
const configs = require('./config/configs');

//=========================================================
// Bot Setup
//=========================================================

// Setup Restify Server
var server = restify.createServer();
server.listen(configs.get('APPLICATION_PORT'), function () {
  console.log('%s listening to %s', server.name, server.url);
});

// Create chat bot
var connector = new builder.ChatConnector({
  appId: process.env.MICROSOFT_APP_ID,
  appPassword: process.env.MICROSOFT_APP_PASSWORD
  // appId: null,
  // appPassword: null
});
var bot = new builder.UniversalBot(connector);
server.post('/api/messages', connector.listen());

var recognizer = new builder.LuisRecognizer('https://westus.api.cognitive.microsoft.com/luis/v2.0/apps/9b2622c4-2a83-4f33-9fb0-e819ddb5f894?subscription-key=686d01692e8c47ec87bdc838e7e1a95f');
bot.recognizer(recognizer);

// Config PMKB Client
const pmkbClient = new PMKBClient(configs.get('PMKB_HOST'), configs.get('PMKB_USER'), configs.get('PMKB_PASS'));

//=========================================================
// Bots Dialogs
//=========================================================
bot.on('conversationUpdate', function (message) {
    if (message.membersAdded) {
        message.membersAdded.forEach(function (identity) {
            if (identity.id === message.address.bot.id) {
                var reply = new builder.Message()
                    .address(message.address)
                    .text('Hi! I am SpeechToText Bot. I can understand the content of any audio and convert it to text. Try sending me a wav file.');
                bot.send(reply);
            }
        });
    }
});

bot.dialog('/', function (session) {
  session.send(prompts.greetMsg);
  session.send(prompts.helpMsg),
  session.send(prompts.disclaimerMsg),
  session.beginDialog('help');
}).triggerAction({matches: /(^hello)|(^hi)/i});

bot.dialog('newSearch', [
    function(session){
        builder.Prompts.choice(session, prompts.newSearchMsg, 'Yes|No')
    },
    function(session, results){
        switch (results.response.index) {
            case 0:
                session.beginDialog('help');
                break;
            case 1:
                session.send(prompts.exitMsg);
                session.endDialog();
                break;
            default:
                session.send(prompts.exitMsg);
                session.endDialog();
                break;
        }
    }]);

bot.dialog('help', [
    function(session){

        builder.Prompts.choice(session, prompts.menuMsg, 'Gene|Variant|Primary Site|Tumor Type|Exit')
    },
    function(session, results){
         switch (results.response.index) {
            case 0:
                session.sendTyping();
                session.beginDialog('find gene');
                break;
            case 1:
                session.sendTyping();
                session.send('Searching Variant...');
                session.beginDialog('newSearch');
                break;
            case 2:
                session.sendTyping();
                session.send('Searching Primary Site ...');
                session.beginDialog('newSearch');
                break;
            case 3:
                session.sendTyping();
                session.send('Searching Tumor Type ...');
                session.beginDialog('newSearch');
                break;
            case 4:
                session.send(prompts.exitMsg);
                session.endDialog();
                break;
            default:
                session.send(prompts.exitMsg);
                session.endDialog();
                break;
    }
}]).triggerAction({matches: /^help/i});

bot.dialog('test', function (session) {
  pmkbClient.isAlive(function (err, isUp) {
    session.send('PMKB is ' + (isUp ? 'up' : 'down'));
  })
}).triggerAction({matches: /^test pmkb/});

bot.dialog('find gene', [
  function (session) {
    builder.Prompts.text(session, 'What gene are you looking for?');
  },
  function (session, results) {
    session.sendTyping();
    const geneName = results.response;
    pmkbClient.getGenes(function (err, genes) {
      async.filter(genes, function (gene, cb) {
        cb(null, gene.name === geneName)  //TODO: match via regex
      }, function (err, res) {
        session.endDialog(res.length && res[0].name || ('Gene ' + geneName + ' does not exist'));
        // TODO: Find all interpretations for this gene
      })
    })
  } 
]).triggerAction({matches: "findGene"});

bot.dialog('list genes', function (session) {
  pmkbClient.getGenes(function (err, genes) {
    async.map(genes, function (gene, cb) {
      cb(null, gene.name)
    }, function (err, geneNames) {
      session.endDialog(geneNames.join(', '));
    })
  })
}).triggerAction({matches: /^genes/});

var fs = require('fs')

bot.dialog('record',[
  function(session){
        builder.Prompts.choice(session, prompts.menuMsg, 'Record', {liststyle:3});
    },
    function(session, results){
         switch (results.response.index) {
            case 0:
              session.beginDialog('doRecording');
              
        }
    
  }
]).triggerAction({matches: /^record/i});

bot.dialog('doRecording', [
  function(session){
    session.send("Recording");
    const exec = require('child_process').exec;
    const child = exec('sox -t waveaudio default new.wav trim 0 4',
          (error, stdout, stderr) => {
              console.log(`stdout: ${stdout}`);
              console.log(`stderr: ${stderr}`);
              if (error !== null) {
                  console.log(`exec error: ${error}`);
              }
              session.send("IM HEREEEE");
              session.beginDialog("thinking");
    });
   
  }
]);

var client = require('./lib/client');

bot.dialog('thinking',[
  function(session){
    var bing = new client.BingSpeechClient('148c262df6f7418fbcca86479848f61a');
    var results = '';
    var wave = fs.readFileSync('./new.wav');

    const text = bing.recognize(wave).then(result => {
      console.log('Speech To Text completed');
      console.log(result.header.lexical)
      console.log('\n');
      session.send(result.header.lexical)
    });
    }]


).triggerAction({matches:/^thinking/i});


function processText(text) {
    var result = 'You said: ' + text + '.';

    if (text && text.length > 0) {
        var wordCount = text.split(' ').filter(function (x) { return x; }).length;
        result += '\n\nWord Count: ' + wordCount;

        var characterCount = text.replace(/ /g, '').length;
        result += '\n\nCharacter Count: ' + characterCount;

        var spaceCount = text.split(' ').length - 1;
        result += '\n\nSpace Count: ' + spaceCount;

        var m = text.match(/[aeiou]/gi);
        var vowelCount = m === null ? 0 : m.length;
        result += '\n\nVowel Count: ' + vowelCount;
    }

    return result;
}