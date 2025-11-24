##API guideline##

#Evolution API
##Get information

javascript
const url = 'https://evolution-example/';
const options = {method: 'GET', body: undefined};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}



try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

Respon
200
{
  "status": 200,
  "message": "Welcome to the Evolution API, it is working!",
  "version": "1.7.4",
  "swagger": "http://example.evolution-api.com/docs",
  "manager": "http://example.evolution-api.com/manager",
  "documentation": "https://doc.evolution-api.com"
}


##Create Instance
Javascript
const url = 'https://evolution-example/instance/create';
const options = {
  method: 'POST',
  headers: {apikey: '<api-key>', 'Content-Type': 'application/json'},
  body: '{"instanceName":"<string>","token":"<string>","qrcode":true,"number":"<string>","integration":"WHATSAPP-BAILEYS","rejectCall":true,"msgCall":"<string>","groupsIgnore":true,"alwaysOnline":true,"readMessages":true,"readStatus":true,"syncFullHistory":true,"proxyHost":"<string>","proxyPort":"<string>","proxyProtocol":"<string>","proxyUsername":"<string>","proxyPassword":"<string>","webhook":{"url":"<string>","byEvents":true,"base64":true,"headers":{"authorization":"<string>","Content-Type":"<string>"},"events":["APPLICATION_STARTUP"]},"rabbitmq":{"enabled":true,"events":["APPLICATION_STARTUP"]},"sqs":{"enabled":true,"events":["APPLICATION_STARTUP"]},"chatwootAccountId":123,"chatwootToken":"<string>","chatwootUrl":"<string>","chatwootSignMsg":true,"chatwootReopenConversation":true,"chatwootConversationPending":true,"chatwootImportContacts":true,"chatwootNameInbox":"<string>","chatwootMergeBrazilContacts":true,"chatwootImportMessages":true,"chatwootDaysLimitImportMessages":123,"chatwootOrganization":"<string>","chatwootLogo":"<string>"}'
};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}


Respon
201
{
  "instance": {
    "instanceName": "teste-docs",
    "instanceId": "af6c5b7c-ee27-4f94-9ea8-192393746ddd",
    "webhook_wa_business": null,
    "access_token_wa_business": "",
    "status": "created"
  },
  "hash": {
    "apikey": "123456"
  },
  "settings": {
    "reject_call": false,
    "msg_call": "",
    "groups_ignore": true,
    "always_online": false,
    "read_messages": false,
    "read_status": false,
    "sync_full_history": false
  }
}

403
{
  "status": 403,
  "error": "Forbidden",
  "response": {
    "message": [
      "This name \"instance-example-name\" is already in use."
    ]
  }
}


##Fetch Instances

Javascript
const url = 'https://evolution-example/instance/fetchInstances';
const options = {method: 'GET', headers: {apikey: '<api-key>'}, body: undefined};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

Respon
200
[
  {
    "instance": {
      "instanceName": "example-name",
      "instanceId": "421a4121-a3d9-40cc-a8db-c3a1df353126",
      "owner": "553198296801@s.whatsapp.net",
      "profileName": "Guilherme Gomes",
      "profilePictureUrl": null,
      "profileStatus": "This is the profile status.",
      "status": "open",
      "serverUrl": "https://example.evolution-api.com",
      "apikey": "B3844804-481D-47A4-B69C-F14B4206EB56",
      "integration": {
        "integration": "WHATSAPP-BAILEYS",
        "webhook_wa_business": "https://example.evolution-api.com/webhook/whatsapp/db5e11d3-ded5-4d91-b3fb-48272688f206"
      }
    }
  },
  {
    "instance": {
      "instanceName": "teste-docs",
      "instanceId": "af6c5b7c-ee27-4f94-9ea8-192393746ddd",
      "status": "close",
      "serverUrl": "https://example.evolution-api.com",
      "apikey": "123456",
      "integration": {
        "token": "123456",
        "webhook_wa_business": "https://example.evolution-api.com/webhook/whatsapp/teste-docs"
      }
    }
  }
]

##Instance Connect
Javascript
const url = 'https://evolution-example/instance/connect/{instance}';
const options = {method: 'GET', headers: {apikey: '<api-key>'}, body: undefined};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

Respon
200
{
  "pairingCode": "WZYEH1YY",
  "code": "2@y8eK+bjtEjUWy9/FOM...",
  "count": 1
}

400
{
  "status": 404,
  "error": "Not Found",
  "response": {
    "message": [
      "The \"invalid-instance\" instance does not exist"
    ]
  }
}

##Restart Instance
Javascript
const url = 'https://evolution-example/instance/restart/{instance}';
const options = {method: 'PUT', headers: {apikey: '<api-key>'}, body: undefined};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

Respon
200
{
  "instance": {
    "instanceName": "teste-docs",
    "state": "open"
  }
}

404
{
  "status": 404,
  "error": "Not Found",
  "response": {
    "message": [
      "The \"invalid-instance\" instance does not exist"
    ]
  }
}

##Connection State
Javascript
const url = 'https://evolution-example/instance/connectionState/{instance}';
const options = {method: 'GET', headers: {apikey: '<api-key>'}, body: undefined};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

Respon
200
{
  "instance": {
    "instanceName": "teste-docs",
    "state": "open"
  }
}

404
{
  "status": 404,
  "error": "Not Found",
  "response": {
    "message": [
      "The \"invalid-instance\" instance does not exist"
    ]
  }
}

##Logout Instance
Javascript
const url = 'https://evolution-example/instance/logout/{instance}';
const options = {method: 'DELETE', headers: {apikey: '<api-key>'}, body: undefined};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

Respon
200
{
  "status": "SUCCESS",
  "error": false,
  "response": {
    "message": "Instance logged out"
  }
}

404
{
  "status": 404,
  "error": "Not Found",
  "response": {
    "message": [
      "The \"invalid-instance\" instance does not exist"
    ]
  }
}

##Delete Instance
Javascript
const url = 'https://evolution-example/instance/delete/{instance}';
const options = {method: 'DELETE', headers: {apikey: '<api-key>'}, body: undefined};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

##Set Presence
Javascript
const url = 'https://evolution-example/instance/setPresence/{instance}';
const options = {
  method: 'POST',
  headers: {apikey: '<api-key>', 'Content-Type': 'application/json'},
  body: '{"presence":"available"}'
};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

##Set Webhook
Javascript
const url = 'https://evolution-example/webhook/set/{instance}';
const options = {
  method: 'POST',
  headers: {apikey: '<api-key>', 'Content-Type': 'application/json'},
  body: '{"enabled":true,"url":"<string>","webhookByEvents":true,"webhookBase64":true,"events":["APPLICATION_STARTUP"]}'
};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

##Find Webhook
Javascript
const url = 'https://evolution-example/webhook/find/{instance}';
const options = {method: 'GET', headers: {apikey: '<api-key>'}, body: undefined};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

##Set Settings
Javascript
const url = 'https://evolution-example/settings/set/{instance}';
const options = {
  method: 'POST',
  headers: {apikey: '<api-key>', 'Content-Type': 'application/json'},
  body: '{"rejectCall":true,"msgCall":"<string>","groupsIgnore":true,"alwaysOnline":true,"readMessages":true,"readStatus":true,"syncFullHistory":true}'
};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

Respon
201
{
  "settings": {
    "instanceName": "teste-docs",
    "settings": {
      "reject_call": true,
      "groups_ignore": true,
      "always_online": true,
      "read_messages": true,
      "read_status": true,
      "sync_full_history": false
    }
  }
}

##Find Settings
Javascript
const url = 'https://evolution-example/settings/find/{instance}';
const options = {method: 'GET', headers: {apikey: '<api-key>'}, body: undefined};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

Respon
200
{
  "reject_call": true,
  "groups_ignore": true,
  "always_online": true,
  "read_messages": true,
  "read_status": true,
  "sync_full_history": false
}

##Send Plain Text
Javascript
const url = 'https://evolution-example/message/sendText/{instance}';
const options = {
  method: 'POST',
  headers: {apikey: '<api-key>', 'Content-Type': 'application/json'},
  body: '{"number":"<string>","text":"<string>","delay":123,"linkPreview":true,"mentionsEveryOne":true,"mentioned":["{{remoteJID}}"],"quoted":{"key":{"id":"<string>"},"message":{"conversation":"<string>"}}}'
};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

Respon
201
{
  "key": {
    "remoteJid": "553198296801@s.whatsapp.net",
    "fromMe": true,
    "id": "BAE594145F4C59B4"
  },
  "message": {
    "extendedTextMessage": {
      "text": "Olá!"
    }
  },
  "messageTimestamp": "1717689097",
  "status": "PENDING"
}

##Send Status
Javascript
const url = 'https://evolution-example/message/sendStatus/{instance}';
const options = {
  method: 'POST',
  headers: {apikey: '<api-key>', 'Content-Type': 'application/json'},
  body: '{"type":"text","content":"<string>","caption":"<string>","backgroundColor":"<string>","font":123,"allContacts":true,"statusJidList":["{{remoteJID}}"]}'
};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

Respon
201
{
  "key": {
    "remoteJid": "status@broadcast",
    "fromMe": true,
    "id": "BAE5FAB9E65A3DA8"
  },
  "message": {
    "extendedTextMessage": {
      "text": "example",
      "backgroundArgb": 4294910617,
      "font": "FB_SCRIPT"
    }
  },
  "messageTimestamp": "1717691767",
  "status": "PENDING",
  "participant": "553198296801:17@s.whatsapp.net"
}

##Send Media
Javascript
const url = 'https://evolution-example/message/sendMedia/{instance}';
const options = {
  method: 'POST',
  headers: {apikey: '<api-key>', 'Content-Type': 'application/json'},
  body: '{"number":"<string>","mediatype":"<string>","mimetype":"<string>","caption":"<string>","media":"<string>","fileName":"<string>","delay":123,"linkPreview":true,"mentionsEveryOne":true,"mentioned":["{{remoteJID}}"],"quoted":{"key":{"id":"<string>"},"message":{"conversation":"<string>"}}}'
};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

Respon
201
{
  "key": {
    "remoteJid": "553198296801@s.whatsapp.net",
    "fromMe": true,
    "id": "BAE5F5A632EAE722"
  },
  "message": {
    "imageMessage": {
      "url": "https://mmg.whatsapp.net/o1/v/t62.7118-2...",
      "mimetype": "image/png",
      "caption": "Caption text",
      "fileSha256": "VbCGkGBv5SZStLD5PHdkBWpQav/lNsXcY...",
      "fileLength": "1305757",
      "height": 1080,
      "width": 1920,
      "mediaKey": "aFQK9Ocw5tE7Nf0iBA42Xcb4Dee6G1k/pLL...",
      "fileEncSha256": "bGVtYeR3458RwC0p1tsGDNuj+vOu/...",
      "directPath": "/o1/v/t62.7118-24/f1/m232/up-oil...",
      "mediaKeyTimestamp": "1717775573",
      "jpegThumbnail": "/9j/2wBDABALDA4MChAODQ4SERATG...",
      "contextInfo": {}
    }
  },
  "messageTimestamp": "1717775575",
  "status": "PENDING"
}

Send WhatsApp Audio
Javascript
const url = 'https://evolution-example/message/sendWhatsAppAudio/{instance}';
const options = {
  method: 'POST',
  headers: {apikey: '<api-key>', 'Content-Type': 'application/json'},
  body: '{"number":"<string>","audio":"<string>","delay":123,"linkPreview":true,"mentionsEveryOne":true,"mentioned":["{{remoteJID}}"],"quoted":{"key":{"id":"<string>"},"message":{"conversation":"<string>"}}}'
};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

Respon
200
{
  "key": {
    "remoteJid": "553198296801@s.whatsapp.net",
    "fromMe": true,
    "id": "BAE5EFED2AB0BB9F"
  },
  "message": {
    "audioMessage": {
      "url": "https://mmg.whatsapp.net/v/t62.7114-24/21428511_985284763127087_5662928...",
      "mimetype": "audio/mp4",
      "fileSha256": "DJPBnRns6QADzZNH2j0R88mUtFQ4aiOm9aZf6dio2G0=",
      "fileLength": "670662",
      "seconds": 42,
      "ptt": true,
      "mediaKey": "+A3X1Tuyzeh87cCVZpfuKpL3Y4RYdYr3sCDurjSlBTY=",
      "fileEncSha256": "s4tKvHOXIZAw5668/Xcy4zoFba4vW8klmNYC78yOPZs=",
      "directPath": "/v/t62.7114-24/21428511_985284763127087_5662928477636351284_n.enc...",
      "mediaKeyTimestamp": "1717776942"
    }
  },
  "messageTimestamp": "1717776942",
  "status": "PENDING"
}

##Send Sticker
Javascript
const url = 'https://evolution-example/message/sendSticker/{instance}';
const options = {
  method: 'POST',
  headers: {apikey: '<api-key>', 'Content-Type': 'application/json'},
  body: '{"number":"<string>","sticker":"<string>","delay":123,"linkPreview":true,"mentionsEveryOne":true,"mentioned":["{{remoteJID}}"],"quoted":{"key":{"id":"<string>"},"message":{"conversation":"<string>"}}}'
};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

##Send Contact
Javascript
const url = 'https://evolution-example/message/sendContact/{instance}';
const options = {
  method: 'POST',
  headers: {apikey: '<api-key>', 'Content-Type': 'application/json'},
  body: '{"number":"<string>","contact":[{"fullName":"<string>","wuid":"<string>","phoneNumber":"<string>","organization":"<string>","email":"<string>","url":"<string>"}]}'
};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

Respon
201
{
  "key": {
    "remoteJid": "553198296801@s.whatsapp.net",
    "fromMe": true,
    "id": "BAE58DA6CBC941BC"
  },
  "message": {
    "contactMessage": {
      "displayName": "Guilherme Gomes",
      "vcard": "BEGIN:VCARD\nVERSION:3.0\nN:Guilherme Gomes\nFN:Guilherme Gomes\nORG:AtendAI;\nEMAIL:...",
      "contextInfo": {}
    }
  },
  "messageTimestamp": "1717780437",
  "status": "PENDING"
}

##Send Reaction
Javascript
const url = 'https://evolution-example/message/sendReaction/{instance}';
const options = {
  method: 'POST',
  headers: {apikey: '<api-key>', 'Content-Type': 'application/json'},
  body: '{"key":{"remoteJid":"<string>","fromMe":true,"id":"<string>"},"reaction":"🚀"}'
};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

Respon
201
{
  "key": {
    "remoteJid": "553198296801@s.whatsapp.net",
    "fromMe": true,
    "id": "BAE569F0E38F858D"
  },
  "message": {
    "reactionMessage": {
      "key": {
        "remoteJid": "553198296801@s.whatsapp.net",
        "fromMe": true,
        "id": "BAE58DA6CBC941BC"
      },
      "text": "🚀",
      "senderTimestampMs": "1717781105034"
    }
  },
  "messageTimestamp": "1717781105",
  "status": "PENDING"
}

##Send List
Javascript
const url = 'https://evolution-example/message/sendList/{instance}';
const options = {
  method: 'POST',
  headers: {apikey: '<api-key>', 'Content-Type': 'application/json'},
  body: '{"number":"<string>","title":"<string>","description":"<string>","buttonText":"<string>","footerText":"<string>","values":[{"title":"<string>","rows":[{"title":"<string>","description":"<string>","rowId":"<string>"}]}],"delay":123,"linkPreview":true,"mentionsEveryOne":true,"mentioned":["{{remoteJID}}"],"quoted":{"key":{"id":"<string>"},"message":{"conversation":"<string>"}}}'
};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

Respon
201
{
  "key": {
    "remoteJid": "553198296801@s.whatsapp.net",
    "fromMe": true,
    "id": "BAE53EC8D8E1FD8A"
  },
  "message": {
    "messageContextInfo": {
      "messageSecret": "lX/+cLHHNfnTTKZi+88mrhoyi6KNuUzWjgfaB0bTfOY="
    },
    "pollCreationMessage": {
      "name": "Poll Name",
      "options": [
        {
          "optionName": "Option 1"
        },
        {
          "optionName": "Option 2"
        },
        {
          "optionName": "Option 3"
        }
      ],
      "selectableOptionsCount": 1
    }
  },
  "messageTimestamp": "1717781848",
  "status": "PENDING"
}

##Send Buttons
Javascript
const url = 'https://evolution-example/message/sendButtons/{instance}';
const options = {
  method: 'POST',
  headers: {apikey: '<api-key>', 'Content-Type': 'application/json'},
  body: '{"number":"<string>","title":"<string>","description":"<string>","footer":"<string>","buttons":[{"title":"<string>","displayText":"<string>","id":"<string>"}],"delay":123,"linkPreview":true,"mentionsEveryOne":true,"mentioned":["{{remoteJID}}"],"quoted":{"key":{"id":"<string>"},"message":{"conversation":"<string>"}}}'
};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

Respon
201
{
  "key": {
    "remoteJid": "553198296801@s.whatsapp.net",
    "fromMe": true,
    "id": "BAE53EC8D8E1FD8A"
  },
  "message": {
    "messageContextInfo": {
      "messageSecret": "lX/+cLHHNfnTTKZi+88mrhoyi6KNuUzWjgfaB0bTfOY="
    },
    "pollCreationMessage": {
      "name": "Poll Name",
      "options": [
        {
          "optionName": "Option 1"
        },
        {
          "optionName": "Option 2"
        },
        {
          "optionName": "Option 3"
        }
      ],
      "selectableOptionsCount": 1
    }
  },
  "messageTimestamp": "1717781848",
  "status": "PENDING"
}

##Check is WhatsApp
Javascript
const url = 'https://evolution-example/chat/whatsappNumbers/{instance}';
const options = {
  method: 'POST',
  headers: {apikey: '<api-key>', 'Content-Type': 'application/json'},
  body: '{"numbers":["<string>"]}'
};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

Respon
200
[
  {
    "exists": true,
    "jid": "553198296801@s.whatsapp.net",
    "number": "553198296801"
  }
]

##Mark Message As Read
Javascript
const url = 'https://evolution-example/chat/markMessageAsRead/{instance}';
const options = {
  method: 'POST',
  headers: {apikey: '<api-key>', 'Content-Type': 'application/json'},
  body: '{"readMessages":[{"remoteJid":"<string>","fromMe":true,"id":"<string>"}]}'
};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

Respon
201
{
  "message": "Read messages",
  "read": "success"
}

##Mark Message As Unread
Javascript
const url = 'https://evolution-example/chat/markChatUnread/{instance}';
const options = {
  method: 'POST',
  headers: {apikey: '<api-key>', 'Content-Type': 'application/json'},
  body: '{"lastMessage":[{"remoteJid":"<string>","fromMe":true,"id":"<string>"}],"chat":"<string>"}'
};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

##Archive Chat
const url = 'https://evolution-example/chat/archiveChat/{instance}';
const options = {
  method: 'POST',
  headers: {apikey: '<api-key>', 'Content-Type': 'application/json'},
  body: '{"lastMessage":{"key":{"remoteJid":"<string>","fromMe":true,"id":"<string>"}},"archive":true,"chat":"<string>"}'
};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

Respon
201
{
  "chatId": "553198296801@s.whatsapp.net",
  "archived": true
}

##Delete Message for Everyone
Javascript
const url = 'https://evolution-example/chat/deleteMessageForEveryone/{instance}';
const options = {
  method: 'DELETE',
  headers: {apikey: '<api-key>', 'Content-Type': 'application/json'},
  body: '{"id":"<string>","remoteJid":"<string>","fromMe":true,"participant":"<string>"}'
};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

Respon
201
{
  "key": {
    "remoteJid": "553198296801@s.whatsapp.com",
    "fromMe": true,
    "id": "BAE5EABBD912C4E2"
  },
  "message": {
    "protocolMessage": {
      "key": {
        "remoteJid": "553198296801@s.whatsapp.com",
        "fromMe": true,
        "id": "BAE52B567D0E3DD8"
      },
      "type": "REVOKE"
    }
  },
  "messageTimestamp": "1718108455",
  "status": "PENDING"
}

##Update Message
Javascript
const url = 'https://evolution-example/chat/updateMessage/{instance}';
const options = {
  method: 'POST',
  headers: {apikey: '<api-key>', 'Content-Type': 'application/json'},
  body: '{"number":123,"text":"<string>","key":{"remoteJid":"<string>","fromMe":true,"id":"<string>"}}'
};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

##Send Presence
Javascript
const url = 'https://evolution-example/chat/sendPresence/{instance}';
const options = {
  method: 'POST',
  headers: {apikey: '<api-key>', 'Content-Type': 'application/json'},
  body: '{"number":"<string>","options":{"delay":123,"presence":"composing","number":"<string>"}}'
};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

##Update Block Status
Javascript
const url = 'https://evolution-example/message/updateBlockStatus/{instance}';
const options = {
  method: 'POST',
  headers: {apikey: '<api-key>', 'Content-Type': 'application/json'},
  body: '{"number":"<string>","status":"<string>"}'
};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

##Fetch Profile Picture URL
const url = 'https://evolution-example/chat/fetchProfilePictureUrl/{instance}';
const options = {
  method: 'POST',
  headers: {apikey: '<api-key>', 'Content-Type': 'application/json'},
  body: '{"number":"<string>"}'
};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

Respon
200
{
  "wuid": "553198296801@s.whatsapp.net",
  "profilePictureUrl": "https://pps.whatsapp.net/v/t61.2..."
}

##Get Base64
Javascript
const url = 'https://evolution-example/chat/getBase64FromMediaMessage/{instance}';
const options = {
  method: 'POST',
  headers: {apikey: '<api-key>', 'Content-Type': 'application/json'},
  body: '{"message":{"key":{"id":"<string>"}},"convertToMp4":true}'
};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

##Find Contacts
Javascript
const url = 'https://evolution-example/chat/findContacts/{instance}';
const options = {
  method: 'POST',
  headers: {apikey: '<api-key>', 'Content-Type': 'application/json'},
  body: '{"where":{"id":"<string>"}}'
};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

##Find Messages
Javascript
const url = 'https://evolution-example/chat/findMessages/{instance}';
const options = {
  method: 'POST',
  headers: {apikey: '<api-key>', 'Content-Type': 'application/json'},
  body: '{"where":{"key":{"remoteJid":"<string>"}}}'
};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

##Find Status Message
Javascript
const url = 'https://evolution-example/chat/findStatusMessage/{instance}';
const options = {
  method: 'POST',
  headers: {apikey: '<api-key>', 'Content-Type': 'application/json'},
  body: '{"where":{"_id":"<string>","id":"<string>","remoteJid":"<string>","fromMe":true},"limit":123}'
};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}


##Find Chats
Javascript
const url = 'https://evolution-example/chat/findChats/{instance}';
const options = {method: 'POST', headers: {apikey: '<api-key>'}, body: undefined};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}


##Fetch Business Profile
Javascript
const url = 'https://evolution-example/chat/fetchBusinessProfile/{instance}';
const options = {
  method: 'POST',
  headers: {apikey: '<api-key>', 'Content-Type': 'application/json'},
  body: '{"number":"<string>"}'
};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

##Fetch Profile
Javascript
const url = 'https://evolution-example/chat/fetchProfile/{instance}';
const options = {
  method: 'POST',
  headers: {apikey: '<api-key>', 'Content-Type': 'application/json'},
  body: '{"number":"<string>"}'
};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

##Update Profile Name
Javascript
const url = 'https://evolution-example/chat/updateProfileName/{instance}';
const options = {
  method: 'POST',
  headers: {apikey: '<api-key>', 'Content-Type': 'application/json'},
  body: '{"name":"<string>"}'
};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

##Update Profile Status
Javascript
const url = 'https://evolution-example/chat/updateProfileStatus/{instance}';
const options = {
  method: 'POST',
  headers: {apikey: '<api-key>', 'Content-Type': 'application/json'},
  body: '{"status":"<string>"}'
};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

##Update Profile Picture
Javascript
const url = 'https://evolution-example/chat/updateProfilePicture/{instance}';
const options = {
  method: 'POST',
  headers: {apikey: '<api-key>', 'Content-Type': 'application/json'},
  body: '{"picture":"<string>"}'
};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

##Remove Profile Picture
Javascript
const url = 'https://evolution-example/chat/removeProfilePicture/{instance}';
const options = {method: 'DELETE', headers: {apikey: '<api-key>'}, body: undefined};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

##Fetch Privacy Settings
Javascript
const url = 'https://evolution-example/chat/fetchPrivacySettings/{instance}';
const options = {method: 'GET', headers: {apikey: '<api-key>'}, body: undefined};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

##Update Privacy Settings
Javascript
const url = 'https://evolution-example/chat/updatePrivacySettings/{instance}';
const options = {
  method: 'POST',
  headers: {apikey: '<api-key>', 'Content-Type': 'application/json'},
  body: '{"readreceipts":"all","profile":"all","status":"all","online":"all","last":"all","groupadd":"all"}'
};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

##Set Websocket
Javascript
const url = 'https://evolution-example/websocket/set/{instance}';
const options = {
  method: 'POST',
  headers: {apikey: '<api-key>', 'Content-Type': 'application/json'},
  body: '{"websocket":{"enabled":true,"events":["APPLICATION_STARTUP"]}}'
};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

##Find Websocket
Javascript
const url = 'https://evolution-example/websocket/find/{instance}';
const options = {method: 'GET', headers: {apikey: '<api-key>'}, body: undefined};

try {
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error(error);
}

